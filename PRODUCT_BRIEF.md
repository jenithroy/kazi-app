# Kazi ERP — Product Brief

> This document defines the scoping, product context, user roles, technical architecture, and functional specifications for the Kazi App.

---

## Technical Stack & Platform Overview

Kazi is an all-in-one Enterprise Resource Planning (ERP) platform designed for factory operations, finance, human resources, and business management.

- **Frontend**: React + Vite SPA with modular UI components and responsive styling.
- **Backend & Database**: Firebase (Firestore database, Firebase Authentication, Firebase Storage).
- **Mobile Platforms**: Native iOS and Android apps powered by Capacitor (`capacitor.config.ts`, `android/`, `ios/`).
- **Integrations**: Cloudflare Worker (`bank-webhook-worker`) for real-time bank transaction webhook ingestion into Firestore.
- **Security & Access Control**: Granular Role-Based Access Control (RBAC) with Firestore security rules (`firestore.rules`) and dynamic user-level permission overrides (`src/utils/permissions.js`).

---

## User Roles & System Access Matrix

The system defines 5 distinct user roles. Role-based navigation and section-level write privileges are enforced dynamically per role, with support for user-specific overrides.

| Role | Members | Nav Sections Visible | Edit & Write Privileges |
| :--- | :--- | :--- | :--- |
| **Super Admin** | Admin (`admin@kazi.com`) | All 16 Sections | Full System & Data Access |
| **UK Admin** | Finn, Zen | Dashboard, Finance, Production, Billing, Budget, Tasks, Directors, Customers, Admin, Messenger, Library, Sales, Employees, Marketing | Read-only access across financial/production modules; full edit on Tasks, Library, Employees, and Budget Approvals |
| **Nepal Admin** | Wilson, Anmol, Anusha, Monika, Sunam Deepa | Dashboard, Tasks, Attendance, Production, QC, Inventory, Sales, Finance, Billing, Budget, Employees, Customers, Messenger, Library, Marketing | Operational write permissions (Wilson/Anmol/Anusha for Production; Anusha for Tasks/Library; Sunam Deepa for Finance & Accounting; Monika for Marketing) |
| **Nepal Staff** | Sarbagya Karki *(Content Editor)* | Dashboard, Tasks, Attendance, Library, Production, QC, Inventory, Budget | Task assignment, self clock-in, work logs (Sarbagya explicitly granted edit access for Marketing) |
| **Employee** | Sudhansu, Bedhant | Dashboard, Tasks, Attendance, Library | Read-only views for assigned tasks and self clock-in |

---

## Dashboard Overview Views

The Dashboard (`/dashboard`) automatically adapts its layout based on the logged-in user's role:

### 1. Nepal Admin Dashboard
Focused on daily factory operations and team coordination:
- **Attendance Today**: Staff counts (Present, Absent, Late) with clickable staff list.
- **Production Pipeline**: Active orders grouped by production stage (Order Received → Cutting → Stitching → QC → Dispatch).
- **Task Board Summary**: Counts across To Do, In Progress, Blocked, and Done.
- **Finance Snapshot**: Monthly expense totals in NPR and GBP (£), plus pending budget requests.
- **Inventory Alerts**: Low-stock items below reorder threshold.
- **QC Summary**: Batch inspection pass rate % for recent production runs.

### 2. UK Admin / Director Dashboard
Tailored for remote executive oversight from the UK:
- **Revenue & Financial Health**: Total invoiced, paid, and outstanding balances in GBP (£).
- **Real-Time Bank Balances**: Bank account feeds synced via Cloudflare Worker webhook.
- **Production Order Pipeline**: Active vs completed order metrics.
- **Budget Request Approvals**: Pending spending requests requiring sign-off.
- **Payroll Summary**: Monthly payroll commitment in GBP (£).
- **Attendance Headline**: Overview headcount count.

### 3. Employee & Staff Dashboard
Personalized operational portal:
- **Clock-In CTA**: Prominent GPS-verified check-in widget with geofence validation.
- **My Assigned Tasks**: Task cards filtered by personal assignment.
- **My Attendance Log**: Monthly clock-in history and late minute tracking.

---

## Navigation & Module Structure

The sidebar navigation (`src/components/Sidebar.jsx`) features a dark theme with the official white wordmark logo (`/kazi - logo - white-01.png`), "Kathmandu HQ" badge, search trigger (`⌘K`), and collapsed state support. Navigation items are organized into 6 logical categories:

### 1. Workspace
- **Dashboard** (`/dashboard`): Role-specific executive and operational overview.
- **Tasks** (`/tasks`): Kanban board with status columns (To Do, In Progress, Done, Blocked) and categories (Research, Manufacturing, Hiring, Marketing, Finance, Operations, Admin, Other).
- **Attendance** (`/attendance`): GPS geofenced clock-in, manual attendance logging, staff schedules, monthly calendar, and weekly bar charts.

