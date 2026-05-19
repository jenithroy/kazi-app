# Kazi ERP — Product Brief for UI Refresh

> This document answers scoping questions for a frontend redesign of Kazi.
> No design tokens or visual specs are included — this is purely product context.

---

## Who is the primary user of the Overview screen?

There are three completely separate Dashboard views, one per role group. Each user sees a different Overview:

### 1. Nepal Admin (Wilson, Anmol)
The most important user of the Overview. They run day-to-day factory operations. Their Overview must surface:
- How many staff are in today (attendance count)
- Active production orders and what stage each is at
- Pending tasks across the team
- Recent expenses and any pending budget requests
- Inventory alerts (low-stock items)
- QC pass/fail rate for recent batches

### 2. UK Admin / Director (Fin, Zen)
Remote business owners based in the UK. They check in once or twice a day to see financial and operational health. Their Overview must surface:
- Revenue figures in GBP (converted from NPR at 1 GBP = 200 NPR)
- Unpaid / outstanding invoices
- Production order pipeline (how many orders in progress vs completed)
- Budget request approvals pending their sign-off
- Headline attendance and staff count

### 3. Employee (Monika, Anusha, Sudhansu, Bedhant)
Factory floor / operations staff. Their "Overview" is essentially a personal dashboard:
- Their own clock-in status for today (large, prominent — the primary action)
- Their own assigned tasks
- Their own attendance history

**There is no shared generic Overview — the role dictates the entire layout.**

---

## Which ERP modules should appear on the Overview?

### Nepal Admin Overview panels (priority order):
1. **Attendance Today** — present / absent / late counts with a staff list
2. **Production Pipeline** — active orders by stage (Cutting → Stitching → QC → Dispatch)
3. **Task Board Summary** — count of To Do / In Progress / Blocked tasks
4. **Finance Snapshot** — monthly expenses total in NPR + GBP, pending budget requests
5. **Inventory Alerts** — items below reorder threshold
6. **QC Summary** — pass rate % for recent batches

### UK Admin Overview panels (priority order):
1. **Revenue & Invoices** — total invoiced, total paid, total outstanding (in GBP)
2. **Production Status** — orders in progress, completed this month
3. **Budget Approvals** — pending requests requiring UK sign-off
4. **Payroll Summary** — monthly payroll cost in GBP
5. **Attendance Headline** — staff present today (number only, no staff list)

### Employee Overview panels:
1. **Clock-In CTA** — large prominent button (GPS-verified, geofenced to office)
2. **My Tasks** — tasks assigned to them across all statuses
3. **My Attendance** — their own log for the current month

---

## How dense should the screen feel?

**Medium density.** The app is used on desktop at a desk, not on mobile. Users are operational staff checking data quickly during a workday. Priorities:
- Each panel should show meaningful data at a glance without requiring clicks to expand
- Tables should show at least 5–8 rows before scrolling
- KPI cards with numbers are preferred over charts where possible
- Charts are acceptable for trends (weekly attendance, monthly revenue) but should not dominate
- Avoid excessive whitespace — this is a work tool, not a marketing page

---

## What interactions should actually work?

All interactions in the current app are fully functional and must remain so. This is a UI refresh, not a prototype. The following are live features:

### Global
- **Login / Logout** — Firebase Auth (email + password)
- **Role-based routing** — different sidebar items and page content per role
- **Sidebar collapse** — toggle between full and icon-only sidebar

### Attendance
- **Geofenced Clock-In** — captures GPS, calculates distance to office (Haversine formula), only allows clock-in within 100 metres; uses server-side timestamp (tamper-proof)
- **Manual attendance logging** — nepal admins can set Present / Absent / Late / Half-day / Leave for any staff member on any date
- **Monthly calendar view** — shows attendance status per day per staff
- **Weekly bar chart** — shows present count per day of the week

### Tasks
- **Kanban board** — drag-free; tasks move between columns (To Do / In Progress / Done / Blocked) via dropdown on each card
- **Create task** — assign to team member, set priority, set due date, add description
- **Edit / delete task** — inline

### Production
- **Order creation** — order number, client, product, quantity, target date
- **Stage tracking** — orders move through: Order Received → Cutting → Stitching → QC → Dispatch
- **Progress bar** per order
- **Production log entries** — log daily output per order

### Finance (8 sub-tabs)
- **Expenses** — log expenses with category, NPR amount, VAT bill checkbox; attach VAT bill file (uploaded to Firebase Storage)
- **Payroll** — log salary payments per staff member per month
- **Journal** — double-entry accounting ledger
- **Accounts** — chart of accounts
- **Invoices** — create/send invoices to clients, mark as paid
- **Budget Requests** — staff submit requests; UK admins approve/reject
- **Purchase Orders** — log supplier purchases
- **Summary** — read-only financial overview

### Inventory
- **Stock items** — name, category, quantity, unit, reorder threshold
- **Add/edit/delete items** inline
- **Low-stock indicator** — items below reorder threshold highlighted

### QC (Quality Control)
- **Batch inspection logs** — batch ID, order reference, pieces checked, pieces passed, defect notes
- **Pass rate calculation** — auto-computed from pieces passed / pieces checked
- **Status badge** — Pass / Fail / Partial based on pass rate threshold

### Billing
- **Invoice generation** — linked to orders
- **PDF-style invoice view** — client details, line items, totals in NPR + GBP
- **Status tracking** — Draft / Sent / Paid / Overdue

