/**
 * The row at the top of the filed VAT bills: choose the purchase the bill is for (the ones still needing a bill come first; the list
 * can be searched by number, supplier or amount) and its file, then Enter. It files the bill through `uploadVatBill`, the function the
 * Upload a VAT bill card uses.
 */
import { useMemo } from "react";
import EntryRow from "./EntryRow";
import { Clip, Pick } from "./cells";
import useEntry from "./useEntry";
import { useFin } from "../FinanceContext";
import { useMoney } from "../parts";
import { uploadVatBill } from "../../../lib/financeWrites";
import { billProblem, blankBill } from "../../../lib/financeEntry";

export const VAT_NEEDS = ["item", "file"];

export default function VatEntry({ ctx, onSaved }) {
  const { profile, region, loading, reload, regionPurchases, regionVatBills } = useFin();
  const money = useMoney();

  // the purchases still needing a bill first, then the rest, newest first (the same list the Upload card offers)
  const options = useMemo(() => {
    const has = new Set(regionVatBills.map((b) => b.purchaseId).filter(Boolean));
    const rank = (p) => (p.vatBill === true && !has.has(p.id) ? 0 : 1);
    return [...regionPurchases]
      .sort((a, b) => rank(a) - rank(b) || (b.date || "").localeCompare(a.date || "") || (b.expenseId || "").localeCompare(a.expenseId || ""))
      .map((p) => ({
        value: p.id,
        label: `${p.expenseId} · ${p.fiscalYear ? `FY ${p.fiscalYear} · ` : ""}${(p.expenseItem || "").trim() || "no supplier"}`,
        hint: money(Number(p.amountNPR) || 0),
      }));
  }, [regionPurchases, regionVatBills, money]);

  const e = useEntry({
    kind: "bill", first: "purchase", blank: blankBill, check: billProblem,
    write: (f) => uploadVatBill({ purchase: regionPurchases.find((p) => p.id === f.purchaseId) || null, file: f.file, profile, region }),
    after: ({ res, form }) => {
      reload().catch(console.error);
      onSaved?.(res.row?.id);
      const p = regionPurchases.find((x) => x.id === form.purchaseId);
      return `${p?.expenseId || "Bill"} · ${form.file?.name || ""}`.trim();
    },
  });
  const { form, set, problem, idOf } = e;
  const bad = (field) => problem?.field === field;

  const wide = ctx.visible.some((c) => c.id === "by");
  const cells = {
    item: <Pick id={idOf("purchase")} label="The purchase this bill is for" placeholder="Choose the purchase this bill is for" value={form.purchaseId} options={options} onChange={(v) => set({ purchaseId: v })} disabled={loading} invalid={bad("purchase")} minWidth={380} />,
    // the file box goes in the Uploaded by cell, which is empty in this row and wide enough to read a file's name; with that column gone it goes under Bill.
    // It is the last stop on the way through: Enter from the purchase lands here, Enter here opens the chooser, and Enter once there is a file files the bill.
    [wide ? "by" : "file"]: <Clip id={idOf("file")} file={form.file} onFile={(file) => set({ file })} disabled={loading} invalid={bad("file")} named flow onEnter={e.submit} label="Choose the file" />,
  };

  return (
    <EntryRow
      ctx={ctx} label="File a VAT bill" saveLabel="File the bill" saveAt="file" cells={cells}
      busy={e.busy} waiting={e.waiting} saved={e.saved} problem={e.problem} rowRef={e.rowRef} idOf={e.idOf} onSubmit={e.submit} onKeyDown={e.onKeyDown}
    />
  );
}
