import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchAll, fetchOne, insertRow, updateRow } from "../lib/db";
import DocPreview from "../components/DocPreview";
import KeyboardSelect from "../components/KeyboardSelect";
import { Icons, cn } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { sectionCanEdit } from "../utils/permissions";
import { GBP_RATE } from "../constants";
import { scrollAppToTop } from "../utils/scroll";
import { todayDate } from "../utils/date";
import {
  DOC_TYPES, STATUS_BY_TYPE, BANK_NAMES, emptyItem, makeEmptyForm,
  fmtNPR, fmtCurrency, fmtDate, calcTotals, getNextNumber, statusBadge,
  resequenceDocNumbers, planRenumber, seriesKey,
} from "../utils/billing.jsx";
import {
  fiscalYearForDate, currentFiscalYear, isFiscalYearLabel,
  fiscalYearDateRangeAD, filterByFiscalYear, fiscalYearsIn, fmtDateBS,
} from "../utils/fiscalYear";
import { FiscalYearSelect, useFiscalYearFilter } from "../components/FiscalYearFilter";
import DualDateInput from "../components/DualDateInput";
import { postSaleStockOut } from "../utils/stockLedger";
import { useRegion } from "../context/RegionContext";
import { RegionSwitch, RegionSelect } from "../components/RegionSwitch";
import { countUntagged, filterByRegion } from "../utils/region";

/* ── English (A.D.) / Nepali (B.S.) date display ──────────────────────────
   Stored dates are always AD ISO strings; the calendar is a display choice.
   Every date column on the page reads the same `dateMode`, so flipping one
   header flips the whole table rather than leaving mixed calendars in a row. */
function fmtDateIn(mode, iso) {
  return mode === "bs" ? fmtDateBS(iso) : fmtDate(iso);
}

function DateModeToggle({ mode, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title="Switch between English (A.D.) and Nepali (B.S.) dates"
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        fontSize: 10.5, fontWeight: 600, color: "var(--mint-deep)", cursor: "pointer",
        background: "var(--mint-wash)", border: "1px solid rgba(45,155,111,.25)",
        borderRadius: 20, padding: "2px 7px 2px 6px", lineHeight: 1.4, textTransform: "none",
      }}
    >
      <span style={{ fontSize: 11 }}>⇄</span>{mode === "ad" ? "B.S." : "A.D."}
    </button>
  );
}

/* ── FX rates vs NPR (fallback — overwritten by live fetch) ── */
const FX_FALLBACK = {
  USD: 133.5, GBP: 168.0, EUR: 145.0, AUD: 86.0,
  INR: 1.60,  CNY: 18.4,  SGD: 99.0,  AED: 36.3,
  CAD: 97.0,  JPY: 0.89,
};

