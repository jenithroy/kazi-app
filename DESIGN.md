---
name: Kazi Manufacturing ERP

# ─────────────────────────────────────────────────────────────
# DESIGN TOKENS
# ─────────────────────────────────────────────────────────────

colors:
  # Backgrounds
  background: "#f2f5f2"
  surface: "#ffffff"
  surface-soft: "#f8faf8"

  # Borders
  outline: "#dde8dd"
  outline-strong: "#b0bfb0"

  # Text
  on-surface: "#1a1f1a"
  on-surface-variant: "#637363"

  # Primary — Forest Green
  primary: "#2e7d32"
  primary-light: "#4caf50"
  primary-soft: "#66bb6a"
  primary-deep: "#1b5e20"
  on-primary: "#ffffff"
  primary-container: "rgba(46, 125, 50, 0.10)"
  primary-container-border: "rgba(46, 125, 50, 0.25)"
  on-primary-container: "#1b5e20"
  primary-gradient: "linear-gradient(180deg, #4caf50 0%, #2e7d32 100%)"
  primary-gradient-hover: "linear-gradient(180deg, #66bb6a 0%, #388e3c 100%)"

  # Sidebar — Dark Forest (entirely separate register)
  sidebar: "#182a1a"
  on-sidebar: "rgba(255, 255, 255, 0.65)"
  on-sidebar-active: "#ffffff"
  sidebar-hover: "rgba(255, 255, 255, 0.08)"
  sidebar-active: "rgba(255, 255, 255, 0.14)"
  sidebar-divider: "rgba(255, 255, 255, 0.10)"
  sidebar-border: "rgba(255, 255, 255, 0.12)"

  # Semantic
  error: "#c62828"
  error-dark: "#b71c1c"
  error-container: "rgba(198, 40, 40, 0.10)"
  error-container-border: "rgba(198, 40, 40, 0.30)"
  warning: "#e65100"
  warning-container: "rgba(230, 81, 0, 0.07)"
  warning-container-border: "rgba(230, 81, 0, 0.25)"
  warning-text: "#bf360c"
  ok: "#2e7d32"
  ok-container: "rgba(46, 125, 50, 0.07)"
  ok-container-border: "rgba(46, 125, 50, 0.25)"
  ok-text: "#1b5e20"

  # Attendance status — each has a bg/border/dot/text triplet
  status-present-bg: "#e8f5e9"
  status-present-border: "#a5d6a7"
  status-present-dot: "#2e7d32"
  status-present-text: "#1b5e20"
  status-late-bg: "#fff8e1"
  status-late-border: "#ffe082"
  status-late-dot: "#f59e0b"
  status-late-text: "#92400e"
  status-absent-bg: "#ffebee"
  status-absent-border: "#ef9a9a"
  status-absent-dot: "#c62828"
  status-absent-text: "#b71c1c"
  status-leave-bg: "#f3e5f5"
  status-leave-border: "#ce93d8"
  status-leave-dot: "#7b1fa2"
  status-leave-text: "#4a148c"
  status-halfday-bg: "#e3f2fd"
  status-halfday-border: "#90caf9"
  status-halfday-dot: "#1565c0"
  status-halfday-text: "#0d47a1"

  # Task / Kanban status
  task-todo-bg: "#f1f5f9"
  task-todo-text: "#475569"
  task-inprogress-bg: "#dbeafe"
  task-inprogress-text: "#1d4ed8"
  task-done-bg: "#dcfce7"
  task-done-text: "#166534"
  task-blocked-bg: "#fee2e2"
  task-blocked-text: "#991b1b"

  # Priority tags
  priority-high-bg: "rgba(198, 40, 40, 0.10)"
  priority-high-text: "#c62828"
  priority-medium-bg: "rgba(230, 81, 0, 0.10)"
  priority-medium-text: "#e65100"
  priority-low-bg: "rgba(46, 125, 50, 0.10)"
  priority-low-text: "#2e7d32"

  # Invoice / budget status
  invoice-paid-bg: "#dcfce7"
  invoice-paid-text: "#166534"
  invoice-sent-bg: "#dbeafe"
  invoice-sent-text: "#1d4ed8"
  invoice-draft-bg: "#fef9c3"
  invoice-draft-text: "#854d0e"
  invoice-cancelled-bg: "#fee2e2"
  invoice-cancelled-text: "#991b1b"
  invoice-outstanding-bg: "#fef9c3"
  invoice-outstanding-text: "#854d0e"

  # Role badges
  role-nepal-admin-bg: "#dcfce7"
  role-nepal-admin-text: "#166534"
  role-uk-admin-bg: "#dbeafe"
  role-uk-admin-text: "#1d4ed8"
  role-super-admin-bg: "#fef9c3"
  role-super-admin-text: "#854d0e"
  role-employee-bg: "#f1f5f9"
  role-employee-text: "#475569"

  # Login screen gradient
  login-bg-start: "#e8f5e9"
  login-bg-mid: "#f2f5f2"
  login-bg-end: "#e8f5e9"

  # Avatar gradient
  avatar-start: "#4caf50"
  avatar-end: "#1b5e20"

  # Dashboard KPI accent colours (nepal admin)
  kpi-production: "#2563eb"
  kpi-orders: "#7c3aed"
  kpi-qc: "#0891b2"
  kpi-outstanding: "#d97706"
  kpi-danger: "#dc2626"

