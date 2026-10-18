/**
 * Everything the Finance page reads, loaded together.
 *
 * It is the old page's `loadData`, moved here with its one-off tidying kept (seeding an empty purchases table, filling in
 * the default chart of accounts, giving a bank typed into an "Other" box an account of its own, renaming the old Laxmi
 * Sunrise account). Three differences from before, all about not letting housekeeping hurt a read:
 *   - the seeding only runs when the table was read successfully and really is empty. A failed read used to look the same
 *     as an empty table and could have written the starter purchases / accounts over live ones;
 *   - each collection that could not be read is named in `failed`, so the page can say so instead of showing zeros;
 *   - a tidying write the database refuses (a view-only position cannot write) is logged and skipped. Before, it stopped the
 *     load half way, which on this page would now read as "Finance could not load".
 *
 * `reload({ quiet: true })` looks again without putting the page back to "loading". A look that is overtaken by a newer
 * one is thrown away, so a slow read can never overwrite a fresher one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAll, insertRow, updateRow, upsertRow } from "../lib/db";
import { createdAfterCutoff } from "../constants";
import { BANK_NAMES } from "../utils/billing.jsx";
import { tsMillis } from "../utils/date";
import { DEFAULT_ACCOUNTS, SEED_PURCHASES, labourRatePerUnit } from "../lib/finance";

const COLLECTIONS = [
  "finance_payroll", "finance_expenses", "finance_purchases", "vat_bills", "employees", "journal_entries",
  "accounts", "invoices", "bank_transactions", "orders", "order_costs", "production", "inventory",
];

const EMPTY = {
  payroll: [], employees: [], expenses: [], purchases: [], vatBills: [], entries: [], accounts: [], invoices: [],
  bankTxns: [], orders: [], orderCosts: {}, inventoryItems: [], labourRate: null,
};

const byDateDesc = (a, b) => (b.date || "").localeCompare(a.date || "");

/** A piece of housekeeping that writes while the page reads: if the database refuses it, say so in the console and carry on. */
async function tidy(what, run) {
  try { return await run(); } catch (err) { console.error(`Finance: could not ${what}:`, err); return undefined; }
}

