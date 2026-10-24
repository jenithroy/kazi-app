/**
 * What a row of fields means: how its boxes become the form a card would have built, and when a row is not ready to save.
 *
 * A row writes through exactly the functions the cards use (lib/financeWrites.js), so what reaches the database is what a card
 * would have sent for the same typing. The checks are the cards' own, with their words (a missing amount is "Enter the amount."
 * on the card and in the row). Where a row is stricter than its card it says so below: those are slips that are easy to make on one
 * line and costly afterwards (a purchase with no amount, or an amount of nothing, still takes up a bill number).
 */
import { emptyExpense, emptyJournal, emptyBankTxn } from "./financeWrites";
import { isAdvanceEntry } from "./finance";
import { emptyPurchaseForm } from "../components/PurchaseRowGroup";
import { BANK_NAMES } from "../utils/billing.jsx";
import { filterByDateRange, filterByFiscalYear } from "../utils/fiscalYear";
import { asciiDigits } from "./entryDate";

/**
 * Is this day outside the period the page is showing (a fiscal year, a From / To)? A record dated then is saved, but it is not in the list
 * she is looking at, which reads as "it did not save" unless she is told.
 */
export function outsidePeriod({ fy, dateRange }, day) {
  if (!day) return false;
  const only = [{ date: day }];
  return filterByDateRange(filterByFiscalYear(only, fy), dateRange).length === 0;
}

/* ── Amounts ──────────────────────────────────────────────────────── */

/** A typed amount without the commas and spaces people write them with ("1,62,000" is 162000). */
export const stripAmount = (text) => asciiDigits(text).replace(/[,\s]/g, "");

