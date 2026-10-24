/**
 * The Filters panel of the fiscal-year Transactions page: what one year's list of everything that moved can be narrowed by, declared as
 * data for the shared engine (components/filters/useFilters.js). No React in here, so it can be checked on its own; the rows are
 * lib/fiscalYearRows.js.
 *
 *   Kind          All · Expense · Purchase · Payroll · Journal · Bank · Sales (the kinds this year holds)
 *   Money         Any · In · Out
 *   Name          the customer, supplier or member of staff a line is with (spellings that differ only in capitals or spaces are one name)
 *   Category      an expense's or purchase's category, or either account of a journal entry (folded the same way)
 *   Amount        a smallest and a largest amount, in rupees
 *   Dated between a day range inside the year
 *   Only show     Not counted in the totals (unpaid sales) · With a VAT bill · Expenses not paid yet
 *   Logged by     who entered it (last: the names are not always spelt the same)
 */
import foldNames from "./foldNames";

const clean = (v) => String(v ?? "").trim();

/** Whom a line is with: a sale's client, a purchase's supplier, a payroll line's person, a journal entry's party. */
export function nameOf(r) {
  const s = r.src || {};
  if (r.type === "Sales") return clean(s.clientName);
  if (r.type === "Purchase") return clean(s.expenseItem);
  if (r.type === "Payroll") return clean(s.staffName);
  if (r.type === "Journal") return clean(s.partyName);
  return "";
}

/** The category of an expense or purchase; the debit and the credit account of a journal entry (it is under each); nothing for the rest. */
export function categoryOf(r) {
  const s = r.src || {};
  if (r.type === "Expense" || r.type === "Purchase") return clean(s.category);
  if (r.type === "Journal") return [clean(s.debitAccount), clean(s.creditAccount)].filter(Boolean);
  return "";
}

/** Who entered a line, where the record says (a purchase and a bank line do not). */
export function loggedBy(r) {
  const s = r.src || {};
  if (r.type === "Expense" || r.type === "Payroll") return clean(s.loggedBy);
  if (r.type === "Journal" || r.type === "Sales") return clean(s.createdBy);
  return "";
}

/**
 * `types`: the kinds this year holds, in the order the page lists them; `show` writes a day in A.D. or B.S.; `rows`: the year's lines, from which
 * a name is written the way most of them spell it.
 */
export function transactionFilterDefs({ types, show, rows = [] }) {
  const names = foldNames(rows, nameOf);
  const categories = foldNames(rows.flatMap((r) => [].concat(categoryOf(r) || [])), (t) => t);
  const people = foldNames(rows, loggedBy);
  return [
    {
      id: "kind", label: "Kind", kind: "chips",
      options: [{ value: "all", label: "All" }, ...types.map((t) => ({ value: t, label: t }))],
      test: (r, v) => r.type === v,
    },
    {
      id: "money", label: "Money", kind: "chips",
      options: [{ value: "any", label: "Any" }, { value: "in", label: "In" }, { value: "out", label: "Out" }],
      test: (r, v) => (v === "in" ? r.sign > 0 : r.sign < 0),
    },
    { id: "name", label: "Customer, supplier or staff", kind: "select", of: (r) => names.keyOf(nameOf(r)), nameOf: names.nameOf, any: "Anyone", none: "No name on it" },
    { id: "category", label: "Category or account", kind: "select", of: (r) => [].concat(categoryOf(r) || []).map(categories.keyOf), nameOf: categories.nameOf, any: "Any category or account", none: "Has neither" },
    { id: "amount", label: "Amount", kind: "range", get: (r) => r.amountNPR, unit: "NPR", pill: "Amount" },
    { id: "day", label: "Dated between", kind: "dates", get: (r) => r.date, show, pill: "Dated" },
    { id: "uncounted", label: "Not counted", kind: "toggle", text: "Not counted in the totals", pill: "Not counted", test: (r) => !r.counts },
    { id: "vat", label: "With a VAT bill", kind: "toggle", text: "With a VAT bill", pill: "With a VAT bill", test: (r) => (r.type === "Expense" || r.type === "Purchase") && r.src?.vatBill === true },
    { id: "unpaid", label: "Expenses not paid yet", kind: "toggle", text: "Expenses not paid yet", pill: "Expense not paid", test: (r) => r.type === "Expense" && r.src?.status !== "Paid" },
    { id: "by", label: "Logged by", kind: "select", of: (r) => people.keyOf(loggedBy(r)), nameOf: people.nameOf, any: "Anyone", none: "Not recorded" },
  ];
}