export default function useFinanceData() {
  const [data, setData] = useState(EMPTY);
  const [status, setStatus] = useState("loading");        // loading | ready | error
  const [failed, setFailed] = useState([]);                // collections the last look could not read
  const seq = useRef(0);
  const lastGood = useRef({});                              // the last successful read of each collection

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    // allSettled: a person who may not read one collection (bank transactions are admin-only) must not blank
    // every other tab they do have access to.
    const settled = await Promise.allSettled(COLLECTIONS.map((c) => fetchAll(c)));
    if (mine !== seq.current) return;                       // a newer look is on its way
    const lost = [];
    const read = {};
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") { read[COLLECTIONS[i]] = r.value; lastGood.current[COLLECTIONS[i]] = r.value; }
      // a collection that cannot be read this time keeps what it had: an open card must not lose its row, and what was typed
      // in it, to a blip (it is still named in `failed`, so the page says it could not be refreshed, and nothing is seeded)
      else { lost.push(COLLECTIONS[i]); read[COLLECTIONS[i]] = lastGood.current[COLLECTIONS[i]] || []; console.error(`Finance: failed to load ${COLLECTIONS[i]}:`, r.reason); }
    });
    const ok = (c) => !lost.includes(c);

    if (lost.length === COLLECTIONS.length) { setFailed(lost); setStatus((s) => (s === "ready" ? "ready" : "error")); return; }

    const next = { ...EMPTY };
    next.inventoryItems = read.inventory;
    next.employees = read.employees.filter((e) => e.status !== "Inactive");
    next.payroll = read.finance_payroll;
    next.bankTxns = [...read.bank_transactions].sort(byDateDesc);
    const expRows = [...read.finance_expenses].sort(byDateDesc);
    next.expenses = expRows;

    let purRows = [...read.finance_purchases];
    // Backfill the starter purchases only into a table that was read and is genuinely empty.
    if (ok("finance_purchases") && purRows.length === 0) {
      const seeded = await tidy("seed the starter purchases", async () => {
        const today = new Date().toISOString().slice(0, 10);
        await Promise.all(SEED_PURCHASES.map((p) => upsertRow("finance_purchases", { ...p, date: today }, ["expense_ref"])));
        return fetchAll("finance_purchases");
      });
      if (seeded) purRows = seeded;
    }
    // Collapse any duplicate expense refs for display, keeping the first. A read must not delete anything, so this hides
    // rather than removes. Keyed by fiscal year + ref: numbers restart every fiscal year (migration 0046), so "EXP001"
    // alone no longer names one purchase.
    const seen = new Map();
    for (const r of purRows) {
      const key = `${r.fiscalYear || ""}:${r.expenseId}`;
      if (!seen.has(key)) seen.set(key, r);
    }
    if (seen.size !== purRows.length) purRows = [...seen.values()];
    purRows.sort((a, b) => (a.expenseId || "").localeCompare(b.expenseId || ""));
    purRows = purRows.filter((r) => createdAfterCutoff(r));
    next.purchases = purRows;

    next.vatBills = [...read.vat_bills].sort((a, b) => tsMillis(b.uploadedAt) - tsMillis(a.uploadedAt));
    next.entries = read.journal_entries.filter((r) => createdAfterCutoff(r)).sort(byDateDesc);

    let accs = [...read.accounts];
    if (ok("accounts")) {
      // The chart of accounts is tidied as it is read. A person who may not write (a view-only position) is refused by the
      // database, and that must cost the page nothing: it shows the accounts as they were read and tries again next time.
      accs = (await tidy("tidy the chart of accounts", async () => {
        let list = accs;
        if (list.length === 0) {
          for (const acc of DEFAULT_ACCOUNTS) await insertRow("accounts", acc);
          list = await fetchAll("accounts");
        } else {
          // Sync any account added to DEFAULT_ACCOUNTS since this database was seeded (e.g. Fonepay)
          const existing = new Set(list.map((a) => a.name));
          const missing = DEFAULT_ACCOUNTS.filter((a) => !existing.has(a.name));
          if (missing.length > 0) {
            for (const acc of missing) await insertRow("accounts", acc);
            list = await fetchAll("accounts");
          }
          // Backfill openingBalanceNPR onto accounts seeded before that field existed
          for (const def of DEFAULT_ACCOUNTS) {
            if (def.openingBalanceNPR == null) continue;
            const acc = list.find((a) => a.name === def.name);
            if (acc && acc.openingBalanceNPR == null) {
              await updateRow("accounts", acc.id, { openingBalanceNPR: def.openingBalanceNPR });
              acc.openingBalanceNPR = def.openingBalanceNPR;
            }
          }
        }
        // A bank name typed into the "Other" box on a purchase, invoice or expense gets an Asset account, so it has an
        // opening balance and shows in the ledger like any other bank instead of silently dropping out of it.
        const custom = new Set();
        purRows.forEach((p) => { if (p.paymentType === "Bank" && p.bankName && !BANK_NAMES.includes(p.bankName)) custom.add(p.bankName); });
        read.invoices.forEach((inv) => { if (inv.paymentType === "Bank" && inv.bankName && !BANK_NAMES.includes(inv.bankName)) custom.add(inv.bankName); });
        expRows.forEach((x) => { if (x.paymentType === "Bank" && x.bankName && !BANK_NAMES.includes(x.bankName)) custom.add(x.bankName); });
        const names = new Set(list.map((a) => a.name));
        const fresh = [...custom].filter((n) => !names.has(n));
        if (fresh.length > 0) {
          for (const name of fresh) await insertRow("accounts", { name, type: "Asset", openingBalanceNPR: 0 });
          list = await fetchAll("accounts");
        }
        // One-time rename of an already-seeded "Laxmi Sunrise Bank" to "Nabil Bank"
        const old = list.find((a) => a.name === "Laxmi Sunrise Bank");
        if (old && !list.find((a) => a.name === "Nabil Bank")) {
          await updateRow("accounts", old.id, { name: "Nabil Bank" });
          old.name = "Nabil Bank";
        }
        return list;
      })) || accs;
    }
    const seenAcc = new Set();
    accs = accs.filter((a) => { if (seenAcc.has(a.name)) return false; seenAcc.add(a.name); return true; });
    accs.sort((a, b) => a.name.localeCompare(b.name));
    next.accounts = accs;

    next.invoices = read.invoices;
    next.orders = [...read.orders].sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
    const costs = {};
    read.order_costs.forEach((c) => { if (c.orderId) costs[c.orderId] = c; });      // keyed by the order reference the cost form writes against
    next.orderCosts = costs;
    next.labourRate = labourRatePerUnit({ payroll: read.finance_payroll, employees: read.employees, production: read.production });

    setData(next);
    setFailed(lost);
    setStatus("ready");
  }, []);

  useEffect(() => { reload().catch((err) => { console.error(err); setStatus((s) => (s === "ready" ? s : "error")); }); }, [reload]);

  // Somebody else may have entered something while this tab was in the background
  useEffect(() => {
    let timer = 0;
    const back = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      timer = setTimeout(() => reload().catch(console.error), 600);
    };
    document.addEventListener("visibilitychange", back);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", back); };
  }, [reload]);

  return { ...data, status, failed, reload };
}