typography:
  page-title:
    fontFamily: Poppins
    fontSize: 25.6px
    fontWeight: "700"
    lineHeight: 1.2
  section-heading:
    fontFamily: Poppins
    fontSize: 12.5px
    fontWeight: "600"
    textTransform: uppercase
    letterSpacing: 0.06em
  body:
    fontFamily: Poppins
    fontSize: 14.4px
    fontWeight: "400"
    lineHeight: 1.5
  body-sm:
    fontFamily: Poppins
    fontSize: 13.6px
    fontWeight: "500"
  body-xs:
    fontFamily: Poppins
    fontSize: 13.1px
    fontWeight: "400"
  label-form:
    fontFamily: Poppins
    fontSize: 13.6px
    fontWeight: "500"
  table-header:
    fontFamily: Poppins
    fontSize: 12.2px
    fontWeight: "600"
    textTransform: uppercase
    letterSpacing: 0.06em
  table-body:
    fontFamily: Poppins
    fontSize: 14.4px
    fontWeight: "400"
  stat-value:
    fontFamily: Poppins
    fontSize: 28.8px
    fontWeight: "500"
  stat-value-lg:
    fontFamily: Poppins
    fontSize: 32px
    fontWeight: "700"
  stat-title:
    fontFamily: Poppins
    fontSize: 12.5px
    fontWeight: "600"
    textTransform: uppercase
    letterSpacing: 0.05em
  badge:
    fontFamily: Poppins
    fontSize: 11.8px
    fontWeight: "600"
  nav-link:
    fontFamily: Poppins
    fontSize: 14.4px
    fontWeight: "500"
  caption:
    fontFamily: Poppins
    fontSize: 13.1px
    fontWeight: "400"
  kpi-value:
    fontFamily: Poppins
    fontSize: 23.2px
    fontWeight: "800"
    lineHeight: 1
  kpi-label:
    fontFamily: Poppins
    fontSize: 10.9px
    fontWeight: "700"
    textTransform: uppercase
    letterSpacing: 0.5px
  greeting:
    fontFamily: Poppins
    fontSize: 24px
    fontWeight: "800"

rounded:
  sm: 6px
  DEFAULT: 10px
  md: 12px
  lg: 16px
  xl: 20px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  3xl: 28px
  panel-padding: 20px
  panel-gap: 14px
  content-x: 28px
  content-y: 24px
  content-gap: 16px
  form-gap: 12px
  stats-gap: 12px
  sidebar-width: 240px
  sidebar-collapsed: 68px
  header-height: 56px
  stat-card-padding: 18px

elevation:
  flat: "none"
  panel: "0 1px 3px rgba(0, 0, 0, 0.04)"
  card: "0 1px 2px rgba(0, 0, 0, 0.04)"
  kpi: "0 1px 5px rgba(0, 0, 0, 0.07)"
  login: "0 4px 24px rgba(0, 0, 0, 0.08)"
  clock-in-cta: "0 4px 16px rgba(26, 92, 26, 0.25)"

motion:
  sidebar: "0.22s ease"
  interactive: "0.15s ease"
  toggle: "0.2s ease"
  progress-bar: "0.3s ease"
  geofence-bar: "0.4s ease"

