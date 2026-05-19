# Kazi Manufacturing — Operations Portal

A full-stack web application for managing day-to-day operations across **Nepal and UK teams** at Kazi Manufacturing Pvt. Ltd.

Built with **React 18 + Vite + Firebase** (Firestore, Auth) and deployed on **Cloudflare Pages**.

---

## Features

| Module | Description |
|---|---|
| **Dashboard** | KPI overview — production, inventory, finance, attendance |
| **Billing** | Nepal IRD–compliant VAT invoices, challan bills, quotations — sequential numbering, partial payments, PDF export |
| **Inventory** | Stock tracking with low-stock alerts |
| **Production** | Job orders, batch tracking, output logging |
| **Quality Control** | QC inspection logs per batch |
| **Finance** | Expenses, payroll, purchases, VAT ledger, journal entries |
| **Employees** | Staff directory, roles, contact info |
| **Attendance** | Daily attendance records for Nepal operations |
| **Tasks** | Cross-team task management (Nepal ↔ UK) |
| **Budget** | Budget requests and approvals |
| **Admin Panel** | User management, role assignment |

---

## Tech Stack

- **Frontend** — React 18, React Router v6, Recharts, `@react-pdf/renderer`
- **Backend / DB** — Firebase Firestore (real-time NoSQL)
- **Auth** — Firebase Authentication
- **PDF generation** — jsPDF + html2canvas, `@react-pdf/renderer`
- **Build tool** — Vite 5
- **Hosting** — Cloudflare Pages (with `_redirects` for SPA routing)

---

## Roles & Permissions

| Role | Access |
|---|---|
| `super_admin` | Full access — all modules, all writes |
| `nepal_admin` | Full Nepal ops — billing, finance, payroll, inventory, production |
| `nepal_staff` | Attendance, production, inventory, QC, tasks, content |
| `uk_admin` | Read all + task management + content status updates |
| `employee` | Read-only |

Permissions are enforced both client-side (`src/utils/permissions.js`) and server-side via **Firestore Security Rules** (`firestore.rules`).

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Firebase project with Firestore and Authentication enabled
- Netlify CLI (optional, for deployment)

### 1. Clone the repo

```bash
git clone https://github.com/jenithroy/kazi-app.git
cd kazi-app
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in your Firebase project credentials:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Run the dev server

```bash
npm run dev
```

App runs at `http://localhost:5173`.

### 5. Deploy Firestore rules

```bash
firebase deploy --only firestore:rules
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local development server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run seed` | Seed Firestore with sample data (requires service account) |

---

## Project Structure

```
kazi-app/
├── public/              # Static assets (logo, letterhead)
├── scripts/             # Admin / one-off Firestore scripts
├── src/
│   ├── components/      # Shared UI components (AppLayout, Sidebar, DocPreview, …)
│   ├── context/         # AuthContext (Firebase auth state)
│   ├── hooks/           # useFirestore custom hook
│   ├── pages/           # One file per route/module
│   ├── utils/           # billing, permissions, roles, formatting helpers
│   ├── App.jsx          # Route definitions
│   ├── firebase.js      # Firebase SDK init
│   ├── main.jsx         # React entry point
│   └── styles.css       # Global styles / design tokens
├── firestore.rules      # Firestore security rules
├── firebase.json        # Firebase project config
├── netlify.toml         # Netlify build + redirect config
└── vite.config.js       # Vite config
```

---

## VAT / Billing Compliance

The billing module is designed for **Nepal IRD compliance**:

- 13% VAT applied on the taxable amount (discount deducted before VAT)
- Sequential auto-numbering: `INV-001`, `CH-001`, `QT-001`
- Fiscal year in Bikram Sambat (B.S.)
- PAN captured for transactions above NPR 50,000
- Partial payment tracking with credit outstanding calculation
- PDF export with IRD-format layout

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firestore project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase App ID |

> **Never commit your `.env` file or `serviceAccountKey.json`.** Both are listed in `.gitignore`.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, commit style, and PR guidelines.

---

## License

Private — Kazi Manufacturing Pvt. Ltd. All rights reserved.