### Employees
- **Staff directory** — name, role, location, email, app role
- **View individual employee** — attendance summary, assigned tasks, payroll history

### Admin Panel (super_admin only)
- **Permission management** — toggle which sections each nepal_admin can edit
- **User management** — view all users, their roles, last login

---

## Beyond Overview, which sub-screens should be fully designed?

All screens should be fully designed — this app has no "coming soon" states. Every module is live and in daily use. Priority order if a phased approach is needed:

1. **Dashboard (all 3 role variants)** — most visited screen
2. **Attendance** — daily use by all staff
3. **Finance** — most complex, 8 sub-tabs, used by admins
4. **Tasks** — daily use by admins and employees
5. **Production** — core operational screen
6. **Billing** — used by UK directors
7. **QC** — used by nepal admins
8. **Inventory** — used by nepal admins
9. **Employees** — occasional use
10. **Admin Panel** — rare, super_admin only

---

## Brand mark in the sidebar

Show the text **"Kazi"** as the logo. No image asset exists currently. The sidebar is dark (deep forest green / near-black). The wordmark should sit at the top of the sidebar above the nav items. Below the wordmark, show the logged-in user's name and role as a compact identity block.

---

## What should be tweakable in the live design?

The following are runtime-configurable values in the codebase that affect what the UI shows:

| Tweakable | Current Value | Where Used |
|---|---|---|
| GBP conversion rate | 1 GBP = 200 NPR | All finance screens, billing, UK dashboard |
| Office GPS coordinates | 27.687°N, 85.299°E (Kathmandu) | Attendance clock-in geofence |
| Geofence radius | 100 metres | Attendance clock-in |
| Team members list | 9 people (see below) | Attendance, Tasks, Employees, Payroll |
| Task column names | To Do / In Progress / Done / Blocked | Kanban board |

The UI should surface the GBP rate visibly somewhere on finance screens (e.g. "All GBP values at 1 GBP = 200 NPR").

---

## Deployment scale

**Single site, single team.** This is an internal tool for one company with:
- ~9 users total
- 1 factory location (Kathmandu, Nepal)
- 1 set of UK directors (2 people)

**No multi-site selector needed.** No tenant switching. No line/shift selector. Everything is for one factory, one team.

The app is deployed on Netlify (static hosting) backed by Firebase (Firestore + Storage + Auth). There is no backend server — all logic runs client-side in React.

---

## Team & Terminology

### The team (all current users)

| Name | Role | Location | App Role |
|---|---|---|---|
| Fin | Director | UK | uk_admin |
| Zen | Director | UK | uk_admin |
| Wilson | Operations Head | Nepal | nepal_admin |
| Anmol | Operations Intern | Nepal | nepal_admin |
| Admin | System Admin | Nepal | super_admin |
| Monika | Marketing | Nepal | employee |
| Anusha | Fashion | Nepal | employee |
| Sudhansu | Operations Assistant | Nepal | employee |
| Bedhant | Management | Nepal | employee |

### Internal terminology
- **Kazi** — the company name (also the app name)
- **NPR** — Nepalese Rupee, used for all stored financial values
- **GBP** — British Pounds, shown to UK admins alongside NPR
- **Clock-in** — GPS-verified attendance check-in at the start of the workday
- **Production Order** — a manufacturing job (cutting, stitching, finishing garments for a client)
- **QC** — Quality Control; inspection of finished batches before dispatch
- **Budget Request** — a formal request by nepal staff for spending approval from UK directors
- **Journal Entry** — double-entry accounting record (debit/credit)
- **VAT Bill** — tax invoice attached to an expense, uploaded as a file

### Screens to avoid redesigning aggressively
- The **Admin Panel** permission toggles — these are functional and used by one person; keep them utilitarian
- The **Finance Journal** (double-entry ledger) — accountant-style table, keep it dense and tabular

---

## Anything else the designer should know

1. **Two languages in the codebase, one in the UI.** All UI text is English. Nepal staff are comfortable reading English.

2. **No mobile version exists** but the app should be usable on a tablet (1024px+). The primary use case is a laptop or desktop browser.

3. **The sidebar has 11 nav items.** Not every role sees all of them:
   - `employee` sees: Dashboard, Tasks, Attendance only
   - `uk_admin` sees: Dashboard, Finance, Production, Billing, Budget
   - `nepal_admin` sees: Dashboard, Tasks, Attendance, Production, QC, Inventory, Finance, Billing, Budget, Employees
   - `super_admin` sees: everything including Admin Panel

4. **Firestore is the source of truth.** All data shown in the UI is live from Firestore — there is no mock data in production. The app must handle loading states and empty states gracefully (some collections may genuinely be empty for new installations).

5. **The clock-in feature is critical.** For employees, clocking in is the #1 daily action. The geofence check (must be within 100m of office) is a business requirement — not a nice-to-have. The UI must make the success/failure states of GPS verification very clear.

6. **Finance is the most complex module.** It has 8 sub-tabs, each with its own form and table. The tab navigation must be clear and the active tab must be obvious. Role gating matters here: employees cannot access Finance at all; uk_admins can view but not edit most tabs.

7. **Dual-currency is everywhere in Finance.** Every NPR value should show its GBP equivalent. The pattern is: `NPR 50,000 (£250)`.