components:
  button-primary:
    background: "linear-gradient(180deg, #4caf50 0%, #2e7d32 100%)"
    textColor: "#ffffff"
    borderColor: "#1b5e20"
    rounded: "{rounded.DEFAULT}"
    padding: "9px 16px"
    fontWeight: "600"
  button-primary-hover:
    background: "linear-gradient(180deg, #66bb6a 0%, #388e3c 100%)"
  button-primary-disabled:
    opacity: "0.5"
  button-ghost:
    background: "{colors.surface-soft}"
    textColor: "{colors.on-surface}"
    borderColor: "{colors.outline}"
    rounded: "{rounded.DEFAULT}"
    padding: "9px 16px"
    fontWeight: "500"
  button-ghost-hover:
    background: "{colors.background}"
    borderColor: "{colors.outline-strong}"
  clock-in-hero:
    background: "#1a5c1a"
    textColor: "#ffffff"
    rounded: "14px"
    padding: "16px 48px"
    fontSize: 17.6px
    fontWeight: "700"
    shadow: "{elevation.clock-in-cta}"
  tab-button:
    background: "transparent"
    textColor: "{colors.on-surface-variant}"
    borderBottom: "2px solid transparent"
    padding: "10px 18px"
    fontWeight: "500"
    marginBottom: "-1px"
  tab-button-active:
    textColor: "{colors.primary}"
    borderBottomColor: "{colors.primary}"
    fontWeight: "600"
  panel:
    background: "{colors.surface}"
    borderColor: "{colors.outline}"
    rounded: "{rounded.md}"
    padding: "{spacing.panel-padding}"
    gap: "{spacing.panel-gap}"
    shadow: "{elevation.panel}"
    flexDirection: "column"
  stat-card:
    background: "{colors.surface}"
    borderColor: "{colors.outline}"
    rounded: "{rounded.md}"
    padding: "{spacing.stat-card-padding}"
    gap: "6px"
    shadow: "{elevation.panel}"
  stat-card-warning:
    borderColor: "{colors.error-container-border}"
    background: "#fff8f8"
  kpi-card:
    background: "{colors.surface}"
    rounded: "{rounded.DEFAULT}"
    padding: "16px 18px"
    shadow: "{elevation.kpi}"
    borderTop: "3px solid {accent-color}"
  input:
    background: "{colors.surface}"
    textColor: "{colors.on-surface}"
    borderColor: "{colors.outline}"
    rounded: "{rounded.DEFAULT}"
    padding: "9px 12px"
    transition: "{motion.interactive}"
  input-focus:
    borderColor: "{colors.primary}"
  label:
    textColor: "{colors.on-surface-variant}"
    fontSize: 13.6px
    fontWeight: "500"
    gap: "6px"
  badge-ok:
    background: "{colors.primary-container}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "3px 10px"
    fontSize: 11.8px
    fontWeight: "600"
  badge-danger:
    background: "{colors.error-container}"
    textColor: "{colors.error}"
    rounded: "{rounded.full}"
    padding: "3px 10px"
    fontSize: 11.8px
    fontWeight: "600"
  badge-muted:
    background: "rgba(99, 115, 99, 0.12)"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.full}"
    padding: "3px 10px"
    fontSize: 11.8px
    fontWeight: "600"
  priority-tag:
    rounded: "{rounded.full}"
    padding: "3px 9px"
    fontSize: 11.5px
    fontWeight: "600"
  avatar:
    background: "linear-gradient(135deg, #4caf50, #1b5e20)"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    fontWeight: "700"
  banner-warning:
    background: "{colors.warning-container}"
    borderColor: "{colors.warning-container-border}"
    textColor: "{colors.warning-text}"
    rounded: "{rounded.DEFAULT}"
    padding: "12px 14px"
  banner-info:
    background: "{colors.ok-container}"
    borderColor: "{colors.ok-container-border}"
    textColor: "{colors.ok-text}"
    rounded: "{rounded.DEFAULT}"
    padding: "12px 14px"
  sidebar:
    background: "{colors.sidebar}"
    width: "{spacing.sidebar-width}"
    collapsedWidth: "{spacing.sidebar-collapsed}"
    padding: "24px 16px"
    transition: "{motion.sidebar}"
  sidebar-link:
    textColor: "{colors.on-sidebar}"
    rounded: "{rounded.DEFAULT}"
    padding: "10px 12px"
    gap: "10px"
  sidebar-link-hover:
    background: "{colors.sidebar-hover}"
    textColor: "{colors.on-sidebar-active}"
  sidebar-link-active:
    background: "{colors.sidebar-active}"
    textColor: "{colors.on-sidebar-active}"
  top-header:
    background: "{colors.surface}"
    borderBottomColor: "{colors.outline}"
    padding: "16px 28px"
    position: "sticky"
    zIndex: 10
  search-bar:
    background: "{colors.background}"
    borderColor: "{colors.outline}"
    rounded: "{rounded.DEFAULT}"
    padding: "9px 14px"
  kanban-column:
    background: "{colors.surface-soft}"
    borderColor: "{colors.outline}"
    rounded: "{rounded.md}"
    padding: "14px"
    gap: "10px"
  task-card:
    background: "{colors.surface}"
    borderColor: "{colors.outline}"
    rounded: "{rounded.DEFAULT}"
    padding: "12px"
    gap: "8px"
    shadow: "{elevation.card}"
  login-card:
    background: "{colors.surface}"
    borderColor: "{colors.outline}"
    rounded: "{rounded.lg}"
    padding: "32px"
    gap: "20px"
    shadow: "{elevation.login}"
    maxWidth: "440px"
  toggle-on:
    background: "#1a5c1a"
    width: "40px"
    height: "22px"
    borderRadius: "11px"
  toggle-off:
    background: "#cbd5e1"
    width: "40px"
    height: "22px"
    borderRadius: "11px"
  order-progress-bar:
    height: "6px"
    background: "{colors.outline}"
    fill: "{colors.primary}"
    borderRadius: "99px"
  order-stage-dot-done:
    background: "{colors.primary}"
    size: "28px"
    borderRadius: "50%"
  order-stage-dot-current:
    background: "{colors.primary-soft}"
    border: "3px solid {colors.primary}"
    size: "28px"
  order-stage-dot-pending:
    background: "{colors.outline}"
    size: "28px"
---

# Kazi Manufacturing ERP — Full Design & Logic Specification

> **Purpose of this document:** Give a redesigning tool (Stitch or any AI frontend designer) complete context about what this product is, who uses it, how the data flows, and what every screen must communicate. The goal is a redesigned UI that is visually modern and polished while preserving every piece of business logic described here.

---

## 1. What Is Kazi?

Kazi is an internal ERP (Enterprise Resource Planning) web application for a garment manufacturing company operating across two locations:

- **Nepal** — the factory. Production, quality control, attendance, inventory, and finance all happen here.
- **UK** — the business directors. They monitor revenue, invoices, orders, and overall factory health from the UK.

The app is a React SPA (Vite) backed by Firebase Firestore (database) and Firebase Storage (file uploads). It runs in the browser on desktop. There is no mobile app, though the design should be responsive.

**Currency:** Nepal uses NPR (Nepalese Rupee). The UK side sees GBP (British Pounds). The conversion rate is a hardcoded constant: `1 GBP = 200 NPR`. All financial figures are stored in NPR and displayed in both currencies.

---

## 2. User Roles & Access Control

There are four roles. Role is stored on each user's Firestore document and synced from a hardcoded `TEAM_MEMBERS` list on every login.

| Role | Who | What they can do |
|---|---|---|
| `super_admin` | Admin (admin@kazi.com) | Full access to everything including the Admin Panel |
| `nepal_admin` | Wilson, Anmol | Can edit sections they've been granted permission for (configurable per-user by super_admin) |
| `uk_admin` | Fin, Zen (UK directors) | View-only across all sections; can approve Budget Requests |
| `employee` | Monika, Anusha, Sudhansu, Bedhant | See only their own attendance and tasks |

### Permission System (nepal_admin)
Nepal admins have a `permissions` object on their Firestore user doc. The super admin can toggle each section on/off per user in the Admin Panel. Example structure:
```json
{
  "tasks": true,
  "attendance": true,
  "production": true,
  "inventory": true,
  "qc": true,
  "billing": true,
  "employees": true,
  "budget": true,
  "finance": {
    "expenses": true,
    "payroll": true,
    "purchases": true,
    "vatBills": true,
    "journal": true,
    "ledger": true,
    "pl": true,
    "balanceSheet": true
  }
}
```

