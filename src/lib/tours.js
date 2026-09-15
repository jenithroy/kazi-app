/**
 * Guided "Show me" flows.
 *
 * Each tour is a short walk to one control — the thing somebody has to click
 * to do their job — not a tour of the page. A step names a `data-tour` value
 * that some page puts on a real element; Spotlight finds it, rings it, and
 * says what it does.
 *
 * Deliberately few. A tour per button would be sixty anchors to keep alive
 * through every redesign, and nobody needs walking through the Changelog.
 * These are the flows people are logging every day, where getting it wrong
 * costs somebody a reconciliation later.
 *
 * Anchors live on the page, not here, so `grep data-tour` finds every target.
 * A step whose anchor never appears is not a crash: Spotlight says the control
 * isn't on screen (usually view-only access) and offers the way out.
 */

export const TOURS = {
  "clock-in": {
    label: "Clocking in and out",
    section: "attendance",
    path: "/attendance",
    steps: [
      {
        anchor: "clock-in",
        title: "Clock in when you arrive",
        body:
          "Tap this once you're at the workshop. Your phone's GPS is checked against a "
          + "100m geofence around the office, and the time is stamped by the server — not "
          + "by your phone's clock, so changing your phone's time does nothing.",
      },
      {
        anchor: "clock-in",
        title: "And clock out when you leave",
        body:
          "The same card turns into Clock out once you're clocked in. Your hours for the "
          + "day come from the gap between the two, so forgetting to clock out leaves the "
          + "day incomplete and someone has to fix it by hand.",
      },
    ],
  },

  "new-order": {
    label: "Opening a production order",
    section: "production",
    path: "/production",
    steps: [
      {
        anchor: "new-order",
        title: "Every job starts as an order",
        body:
          "Open the order the day it's confirmed, not the day cutting starts. Batches, "
          + "QC logs, issued stock and the order's P&L all hang off this record — anything "
          + "logged before the order exists has nowhere to attach.",
      },
      {
        anchor: "production-tabs",
        title: "Then move it along here",
        body:
          "Pipeline shows every live order by stage. Batch Tracking is where cut quantities "
          + "get logged. Move an order on the day the stage actually changes — the delivery "
          + "dates the directors quote clients are read off these stages.",
      },
    ],
  },

  "qc-log": {
    label: "Logging a QC check",
    section: "quality_control",
    path: "/qc",
    steps: [
      {
        anchor: "qc-form",
        title: "One log per batch inspected",
        body:
          "Pick the batch, the date, how many pieces you checked and how many failed. Log "
          + "the check even when nothing fails — a batch with no log reads as uninspected, "
          + "and the defect rate is only meaningful if the clean batches are in there too.",
      },
    ],
  },

  "new-invoice": {
    label: "Raising an invoice",
    section: "billing",
    path: "/billing",
    steps: [
      {
        anchor: "billing-tabs",
        title: "Three documents, three tabs",
        body:
          "Quotation goes out before the client commits. Challan travels with the goods. "
          + "VAT Invoice is the one that asks for money. They number themselves — never "
          + "type a document number by hand.",
      },
      {
        anchor: "new-doc",
        title: "This opens a new one",
        body:
          "The button follows the tab you're on, so check the tab first. Line items can be "
          + "linked to stock, which takes the goods out of Inventory when the sale is posted.",
      },
      {
        anchor: "billing-list",
        title: "Record payments against the invoice",
        body:
          "When money lands, open the invoice from this list and use Record Payment rather "
          + "than editing the status by hand. Part payments are fine — the status moves to "
          + "Partial on its own and the balance stays visible.",
      },
    ],
  },

  "add-expense": {
    label: "Recording an expense",
    section: "finance",
    path: "/finance",
    steps: [
      {
        anchor: "finance-tabs",
        title: "Finance is split into tabs",
        body:
          "You'll only see the tabs your role opens. Expenses, VAT Bills, Journal and "
          + "Payroll are where things get entered; P&L, Ledger and Balance Sheet are built "
          + "from those entries and are never typed into directly.",
      },
      {
        anchor: "add-expense",
        title: "Log the spend, then attach the bill",
        body:
          "Enter the expense on the day it's paid. Then upload the VAT bill against it in "
          + "the VAT Bills tab — an expense with no bill attached can't be claimed, and "
          + "chasing the paper back at year end is how the timing gets lost.",
      },
    ],
  },

  "new-task": {
    label: "Working the task board",
    section: "tasks",
    path: "/tasks",
    steps: [
      {
        anchor: "new-task",
        title: "Anything longer than a day goes on the board",
        body:
          "Give it a category and an owner. The board is where anyone else finds out what "
          + "you're on without asking you.",
      },
      {
        anchor: "task-board",
        title: "Move your own cards",
        body:
          "Drag between To Do, In Progress, Done and Blocked. Blocked is not an admission "
          + "of failure — it's the column that gets you help, and a card sitting in "
          + "In Progress while it's actually stuck is a card nobody knows to unstick.",
      },
    ],
  },

  "budget-request": {
    label: "Asking for money to spend",
    section: "budget",
    path: "/content",
    steps: [
      {
        anchor: "new-budget-request",
        title: "Request it before you spend it",
        body:
          "Anything you need bought goes through here so it can be approved and budgeted. "
          + "Buying first and claiming later means the spend lands in the accounts with no "
          + "approval behind it.",
      },
    ],
  },

  "add-stock": {
    label: "Keeping stock straight",
    section: "inventory",
    path: "/inventory",
    steps: [
      {
        anchor: "add-stock",
        title: "New materials get added here",
        body:
          "Add the item once, with its unit, then move quantities in and out against it. "
          + "Making a second entry for something already listed splits its history in two.",
      },
      {
        anchor: "inventory-tabs",
        title: "Stock, costs and the product library",
        body:
          "Stock is what's physically on the shelf. Cost items price the work. The library "
          + "holds fabrics and product specs you reuse across orders.",
      },
    ],
  },
};

export const tourKeys = () => Object.keys(TOURS);
export const getTour = (key) => TOURS[key] || null;

/** Link that opens a page with its tour running. */
export const tourHref = (key) => {
  const t = TOURS[key];
  return t ? `${t.path}?tour=${encodeURIComponent(key)}` : null;
};
