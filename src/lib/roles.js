/**
 * What each role is expected to log.
 *
 * The roles themselves are NOT listed here. They live in the `positions` table
 * in Supabase and are edited on the Admin Panel, so the Roles page reads them
 * from there — otherwise a role added or renamed in Admin would silently
 * disagree with this page, which is exactly what a hardcoded list did before.
 *
 * This file supplies only the words. Entries are keyed by position id, or by
 * the role's name slugified the same way the Admin Panel derives an id from a
 * name (lowercase, non-alphanumerics to dashes), so a role written up under
 * either spelling is found. A role with no entry shows its people and says its
 * duties haven't been written up yet — better than inventing some.
 *
 * `cadence` is company policy, not something the code knows. It's here so it
 * says one thing to everybody, and changing it changes it everywhere.
 */

/** Same derivation the Admin Panel uses when it turns a role name into an id. */
export const roleKey = (s = "") =>
  String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const ROLE_DUTIES = {
  // Directors own the business; they read what Kathmandu records rather than
  // recording anything themselves. Still listed — an empty duty list is the
  // point, not a reason to leave the role off.
  director: [],

  // A separate role from Operations Manager, and it logs nothing.
  "operations-head": [],

  "operations-manager": [
    {
      what: "Open every order and keep the pipeline honest",
      cadence: "Per order, and as each stage changes",
      section: "production",
      tour: "new-order",
      detail: "Open the order the day it's confirmed and move its stage the day the stage actually moves. Every order should be findable and at the right point — the dates quoted to clients are read straight off this.",
    },
    {
      what: "Set materials and fabrics against the work",
      cadence: "As orders consume them",
      section: "inventory",
      tour: "add-stock",
      detail: "Keep Stock Levels and Materials & Fabrics matching what the floor is actually using, so an order's costs and what's left on the shelf both stay true.",
    },
  ],

  accountant: [
    {
      what: "Enter expenses and attach the VAT bill",
      cadence: "Daily",
      section: "finance",
      tour: "add-expense",
      detail: "An expense with no bill against it can't be claimed, and chasing the paper back at year end is how the timing gets lost.",
    },
    {
      what: "Raise invoices and record payments as they land",
      cadence: "Per order, and same day the money arrives",
      section: "billing",
      tour: "new-invoice",
      detail: "Use Record Payment rather than editing a status by hand — otherwise the money is untraceable. Part payments are fine.",
    },
    {
      what: "Post journal entries for anything that isn't a plain expense",
      cadence: "As they arise",
      section: "finance",
      detail: "Adjustments, transfers and corrections, with a description that still explains itself in six months.",
    },
    {
      what: "Run payroll and issue salary slips",
      cadence: "Monthly",
      section: "employees",
      detail: "Payroll reads the month's attendance, so close attendance before running it.",
    },
  ],

  "marketing-co-ordinator": [
    {
      what: "Put everyone's tasks on the board",
      cadence: "As work is assigned",
      section: "tasks",
      tour: "new-task",
      detail: "Not just marketing's — this role raises the cards for the whole team, with an owner and a category on each. Work that only exists in a chat thread is work nobody can find on the day it's needed.",
    },
    {
      what: "Plan posts on the marketing calendar",
      cadence: "Weekly",
      section: "marketing",
      detail: "Put each piece on the day it goes out, so anyone can see what's coming without asking.",
    },
  ],

  "fashion-designer": [
    {
      what: "Add and remove materials and fabrics",
      cadence: "As they're sourced or dropped",
      section: "inventory",
      detail: "Inventory → Materials & Fabrics. Add each one once, with its composition and GSM, so orders reference it instead of restating it.",
    },
    {
      what: "Keep the status on materials and fabrics current",
      cadence: "Whenever it changes",
      section: "inventory",
      detail: "A fabric still reading In Stock after it's run out sends someone to a shelf that's empty.",
    },
    {
      what: "Add tech packs as they're drawn up",
      cadence: "When a style needs one",
      section: "inventory",
      detail: "Inventory → Tech Packs. The pack is what the floor cuts from, so it belongs here rather than in a folder on someone's laptop.",
    },
    {
      what: "Log samples",
      cadence: "Per sample made",
      section: "inventory",
      detail: "Inventory → Samples, with the stage, the fabric used, size, colour and cost. It's the record of what was tried before the bulk run.",
    },
  ],

  "content-co-ordinator": [
    {
      what: "Mark calendar entries done when the piece ships",
      cadence: "On publish",
      section: "marketing",
      detail: "A calendar showing the plan but not what actually went out is only half a record.",
    },
    {
      what: "Keep finished work attached to its task card",
      cadence: "As each piece lands",
      section: "tasks",
      detail: "So the person who commissioned it can find it without asking you where it went.",
    },
  ],
};