The helper function `sectionCanEdit(profile, section)` returns `true` only for super_admin or a nepal_admin whose permission for that section is `true`. UK admins and employees always return `false`. This function guards every form, every button, every editable input across the app.

---

## 3. Navigation Structure

The sidebar has 11 nav items (some role-gated):

| Route | Label | Visible to |
|---|---|---|
| `/admin` | Admin Panel | super_admin only |
| `/dashboard` | Dashboard | All roles |
| `/tasks` | Tasks | nepal_admin, employee, super_admin |
| `/attendance` | Attendance | nepal_admin, employee, super_admin |
| `/production` | Production | uk_admin, nepal_admin, super_admin |
| `/inventory` | Inventory | uk_admin, nepal_admin, super_admin |
| `/qc` | Quality Control | uk_admin, nepal_admin, super_admin |
| `/finance` | Finance | uk_admin, nepal_admin, super_admin |
| `/content` | Budget & Reqs | nepal_admin, super_admin |
| `/billing` | Billing & Invoices | uk_admin, nepal_admin, super_admin |
| `/employees` | Employees | uk_admin, nepal_admin, super_admin |

The sidebar collapses to icon-only mode (68px) via an edge toggle tab. In collapsed state, nav labels are hidden and only the 18×18px SVG icons remain. The logo becomes a single "K" lettermark.

The sidebar footer contains: Log Out button + user chip (avatar initials + name + role label).

---

## 4. Firestore Collections (Data Models)

Understanding these is critical for UI design — each page reads/writes one or more of these collections.

### `users`
```
uid, name, role, jobRole, location, email, permissions (object)
```
One doc per user. Created/synced on login. The `permissions` field only exists for `nepal_admin`.

### `attendance`
```
date (YYYY-MM-DD), staffId, staffName, role,
status ("Present"|"Absent"|"Late"|"Half-day"|"Leave"),
hours (number), note, loggedBy, createdAt
```
Doc ID: `{date}_{staffId}`. One record per staff member per day. Saved in bulk via `writeBatch` when the admin clicks "Save Attendance".

### `clock_ins`
```
staffId, staffName, role, date,
lat, lng, accuracyM, distanceToSiteM,
clockedInAt (serverTimestamp)
```
Created by geofenced clock-in. GPS verified — only created if distance ≤ 100m from office coordinates.

### `tasks`
```
title, description, assignee, priority ("High"|"Medium"|"Low"),
status ("To Do"|"In Progress"|"Done"|"Blocked"),
columnId, order (number), createdBy, createdAt
```

### `task_columns`
```
title, order (number), createdAt
```
Default columns: "To Do", "In Progress", "Done", "Blocked". Columns and cards can be dragged to reorder.

### `production`
```
batchId (B001, B002…), date, cut, stitched, passed, rejected,
note, loggedBy, createdAt
```
Batch production records. `passRate = passed / (passed + rejected)`.

### `orders`
```
orderId (ORD-001…), date, deliveryDate,
customerName, styleName, fabricType, colorway,
quantity, pricePerPcNPR, totalValueNPR,
invoiceRef, assignedTo,
stage ("Order Received"|"Fabric Sourcing"|"Cutting"|"Stitching"|
       "Finishing & Pressing"|"Quality Check"|"Packing"|"Shipped"|"Delivered"),
status ("Active"|"On Hold"|"Completed"|"Cancelled"),
stageHistory (array of {stage, date, by}),
notes, createdBy, createdAt
```
Each order has a 9-stage pipeline. `advanceStage` moves it forward one step, writing a history entry. `reverseStage` moves it back.

### `qc_logs`
```
qcId (QC001…), batchId, date,
inspected, passed, rejected, defectType, action,
checkedBy, createdAt
```

### `inventory`
```
itemId (ITEM001…), item, unit, category, supplier, location,
openingStock, stockIn, stockUsed, minLevel, unitCostNPR,
lastUpdated, createdBy, createdAt
```
`closingStock = openingStock + stockIn - stockUsed`. Alert when `closing <= minLevel`.

### `finance_expenses`
```
category, amountNPR, date, note, vatBill (boolean),
loggedBy, createdAt
```
If `vatBill === true` and a file was uploaded, a linked `vat_bills` doc is created.

### `vat_bills`
```
expenseId, expenseItem, fileName, fileUrl, storagePath,
fileType, uploadedBy, uploadedAt, source ("expense"|"purchase")
```
Files stored in Firebase Storage at `vat-bills/{expenseId or purchaseId}/{timestamp}_{filename}`.

### `finance_purchases`
```
expenseId (EXP001…), expenseItem, category, vatBill (boolean|null),
amountNPR, date, createdAt
```
Pre-seeded with 25 historical purchases. Deduped by `expenseId` on load.

### `finance_payroll`
```
staffName, role, month, year,
basicNPR, lateDays, lateRateNPR, lateDeductionNPR,
pfDeductionNPR, bonusNPR, grossNPR, totalDeductionsNPR, netNPR,
note, loggedBy, createdAt
```
`netNPR = (basicNPR + bonusNPR) - (lateDays × lateRateNPR) - pfDeductionNPR`

### `journal_entries`
```
date, description, debitAccount, creditAccount,
amountNPR, reference, createdBy, createdAt
```

### `accounts`
```
name, type ("Asset"|"Liability"|"Equity"|"Income"|"Expense"),
createdAt
```
Seeded from 20 default accounts on first load.

### `invoices`
```
invoiceNumber (INV-001…), clientName, clientAddress, clientEmail,
date, dueDate, currency ("NPR"|"GBP"),
items (array of {description, qty, unitPrice, total}),
subtotalNPR, vatAmount, totalNPR, vatPercent,
paymentTerms, bankDetails, notes,
status ("Draft"|"Sent"|"Paid"|"Cancelled"),
createdAt
```
Invoice PDF-style layout generated in the browser.

