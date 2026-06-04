# Kazi Manufacturing App - Permissions Guide

This document outlines the roles, navigation visibility, section editing rights, and Firestore security rules implemented in the Kazi App.

---

## 1. System Roles & Access Matrix

The app defines five distinct roles for team members. Navigation links and write privileges are restricted per role, with support for granular user-level overrides.

| Role | Members | Nav Sections Visible | Edit/Write Privileges |
| :--- | :--- | :--- | :--- |
| **Super Admin** | Admin (`admin@kazi.com`) | All | All (Full Access) |
| **UK Admin** | Finn, Zen | `dashboard`, `finance` (read-only), `production`, `billing`, `content` (Budget), `tasks`, `directors`, `customers`, `admin`, `messenger`, `library` | `tasks` (Read-only for others unless explicitly overridden) |
| **Nepal Admin** | Wilson, Anmol, Anusha | `dashboard`, `tasks`, `attendance`, `production`, `qc`, `inventory`, `finance`, `billing`, `content` (Budget), `employees`, `customers`, `messenger`, `library` | All default Nepal Operations ( Wilson, Anmol, & Anusha have forced `production` write access) |
| **Employee** | Monika, Sudhansu, Bedhant | `dashboard`, `tasks`, `attendance`, `library` | None (Read-only views for assigned tasks and self clock-in) |
| **Nepal Staff** | *(Stitchers/Workers)* | `dashboard`, `tasks`, `attendance`, `library`, `production`, `qc`, `inventory`, `content` (Budget) | None (Read-only views for work assignments and self clock-in) |

---

## 2. Nav Section Visibility & Edit Rules (`permissions.js`)

Access control logic is defined in [permissions.js](file:///c:/Users/acer/Claude%20FIles/code/kazi-app/src/utils/permissions.js).

### Navigation Visibility (`sectionVisible`)
- Sidebar links are filtered dynamically depending on the user's role.
- If a user has an explicit permission override under their Firestore document (e.g. `permissions.finance` is an object/true), the section is rendered regardless of role.

### Section Editing (`sectionCanEdit`)
- Nepal Admin roles check their specific permissions object (e.g. `permissions.attendance`).
- UK Admins can edit `tasks` by default.
- Employees and Nepal Staff are read-only by default unless an explicit override is configured on their document.

### Finance Tabs Allowed (`financeTabAllowed`)
Controls access to the sub-sections of the **Finance** module:
- UK Admins have read access to all Finance tabs.
- Nepal Admins have access controlled by their Firestore permissions configuration.
- Employees are blocked by default unless they have an explicit override.

---

## 3. Active User Overrides

Individual user overrides are loaded dynamically in the [AuthContext.jsx](file:///c:/Users/acer/Claude%20FIles/code/kazi-app/src/context/AuthContext.jsx) from Firestore.

### Monika (`bhusal.monika14@gmail.com`)
- **Base Role**: `employee`
- **Overrides**: Enabled to access the **Finance** section and add **Expenses**.
- **Firestore Permission Object**:
  ```json
  "permissions": {
    "finance": {
      "expenses": true
    }
  }
  ```

---

## 4. Firestore Database Security Rules (`firestore.rules`)

Rules configured in [firestore.rules](file:///c:/Users/acer/Claude%20FIles/code/kazi-app/firestore.rules) govern direct database requests.

- **Global Read**: Any logged-in user can read any document.
- **Attendance**: Write access restricted to `nepal_staff` and `super_admin`.
- **Clock-ins**: All signed-in users can write (submit clock-in).
- **Production, Inventory, QC Logs**: Write access restricted to `nepal_staff` and `super_admin`.
- **Tasks**: Write access restricted to `nepal_staff`, `uk_admin`, and `super_admin`. Delete restricted to `nepal_admin`, `uk_admin`, and `super_admin`.
- **Content (Budget)**: Create allowed for `nepal_staff` and `super_admin`. UK Admin can update "status" only (Approval/Rejection).
- **Finance (Purchases, Payroll, VAT, Journal)**: Write access restricted to `nepal_admin` and `super_admin`.
- **Orders, Invoices, Challans, Quotations**: Write access restricted to `nepal_admin` and `super_admin`.
- **Customers, Employees**: Write access restricted to `nepal_admin`, `uk_admin`, and `super_admin`.