/*
 * Aliases, so a role is found whichever way its name is spelled or whichever
 * id it happens to carry.
 *
 * Worth the few lines: the marketing role is written both with and without
 * the hyphen and sometimes paired with Client Service. Looking up by one exact
 * string would drop the duties on the floor silently — the card would just
 * claim nothing had been written up.
 *
 * Operations Head is deliberately NOT aliased to Operations Manager. They are
 * two different roles here, and only the Manager logs anything.
 */
ROLE_DUTIES["marketing-coordinator"] = ROLE_DUTIES["marketing-co-ordinator"];
ROLE_DUTIES["marketing-co-ordinator-client-service"] = ROLE_DUTIES["marketing-co-ordinator"];
ROLE_DUTIES["marketing-coordinator-client-service"] = ROLE_DUTIES["marketing-co-ordinator"];
ROLE_DUTIES["client-service"] = ROLE_DUTIES["marketing-co-ordinator"];
ROLE_DUTIES["content-coordinator"] = ROLE_DUTIES["content-co-ordinator"];
ROLE_DUTIES["content-editor"] = ROLE_DUTIES["content-co-ordinator"];

/** Duties for a role, by id or by name. Undefined when none are written up. */
export function dutiesFor(position) {
  if (!position) return undefined;
  return ROLE_DUTIES[position.id] ?? ROLE_DUTIES[roleKey(position.label)];
}

/**
 * Asked of everyone in Kathmandu, whatever their role — said once rather than
 * repeated under every heading. Directors are not included: they are in the UK
 * and do not clock in against the Kathmandu geofence.
 */
export const SHARED_DUTIES = [
  {
    what: "Clock in when you arrive and out when you leave",
    cadence: "Every working day",
    section: "attendance",
    tour: "clock-in",
    detail: "GPS-checked against a 100m geofence and stamped by the server. Your hours come from the gap between the two, so a missing clock-out leaves the day for someone else to reconstruct.",
  },
  {
    what: "Keep your task cards in the right column",
    cadence: "As work changes",
    section: "tasks",
    tour: "new-task",
    detail: "To Do, In Progress, Done, Blocked. Blocked is not an admission of failure — it's the column that gets you help.",
  },
  {
    what: "Report anything broken, confusing, or missing",
    cadence: "The moment you hit it",
    section: "bug_report",
    detail: "Bugs and feature requests both. Nothing is too small, and a screenshot usually makes it fixable the same day.",
  },
];

/* ── Section names and paths, shared with the Bug Report page ── */

export const SECTION_LABEL = {
  dashboard: "Dashboard",
  attendance: "Attendance",
  tasks: "Tasks",
  production: "Production",
  quality_control: "Quality Control",
  inventory: "Inventory",
  library: "Product Library",
  sales: "Sales",
  billing: "Billing",
  finance: "Finance",
  purchases: "Purchases",
  budget: "Budget & Requirements",
  customers: "Customers",
  employees: "Employees & HR",
  marketing: "Marketing",
  messenger: "Messenger",
  admin: "Roles & Permissions",
  usage_analytics: "Usage & Activity",
  directors: "Company Overview",
  bug_report: "Bug Report",
};

export const SECTION_PATH = {
  dashboard: "/dashboard",
  attendance: "/attendance",
  tasks: "/tasks",
  production: "/production",
  quality_control: "/qc",
  inventory: "/inventory",
  library: "/inventory",
  sales: "/sales",
  billing: "/billing",
  finance: "/finance",
  purchases: "/purchases",
  budget: "/content",
  customers: "/customers",
  employees: "/employees",
  marketing: "/marketing",
  messenger: "/messenger",
  admin: "/admin",
  usage_analytics: "/usage",
  bug_report: "/bug-report",
};