### `budget_requests`
```
type ("budget"|"requirement"),
title, category, quantity (requirements only),
amountNPR, amount (GBP), urgency ("Low"|"Medium"|"High"),
notes, status ("Pending"|"Approved"|"Rejected"),
requestedBy, reviewedBy, reviewedAt, createdAt
```

### `employees`
```
name, role, department, email, phone, address,
panNumber, bankAccount, joinDate,
basicSalaryNPR, location ("nepal"|"uk"),
status ("Active"|"Inactive"), createdBy, createdAt
```
Seeded from TEAM_MEMBERS on first load. Managed in the Employees section.

---

## 5. Page-by-Page Specification

### `/login` — Login Screen
**Purpose:** Firebase email/password authentication gate.  
**Layout:** Full-page centered card on a soft green gradient background. Logo in a dark forest-green container above the form. Card contains: `h1` "Sign In", email input, password input, error message (red), submit button.  
**Logic:** `signInWithEmailAndPassword(auth, email, password)`. On success, AuthContext picks up the Firebase user, syncs their profile from Firestore, and React Router redirects to `/dashboard`.  
**Role-awareness:** None — this screen is purely for authentication.

---

### `/dashboard` — Dashboard (role-specific views)

The dashboard renders **three completely different layouts** depending on role:

#### Nepal Admin Dashboard (`NepalAdminDash`)
**Purpose:** Factory operations command centre.  
**KPI row (6 cards):**
- 👥 Present Today (green if all on time, amber if any late)
- ⚡ Units This Week (production batches `passed` sum since Monday)
- 📦 Active Orders (orders where status ≠ Delivered/Cancelled)
- ✅ QC Pass Rate (`totalPassed / totalInspected × 100`)
- 💰 Outstanding (sum of invoices not Paid/Cancelled)
- ⚠️ Low Stock (inventory items where closing ≤ minLevel)

**Charts row (2 panels):**
- Area chart: Production output last 6 months (NPR units passed per month)
- Horizontal bar chart: Orders by pipeline stage (count per stage)

**Alerts + data row (3 panels):**
- Blocked Tasks list (top 5, title + assignee)
- Reorder Alerts list (low stock items with red "Reorder" badge)
- Recent Production Batches table (last 5, columns: Batch, Date, Passed, Rejected, Pass %)

#### UK Admin Dashboard (`UKAdminDash`)
**Purpose:** Revenue and business overview.  
**KPI row (6 cards):**
- 💷 Invoiced (Month) in GBP
- ✅ Paid (Month) in GBP
- ⏳ Outstanding in GBP
- 📦 Active Orders
- 🎯 QC Pass Rate
- 👥 Staff Present (Nepal team today)

**Charts row (2 panels):**
- Area chart: Revenue trend last 6 months in GBP (paid invoices only)
- Donut chart: Invoice status breakdown (Paid/Draft/Sent/Estimated/Cancelled)