/* ── Currency Converter Popover ── */
function FXPopover({ idx, onApply, onClose }) {
  const [rates, setRates]     = useState(FX_FALLBACK);
  const [currency, setCurrency] = useState("USD");
  const [fxAmt, setFxAmt]     = useState("");
  const [manualRate, setManualRate] = useState(FX_FALLBACK["USD"]);
  const [loading, setLoading] = useState(true);

  // Fetch live rates once on mount
  useEffect(() => {
    fetch("https://api.exchangerate-api.com/v4/latest/NPR")
      .then(r => r.json())
      .then(data => {
        // API gives NPR→X, we need X→NPR: invert
        const live = {};
        Object.entries(data.rates || {}).forEach(([k, v]) => { if (v) live[k] = 1 / v; });
        const merged = { ...FX_FALLBACK, ...live };
        setRates(merged);
        setManualRate(+(merged[currency] || FX_FALLBACK[currency]).toFixed(4));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // When currency changes, update manual rate
  useEffect(() => {
    setManualRate(+(rates[currency] || FX_FALLBACK[currency]).toFixed(4));
  }, [currency, rates]);

  const nprResult = fxAmt && Number(fxAmt) > 0 ? Number(fxAmt) * Number(manualRate) : null;

  return (
    <div className="kbil-fx-pop" onClick={e => e.stopPropagation()}>
      <div className="kbil-fx-pop-hd">
        <span>Convert to NPR</span>
        <button className="kbil-fx-pop-close" onClick={onClose}>✕</button>
      </div>

      {/* Currency selector */}
      <div className="kbil-fx-row">
        <select
          className="kfin-select kbil-fx-sel"
          value={currency}
          onChange={e => setCurrency(e.target.value)}
        >
          {Object.keys(FX_FALLBACK).map(c => <option key={c}>{c}</option>)}
        </select>
        <input
          className="kfin-input kbil-fx-amt"
          type="number" min="0" step="any"
          placeholder={`Amount in ${currency}`}
          value={fxAmt}
          autoFocus
          onChange={e => setFxAmt(e.target.value)}
        />
      </div>

      {/* Exchange rate — editable */}
      <div className="kbil-fx-rate-row">
        <span className="kbil-fx-rate-lbl">1 {currency} =</span>
        <input
          className="kfin-input kbil-fx-rate-inp"
          type="number" min="0" step="any"
          value={manualRate}
          onChange={e => setManualRate(e.target.value)}
        />
        <span className="kbil-fx-rate-lbl">NPR</span>
        {loading && <span className="kbil-fx-live">fetching…</span>}
        {!loading && <span className="kbil-fx-live">live ✓</span>}
      </div>

      {/* Result */}
      {nprResult != null && (
        <div className="kbil-fx-result">
          = <strong>{fmtNPR(nprResult)}</strong>
        </div>
      )}

      {/* Actions */}
      <div className="kbil-fx-actions">
        <button
          className="kbil-btn-primary"
          style={{ fontSize: 12, padding: "5px 14px" }}
          disabled={!nprResult}
          onClick={() => { onApply(idx, nprResult.toFixed(2)); onClose(); }}
        >
          Apply to Rate
        </button>
        <button
          className="kbil-btn-ghost"
          style={{ fontSize: 12, padding: "5px 12px" }}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   BILLING PAGE — VAT Invoice · Challan · Quotation
   Nepal IRD–compliant: 13% VAT, discount before VAT,
   sequential numbering, partial payment tracking
══════════════════════════════════════════════════════ */
function Billing() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "billing");
  const { fmt: fmtC } = useCurrency();
  const { region } = useRegion();

  // Convert a stored value to NPR for use with fmtC.
  // GBP-denominated documents store amounts in GBP (not NPR), so multiply up.
  function toNPR(val, currency) {
    return currency === "GBP" ? Number(val || 0) * GBP_RATE : Number(val || 0);
  }

  const [tab, setTab]               = useState("invoice");
  const [dateMode, setDateMode]     = useState("ad"); // "ad" | "bs" — one switch for every date on the page, shown and entered
  const [allInvoices, setInvoices]     = useState([]);
  const [allChallans, setChallans]     = useState([]);
  const [allQuotations, setQuotations] = useState([]);
  const [allInventoryItems, setInventoryItems] = useState([]); // for the invoice line item "Stock Item" link

  /* ── One region's book of documents ────────────────────────
     Tab counts, the tables, the preview list and the stock-item picker all read
     these, so the switch reaches the whole page. The picker matters as much as
     the tables: linking a UK invoice line to a Nepal stock item would deduct
     from the wrong warehouse. */
  const invoices       = useMemo(() => filterByRegion(allInvoices,   region), [allInvoices,   region]);
  const challans       = useMemo(() => filterByRegion(allChallans,   region), [allChallans,   region]);
  const quotations     = useMemo(() => filterByRegion(allQuotations, region), [allQuotations, region]);
  const inventoryItems = useMemo(() => filterByRegion(allInventoryItems, region), [allInventoryItems, region]);

  /* ── One fiscal year at a time (or all of them) ────────────
     A document belongs to the year its own Nepali date falls in. The tab counts,
     the KPI strip and both tables read these, so the filter reaches the whole
     page. `invoices` and friends stay unfiltered by year for the Finance-ledger
     deep link, which has to find its document whichever year it is in. */
  const [fiscalYear] = useFiscalYearFilter();
  const invoicesInYear   = useMemo(() => filterByFiscalYear(invoices,   fiscalYear), [invoices,   fiscalYear]);
  const challansInYear   = useMemo(() => filterByFiscalYear(challans,   fiscalYear), [challans,   fiscalYear]);
  const quotationsInYear = useMemo(() => filterByFiscalYear(quotations, fiscalYear), [quotations, fiscalYear]);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(makeEmptyForm("invoice"));
  const [submitting, setSubmitting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [editingId, setEditingId]   = useState(null);   // doc id when editing, null when creating
  const [fxPopover, setFxPopover]   = useState(null);   // row idx with popover open, or null

  const [converting, setConverting] = useState(null); // doc id being converted, or null
  const [showCancelled, setShowCancelled] = useState(false);

  // Search/filter state (Fix 1) — prefilled when arriving from a Finance-ledger deep link
  const [searchQuery, setSearchQuery] = useState(location.state?.search || "");

  // Payment modal state
  const [payModal, setPayModal]     = useState(null); // { id, docNum, totalNPR, currentPaid, coll }
  const [payAmt, setPayAmt]         = useState("");
  const [payError, setPayError]     = useState(""); // Fix 6: payment ceiling error
  const [payDate, setPayDate]       = useState("");
  const [payMethod, setPayMethod]   = useState("Bank");
  const [payRef, setPayRef]         = useState("");
  const [paySaving, setPaySaving]   = useState(false);
  const [payHistory, setPayHistory] = useState([]);

  // Fix 6: PAN validation error
  const [panError, setPanError] = useState("");

  /* ── Load data ── */
  async function loadAll() {
    const [invRows, chRows, qtRows, invtRows] = await Promise.all([
      fetchAll("invoices"),
      fetchAll("challans"),
      fetchAll("quotations"),
      fetchAll("inventory"),
    ]);
    setInventoryItems(invtRows);
    // Newest document first, by its own date — the Nepali and English calendars
    // order identically, so one comparison serves both. Numbers follow dates
    // (see resequenceDocNumbers), so within a day the higher number is the later
    // one; that also keeps a day's documents in a stable order.
    const seqNum = (row) => {
      const m = /(\d+)\s*$/.exec(row.invoiceNumber || row.challanNumber || row.quotationNumber || "");
      return m ? parseInt(m[1], 10) : -1;
    };
    const sort = (a, b) => (b.date || "").localeCompare(a.date || "") || (seqNum(b) - seqNum(a));
    setInvoices([...invRows].sort(sort));
    setChallans([...chRows].sort(sort));
    setQuotations([...qtRows].sort(sort));
  }

  useEffect(() => { loadAll().catch(console.error); }, []);

  /* ── Tab change ── */
  function switchTab(t) {
    setTab(t);
    setShowForm(false);
    setEditingId(null);
    setForm(makeEmptyForm(t));
  }

  /* ── Active list & meta ── */
  const activeList     = tab === "invoice" ? invoicesInYear : tab === "challan" ? challansInYear : quotationsInYear;
  // The years this tab's documents (in the region on screen) actually fall in —
  // the only ones the picker offers.
  const regionList     = tab === "invoice" ? invoices : tab === "challan" ? challans : quotations;
  const yearsHere      = useMemo(() => fiscalYearsIn(regionList), [regionList]);
  // Every document of this kind, in any region and any year: numbers are one
  // series across regions, so what would be renumbered has to be judged on all.
  const allOfKind      = tab === "invoice" ? allInvoices : tab === "challan" ? allChallans : allQuotations;
  const meta           = DOC_TYPES[tab];

  // Fix 1: filter by search query (client name, invoice number, or status)
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeList;
    return activeList.filter(r =>
      (r.clientName  || "").toLowerCase().includes(q) ||
      (r[DOC_TYPES[tab].numberField] || "").toLowerCase().includes(q) ||
      (r.status      || "").toLowerCase().includes(q)
    );
  }, [activeList, searchQuery, tab]);

  const activeDocs     = filteredList.filter(r => r.status !== "Cancelled");
  const cancelledDocs  = filteredList.filter(r => r.status === "Cancelled");

  /* ── Form totals (live preview) ── */
  const formTotals = useMemo(
    () => calcTotals(form.items, form.applyVAT || false, form.discountPct || 0, form.discountMode, form.discountFlatAmt || 0),
    [form.items, form.applyVAT, form.discountPct, form.discountMode, form.discountFlatAmt],
  );

  /* ── Open edit mode for an existing document ── */
  function openEdit(row) {
    // Load the row data into the form, stripping Firestore-only fields
    const { id, ...rest } = row;
    const items = (row.items || []).map(it => {
      let desc = it.description || "";
      if (!desc.includes("\n") && desc.includes("•")) {
        const segments = desc.split(/\s*•\s*/);
        if (segments.length > 1) {
          desc = segments.map((seg, idx) => {
            if (idx === 0) return seg.trim();
            return `• ${seg.trim()}`;
          }).join("\n");
        }
      }
      return { ...it, description: desc };
    });
    // makeEmptyForm defaults the fiscal year to the *current* one, which is wrong
    // for a document filed in an earlier year. Rows written before fiscal-year
    // numbering carry no fiscal year at all, so derive it from the document's own
    // Bikram Sambat date instead of today's.
    const fiscalYear = rest.fiscalYear || fiscalYearForDate(rest.date) || currentFiscalYear();
    setForm({ ...makeEmptyForm(tab), ...rest, fiscalYear, items });
    setEditingId(id);
    setShowForm(true);
    scrollAppToTop();
  }

  // Arriving from a Finance-ledger click: jump straight into editing that invoice
  // instead of landing on the list and making her find + press Edit herself.
  const autoEditDoneRef = useRef(false);
  useEffect(() => {
    if (autoEditDoneRef.current || !location.state?.autoEdit || invoices.length === 0) return;
    autoEditDoneRef.current = true;
    const q = (location.state.search || "").toLowerCase();
    const match = invoices.find(r => (r.invoiceNumber || "").toLowerCase() === q)
      || invoices.find(r => (r.clientName || "").toLowerCase() === q);
    if (match) openEdit(match);
  }, [invoices, location.state]);

  /* ── Enter advances to the next field instead of submitting — same
     Enter-to-advance feel as PurchaseRowGroup.jsx / KeyboardSelect.jsx ── */
  function handleKeyDown(e) {
    if (e.key !== "Enter") return;
    // If it's a textarea, let it handle newlines naturally
    if (e.target.tagName === "TEXTAREA") {
      e.stopPropagation();
      return;
    }
    // If it's the submit button, allow submission
    if (e.target.type === "submit" || (e.target.tagName === "BUTTON" && e.target.type !== "button")) {
      return;
    }
    e.preventDefault();
    // textarea included so a multiline field (e.g. Client Address) can be the
    // *destination* of an advance, even though its own handler keeps Enter as
    // a newline once focus actually lands there.
    const fields = Array.from(e.currentTarget.querySelectorAll("input, select, textarea, [data-kb-select]")).filter(el => !el.disabled);
    const next = fields[fields.indexOf(e.target) + 1];
    next?.focus();
  }

  // Enter (not Shift+Enter) on the last row's Rate field appends a fresh line
  // item and jumps focus into its Description — mirrors addItemOnEnter in
  // PurchaseRowGroup.jsx. Must ignore every other key or Tab gets hijacked too.
  function addItemOnEnter(e) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    const container = e.currentTarget.closest("form");
    setForm(f => ({ ...f, items: [...f.items, { ...emptyItem }] }));
    requestAnimationFrame(() => {
      const inputs = container?.querySelectorAll('[data-role="item-description"]');
      inputs?.[inputs.length - 1]?.focus();
    });
  }

  /* ── Numbers follow dates ──────────────────────────────────
     A document's number is its place in its series by date: the earliest is 001,
     the next 002. Filing one with an earlier date than documents already on
     record — or moving an existing one's date — therefore shifts everything after
     it. Before saving, work out whether that would change numbers already issued,
     so the person can be asked first. The database does the renumbering itself
     (resequence_doc_numbers); this is only the preview. */
  function planSave() {
    const numberField = meta.numberField;
    const newFY = fiscalYearForDate(form.date) || form.fiscalYear || currentFiscalYear();
    const existing = editingId ? allOfKind.find(d => d.id === editingId) : null;
    const oldFY = String(existing?.fiscalYear || "").trim();
    // Only a date edit reshuffles anything. Changing a client name in a series
    // that happens to be out of order must not start renumbering it.
    const run = !existing || existing.date !== form.date;
    // A real move between fiscal-year series (never for quotations, which are
    // one series for all time).
    const fyChanged = !!existing && run && tab !== "quotation" && isFiscalYearLabel(oldFY) && newFY !== oldFY;
    const inSeries = (fy) => allOfKind.filter(d => d.id !== editingId && seriesKey(tab, d) === seriesKey(tab, { fiscalYear: fy }));
    const me = {
      id: editingId || "__new__",
      date: form.date,
      createdAt: existing?.createdAt || new Date().toISOString(),
      [numberField]: existing && !fyChanged ? existing[numberField] : null,
    };
    let affected = [], self = null;
    const seriesToFix = [];
    if (run) {
      const changes = planRenumber(tab, [...inSeries(newFY), me]);
      affected = changes.filter(c => c.id !== me.id);
      self = changes.find(c => c.id === me.id) || null;
      seriesToFix.push(newFY);
      if (fyChanged) {
        affected = [...affected, ...planRenumber(tab, inSeries(oldFY))];
        seriesToFix.push(oldFY);
      }
    }
    return { run, newFY, fyChanged, affected, self, seriesToFix };
  }

  function renumberMessage(changes, what) {
    const shown = changes.slice(0, 8).map(c => `${c.from || "—"}  →  ${c.to}`).join("\n");
    const more = changes.length > 8 ? `\n…and ${changes.length - 8} more` : "";
    return `${what} will renumber ${changes.length} existing ${meta.label.toLowerCase()}${changes.length !== 1 ? "s" : ""} so the numbers keep following the dates:\n\n${shown}${more}\n\nCopies already printed or sent will still show the old numbers. Continue?`;
  }

  /** Put each series back in date order. Never throws — the document itself is already saved by now. */
  async function resequenceSeries(fys) {
    try {
      for (const fy of fys) await resequenceDocNumbers(tab, fy);
      return true;
    } catch (err) {
      console.error("Failed to renumber by date:", err);
      alert("The document was saved, but the numbers could not be put back in date order. Ask an admin to apply database migration 0040, then use \"Renumber by date\" on this page.");
      return false;
    }
  }

  /* Series that are out of date order right now, judged on every region and every
     year. Fixing one is a deliberate act (a button), never a side effect. */
  const outOfOrder = useMemo(() => {
    const groups = new Map();
    for (const d of allOfKind) {
      const key = seriesKey(tab, d);
      if (tab !== "quotation" && !isFiscalYearLabel(key)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }
    const out = [];
    for (const [key, docs] of groups) {
      if (tab !== "quotation" && isFiscalYearLabel(fiscalYear) && key !== fiscalYear) continue;
      const changes = planRenumber(tab, docs);
      if (changes.length) out.push({ key, changes });
    }
    return out;
  }, [allOfKind, tab, fiscalYear]);

  async function renumberOutOfOrder() {
    const changes = outOfOrder.flatMap(g => g.changes);
    if (!changes.length || !window.confirm(renumberMessage(changes, "This"))) return;
    setSubmitting(true);
    try {
      for (const g of outOfOrder) await resequenceDocNumbers(tab, g.key);
      await loadAll();
    } catch (err) {
      console.error("Failed to renumber by date:", err);
      alert("Could not renumber. Database migration 0040 may not be applied yet.");
    }
    setSubmitting(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (document.activeElement && document.activeElement.tagName === "TEXTAREA") {
      return;
    }
    // Fix 6: PAN required if invoice total > 50000 NPR
    if (tab === "invoice") {
      const applyVATPreview = form.applyVAT;
      const { total: previewTotal } = calcTotals(form.items, applyVATPreview, form.discountPct || 0, form.discountMode, form.discountFlatAmt || 0);
      if (previewTotal > 50000 && !form.clientPAN?.trim()) {
        setPanError("PAN number is required for invoices exceeding NPR 50,000 (Nepal IRD regulation).");
        return;
      }
    }
    setPanError("");
    const plan = planSave();
    if (plan.affected.length && !window.confirm(renumberMessage(plan.affected, "Saving this document"))) return;
    setSubmitting(true);
    try {
      const applyVAT = tab === "invoice" && form.applyVAT;
      const { subtotal, discountAmt, taxableAmt, vatAmt, total } = calcTotals(form.items, applyVAT, form.discountPct, form.discountMode, form.discountFlatAmt || 0);

      if (editingId) {
        /* ── UPDATE existing document ── */
        const updates = {
          ...form,
          // The year follows the date, and the number follows the year: a date
          // moved into another fiscal year takes the document into that year's
          // series. It is parked on a placeholder number first — the old one may
          // already be taken there — and given its real one by the renumber below.
          fiscalYear:     plan.run ? plan.newFY : form.fiscalYear,
          ...(plan.fyChanged ? { [meta.numberField]: `RENUM:${editingId}` } : {}),
          currency:       tab === "quotation" ? (form.currency || "NPR") : "NPR",
          subtotalNPR:    subtotal,
          discountMode:    form.discountMode || "pct",
          discountPct:    Number(form.discountPct) || 0,
          discountFlatAmt: Number(form.discountFlatAmt) || 0,
          discountAmtNPR: discountAmt,
          taxableAmtNPR:  taxableAmt,
          vatAmountNPR:   applyVAT ? vatAmt : 0,
          totalNPR:       total,
          updatedBy:      profile?.name || "Unknown",
          updatedAt:      new Date().toISOString(),
        };
        // Manually flipping an invoice to Paid must settle its credit — otherwise
        // the badge says Paid while Credit Due/Record Payment still show an
        // outstanding balance from before the status was changed. Writing
        // amountPaid straight in would not survive: it is now derived from the
        // payments table by trigger, so the next real payment would recompute
        // it and the settlement would silently vanish. Book the balance as a
        // payment instead, which is also the honest record of what happened.
        const settleNPR = tab === "invoice" && form.status === "Paid"
          ? Math.max(0, total - Number(form.amountPaid || 0)) : 0;
        // Remove read-only fields that shouldn't be overwritten
        delete updates.createdAt;
        delete updates.createdBy;
        delete updates.id;
        delete updates.amountPaid;   // trigger-owned on invoices
        await updateRow(meta.coll, editingId, updates);
        if (settleNPR > 0.005) {
          await insertRow("payments", {
            invoiceId:  editingId,
            customerId: form.customerId || null,
            paidOn:     todayDate(),
            amount:     settleNPR,
            method:     form.paymentType || null,
            note:       "Settled by marking the invoice Paid.",
            recordedBy: profile?.name || "Unknown",
            region:     form.region || region,
          });
        }
        if (plan.affected.length || plan.self || plan.fyChanged) await resequenceSeries(plan.seriesToFix);
        setEditingId(null);
      } else {
        /* ── CREATE new document ── */
        // The fiscal year comes from the document's own (Bikram Sambat) date, so
        // a backdated invoice is numbered into the year it belongs to and the FY
        // stored on the record can never disagree with its number.
        const fiscalYear = fiscalYearForDate(form.date) || form.fiscalYear || currentFiscalYear();
        const docNumber = await getNextNumber(tab, fiscalYear);
        const record = {
          ...form,
          fiscalYear,
          currency:       tab === "quotation" ? (form.currency || "NPR") : "NPR",
          [meta.numberField]: docNumber,
          subtotalNPR:    subtotal,
          discountMode:    form.discountMode || "pct",
          discountPct:    Number(form.discountPct) || 0,
          discountFlatAmt: Number(form.discountFlatAmt) || 0,
          discountAmtNPR: discountAmt,
          taxableAmtNPR:  taxableAmt,
          vatAmountNPR:   applyVAT ? vatAmt : 0,
          totalNPR:       total,
          amountPaid:     0,
          region:         form.region || region,
          createdBy:      profile?.name || "Unknown",

        };
        // Strip fields irrelevant to this doc type
        if (tab !== "invoice")   { delete record.applyVAT; delete record.dueDate; delete record.paymentTerms; delete record.amountPaid; delete record.relatedChallan; delete record.relatedQuotation; delete record.paymentType; delete record.bankName; }
        if (tab !== "challan")   { delete record.vehicleNo; delete record.driverName; delete record.routeFrom; delete record.routeTo; }
        if (tab !== "quotation") { delete record.validUntil; delete record.terms; }
        const saved = await insertRow(meta.coll, record);
        // The number just drawn is the next one in the series, which is only right
        // if this is the latest document by date. A backdated one — or a series
        // with gaps — is put back in date order, and stock is posted under the
        // number the document ends up with.
        if (plan.affected.length || (plan.self && plan.self.to !== docNumber)) {
          if (await resequenceSeries(plan.seriesToFix)) {
            try { record[meta.numberField] = (await fetchOne(meta.coll, saved.id))?.[meta.numberField] || docNumber; } catch { /* keep the drawn number */ }
          }
        }
        // Deduct stock for any line item explicitly linked to an inventory item —
        // only on invoice creation, never on edits/status changes, so stock is
        // deducted exactly once per sale.
        if (tab === "invoice") {
          postSaleStockOut({
            invoice: record,
            items: record.items,
            createdBy: profile?.name || "Unknown",
          }).catch(err => console.error("Stock auto-post failed:", err));
        }
      }

      setForm(makeEmptyForm(tab));
      setShowForm(false);
      await loadAll();
    } catch (err) {
      console.error("Failed to save document:", err);
      alert("Failed to save document. Please try again.");
    }
    setSubmitting(false);
  }

  /* ── Status update ── */
  async function updateStatus(id, status) {
    await updateRow(meta.coll, id, { status });
    await loadAll();
  }

  /* ── Cancel document (preserve record) ── */
  async function cancelDoc(id) {
    if (!window.confirm("Cancel this document? The record will be preserved.")) return;
    await updateRow(meta.coll, id, { status: "Cancelled" });
    await loadAll();
  }

  /* ── Record payment (partial or full) ──
     Each payment is its own row in `payments`, carrying the date it actually
     arrived. The invoice's amountPaid is recomputed from those rows by a
     database trigger, so it stays the cheap running total every dashboard
     already reads -- but it is now a summary of a history rather than a
     number that overwrote the last one. Status stays app-side, because the
     database must not decide that a cancelled invoice is Paid. */
  async function recordPayment() {
    if (!payModal || paySaving) return;
    const newAmt = Number(payAmt);
    if (isNaN(newAmt) || newAmt <= 0) { setPayError("Enter a valid payment amount."); return; }
    // Fix 6: payment ceiling — cannot exceed outstanding balance
    const outstanding = payModal.totalNPR - payModal.currentPaid;
    if (newAmt > outstanding + 0.005) {
      setPayError(`Payment of ${fmtNPR(newAmt)} exceeds the outstanding balance of ${fmtNPR(outstanding)}. Please enter a smaller amount.`);
      return;
    }
    setPayError("");
    setPaySaving(true);
    try {
      const totalPaid = Math.min(payModal.currentPaid + newAmt, payModal.totalNPR);
      const creditLeft = payModal.totalNPR - totalPaid;
      const newStatus  = creditLeft <= 0.005 ? "Paid" : "Partial";

      // The modal works in rupees; the row is stored in the invoice's own
      // currency so the trigger's sum stays comparable with total_npr.
      await insertRow("payments", {
        invoiceId:  payModal.id,
        customerId: payModal.customerId || null,
        paidOn:     payDate || todayDate(),
        amount:     payModal.isGBP ? newAmt / GBP_RATE : newAmt,
        method:     payMethod || null,
        bankName:   payMethod === "Bank" ? (payModal.bankName || null) : null,
        reference:  payRef.trim() || null,
        recordedBy: profile?.name || "Unknown",
        region:     payModal.region || null,
      });
      // The trigger has already written amountPaid; only the workflow status
      // is ours to set.
      await updateRow("invoices", payModal.id, { status: newStatus });

      closePayModal();
      await loadAll();
    } catch (err) {
      console.error("Failed to record payment:", err);
      setPayError("Could not save the payment. Please try again.");
    } finally {
      setPaySaving(false);
    }
  }

  function closePayModal() {
    setPayModal(null);
    setPayAmt(""); setPayError(""); setPayRef("");
    setPayDate(""); setPayMethod("Bank"); setPayHistory([]);
  }

  /* Payments already recorded against the invoice being paid. */
  async function loadPayHistory(invoiceId) {
    try {
      setPayHistory(await fetchAll("payments", {
        filters: [{ field: "invoiceId", value: invoiceId }],
        orderBy: "paidOn", orderDir: "desc",
      }));
    } catch (err) {
      console.error("Failed to load payment history:", err);
      setPayHistory([]);
    }
  }

  /* ── Convert Quotation → Invoice ── */
  async function convertToInvoice(qt) {
    if (converting === qt.id) return;
    setConverting(qt.id);
    const isGBP = qt.currency === "GBP";
    const confirmMsg = isGBP
      ? `Convert ${qt.quotationNumber} to a VAT Invoice? Since the quotation is in GBP, the rates will be converted to NPR using the rate of 1 GBP = 200 NPR.`
      : `Convert ${qt.quotationNumber} to a VAT Invoice?`;
    if (!window.confirm(confirmMsg)) { setConverting(null); return; }
    setSubmitting(true);
    try {
      // Convert items rates to NPR if GBP
      const items = (qt.items || []).map(it => {
        if (isGBP) {
          return { ...it, rate: Number(it.rate || 0) * GBP_RATE };
        }
        return it;
      });

      const { subtotal, discountAmt, taxableAmt, vatAmt, total } = calcTotals(items, true, qt.discountPct || 0, qt.discountMode, qt.discountFlatAmt || 0);
      // The invoice is raised today, so its fiscal year — and number series —
      // follow today's Nepali date, not the quotation's fiscal year.
      const invDate = new Date().toISOString().slice(0, 10);
      const invFiscalYear = fiscalYearForDate(invDate) || currentFiscalYear();
      const invNumber = await getNextNumber("invoice", invFiscalYear);
      const d = new Date(); d.setDate(d.getDate() + 30);

      await insertRow("invoices", {
        invoiceNumber:    invNumber,
        date:             invDate,
        dueDate:          d.toISOString().slice(0, 10),
        fiscalYear:       invFiscalYear,
        paymentTerms:     "Net 30",
        clientName:       qt.clientName || "",
        clientPAN:        qt.clientPAN || "",
        clientAddress:    qt.clientAddress || "",
        clientPhone:      qt.clientPhone || "",
        status:           "Draft",
        applyVAT:         true,
        paymentType:      "CASH",
        items:            items,
        note:             qt.note || "",
        discountMode:     qt.discountMode || "pct",
        discountPct:      qt.discountPct || 0,
        discountFlatAmt:  qt.discountFlatAmt || 0,
        discountAmtNPR:   discountAmt,
        taxableAmtNPR:    taxableAmt,
        relatedQuotation: qt.quotationNumber || "",
        relatedChallan:   "",
        region:           qt.region || null,
        subtotalNPR:      subtotal,
        vatAmountNPR:     vatAmt,
        totalNPR:         total,
        amountPaid:       0,
        currency:         "NPR",
        createdBy:        profile?.name || "Unknown",
      });

      // No-op unless the quotation's items already carry a stockItemId — quotations
      // don't expose the Stock Item picker, so this only fires if one is added later.
      postSaleStockOut({
        invoice: { date: invDate, invoiceNumber: invNumber },
        items,
        createdBy: profile?.name || "Unknown",
      }).catch(err => console.error("Stock auto-post failed:", err));

      await updateRow("quotations", qt.id, {
        relatedInvoice: invNumber,
        status: qt.status === "Sent" ? "Accepted" : qt.status,
      });

      await loadAll();
      setTab("invoice");
      alert(`Created ${invNumber} from ${qt.quotationNumber}`);
    } catch (err) {
      console.error(err);
      alert("Conversion failed.");
    } finally {
      setConverting(null);
    }
    setSubmitting(false);
  }

  /* ── Fix 5: CSV export for displayed invoices ── */
  function exportCSV() {
    const rows = activeDocs; // already filtered by searchQuery via activeDocs
    const numField = meta.numberField;
    const header = ["Invoice #", "Client", "Date", "Amount (NPR)", "Status"];
    const lines = [
      header.join(","),
      ...rows.map(r => [
        `"${r[numField] || ""}"`,
        `"${(r.clientName || "").replace(/"/g, '""')}"`,
        `"${r.date || ""}"`,
        r.totalNPR != null ? r.totalNPR : "",
        `"${r.status || ""}"`,
      ].join(","))
    ];
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tab}s-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Form item helpers ── */
  function updateItem(idx, field, value) {
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [field]: value } : it) }));
  }
  function setF(field, value) { setForm(f => ({ ...f, [field]: value })); }

  /* ── KPI Summary ── */
  const summary = useMemo(() => {
    const list = activeList.filter(d => d.status !== "Cancelled");
    const getValInNPR = (d, key) => {
      const val = Number(d[key] || 0);
      if (d.currency === "GBP") {
        return val * GBP_RATE;
      }
      return val;
    };
    const total = list.reduce((s, d) => s + getValInNPR(d, "totalNPR"), 0);
    const paid  = list.filter(d => ["Paid", "Delivered", "Accepted"].includes(d.status)).reduce((s, d) => s + getValInNPR(d, "totalNPR"), 0);
    const partialPaid = list.filter(d => d.status === "Partial").reduce((s, d) => s + getValInNPR(d, "amountPaid"), 0);
    const pending = list.filter(d => !["Paid", "Delivered", "Accepted", "Cancelled", "Rejected"].includes(d.status)).reduce((s, d) => {
      const due = getValInNPR(d, "totalNPR") - getValInNPR(d, "amountPaid");
      return s + Math.max(0, due);
    }, 0);
    const vatCollected = tab === "invoice"
      ? list.filter(d => ["Paid", "Partial"].includes(d.status)).reduce((s, d) => {
          const totalVal = getValInNPR(d, "totalNPR");
          const paidVal = getValInNPR(d, "amountPaid");
          const vatVal = getValInNPR(d, "vatAmountNPR");
          const paidFraction = totalVal > 0 ? paidVal / totalVal : 0;
          return s + vatVal * (d.status === "Paid" ? 1 : paidFraction);
        }, 0)
      : 0;
    return { total, paid: paid + partialPaid, pending, vatCollected, count: list.length };
  }, [activeList, tab]);

  const numField = meta.numberField;

  return (
    <>
      <div className="kfin-wrap">

        <button
          type="button"
          className="ghost-button"
          style={{ alignSelf: "flex-start" }}
          onClick={() => navigate("/finance")}
        >
          <Icons.ChevronLeft size={15} sw={2} /> Back to Finance
        </button>

        {/* ── Page Header ── */}
        <div className="kbil-page-hd">
          <div>
            <h1 className="kbil-page-title">Billing &amp; Invoicing</h1>
            <p className="kbil-page-sub">VAT invoices · challan bills · quotations · Nepal IRD compliant</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <RegionSwitch untagged={countUntagged(
              tab === "invoice" ? allInvoices : tab === "challan" ? allChallans : allQuotations
            )} />
            {canEdit && (
              <button className="kbil-btn-primary" data-tour="new-doc" onClick={() => {
                if (showForm) { setShowForm(false); setEditingId(null); setForm(makeEmptyForm(tab)); }
                else { setEditingId(null); setForm(makeEmptyForm(tab)); setShowForm(true); }
              }}>
                {showForm ? "✕ Cancel" : `+ New ${meta.label}`}
              </button>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="tab-row" data-tour="billing-tabs">
          {Object.entries(DOC_TYPES).map(([key, dt]) => {
            const count = key === "invoice" ? invoicesInYear.length : key === "challan" ? challansInYear.length : quotationsInYear.length;
            return (
              <button key={key} className={`tab-button ${tab === key ? "active" : ""}`} onClick={() => switchTab(key)}>
                {dt.label}<span className="tab-badge">{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── KPI Strip ── */}
        <div className="kfin-kpis">
          <div className="kfin-kpi">
            <div className="kfin-kpi-ico" style={{ background: "rgba(31,110,76,.12)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1f6e4c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20"/></svg>
            </div>
            <p className="kfin-kpi-label">Total {meta.label}s</p>
            <p className="kfin-kpi-value">{fmtC(summary.total)}</p>
            <p className="kfin-kpi-sub">{summary.count} record{summary.count !== 1 ? "s" : ""}</p>
          </div>
          <div className="kfin-kpi">
            <div className="kfin-kpi-ico" style={{ background: "rgba(86,136,176,.12)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5688b0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <p className="kfin-kpi-label">{tab === "invoice" ? "Collected" : tab === "challan" ? "Delivered" : "Accepted"}</p>
            <p className="kfin-kpi-value">{fmtC(summary.paid)}</p>
          </div>
          <div className="kfin-kpi">
            <div className="kfin-kpi-ico" style={{ background: "rgba(196,101,74,.12)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4654a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <p className="kfin-kpi-label">Credit Outstanding</p>
            <p className="kfin-kpi-value">{fmtC(summary.pending)}</p>
          </div>
          {tab === "invoice" && (
            <div className="kfin-kpi">
              <div className="kfin-kpi-ico" style={{ background: "rgba(180,130,30,.12)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b4821e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <p className="kfin-kpi-label">VAT Collected</p>
              <p className="kfin-kpi-value">{fmtC(summary.vatCollected)}</p>
              <p className="kfin-kpi-sub">13% VAT · paid invoices</p>
            </div>
          )}
        </div>

        {/* ══ New Document Form ══ */}
        {showForm && (
          <div className="kfin-block">
            <div className="kfin-block-hd">
              <h2 className="kfin-block-title">{editingId ? `Edit ${meta.label}` : `New ${meta.label}`}</h2>
              <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
                {editingId
                  ? `Editing ${form[meta.numberField] || editingId} · FY ${form.fiscalYear || "—"}`
                  : tab === "quotation"
                  ? `Number follows the date, one run across all years (no fiscal-year reset) · FY ${form.fiscalYear || "—"}`
                  : `Number follows the date (${meta.prefix}-001 onwards) · FY ${form.fiscalYear || "—"}`}
              </span>
            </div>
            <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
              <div className="kfin-form" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>

                {/* Date — enterable in either calendar. It drives the fiscal year (and
                    therefore the number series) off the Nepali date, so the FY field
                    stays in step, and the number follows the date within that year. */}
                <label className="kfin-label">
                  Date
                  <DualDateInput
                    value={form.date}
                    required
                    mode={dateMode}
                    onModeChange={setDateMode}
                    onChange={v => setForm(f => ({
                      ...f,
                      date: v,
                      fiscalYear: fiscalYearForDate(v) || f.fiscalYear,
                    }))}
                  />
                </label>

                {/* Due Date / Valid Until */}
                {tab === "invoice" && (
                  <label className="kfin-label">
                    Due Date
                    <DualDateInput value={form.dueDate} mode={dateMode} onModeChange={setDateMode} onChange={v => setF("dueDate", v)} />
                  </label>
                )}
                {tab === "quotation" && (
                  <label className="kfin-label">
                    Valid Until
                    <DualDateInput value={form.validUntil} mode={dateMode} onModeChange={setDateMode} onChange={v => setF("validUntil", v)} />
                  </label>
                )}
                {tab === "quotation" && (
                  <label className="kfin-label">
                    Currency
                    <select className="kfin-select" value={form.currency || "NPR"} onChange={e => setF("currency", e.target.value)}>
                      <option value="NPR">NPR (Nepalese Rupee)</option>
                      <option value="GBP">GBP (British Pound)</option>
                    </select>
                  </label>
                )}

                {/* Status */}
                <label className="kfin-label">
                  Status
                  <KeyboardSelect className="kfin-select" value={form.status} options={STATUS_BY_TYPE[tab]} onChange={v => setF("status", v)} />
                </label>

                {/* Region */}
                <label className="kfin-label">
                  Region
                  <RegionSelect className="kfin-select" value={form.region} onChange={v => setF("region", v)} />
                </label>

                {/* Fiscal Year (invoice + challan) — derived from the date, never typed.
                    It decides which 1..N series the number is drawn from, so a year that
                    disagreed with the date would put the document in the wrong series
                    (and could collide with a number already filed in that year). */}
                {(tab === "invoice" || tab === "challan") && (() => {
                  const fy = form.fiscalYear || "—";
                  const range = form.fiscalYear ? fiscalYearDateRangeAD(form.fiscalYear) : null;
                  // The year the document is filed under today. Changing the date to
                  // another year moves it into that year's series on save.
                  const filedIn = editingId ? String(allOfKind.find(d => d.id === editingId)?.fiscalYear || "").trim() : "";
                  const moving = isFiscalYearLabel(filedIn) && !!form.fiscalYear && filedIn !== form.fiscalYear;
                  return (
                    <label className="kfin-label">
                      Fiscal Year (B.S.)
                      <input className="kfin-input" type="text" value={fy} readOnly tabIndex={-1}
                        style={{ background: "var(--bg-2)", color: "var(--ink-3)", cursor: "default" }} />
                      <span style={{ fontSize: 11, color: moving ? "var(--terra)" : "var(--ink-4)", marginTop: 3, lineHeight: 1.4 }}>
                        {moving
                          ? `This date is in FY ${form.fiscalYear}, but ${form[meta.numberField] || "the document"} is filed in FY ${filedIn}. Saving moves it into FY ${form.fiscalYear} and gives it a new number there.`
                          : range
                            ? `Shrawan 1 – Asar end · ${range.startAD} to ${range.endAD} A.D.`
                            : "Set automatically from the date above."}
                      </span>
                    </label>
                  );
                })()}

                {/* Payment Terms (invoice) */}
                {tab === "invoice" && (
                  <label className="kfin-label">
                    Payment Terms
                    <input className="kfin-input" type="text" value={form.paymentTerms} placeholder="Net 30" onChange={e => setF("paymentTerms", e.target.value)} />
                  </label>
                )}

                {/* Payment Type (invoice) — routes this sale into the Cash or Bank ledger on Finance */}
                {tab === "invoice" && (
                  <label className="kfin-label">
                    Payment Type
                    <KeyboardSelect className="kfin-select" value={form.paymentType || "CASH"} options={["CASH", "Bank", "Credit"]} onChange={v => setF("paymentType", v)} />
                  </label>
                )}

                {/* Bank (invoice, only when Payment Type is Bank) — which bank ledger this sale lands in */}
                {tab === "invoice" && form.paymentType === "Bank" && (() => {
                  const isOtherBank = form.bankName === "other" || (form.bankName && !BANK_NAMES.includes(form.bankName));
                  return (
                    <>
                      <label className="kfin-label">
                        Bank
                        <KeyboardSelect className="kfin-select" value={isOtherBank ? "other" : (form.bankName || "Nabil Bank")}
                          options={[...BANK_NAMES, { value: "other", label: "Other" }]}
                          onChange={v => setF("bankName", v)} />
                      </label>
                      {isOtherBank && (
                        <label className="kfin-label">
                          Bank Name
                          <input className="kfin-input" type="text" value={form.bankName === "other" ? "" : form.bankName}
                            placeholder="Type bank name" onChange={e => setF("bankName", e.target.value === "" ? "other" : e.target.value)} />
                        </label>
                      )}
                    </>
                  );
                })()}

                {/* Challan — Transport Details (Nepal compliance) */}
                {tab === "challan" && (
                  <>
                    <label className="kfin-label">
                      Vehicle No.
                      <input className="kfin-input" type="text" value={form.vehicleNo || ""} placeholder="BA 1 KA 1234" onChange={e => setF("vehicleNo", e.target.value)} />
                    </label>
                    <label className="kfin-label">
                      Driver Name
                      <input className="kfin-input" type="text" value={form.driverName || ""} placeholder="Full name" onChange={e => setF("driverName", e.target.value)} />
                    </label>
                    <label className="kfin-label">
                      Route — From
                      <input className="kfin-input" type="text" value={form.routeFrom || ""} placeholder="Departure location" onChange={e => setF("routeFrom", e.target.value)} />
                    </label>
                    <label className="kfin-label">
                      Route — To
                      <input className="kfin-input" type="text" value={form.routeTo || ""} placeholder="Destination" onChange={e => setF("routeTo", e.target.value)} />
                    </label>
                  </>
                )}

                {/* Client fields */}
                <label className="kfin-label" style={{ gridColumn: "span 3" }}>
                  Client / Company Name
                  <input className="kfin-input" type="text" value={form.clientName} required placeholder="Client or company name" onChange={e => setF("clientName", e.target.value)} />
                </label>
                <label className="kfin-label">
                  Client PAN
                  <input
                    className="kfin-input"
                    type="text"
                    value={form.clientPAN}
                    placeholder="9-digit PAN (required if > NPR 50,000)"
                    onChange={e => { setF("clientPAN", e.target.value); if (panError) setPanError(""); }}
                    style={panError ? { borderColor: "var(--terra)" } : undefined}
                  />
                  {panError && (
                    <span style={{ fontSize: 12, color: "var(--terra)", marginTop: 4, display: "block" }}>{panError}</span>
                  )}
                </label>
                <label className="kfin-label">
                  Client Phone
                  <input className="kfin-input" type="text" value={form.clientPhone} placeholder="+977 ..." onChange={e => setF("clientPhone", e.target.value)} />
                </label>
                <label className="kfin-label">
                  Client Address
                  <textarea
                    className="kfin-input"
                    value={form.clientAddress}
                    placeholder="Street, Ward No., City (Enter to move on · Shift+Enter for a new line)"
                    rows={2}
                    style={{ resize: "vertical", fontFamily: "var(--font)" }}
                    onChange={e => setF("clientAddress", e.target.value)}
                    onKeyDown={e => {
                      if (e.key !== "Enter" || e.shiftKey) return; // Shift+Enter still inserts a newline
                      e.preventDefault();
                      e.stopPropagation();
                      const fields = Array.from(e.currentTarget.closest("form").querySelectorAll("input, select, textarea, [data-kb-select]")).filter(el => !el.disabled);
                      const next = fields[fields.indexOf(e.currentTarget) + 1];
                      next?.focus();
                    }}
                  />
                </label>
              </div>

              {/* ── Line Items ── */}
              <div className="kbil-items">
                <div className="kbil-items-hd">
                  <h3 className="kbil-items-title">Line Items</h3>
                  <button type="button" className="kbil-items-add" onClick={() => setForm(f => ({ ...f, items: [...f.items, { ...emptyItem }] }))}>+ Add Row</button>
                </div>
                <div className={cn("kbil-cols", tab === "invoice" && "kbil-cols--invoice")}>
                  <span className="kbil-col-label">Description</span>
                  <span className="kbil-col-label">Qty</span>
                  <span className="kbil-col-label">Unit</span>
                  <span className="kbil-col-label">Rate ({form.currency || "NPR"})</span>
                  <span className="kbil-col-label kbil-col-right">Amount ({form.currency || "NPR"})</span>
                  {tab === "invoice" && <span className="kbil-col-label">Stock Item</span>}
                  <span />
                </div>
                {form.items.map((item, idx) => (
                  <div className={cn("kbil-item-row", tab === "invoice" && "kbil-item-row--invoice")} key={idx}>
                    <textarea
                      className="kfin-input"
                      data-role="item-description"
                      value={item.description}
                      placeholder="Item or service (Enter to move on · Shift+Enter for a new line)"
                      rows={2}
                      style={{ resize: "vertical", fontFamily: "var(--font)", minHeight: "38px", padding: "6px 8px" }}
                      onChange={e => updateItem(idx, "description", e.target.value)}
                      onKeyDown={e => {
                        if (e.key !== "Enter" || e.shiftKey) return; // Shift+Enter still inserts a newline
                        e.preventDefault();
                        e.stopPropagation();
                        const fields = Array.from(e.currentTarget.closest("form").querySelectorAll("input, select, textarea, [data-kb-select]")).filter(el => !el.disabled);
                        const next = fields[fields.indexOf(e.currentTarget) + 1];
                        next?.focus();
                      }}
                    />
                    <input className="kfin-input" type="number" min="0" step="any" value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value)} />
                    <input className="kfin-input" type="text" value={item.unit} placeholder="Pcs" onChange={e => updateItem(idx, "unit", e.target.value)} />
                    {/* Rate with FX converter button */}
                    <div style={{ position: "relative" }}>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input
                          className="kfin-input"
                          type="number" min="0" step="any"
                          value={item.rate} placeholder="0"
                          onChange={e => updateItem(idx, "rate", e.target.value)}
                          onKeyDown={idx === form.items.length - 1 ? addItemOnEnter : undefined}
                          style={{ flex: 1, minWidth: 0 }}
                        />
                        <button
                          type="button"
                          className="kbil-fx-trigger"
                          title="Convert from foreign currency"
                          onClick={() => setFxPopover(fxPopover === idx ? null : idx)}
                        >
                          ⇄
                        </button>
                      </div>
                      {fxPopover === idx && (
                        <FXPopover
                          idx={idx}
                          onApply={(i, val) => updateItem(i, "rate", val)}
                          onClose={() => setFxPopover(null)}
                        />
                      )}
                    </div>
                    <span className="kbil-item-amount">{(Number(item.qty || 0) * Number(item.rate || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    {tab === "invoice" && (
                      <select
                        className="kfin-select"
                        value={item.stockItemId || ""}
                        title="Link this line to an inventory item so saving the invoice deducts stock automatically"
                        onChange={e => updateItem(idx, "stockItemId", e.target.value)}
                      >
                        <option value="">— none —</option>
                        {inventoryItems.map(inv => (
                          <option key={inv.id} value={inv.id}>{inv.item} ({inv.unit})</option>
                        ))}
                      </select>
                    )}
                    <button type="button" className="kbil-item-del" disabled={form.items.length <= 1} onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}>×</button>
                  </div>
                ))}
              </div>

              {/* ── Totals + Discount ── */}
              <div className="kbil-totals">
                {/* VAT toggle */}
                {tab === "invoice" && (
                  <label className="kbil-vat-check">
                    <input type="checkbox" checked={form.applyVAT} onChange={e => setF("applyVAT", e.target.checked)} />
                    Apply VAT @ 13% (Nepal IRD)
                  </label>
                )}

                {/* Discount */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label style={{ fontSize: 13, color: "var(--ink-3)", whiteSpace: "nowrap" }}>Discount</label>
                  <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
                    <button
                      type="button"
                      onClick={() => setF("discountMode", "pct")}
                      style={{
                        padding: "5px 10px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                        background: (form.discountMode || "pct") === "pct" ? "var(--mint-deep)" : "transparent",
                        color: (form.discountMode || "pct") === "pct" ? "#fff" : "var(--ink-3)",
                      }}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setF("discountMode", "amount")}
                      style={{
                        padding: "5px 10px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                        background: form.discountMode === "amount" ? "var(--mint-deep)" : "transparent",
                        color: form.discountMode === "amount" ? "#fff" : "var(--ink-3)",
                      }}
                    >
                      Amt
                    </button>
                  </div>
                  {(form.discountMode || "pct") === "pct" ? (
                    <input
                      className="kfin-input"
                      type="number" min="0" max="100" step="0.5"
                      value={form.discountPct || 0}
                      style={{ width: 80 }}
                      onChange={e => setF("discountPct", e.target.value)}
                    />
                  ) : (
                    <input
                      className="kfin-input"
                      type="number" min="0" step="0.01"
                      value={form.discountFlatAmt || 0}
                      style={{ width: 110 }}
                      onChange={e => setF("discountFlatAmt", e.target.value)}
                    />
                  )}
                  {formTotals.discountAmt > 0 && (
                    <span style={{ fontSize: 12, color: "var(--terra)", fontWeight: 600 }}>
                      − {fmtCurrency(formTotals.discountAmt, form.currency)} off
                    </span>
                  )}
                </div>

                <div className="kbil-totals-card">
                  <div className="kbil-totals-row">
                    <span className="kbil-totals-label">Subtotal</span>
                    <span className="kbil-totals-val">{fmtCurrency(formTotals.subtotal, form.currency)}</span>
                  </div>
                  {formTotals.discountAmt > 0 && (
                    <>
                      <div className="kbil-totals-row" style={{ color: "var(--terra)" }}>
                        <span className="kbil-totals-label">
                          {(form.discountMode || "pct") === "pct" ? `Discount (${form.discountPct}%)` : "Discount"}
                        </span>
                        <span className="kbil-totals-val">− {fmtCurrency(formTotals.discountAmt, form.currency)}</span>
                      </div>
                      <div className="kbil-totals-row">
                        <span className="kbil-totals-label">Taxable Amount</span>
                        <span className="kbil-totals-val">{fmtCurrency(formTotals.taxableAmt, form.currency)}</span>
                      </div>
                    </>
                  )}
                  {tab === "invoice" && form.applyVAT && (
                    <div className="kbil-totals-row">
                      <span className="kbil-totals-label">VAT (13%)</span>
                      <span className="kbil-totals-val">{fmtCurrency(formTotals.vatAmt, form.currency)}</span>
                    </div>
                  )}
                  <div className="kbil-totals-grand">
                    <span>Grand Total</span>
                    <span className="kbil-totals-grand-val">{fmtCurrency(formTotals.total, form.currency)}</span>
                  </div>
                </div>
              </div>

              {/* Terms (quotation) */}
              {tab === "quotation" && (
                <label className="kfin-label" style={{ marginTop: 16 }}>
                  Terms &amp; Conditions
                  <textarea
                    className="kfin-input"
                    value={form.terms || ""}
                    rows={4}
                    style={{ resize: "vertical", fontFamily: "var(--font)", marginTop: 4 }}
                    onChange={e => setF("terms", e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") e.stopPropagation(); }}
                  />
                </label>
              )}

              {/* Notes / Bank Details */}
              <label className="kfin-label" style={{ marginTop: 16 }}>
                Notes / Bank Details / Remarks
                <textarea
                  className="kfin-input"
                  value={form.note}
                  rows={3}
                  placeholder={"Bank: \nAccount No.: \nBranch:"}
                  style={{ resize: "vertical", fontFamily: "var(--font)", marginTop: 4 }}
                  onChange={e => setF("note", e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") e.stopPropagation(); }}
                />
              </label>

              <div className="kbil-form-actions">
                <button type="submit" className="kbil-btn-primary" disabled={submitting}>
                  {submitting ? "Saving…" : editingId ? "Save Changes" : `Create ${meta.label}`}
                </button>
                <button type="button" className="kbil-btn-ghost" onClick={() => { setShowForm(false); setEditingId(null); setForm(makeEmptyForm(tab)); }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* ══ Document List ══ */}
        <div className="kfin-block" data-tour="billing-list">
          <div className="kfin-block-hd">
            <h2 className="kfin-block-title">
              {meta.label}s <span className="kfin-block-sub">({activeDocs.length}{searchQuery ? ` of ${activeList.filter(r => r.status !== "Cancelled").length}` : ""})</span>
            </h2>
            {/* Fix 5: export button */}
            {activeDocs.length > 0 && (
              <button
                className="kbil-btn-ghost"
                style={{ fontSize: 12, padding: "5px 12px" }}
                onClick={exportCSV}
                title="Export visible rows to CSV"
              >
                ↓ Export CSV
              </button>
            )}
          </div>
          {/* Numbers are meant to follow dates. When a series has drifted — documents
              filed out of order before this rule, or a date edited elsewhere — say so
              and offer the fix, rather than renumbering issued documents unasked. */}
          {canEdit && outOfOrder.length > 0 && (
            <div className="kfin-notice" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 220 }}>
                ⚠ {outOfOrder.reduce((n, g) => n + g.changes.length, 0)} {meta.label.toLowerCase()} number{outOfOrder.reduce((n, g) => n + g.changes.length, 0) !== 1 ? "s are" : " is"} out of date order
                {" "}({outOfOrder.length === 1 && tab !== "quotation" ? `FY ${outOfOrder[0].key}` : tab === "quotation" ? "all years" : `${outOfOrder.length} fiscal years`}).
              </span>
              <button type="button" className="kbil-btn-ghost" style={{ fontSize: 12, padding: "5px 12px" }} disabled={submitting} onClick={renumberOutOfOrder}>
                Renumber by date
              </button>
            </div>
          )}
          {/* Fix 1: search input */}
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <input
              className="kfin-input"
              type="text"
              placeholder={`Search by client, ${meta.numberField.replace("Number", " #")}, or status…`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ maxWidth: 360 }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", fontSize: 13 }}
              >✕ Clear</button>
            )}
            <FiscalYearSelect years={yearsHere} />
          </div>

          {activeDocs.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-4)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>No {meta.label.toLowerCase()}s found{isFiscalYearLabel(fiscalYear) ? ` in FY ${fiscalYear}` : ""}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {isFiscalYearLabel(fiscalYear) ? "Try another fiscal year, clearing your search, or create a new one" : `Try clearing your search or create a new ${meta.label.toLowerCase()}`}
              </div>
            </div>
          ) : (
            <div className="kfin-tbl-wrap">
              <table className="kfin-tbl">
                <thead>
                  <tr>
                    <th>{meta.label} #</th>
                    <th>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        Date
                        <DateModeToggle mode={dateMode} onToggle={() => setDateMode(m => m === "ad" ? "bs" : "ad")} />
                      </div>
                    </th>
                    <th>Client</th>
                    <th>PAN</th>
                    {tab === "invoice"   && <th>Related</th>}
                    {tab === "challan"   && <th>Related</th>}
                    {tab === "quotation" && <th>Valid Until</th>}
                    <th style={{ textAlign: "right" }}>Subtotal</th>
                    {tab === "invoice" && <th style={{ textAlign: "right" }}>Disc.</th>}
                    {tab === "invoice" && <th style={{ textAlign: "right" }}>VAT 13%</th>}
                    <th style={{ textAlign: "right" }}>Total</th>
                    {tab === "invoice" && <th style={{ textAlign: "right" }}>Credit Due</th>}
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDocs.map(row => {
                    const rowTotalNPR = row.currency === "GBP" ? (row.totalNPR || 0) * GBP_RATE : (row.totalNPR || 0);
                    const rowPaidNPR  = row.currency === "GBP" ? (row.amountPaid || 0) * GBP_RATE : (row.amountPaid || 0);
                    const creditDue = Math.max(0, rowTotalNPR - rowPaidNPR);
                    return (
                      <tr key={row.id}>
                        <td style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--mint-deep)" }}>{row[numField]}</td>
                        <td>{fmtDateIn(dateMode, row.date)}</td>
                        <td style={{ fontWeight: 500 }}>{row.clientName}</td>
                        <td style={{ color: "var(--ink-4)", fontSize: 12 }}>{row.clientPAN || "—"}</td>

                        {tab === "invoice" && (
                          <td style={{ fontSize: 11, color: "var(--ink-4)" }}>
                            {row.relatedQuotation && <span title="From quotation">QT: {row.relatedQuotation}</span>}
                            {row.relatedChallan   && <span title="Challan ref"> CH: {row.relatedChallan}</span>}
                            {!row.relatedQuotation && !row.relatedChallan && "—"}
                          </td>
                        )}
                        {tab === "challan" && (
                          <td style={{ fontSize: 11, color: "var(--ink-4)" }}>
                            {row.relatedInvoice ? <span>INV: {row.relatedInvoice}</span> : "—"}
                          </td>
                        )}
                        {tab === "quotation" && (
                          <td style={{ fontSize: 12, color: "var(--ink-4)" }}>{fmtDateIn(dateMode, row.validUntil)}</td>
                        )}

                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtC(toNPR(row.subtotalNPR, row.currency))}</td>
                        {tab === "invoice" && (
                          <td style={{ textAlign: "right", fontSize: 12, color: "var(--terra)", fontVariantNumeric: "tabular-nums" }}>
                            {row.discountMode === "amount"
                              ? (row.discountAmtNPR > 0 ? fmtC(toNPR(row.discountAmtNPR, row.currency)) : "—")
                              : (row.discountPct > 0 ? `${row.discountPct}%` : "—")}
                          </td>
                        )}
                        {tab === "invoice" && <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtC(toNPR(row.vatAmountNPR, row.currency))}</td>}
                        <td style={{ textAlign: "right", fontWeight: 700, color: "var(--mint-deep)", fontVariantNumeric: "tabular-nums" }}>{fmtC(toNPR(row.totalNPR, row.currency))}</td>

                        {/* Credit Due column — invoices only */}
                        {tab === "invoice" && (
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {row.status === "Cancelled" ? (
                              <span style={{ color: "var(--ink-4)", fontSize: 12 }}>—</span>
                            ) : creditDue > 0 ? (
                              <span style={{ color: "var(--terra)", fontWeight: 700, fontSize: 12 }}>{fmtC(toNPR(creditDue, row.currency))}</span>
                            ) : (
                              <span style={{ color: "var(--mint-deep)", fontSize: 12 }}>Settled</span>
                            )}
                          </td>
                        )}

                        <td>{statusBadge(row.status)}</td>
                        <td>
                          <div className="kbil-tbl-actions">
                            <button className="kbil-tbl-btn kbil-tbl-btn--primary" onClick={() => setPreviewDoc({ data: row, docType: tab })}>View</button>

                            {/* Edit */}
                            {canEdit && row.status !== "Cancelled" && (
                              <button className="kbil-tbl-btn" onClick={() => openEdit(row)}>Edit</button>
                            )}

                            {/* Record payment (invoice) — gated on actual credit due, not the
                                status label, so a stale/mismatched status can't hide it */}
                            {canEdit && tab === "invoice" && row.status !== "Cancelled" && creditDue > 0.005 && (
                              <button
                                className="kbil-tbl-btn kbil-tbl-btn--ok"
                                onClick={() => {
                                  setPayModal({ id: row.id, docNum: row.invoiceNumber, totalNPR: row.currency === "GBP" ? (row.totalNPR || 0) * GBP_RATE : (row.totalNPR || 0), currentPaid: row.currency === "GBP" ? (row.amountPaid || 0) * GBP_RATE : (row.amountPaid || 0), coll: meta.coll, customerId: row.customerId || null, region: row.region || null, bankName: row.bankName || null, isGBP: row.currency === "GBP" });
                                  setPayAmt(""); setPayError(""); setPayRef("");
                                  setPayDate(todayDate()); setPayMethod(row.paymentType || "Bank");
                                  loadPayHistory(row.id);
                                }}
                              >
                                {(row.amountPaid || 0) > 0 ? "Add Payment" : "Record Payment"}
                              </button>
                            )}

                            {/* Delivered (challan) */}
                            {canEdit && tab === "challan" && !["Delivered", "Cancelled"].includes(row.status) && (
                              <button className="kbil-tbl-btn kbil-tbl-btn--ok" onClick={() => updateStatus(row.id, "Delivered")}>Delivered</button>
                            )}

                            {/* Accept (quotation) */}
                            {canEdit && tab === "quotation" && !["Accepted", "Rejected", "Cancelled"].includes(row.status) && (
                              <button className="kbil-tbl-btn kbil-tbl-btn--ok" onClick={() => updateStatus(row.id, "Accepted")}>Accept</button>
                            )}

                            {/* Convert quotation → invoice */}
                            {canEdit && tab === "quotation" && !row.relatedInvoice && row.status !== "Cancelled" && row.status !== "Rejected" && (
                              <button className="kbil-tbl-btn kbil-tbl-btn--primary" disabled={submitting || converting === row.id} onClick={() => convertToInvoice(row)}>
                                {converting === row.id ? "Converting…" : "→ Invoice"}
                              </button>
                            )}

                            {/* Cancel */}
                            {canEdit && row.status !== "Cancelled" && (
                              <button className="kbil-tbl-btn kbil-tbl-btn--danger" onClick={() => cancelDoc(row.id)}>Cancel</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ══ Cancelled Documents ══ */}
        {cancelledDocs.length > 0 && (
          <div className="kfin-block" style={{ borderColor: "var(--terra)", opacity: 0.85 }}>
            <div className="kfin-block-hd" style={{ cursor: "pointer" }} onClick={() => setShowCancelled(v => !v)}>
              <h2 className="kfin-block-title" style={{ color: "var(--terra)", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                Cancelled {meta.label}s
                <span className="kfin-block-sub">({cancelledDocs.length})</span>
              </h2>
              <span style={{ fontSize: 12, color: "var(--ink-4)" }}>{showCancelled ? "▲ Hide" : "▼ Show"}</span>
            </div>

            {showCancelled && (
              <div className="kfin-tbl-wrap">
                <table className="kfin-tbl" style={{ opacity: 0.7 }}>
                  <thead>
                    <tr>
                      <th>{meta.label} #</th>
                      <th>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        Date
                        <DateModeToggle mode={dateMode} onToggle={() => setDateMode(m => m === "ad" ? "bs" : "ad")} />
                      </div>
                    </th>
                      <th>Client</th>
                      <th>PAN</th>
                      {tab === "invoice"   && <th>Related</th>}
                      {tab === "challan"   && <th>Related</th>}
                      {tab === "quotation" && <th>Valid Until</th>}
                      <th style={{ textAlign: "right" }}>Subtotal</th>
                      {tab === "invoice" && <th style={{ textAlign: "right" }}>Disc.</th>}
                      {tab === "invoice" && <th style={{ textAlign: "right" }}>VAT 13%</th>}
                      <th style={{ textAlign: "right" }}>Total</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancelledDocs.map(row => (
                      <tr key={row.id}>
                        <td style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--ink-3)" }}>{row[numField]}</td>
                        <td>{fmtDateIn(dateMode, row.date)}</td>
                        <td style={{ fontWeight: 500 }}>{row.clientName}</td>
                        <td style={{ color: "var(--ink-4)", fontSize: 12 }}>{row.clientPAN || "—"}</td>

                        {tab === "invoice" && (
                          <td style={{ fontSize: 11, color: "var(--ink-4)" }}>
                            {row.relatedQuotation && <span title="From quotation">QT: {row.relatedQuotation}</span>}
                            {row.relatedChallan   && <span title="Challan ref"> CH: {row.relatedChallan}</span>}
                            {!row.relatedQuotation && !row.relatedChallan && "—"}
                          </td>
                        )}
                        {tab === "challan" && (
                          <td style={{ fontSize: 11, color: "var(--ink-4)" }}>
                            {row.relatedInvoice ? <span>INV: {row.relatedInvoice}</span> : "—"}
                          </td>
                        )}
                        {tab === "quotation" && (
                          <td style={{ fontSize: 12, color: "var(--ink-4)" }}>{fmtDateIn(dateMode, row.validUntil)}</td>
                        )}

                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtC(toNPR(row.subtotalNPR, row.currency))}</td>
                        {tab === "invoice" && (
                          <td style={{ textAlign: "right", fontSize: 12, color: "var(--terra)", fontVariantNumeric: "tabular-nums" }}>
                            {row.discountMode === "amount"
                              ? (row.discountAmtNPR > 0 ? fmtC(toNPR(row.discountAmtNPR, row.currency)) : "—")
                              : (row.discountPct > 0 ? `${row.discountPct}%` : "—")}
                          </td>
                        )}
                        {tab === "invoice" && <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtC(toNPR(row.vatAmountNPR, row.currency))}</td>}
                        <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtC(toNPR(row.totalNPR, row.currency))}</td>
                        <td>{statusBadge(row.status)}</td>
                        <td>
                          <button className="kbil-tbl-btn kbil-tbl-btn--primary" onClick={() => setPreviewDoc({ data: row, docType: tab })}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Payment Modal ── */}
      {payModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--card)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.22)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: "1.05rem", fontWeight: 700 }}>Record Payment</h3>
            <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "0 0 14px" }}>
              {payModal.docNum} · Total: <strong>{fmtNPR(payModal.totalNPR)}</strong>
            </p>
            {payModal.currentPaid > 0 && (
              <div style={{ background: "var(--bg)", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12 }}>
                <div>Already paid: <strong>{fmtNPR(payModal.currentPaid)}</strong></div>
                <div style={{ color: "var(--terra)" }}>Credit outstanding: <strong>{fmtNPR(payModal.totalNPR - payModal.currentPaid)}</strong></div>
              </div>
            )}
            <label className="kfin-label">
              Amount Received (NPR)
              <input
                className="kfin-input"
                type="number" min="1" step="any"
                value={payAmt}
                autoFocus
                onChange={e => { setPayAmt(e.target.value); if (payError) setPayError(""); }}
                placeholder={`Up to ${fmtNPR(payModal.totalNPR - payModal.currentPaid)}`}
                style={{ marginTop: 4 }}
              />
            </label>
            {/* The date is the whole point of recording payments separately —
                without it there is no way to tell how long anyone takes to pay. */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <label className="kfin-label">
                Date Received
                <input className="kfin-input" type="date" value={payDate}
                  max={todayDate()}
                  onChange={e => setPayDate(e.target.value)} style={{ marginTop: 4 }} />
              </label>
              <label className="kfin-label">
                Method
                <select className="kfin-input" value={payMethod}
                  onChange={e => setPayMethod(e.target.value)} style={{ marginTop: 4 }}>
                  <option>Bank</option>
                  <option>Cash</option>
                  <option>Cheque</option>
                  <option>Online</option>
                  <option>Other</option>
                </select>
              </label>
            </div>
            <label className="kfin-label" style={{ display: "block", marginTop: 10 }}>
              Reference <span style={{ fontWeight: 400, color: "var(--ink-4)" }}>(optional)</span>
              <input className="kfin-input" type="text" value={payRef}
                placeholder="Cheque no., transaction id…"
                onChange={e => setPayRef(e.target.value)} style={{ marginTop: 4 }} />
            </label>
            {payAmt && Number(payAmt) > 0 && (
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.6 }}>
                Total paid after: <strong>{fmtNPR(Math.min(payModal.currentPaid + Number(payAmt), payModal.totalNPR))}</strong><br />
                Credit remaining: <strong style={{ color: Math.max(0, payModal.totalNPR - payModal.currentPaid - Number(payAmt)) > 0 ? "var(--terra)" : "var(--mint-deep)" }}>
                  {fmtNPR(Math.max(0, payModal.totalNPR - payModal.currentPaid - Number(payAmt)))}
                </strong>
              </div>
            )}
            {/* Fix 6: payment ceiling inline error */}
            {payError && (
              <div style={{ fontSize: 12, color: "var(--terra)", marginTop: 8, padding: "8px 12px", background: "var(--terra-soft, #fdf2ef)", borderRadius: 8, border: "1px solid rgba(196,101,74,.25)" }}>
                {payError}
              </div>
            )}
            {payHistory.length > 0 && (
              <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
                  Payments so far
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 132, overflowY: "auto" }}>
                  {payHistory.map(p => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                      <span style={{ color: "var(--ink-3)" }}>
                        {p.isOpening ? "Date unknown" : fmtDate(p.paidOn)}
                        {p.method && !p.isOpening ? ` · ${p.method}` : ""}
                      </span>
                      <strong>{fmtNPR(Number(p.amountNPR || 0))}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="kbil-btn-primary" onClick={recordPayment} disabled={paySaving}>
                {paySaving ? "Saving…" : "Save Payment"}
              </button>
              <button className="kbil-btn-ghost" onClick={closePayModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── A4 Document Preview ── */}
      {previewDoc && (
        <DocPreview data={previewDoc.data} docType={previewDoc.docType} onClose={() => setPreviewDoc(null)} />
      )}
    </>
  );
}

export default Billing;