/** The number typed, or null when the box is empty or is not a number. */
export function amountOf(text) {
  const t = stripAmount(text);
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// "Rs. 1,250", "NPR 1250", "₨1,250", "रु. १,२५०" and "1,250/-" are how an amount is written on a bill, and are pasted that way
const CURRENCY_BEFORE = /^\s*(?:n?rs|npr|₨|रु|रू)\.?\s*/i;
const CURRENCY_AFTER = /\s*\/-\s*$/;

/**
 * What goes in an amount box for what was typed or pasted: the digits and the point (commas and spaces are only for the eye), with a
 * currency written before or after it taken off. null when there is anything else in it: a letter is not part of a number, and
 * dropping it silently turns "12.5k" into 12.5, and a currency's own dot, left behind, turns "Rs.1250" into 0.125.
 */
export function typedAmount(text) {
  const t = asciiDigits(text).replace(CURRENCY_BEFORE, "").replace(CURRENCY_AFTER, "");
  return /[^0-9.,\s]/.test(t) ? null : t.replace(/\s+/g, "");
}

/** What the row says when what was typed or pasted into an amount box was not taken (see typedAmount). */
export function notAnAmount(text) {
  const t = String(text ?? "").trim();
  return { field: "amount", message: `“${t.length > 24 ? `${t.slice(0, 24)}…` : t}” is not an amount. Use digits only, like 1,250.50.` };
}

/* ── Paid by: cash, credit, or one of the banks, in one dropdown ─── */

export const PAY_CHOICES = [
  { value: "CASH", label: "Cash" },
  { value: "Credit", label: "Credit" },
  ...BANK_NAMES.map((b) => ({ value: `Bank:${b}`, label: b })),
];

/** The dropdown's choice as the two fields the books keep. A bank carries its name; the others keep the form's default name, as a card does. */
export function payFrom(choice) {
  if (typeof choice === "string" && choice.startsWith("Bank:")) return { paymentType: "Bank", bankName: choice.slice(5) };
  return { paymentType: choice === "Credit" ? "Credit" : "CASH", bankName: "Nabil Bank" };
}

/* ── Expenses ─────────────────────────────────────────────────────── */

export const blankExpense = (date) => ({ date, category: "Utilities", note: "", pay: "CASH", vat: false, amount: "", paid: false, file: null });

/** The form the expense card builds for the same typing (`paid` is the card's choice; the table keeps it as `status`). */
export function expenseForm(f, region) {
  const { paymentType, bankName } = payFrom(f.pay);
  return {
    ...emptyExpense(f.date, region), category: f.category, amountNPR: stripAmount(f.amount), note: f.note,
    vatBill: Boolean(f.vat), paymentType, bankName, paid: Boolean(f.paid),
  };
}

export function expenseProblem(f) {
  if (amountOf(f.amount) === null) return { field: "amount", message: "Enter the amount." };
  if (!f.date) return { field: "date", message: "Pick the date." };
  return null;
}

/* ── Purchases ────────────────────────────────────────────────────── */

export const VAT_CHOICES = [{ value: "no", label: "No" }, { value: "yes", label: "Yes, 13%" }, { value: "na", label: "N/A" }];
export const blankPurchase = (date) => ({ date, party: "", item: "", category: "Office Supplies", pay: "CASH", vat: "no", amount: "" });

/** One bill with one line: the first item of the card's list, left as a card leaves it when only the particulars and the amount are typed. */
export function purchaseForm(f, region) {
  const { paymentType, bankName } = payFrom(f.pay);
  return {
    ...emptyPurchaseForm, date: f.date, region, expenseItem: f.party, category: f.category, paymentType, bankName,
    vatBill: f.vat === "yes" ? true : f.vat === "na" ? null : false,
    items: [{ particulars: f.item, quantity: "", unit: "pcs", rate: "", amount: stripAmount(f.amount) }],
  };
}

/**
 * `stockNames` is the lower-case names of the stock items. A line that names one is only counted in stock when it has a quantity
 * (lib/stockLedger.js), and a row has no quantity box: saving it here would file the bill and leave the stock where it was, so the
 * row hands it to the full form instead. The card's own checks come first, in its order; a row is stricter in one place: the amount
 * is required (the card lets a named item with no amount through, which uses up a bill number on nothing).
 */
export function purchaseProblem(f, stockNames = new Set()) {
  if (!f.party.trim()) return { field: "party", message: "Required: who did you buy from?" };
  if (!f.date) return { field: "date", message: "Pick the date." };
  const amount = amountOf(f.amount);
  if (!f.item.trim()) return { field: "item", message: amount ? "Say what was bought." : "Add what was bought, with its amount." };
  if (!(amount > 0)) return { field: "amount", message: "Enter the amount." };
  if (stockNames.has(f.item.trim().toLowerCase())) {
    return { field: "item", full: true, message: `“${f.item.trim()}” is a stock item: put its quantity in the full form, so the stock goes up.` };
  }
  return null;
}

/* ── Bank ─────────────────────────────────────────────────────────── */

export const blankBank = (date) => ({ date, description: "", type: "Debit", amount: "" });

export const bankForm = (f) => ({ ...emptyBankTxn(f.date), description: f.description, amount: stripAmount(f.amount), type: f.type });

export function bankProblem(f) {
  if (!f.date) return { field: "date", message: "Pick the transaction date." };
  if (amountOf(f.amount) === null) return { field: "amount", message: "Enter the amount." };
  if (!f.description.trim()) return { field: "description", message: "Say what the transaction was." };
  return null;
}

/* ── Journal ──────────────────────────────────────────────────────── */

export const blankJournal = (date) => {
  const e = emptyJournal(date);
  return { date, description: "", debit: e.debitAccount, credit: e.creditAccount, amount: "", party: "" };
};

export const journalForm = (f, region) => ({
  ...emptyJournal(f.date), description: f.description, debitAccount: f.debit, creditAccount: f.credit, amountNPR: stripAmount(f.amount),
  partyName: f.party, region,
});

export function journalProblem(f) {
  const form = journalForm(f, "");
  if (!f.date) return { field: "date", message: "Pick the entry date." };
  if (!((amountOf(f.amount) || 0) > 0)) return { field: "amount", message: "Enter the amount." };
  if (f.debit === f.credit) return { field: "credit", message: "Debit and Credit accounts must be different." };
  if (isAdvanceEntry(form) && !f.party.trim()) return { field: "party", message: "Enter the customer or supplier this advance belongs to." };
  if (!f.description.trim()) return { field: "description", message: "Say what the entry is for." };
  return null;
}

/* ── VAT bills ────────────────────────────────────────────────────── */

export const blankBill = () => ({ date: "", purchaseId: "", file: null });

export function billProblem(f) {
  if (!f.purchaseId) return { field: "purchase", message: "Choose the purchase this bill is for." };
  if (!f.file) return { field: "file", message: "Choose the bill's file." };
  return null;
}
