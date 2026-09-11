# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The same React build also ships inside a Capacitor wrapper (`com.kazimfg.app`, Android and iOS) that adds native GPS, haptics, push notifications and a bottom tab bar for field staff. The design language is the web one in both places.

## Users

Kazi Manufacturing's own staff, about a dozen people across two locations:

- **Nepal factory team (Kathmandu).** Operations head, operations and fashion interns, accountant, marketing co-ordinator, content editor, operations assistants. They log the day's work: attendance and GPS clock-in, tasks, production stages, QC inspections, stock movements, purchases, expenses, payroll, VAT invoices and budget requests.
- **UK directors.** They own the business and oversee it remotely: revenue, invoices, outstanding balances, bank balances, order pipeline, budget approvals, payroll commitment.
- **System admin / developer.** Maintains roles, permissions and the app itself.

Most use happens on desktop and laptop. Phones are secondary but real (clock-in, quick checks, the native app), so every page has to work at phone width even though desktop gets the richer layout.

## Product Purpose

An internal ERP that runs a garment factory end to end. It turns the factory's daily records into one shared source of truth that both the Kathmandu floor and the UK directors act on. Success means staff log their work here rather than in spreadsheets or chat, and the directors trust the numbers without asking.

## Positioning

Built for exactly one company's two-country operation. NPR is the stored currency with GBP shown beside it at 1 GBP = 200 NPR. Nepal IRD-compliant billing uses Bikram Sambat fiscal years. Every page and finance tab is gated by a permission matrix that the database itself enforces. A UK / Nepal region switch splits most records by arm of the business.

## Operating Context

- Access is a property of the position (role), set in the Admin Panel and enforced by Supabase row-level security. A role sees a page as none / view / edit. A view-only role still sees the whole page, read-only.
- Workflows cover: GPS-geofenced clock-in (100 m radius) with late-cut calculation; a production order pipeline (received → cutting → stitching → embellishment → QC → packing → dispatch); QC batch logs; a stock ledger with reorder alerts; unit economics and costing; tech packs and a fabric library; expenses with VAT bill uploads; purchases with line items and 13% VAT; double-entry journal, ledger, P&L, balance sheet; bank feed via webhook; payroll with late deductions and salary slips; VAT invoices, challans and quotations numbered per Nepali fiscal year with partial payments; budget requests approved from the UK; team chat; a usage and activity log; a bug report page.
- Heavy keyboard data entry exists and must keep working: Enter-to-advance inputs, keyboard selects, Shift+letter tab shortcuts.
- Guided "Show me" tours target elements through `data-tour` attributes.

## Capabilities and Constraints

- Stack: React 18 + Vite SPA, React Router 6, Recharts, Supabase (auth, Postgres with RLS, storage, realtime), deployed on Cloudflare Workers, wrapped by Capacitor.
- Printed and PDF documents (tax invoices, challans, quotations, salary slips, stock-ledger and tech-pack spec print sheets) are compliance artefacts. Their output stays exactly as it is; only the app UI around them may change.
- Business logic (VAT, fiscal-year numbering, stock balances, payroll maths, double-entry validation, region filtering, permission checks) must not change as a side effect of UI work.
- Some product docs in the repo (DESIGN.md, PERMISSIONS.md, README.md, PRODUCT_BRIEF.md) still describe the older Firebase / hard-coded-role version of the app and are stale.

## Brand Commitments

- Name: Kazi (Kazi Manufacturing Pvt. Ltd.). White wordmark logo on the dark forest sidebar (`public/kazi - logo - white-01.png`); "Kathmandu HQ" tag.
- The newer pages (Roles, Usage & Activity, Admin Panel, Messenger) are the confirmed reference for how the whole app should look and behave.
- Voice in the UI is plain, specific and honest about state: it says what a control does and why something is empty or restricted, rather than generic filler.

## Evidence on Hand

Real operational data lives in Supabase. The redesign must not invent staff, customers, figures or claims in UI copy or empty states.

## Product Principles

1. The record is the product: logging a day's work has to be faster and clearer here than in a spreadsheet.
2. Access follows the job. What a person sees always matches what the database will let them read or change.
3. Honest state. Show why something is empty, restricted, unsaved or failing, never a silent blank.
4. One system, two countries. NPR and GBP, Nepal and UK, AD and BS dates sit side by side without making either side feel secondary.
5. Documents are law. Anything that prints or exports for tax or HR purposes is never casually restyled.