### 2. Operations
- **Production** (`/production`): Stage tracking, daily output logs, order progress bars, and Production Calendar view (`ProductionCalendar.jsx`).
- **Quality Control** (`/qc`): Batch inspection logs, defect notes, pass rate calculation, and status badges (Pass/Fail/Partial).
- **Inventory & Library** (`/inventory`): Stock items, reorder thresholds, low-stock alerts, and production pattern/specification document viewer (`DocPreview.jsx`).

### 3. Finance
- **Sales** (`/sales`): Sales transaction tracking and revenue stream analysis.
- **Finance** (`/finance`): Comprehensive accounting hub with **10 sub-tabs**:
  1. *Expenses*: Logging expense items, categories, NPR amounts, and VAT bill upload attachments (Firebase Storage).
  2. *Payroll*: Monthly staff salary processing and payment tracking.
  3. *Purchases*: Supplier purchase orders and raw material costs.
  4. *VAT Bills*: Tax invoice audit trail and VAT tracking.
  5. *Journal*: Double-entry accounting transaction ledger.
  6. *Ledger*: Chart of accounts and account balances.
  7. *P&L*: Profit and Loss financial statements.
  8. *Balance Sheet*: Company asset, liability, and equity summary.
  9. *Bank*: Real-time bank account feeds powered by Cloudflare Worker webhook.
  10. *Order P&L*: Profitability calculations per production order.
- **Billing** (`/billing`): Client invoices, dual-currency support (NPR / GBP), status tracking (Draft/Sent/Paid/Overdue), and PDF invoice generation (`InvoicePDF.jsx`).
- **Budget** (`/content`): Internal spending request submissions and UK Director approval workflow.

### 4. People
- **Employee & HR** (`/employees`): Directory of team members, custom work schedules, payroll history, and attendance records.
- **Directors** (`/directors`): Executive director overview portal.
- **Customers** (`/customers`): Customer Relationship Management (CRM) profiles and transaction history.

### 5. Marketing & Comms
- **Marketing** (`/marketing`): Marketing campaigns and interactive Marketing Calendar (`MarketingCalendar.jsx`).
- **Messenger** (`/messenger`): Internal team messaging and announcements.

### 6. System
- **Admin** (`/admin`): Super-admin panel for permission overrides, user management, and audit logs.

---

## Technical Features & Parameters

| Configurable Parameter | Value | Details / Usage |
| :--- | :--- | :--- |
| **GBP Exchange Rate** | 1 GBP = 200 NPR | Conversion applied across finance, billing, and executive dashboards |
| **Office Location (GPS)** | 27.687340°N, 85.298722°E | Kazi Office entrance, Kathmandu, Nepal |
| **Geofence Radius** | 100 metres | Distance threshold for GPS clock-in verification (Haversine formula) |
| **GPS Accuracy Threshold** | 500 metres | Maximum acceptable GPS reading inaccuracy for clock-in |
| **Active Team Size** | 11 members | Registered users in Firestore |
| **Task Categories** | 8 categories | Research, Manufacturing, Hiring, Marketing, Finance, Operations, Admin, Other |

---

## Team Roster & Terminology

### Active Team Members

| Name | Role | Location | App Role | Email |
| :--- | :--- | :--- | :--- | :--- |
| **Finn** | Director | UK | `uk_admin` | `finnqrk@gmail.com` |
| **Zen** | Director | UK | `uk_admin` | `hi.zenuk@gmail.com` |
| **Wilson** | Operations Head | Nepal | `nepal_admin` | `wilsonshah98765@gmail.com` |
| **Anmol** | Operations Intern | Nepal | `nepal_admin` | `Basnetanamol21@gmail.com` |
| **Anusha** | Fashion Intern | Nepal | `nepal_admin` | `anushapantaa@gmail.com` |
| **Monika** | Marketing Co-ordinator | Nepal | `nepal_admin` | `bhusal.monika14@gmail.com` |
| **Sunam Deepa** | Accountant | Nepal | `nepal_admin` | `sunamdeepa26@gmail.com` |
| **Admin** | System Admin | Nepal | `super_admin` | `admin@kazi.com` |
| **Sarbagya Karki** | Content Editor | Nepal | `nepal_staff` | `sarbagyakarkig8@gmail.com` |
| **Sudhansu** | Operations Assistant | Nepal | `employee` | `sa4715666@gmail.com` |
| **Bedhant** | Management | Nepal | `employee` | `bedantrana@gmail.com` |

### Key Terminology
- **Kazi**: Company name and application brand mark.
- **NPR**: Nepalese Rupee (base currency stored in Firestore).
- **GBP (£)**: British Pound Sterling (converted dynamically at 1 GBP = 200 NPR).
- **Clock-In**: Server-timestamped, GPS-verified attendance entry.
- **Late Cut**: Automated attendance calculation comparing clock-in time against employee schedule (`EMPLOYEE_SCHEDULES`).
- **Production Order**: Garment manufacturing job moving through factory pipeline stages.
- **QC Batch**: Quality inspection record containing checked count, passed count, defect notes, and pass rate %.
- **Budget Request**: Requisition form submitted by staff for UK Director approval.
- **VAT Bill**: Tax invoice attachment linked to expense logging.