**Full-width panel:** Recent Invoices table (Invoice #, Client, Date, Due, Status badge, Amount GBP)

#### Employee Dashboard (`EmployeeDash`)
**Purpose:** Personal view — no team data.  
**Greeting:** Time-aware ("Good morning/afternoon/evening, {name} 👋")  
**KPI row (4 cards):**
- Today's Attendance (coloured badge with their own status — if not logged yet: "Not marked")
- Open Tasks (their tasks assigned to them where status ≠ Done)
- Completed (their done tasks)
- Blocked (their blocked tasks, red if > 0)

**My Tasks panel:** Full list of tasks assigned to them, sorted by urgency (Blocked first, then In Progress, To Do, Done last). Each row: title, optional description, status pill.

---

### `/tasks` — Tasks (Kanban Board)

**Purpose:** Team task management board.  
**Layout:** Drag-and-drop Kanban board. Columns are draggable (reorder). Cards within columns are draggable.  
**Header action:** "+ Add Task" button (canEdit only).  

**Add Task form (panel above board):** Title (required), Description, Assignee (dropdown from employees + nepal_admin names), Priority (High/Medium/Low), Column.

**Kanban column:** `surface-soft` background, uppercase heading with task count badge. Cards inside.  
**Task card:** White, border, `10px` radius, subtle shadow. Top row: title + priority tag + delete button. Second row: assignee avatar initials + name (if assigned).

**Priority tags:** Pill-shaped coloured tags — High (red), Medium (amber), Low (green).

**Data:** `tasks` collection. `task_columns` collection stores column order. Both collections support drag-reorder which writes `order` field back to Firestore.

**Permissions:** canEdit = `sectionCanEdit(profile, "tasks")`. UK admins and employees see the board read-only. Employees can see all tasks but can only view (not create/move/delete).

---

### `/attendance` — Attendance

**Purpose:** Daily staff attendance logging with GPS-verified clock-in.

#### Admin/Manager view (nepal_admin, uk_admin, super_admin)
**Header:** Page title + "Save Attendance" primary button (canEdit only).  
**GPS Clock-In panel (top, compact horizontal bar):** Label, status message, Clock In button. After clicking, shows either success (time + distance) or failure (distance over limit, denied, etc.).  
**Top row (2 panels):**  
- Calendar panel: Week strip (Mon–Sun) with today highlighted in forest green. Toggle for full month calendar view. Below: Today's Overview mini grid (Present/Late/Absent/Leave counts).
- Weekly Attendance area chart: staff present per day for current week.  
**Bottom row (2 panels):**  
- Attendance Rate gauge (SVG horseshoe, 220° sweep, 160×124px) + legend breakdown.
- Today's Staff Log: Scrollable list of attendance cards, one per nepal staff member. Each card: avatar + name + status dropdown (colour-coded by status) + hours input + note input.

**Logic:** On load, fetches all `nepal_admin` and `employee` users, then today's attendance docs. If docs exist, pre-populates form with saved data. "Save Attendance" writes all rows as a `writeBatch` to Firestore, using doc ID `{date}_{staffId}`.

#### Employee view
**GPS Clock-In hero (full-width centred panel):** Location pin SVG icon, large centred "Clock In" button (`padding: 16px 48px`, shadow), status feedback with 52×52px circular badge. Below: "My Attendance Today" card showing only their own record.

**Geofence logic:** `navigator.geolocation.getCurrentPosition()` with `enableHighAccuracy: true`. Haversine formula calculates distance to `WORK_SITE` coordinates (`27.687339997894547, 85.2987224234393`). If ≤ 100m, writes to `clock_ins` with `serverTimestamp()`. If > 100m, shows distance bar with fence marker.

---

### `/production` — Production

**Purpose:** Track garment batch output and manage the full order pipeline.  
**Two tabs:** Batch Tracking | Order Management

#### Batch Tracking tab
**Add Batch form:** Date, Cut (units cut), Stitched, Passed, Rejected, Note. Auto-generates batchId (`B001`, `B002`…).  
**Batches table:** Batch ID (monospace, green), Date, Cut, Stitched, Passed, Rejected, Pass Rate (colour: green ≥90%, amber ≥75%, red <75%), Note.

#### Order Management tab
**Stats row (4 cards):** Total Orders, Completed, Units in Pipeline, Total Order Value.  
**New Order form (expandable):** Date, Delivery Date, Customer Name, Style/Item, Fabric Type (dropdown), Colorway, Quantity, Price per Piece NPR, Invoice Ref, Assigned To (employee dropdown), Stage, Notes. Live order value preview: `quantity × pricePerPcNPR`.  
**Order pipeline cards:** One card per order. Each card shows:
- Header: Order ID (monospace, green) + status badge, Customer Name, item details line, due date/assignee/ref line.
- **Stage pipeline visualiser:** 9-stage horizontal progress. Stages are dots (✓ = done in green, current = amber with green border, future = grey). Progress bar above the dots fills proportionally. Stage labels below each dot.
- Stage controls (canEdit): "← Previous Stage" ghost button, "Advance Stage →" / "Mark Delivered" primary button, "Hold" / "Resume" status buttons.
- Expandable "Details" toggle reveals the full stage history log (date, stage name, who advanced it).

**Order stages:** Order Received → Fabric Sourcing → Cutting → Stitching → Finishing & Pressing → Quality Check → Packing → Shipped → Delivered

---

### `/inventory` — Inventory & Stock

**Purpose:** Track raw material and stock levels. Alert on reorder.  
**Header action:** "+ Add Item" (canEdit only).  
**Stats row (4 cards):** Total Items, Low/Reorder (warning state if > 0), Stock Value NPR (closing × unit cost), Categories.  
**Two tabs:** Stock Levels | Item Details

**Stock Levels tab:** Table with inline editable Stock In and Stock Used inputs per row. Low stock rows have a red `.row-alert` background tint. Status column: "REORDER" (red pill) or "OK" (green pill). "Save" button per row writes only that row's changes.

**Item Details tab:** Read-only table with full metadata: supplier, location, unit cost, stock value.

**Logic:** `closingStock = openingStock + stockIn - stockUsed`. Low stock: `closing <= minLevel`.

---

### `/qc` — Quality Control

**Purpose:** Log inspection outcomes per production batch.  
**Add QC Log form:** Batch (dropdown from production batches), Date, Inspected, Passed, Rejected, Defect Type, Action.  
**QC Logs table:** QC ID, Batch, Date, Inspected, Passed, Rejected, Rejection Rate (`rejected/inspected × 100`), Defect, Action.  
**Auto-ID:** `QC001`, `QC002`…

---

### `/finance` — Finance & Accounting

**Purpose:** Complete financial management. Eight tabs.  
**Summary stats (top, always visible):** Total Payroll, Total Expenses, Total Purchases, Net Profit/Loss.  
**Charts (always visible):** Outgoings donut (Purchases/Expenses/Payroll in green tonal palette) + Purchases by Category bar chart.

**Tab visibility:** nepal_admin users only see tabs their `permissions.finance` object grants. UK admins see all tabs read-only. Employees see nothing (no access to /finance).

#### Expenses tab
Form: Category (dropdown), Amount NPR, Date, Note, VAT Bill checkbox. If VAT Bill is checked, a file upload input appears. On submit: saves to `finance_expenses`. If file present, uploads to Firebase Storage then saves to `vat_bills`.  
Table: Category, Amount NPR, Amount GBP, Date, Note, VAT Bill (shows "View" link if uploaded, "Yes" badge if flagged without file, "No" badge), Logged By.

#### Payroll tab
Collapsible form: Staff Name, Role, Month, Year, Basic NPR, Late Days, Late Rate NPR (default 500/day), Bonus NPR, PF Deduction NPR, Note. Live calculation preview: Gross, Deductions, Net Pay.  
Table: Staff, Role, Month/Year, Basic, Late Deduction, PF, Bonus, Gross, Net, Note, Logged By.

#### Purchases tab
Form: Date, Expense Item, Category, VAT Bill toggle, Amount NPR.  
Table: Expense ID (EXP001…), Item, Category, VAT Bill badge, Amount NPR, Amount GBP, Date. Inline edit (pencil icon) + delete per row.  
Pre-seeded with 25 historical company purchases.

#### VAT Bills tab
Upload form: Select from purchase expense IDs (dropdown), file picker (images or PDF). Progress bar during upload.  
Table: Expense ID, Item, File Name, File Type, Uploaded By, Upload Date, View link + Delete.

#### Journal tab
Double-entry bookkeeping. Form: Date, Description, Debit Account (dropdown from `accounts`), Credit Account (dropdown), Amount NPR, Reference. Validation: debit ≠ credit account.  
Table: Date, Description, Debit, Credit, Amount NPR, Amount GBP, Reference, Created By.

#### Ledger tab
Computed from all journal entries. Table: Account Name, Account Type, Debits, Credits, Balance. Balance calculated based on account type (Assets: debits − credits; others: credits − debits).

#### P&L tab
Computed: Income (paid invoices + journal income entries) vs Expenses (finance_expenses + purchases + payroll + journal expense entries). Bar chart comparing Income, Expenses, Net Profit. Summary table with each component.

#### Balance Sheet tab
Computed from ledger. Three sections: Assets, Liabilities, Equity. Each shows account name + balance. Totals row. Accounting equation check: `Assets = Liabilities + Equity`.

---

### `/billing` — Billing & Invoices

**Purpose:** Create, manage, and print tax invoices.  
**Two tabs:** Tax Invoice | Invoice History

#### Tax Invoice tab
**Invoice builder form:** Client Name, Address, Email, Invoice Number (auto: INV-001…), Date, Due Date, Currency toggle (NPR/GBP), Payment Terms, Bank Details, Notes. Line items table: add/remove rows (Description, Qty, Unit Price, Total). VAT % input. Live totals: Subtotal, VAT Amount, Grand Total (in both NPR and GBP).

**Invoice preview:** Styled tax invoice layout with dark green (`#1a5c1a`) header. Company name KAZI MANUFACTURING PVT. LTD., address, bill-to section, line items table with dark green header row on `<th>` elements (important: background must be on `<th>` not `<tr>`), subtotals, VAT, grand total. Bank details and signature block at bottom.

**Actions:** Save Invoice (writes to `invoices` collection), Print (triggers `window.print()`).

#### Invoice History tab
Table: Invoice #, Client, Date, Due, Status (coloured pill), Amount NPR, Amount GBP, Actions (mark as Paid, mark as Sent, Cancel).

---

### `/content` (Budget & Requirements)

**Purpose:** Nepal team submits budget and material requests; UK admin approves/rejects.  
**Two tabs:** Budget Requests | Requirements (each with a pending count badge on the tab).

**Budget Request form:** Title, Category, Amount NPR (auto-converts to GBP), Amount GBP, Urgency (Low/Medium/High), Justification notes. GBP field has an "auto" tag when filled from NPR conversion.

**Requirements form:** Item/Description, Category, Quantity, Urgency, Est. Cost NPR, Est. Cost GBP.

**Tables:** Each shows all submissions with Status badge and Urgency priority tag. UK admin sees Approve/Reject action buttons on Pending rows. After review: shows "by {reviewerName}".

**Urgency tags:** High (red priority-tag), Medium (amber), Low (green) — same pill component as task priority.

---

### `/employees` — Employees

**Purpose:** Employee directory with salary, PAN, and bank details.  
**Header action:** "+ Add Employee" (canEdit only).  
**Stats row (4 cards):** Total Employees, Nepal Staff, UK Team, Total Basic Payroll NPR.  
**Add/Edit Employee form:** Full Name, Role/Position, Department (dropdown), Email, Phone, Join Date, Basic Salary NPR, PAN Number, Bank Account No., Address, Location (nepal/uk), Status (Active/Inactive).  
**Directory table:** Name, Role, Dept, Location, Email, Phone, Join Date, Basic Salary, PAN, Bank Account, Status (Active/Inactive badge), Edit + Deactivate/Activate buttons.  
**Logic:** Seeded from TEAM_MEMBERS on load. Stale entries (emails not in TEAM_MEMBERS) are deleted. Duplicates cleaned up via `writeBatch`.

---

### `/admin` — Admin Panel (super_admin only)

**Purpose:** Configure per-user permissions for Nepal Admin users.  
**All Users overview:** Chips for every user showing avatar initials + name + role badge.  
**Permission cards (one per nepal_admin):** Shows user avatar, name, email, job role, "Reset to Default" button. Two grids:
- **Page Edit Access:** Toggle switches for each section (Tasks, Attendance, Production, Inventory, Quality Control, Billing, Employees, Budget & Reqs).
- **Finance Tab Access:** Toggle switches for each Finance tab (Expenses, Payroll, Purchases, VAT Bills, Journal, Ledger, P&L, Balance Sheet).

**Toggle switches:** Custom 40×22px pill toggles. On = `#1a5c1a`, Off = `#cbd5e1`. Each toggle calls `updateDoc` with a dotted Firestore field path (`permissions.tasks`, `permissions.finance.payroll`). Saving state per toggle shown via `opacity: 0.4`.

**Fixed Access section:** Lists uk_admin and employee users with a text description of their fixed role access. No controls.

**Stub creation:** AdminPanel creates Firestore stub docs for nepal_admin users who haven't logged in yet, ensuring their permission cards appear before first login.

---

## 6. Visual Design System

### Brand Identity
Kazi reads like a well-produced internal tool: dense but never cluttered, branded but never loud. The product is built for operational staff who need fast access to data, not a consumer experience. Every design decision prioritises **information density and functional clarity** over decoration.

The single chromatic identity is **forest green** — derived from the natural materials the factory works with. It appears in functional roles only (buttons, focus rings, active states, badges, charts) and never as a decorative surface.

### Color Philosophy
- The page canvas (`#f2f5f2`) carries a barely-perceptible green tint. This prevents sterile grey while being subtle enough to disappear behind data.
- White (`#ffffff`) is reserved for surfaces that hold content — panels, cards, inputs, table rows.
- The sidebar is a completely separate colour register: near-black forest (`#182a1a`). It shares zero tokens with the content area.
- All borders use a green-tinted line (`#dde8dd`) instead of neutral grey, reinforcing the brand at the structural level.
- Semantic colours (error red, warning amber) are used minimally and always paired with a low-opacity container fill.

### Typography
**Single typeface: Poppins** (Google Fonts, loaded via CDN). Weights: 400, 500, 600, 700. No other typeface is used anywhere in the product.

Section headings inside panels are **always uppercase with 0.06em letter-spacing**. This is enforced globally via `.panel h3`. Table headers carry the same treatment. Form labels are sentence case at 0.85rem/500 — never uppercase.

Stat values use 1.8rem at weight 500 — large enough to dominate without extreme heaviness. Dashboard KPI values are bolder at 1.45rem/800 to suit the more emphatic KPI card style.

### Spacing Grid
8px base. All spacing tokens are multiples of this base. The content shell uses `24px` vertical and `28px` horizontal padding. Panels use `20px` padding internally with `14px` gap between sub-sections. The gap between panels is `16px`.

### Elevation
The system is intentionally flat. Panels use `0 1px 3px rgba(0,0,0,0.04)`. The login card uses `0 4px 24px rgba(0,0,0,0.08)`. The GPS clock-in hero button uses `0 4px 16px rgba(26,92,26,0.25)` — the only element with a tinted shadow. No hover-based shadow animation exists.

### Shape
Two dominant radii: `10px` for leaf elements (buttons, inputs, nav links, task cards), `12px` for container panels. All badges and avatars are `border-radius: 9999px` (fully circular/pill). The login card uses `16px` as the only exception for container-level rounding.

### Interaction States
- Focus: green border (`#2e7d32`) with no focus ring outline.
- Hover on ghost buttons: `background` deepens, border strengthens.
- Hover on sidebar links: `rgba(255,255,255,0.08)` background + white text.
- Active tabs: `2px solid #2e7d32` bottom border, green text.
- All transitions at `0.15s ease`.

### Charts
All charts use Recharts. Consistent palette across all charts: primary series in `#2e7d32`, area fills at `rgba(46,125,50,0.18)`, grid lines in `#dde8dd` (horizontal only), tooltips white with `10px` radius and `#dde8dd` border.

Dashboard KPI charts may use off-palette colours (blue `#2563eb` for production, purple `#7c3aed` for orders, teal `#0891b2` for QC) to visually distinguish metrics from the primary green brand.

The attendance gauge is a bespoke SVG — not a Recharts component. `220°` sweep, `52px` radius, `11px` stroke weight, fill arc in `#2e7d32`, track in `#e8ece8`.

---

## 7. Key UI Patterns

### Role-gated editing
Every page checks `canEdit = sectionCanEdit(profile, section)`. When `canEdit` is false:
- All form inputs and selects are `disabled`
- Add/Save/Edit buttons are hidden (not just disabled)
- A yellow banner-warning appears: "UK admin — view only." or similar
- The page is still fully visible and readable

### Dual-currency display
Financial amounts always show both NPR and GBP. NPR is the source of truth. GBP is derived as `amountNPR / 200`. In stat cards: large value in NPR, smaller note in GBP. In tables: separate columns. In budget forms: NPR input auto-fills GBP with an "auto" chip tag.

### Auto-increment IDs
Every collection uses a consistent ID scheme: `B001` (batches), `ORD-001` (orders), `QC001` (QC logs), `EXP001` (purchases), `INV-001` (invoices), `ITEM001` (inventory), `{YYYY-MM-DD}_{staffId}` (attendance).

### Server timestamps
All `createdAt` and `updatedAt` fields use `serverTimestamp()` from Firestore — never `new Date()`. Clock-in uses `serverTimestamp()` specifically to prevent user manipulation.

### Tab counts
The Budget & Requirements page shows pending-count badges on tab labels: `<span class="tab-badge">{count}</span>`. This is a small green pill with white text rendered inline after the tab label.

### Inline row editing
The Purchases tab in Finance uses inline editing: clicking a row's edit button replaces static text cells with inputs. The Inventory Stock Levels tab has permanent inline inputs for `stockIn` and `stockUsed` per row with a per-row Save button.

### Empty states
Every table and list has an empty state: a muted paragraph with descriptive text. No illustrations, no icons — just text in `on-surface-variant` colour.

### Loading states
Pages show a simple muted "Loading…" paragraph while Firestore data fetches. No skeletons or spinners in the current implementation — this is an area for the redesign to improve.

---

## 8. Design Opportunities for Redesign

The following are known weaknesses in the current implementation that a redesign should address:

1. **Loading states** — replace plain text with skeleton loaders or a consistent spinner component.
2. **Dashboard KPI cards** — the current `borderTop: 3px solid {color}` style is functional but the two dashboard variants (Nepal admin vs UK admin) use slightly inconsistent inline styles. Unify into a proper KPI card component.
3. **Mobile responsiveness** — the sidebar is hidden on `< 768px` with no mobile navigation replacement. The redesign should include a bottom nav or hamburger menu for mobile.
4. **Empty states** — currently just a text paragraph. Could benefit from contextual illustration or icon + call-to-action guidance.
5. **Finance page density** — 8 tabs with complex tables can be overwhelming. Consider grouping tabs into categories or using a secondary sidebar within the Finance page.
6. **Order pipeline cards** — the 9-stage dot pipeline is informative but takes significant vertical space when many orders exist. A collapsed card variant could help.
7. **Notification system** — there is no real-time alert system. Low stock and blocked tasks appear on the dashboard but there is no push notification or in-app alert indicator.
8. **Print stylesheet** — the Invoice page has a `window.print()` action but no dedicated print stylesheet beyond basic browser defaults.
