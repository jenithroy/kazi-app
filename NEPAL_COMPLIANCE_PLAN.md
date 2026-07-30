# Nepal Compliance Plan — Kazi Manufacturing ERP

Plan for making Kazi ERP compliant with Nepal's IRD (Inland Revenue Department) billing,
VAT, and labor regulations, using [yarsa/nepal-compliance](https://github.com/yarsa/nepal-compliance)
as the reference implementation.

_Drafted: 2026-07-26 · Status: planning only, nothing implemented yet._

---

## 0. Framing decisions

`nepal-compliance` is **not a library we can install** — it is a customization app for
**Frappe/ERPNext + Frappe HR** (Python/MariaDB). Kazi is React + Firebase/Firestore.
This project is therefore a **port of its compliance rules and reports into our stack**,
using their code as a working reference for what the IRD actually requires.

Two constraints follow:

- **License** — the repo is **GPL-3.0**. Do not copy code into Kazi (proprietary).
  Read it to learn the rules (report columns, tax formulas, BS calendar logic), then
  re-implement independently. For BS calendar data, use an independently-licensed source
  (e.g. MIT-licensed `nepali-date-converter` on npm), not the repo's data files.
- **Architecture** — several features are impossible to do honestly client-side
  (immutable audit trail, gap-free numbering, CBMS sync with retry). Those must live in
  **Cloud Functions + Firestore security rules**, which requires the **Blaze plan**
  (CBMS needs outbound HTTP from Functions). Needed by Phase 4 at the latest.

## 1. What "Nepal compliant" concretely means

From the repo + IRD's Electronic Billing Procedure (2074, as amended):

**Billing / VAT (IRD):**

1. Sequential, **fiscal-year-tied invoice numbers with no gaps**; gaps/cancellations must
   be explainable on a register.
2. **No edits or deletes after issue** — corrections only via credit/debit notes
   referencing the original with a reason; cancellations stay visible.
3. Print format — "Tax Invoice" with seller PAN, buyer name/PAN, taxable value vs. VAT
   split, **dates in both Bikram Sambat and AD**, amount in words, reprints labeled
   "**Copy of Original – 2/3/…**" with a print counter.
4. **Audit trail** — who created/printed/voided what and when, including login/logout.
5. **IRD-format registers** — Sales, Purchase, Sales/Purchase Return, VAT registers,
   cancellation register, VAT return summary — exportable in the IRD annex layout.
6. **CBMS sync** — real-time posting of each invoice to IRD's Central Billing Management
   System, with offline queue + retry until confirmed. (Mandatory above ~NPR 10 crore
   turnover, 5 crore for some sectors; required for IRD software listing regardless.)

**HR / Payroll (Income Tax Act, Labor Act, SSF/EPF):**

7. **Nepali fiscal year** (Shrawan–Ashadh) for everything financial; BS dates for
   attendance/leave/holidays.
8. **Income tax slabs** by marital status, SSF (11% employee / 20% employer), PF, CIT,
   gratuity; correct payslip breakdown.
9. Leave per Labor Act — auto-accrued home/sick leave, Nepali holiday lists,
   fiscal-year leave allocation.

## 2. Gap analysis (as of 2026-07-26)

Kazi already has: VAT 13% with discount-before-VAT (`src/utils/billing.jsx` →
`calcTotals`), company PAN, an approximate Nepal fiscal-year string, transactional
invoice numbering (`getNextNumber`), invoices/challans/quotations, and a basic payroll
calculator (`src/pages/Employees.jsx` → `calcPayroll`).

| Requirement | Repo has | Kazi today | Gap |
|---|---|---|---|
| BS (Nepali) dates everywhere | Full date engine + pickers | AD only; FY approximated | **Large** |
| FY-tied gap-free numbering | Yes | Transactional but global counter (`INV-001`), not per-FY | Medium |
| Post-issue immutability, no deletes | Enforced server-side | Invoices freely editable/deletable | **Large** |
| Credit/debit notes | Yes | None (only "Cancelled" status) | Medium |
| Compliant print format (dual dates, copy count, QR) | Yes | Good invoice PDF, but AD-only, no reprint counter/QR | Medium |
| IRD registers & VAT return | ~14 reports | Basic finance dashboards, `vat_bills` collection | **Large** |
| Audit trail incl. logins | Yes | Scattered `createdBy`/`cancelledBy` fields only | **Large** |
| CBMS sync | `cbms_api.py` + settings doctype | None | **Large** |
| Tax slabs / SSF / CIT / gratuity | Yes | Payroll = basic + bonus − PF − late fees | **Large** |
| BS leave/holiday/fiscal-year HR | Yes | AD attendance, no leave engine | Large (lower priority) |
| Backdated entry restriction | Yes | None | Small |

## 3. Phased implementation plan

### Phase 1 — Nepali date engine (foundation; ~3–5 days)

- `src/utils/nepaliDate.js`: AD↔BS conversion (BS month-length lookup, BS 2000–2100),
  formatting (`2082-04-10`, `१० साउन २०८२`), **exact** fiscal-year derivation
  (Shrawan 1 boundary — replaces the ±56/57 approximation in `currentFiscalYear()`).
- `<NepaliDatePicker>` component + `<DualDate>` display component (BS primary, AD secondary).
- Store **both** `date` (AD ISO — keeps existing queries/sorting working) and `dateBS`
  on new/edited docs. AD stays the storage format; BS derived at write time.
- Roll out to Billing first, then Finance, Attendance, Dashboard.

### Phase 2 — Invoice lifecycle compliance (core of IRD compliance; ~1 week)

- **Numbering**: per-fiscal-year, per-doc-type counters (`counters/billing_{FY}`),
  format `INV-2082/83-00001`, assigned **only at the moment of issue** (not draft
  creation) so drafts never consume numbers → no gaps.
- **Draft → Issued lifecycle**: drafts freely editable; on "Issue" the doc gets its
  number + BS/AD timestamps and becomes immutable. Post-issue, only `status`,
  `amountPaid`, `printCount` may change — enforced in **Firestore security rules**.
- **No deletes**: remove invoice delete paths from `Billing.jsx`; rules deny `delete`
  on `invoices`. Cancellation requires a reason and stays on the register.
- **Credit notes**: new doc type (prefix `CN`, own FY counter) referencing the original
  invoice with reason — the only way to correct an issued invoice.
- **Print format** (`src/components/InvoicePDF.jsx`): "Tax Invoice" heading, dual BS/AD
  dates, buyer PAN prominent, taxable/VAT split, `printCount` incremented
  transactionally with "Copy of Original – N" watermark, QR code (seller PAN +
  invoice no. + date + total).
- **Backdated-entry restriction** mirroring the repo's `backdated_doctype_restriction.py`.

### Phase 3 — IRD registers & VAT reports (~1 week)

New permission-gated "Compliance Reports" page reading from `invoices`, `credit_notes`,
`finance_purchases`, `vat_bills`:

- Sales & Purchase Registers in the **IRD annex column layout** (date BS/AD, invoice
  no., buyer/seller PAN, value, taxable, VAT, exempt/export split), with XLS/CSV export
  matching the repo's `download_ird_format.py` output.
- Sales/Purchase **Return** registers (from credit notes), **cancellation register**,
  monthly + party-wise registers.
- **VAT Return summary** matching IRD VAT return form boxes per Nepali month.
- Prerequisite: purchase entries need PAN + taxable/VAT split fields in the Finance form.

### Phase 4 — Audit trail (server-side; ~3–4 days; requires Blaze)

- Cloud Function Firestore triggers on `invoices`, `credit_notes`, `finance_*`,
  `journal_entries` writing to an **append-only `audit_logs` collection**
  (user, action, doc, before/after diff, timestamp). Rules: no client writes,
  no updates/deletes ever.
- Auth event logging (login/logout) and **print events** (who printed which copy).
- Audit Trail report UI with filters (user, doctype, date range).

### Phase 5 — CBMS integration (server-side only; ~1 week + IRD lead time)

- `cbms_settings` stored server-side only (IRD username/password/seller PAN,
  test vs. production URL) — never shipped to the client.
- On invoice issue: Function writes to `cbms_queue`; worker posts to the CBMS API
  (PAN, buyer, fiscal year, invoice no., amounts, `isrealtime` flag), marks confirmed;
  scheduled retry for failures; sync-status indicator per invoice in Billing.
- Build against IRD's **test endpoint** first; production gated on IRD registration.

### Phase 6 — Payroll & HR compliance (~1–2 weeks; parallelizable/deferrable)

- Config-driven **income tax slabs** (single/married, updatable yearly), SSF (11%/20%)
  vs. PF+CIT modes, 1% SST handling, gratuity — replacing the flat `calcPayroll()`.
- Payslip with statutory breakdown + annual **TDS/tax report** per employee.
- Nepali-FY leave allocation, Labor-Act sick/home leave accrual, BS holiday lists.

### Phase 7 — Hardening & certification

- Full Firestore rules review (immutability, role gates, audit-log lockdown),
  fiscal-year close/lock, ~5-year data retention.
- IRD software listing application if pursued (demo, audit trail evidence, CBMS test
  results) — involve the company's auditor; listing is procedural, not just technical.

## 4. Order & caveats

Phases 1 → 2 first (highest legal value — issued invoices are currently editable and
deletable, the biggest non-compliance). Phase 3 makes VAT filing painless. Phases 4–5
are what separate a well-behaved app from certifiable e-billing software. Phase 6 can
run in parallel.

CBMS is only legally *mandatory* above the turnover thresholds, but immutability,
numbering, registers, and audit trail apply to any VAT-registered business using
computer billing. Confirm exact annex layouts and current tax slabs with the company's
auditor against the latest IRD circulars before finalizing Phases 3 and 6.

## Sources

- [yarsa/nepal-compliance](https://github.com/yarsa/nepal-compliance) (GPL-3.0, reference implementation)
- [Electronic Billing in Nepal: The IRD CBMS Compliance Guide](https://mis.ac/articles/blog/electronic-billing-cbms-nepal.php)
- [Compliance Checklist for E-billing Software](https://tiggapp.com/blog-posts/compliance-checklist-for-e-billing-software-what-every-nepali-business-must-know)
- [Legal Provision for E-Billing in Nepal](https://ebillingnepal.com/en/articles/legal-provision-for-e-billing-nepal)
- [Nepal e-invoicing overview (Voxel)](https://www.voxelgroup.net/compliance/guides/nepal/)
