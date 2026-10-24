/**
 * Purchases: every bill from a supplier or a shop, newest first. The same pane serves the Finance page's Purchases section and the
 * Purchases page, so a purchase is entered and corrected the same way from either.
 *
 * A row opens the purchase's card (items, VAT, totals); "New purchase" opens the same card empty. The VAT column says at a glance
 * which VAT purchases still have no bill filed against them, which is what the VAT bills section is for.
 */
import { useEffect, useMemo, useState } from "react";
import DataTable from "../../table/DataTable";
import { FindBar } from "../FilterMenu";
import useTabFilters from "../useTabFilters";
import { EmptyNote } from "../../bento/Bento";
import { Icons } from "../../ui";
import FinPane from "../FinPane";
import PurchaseCard from "../cards/PurchaseCard";
import PurchaseEntry, { PURCHASE_NEEDS } from "../entry/PurchaseEntry";
import { fits } from "../entry/EntryRow";
import useFlash, { useHiddenNote } from "../entry/useFlash";
import ConfirmDialog from "../ConfirmDialog";
import { useFin, emptyWords } from "../FinanceContext";
import { Amt, Chip, ExportButton, Foot, FootSum, NameCell, plural, useMoney, usePhoneRows } from "../parts";
import { planPurchaseRenumber, resequencePurchaseExpenseIds } from "../../../utils/financeRows";
import foldNames from "../../../lib/foldNames";

const payLabel = (p) => (p.paymentType === "Bank" ? (p.bankName || "Bank") : p.paymentType === "Credit" ? "Credit" : "Cash");
const has = (hay, q) => String(hay || "").toLowerCase().includes(q);
const itemNames = (p) => (Array.isArray(p.items) ? p.items.map((i) => (i.particulars || "").trim()).filter(Boolean) : []);
const itemsLine = (p) => {
  const n = itemNames(p);
  return n.length > 2 ? `${n.slice(0, 2).join(", ")} +${n.length - 2}` : n.join(", ");
};

/** Suppliers already used, each once (spelled the way it is used most), most-used first: what the "bought from" field suggests. */
export function partiesOf(purchases) {
  const byKey = new Map();
  for (const p of purchases) {
    const name = (p.expenseItem || "").trim();
    if (!name) continue;
    const key = name.toLowerCase().replace(/\s+/g, " ");
    const hit = byKey.get(key) || { count: 0, spellings: new Map() };
    hit.count += 1;
    hit.spellings.set(name, (hit.spellings.get(name) || 0) + 1);
    byKey.set(key, hit);
  }
  return [...byKey.values()]
    .map((h) => ({ name: [...h.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0], count: h.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export default function PurchasesTab({ showRenumber = false, initialQuery = "", labelledBy = "fin-tab-purchases" }) {
  const f = useFin();
  const { purchases, regionPurchases, allPurchases, regionVatBills, canEditTab, canSeeBills = true, show, loading, reload, fyActive, fy, newRef } = f;
  const money = useMoney();
  const canEdit = canEditTab("purchases");
  const [query, setQuery] = useState(initialQuery);
  const [card, setCard] = useState(null);                 // null, or { id, seed, added } (null id = a new purchase; a seed is what the row at the top had typed, `added` empties that row once the card has saved it)
  const [renumbering, setRenumbering] = useState(false);
  const [fresh, flash] = useFlash();                        // the purchase just typed into the row at the top

  useEffect(() => {
    newRef.current = canEdit ? () => setCard({ id: null }) : null;
    return () => { newRef.current = null; };
  }, [newRef, canEdit]);

  // bills by the purchase they belong to
  const billsOf = useMemo(() => {
    const m = new Map();
    regionVatBills.forEach((b) => { if (b.purchaseId) m.set(b.purchaseId, [...(m.get(b.purchaseId) || []), b]); });
    return m;
  }, [regionVatBills]);
  const parties = useMemo(() => partiesOf(regionPurchases), [regionPurchases]);

  // newest first; a bill's number breaks a tie on the same day
  const ordered = useMemo(
    () => [...purchases].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.expenseId || "").localeCompare(a.expenseId || "")),
    [purchases],
  );
  const q = query.trim().toLowerCase();
  const found = useMemo(
    () => ordered.filter((p) => !q || has(p.expenseId, q) || has(p.expenseItem, q) || has(p.category, q) || itemNames(p).some((n) => has(n, q))),
    [ordered, q],
  );
  // What the Filters panel offers for this list: VAT bill or one still to file, a category, who it was bought from, how it was paid, how much.
  const defs = useMemo(() => {
    const parties = foldNames(ordered, (p) => p.expenseItem);          // names typed with other capitals or spaces are one name
    const categories = foldNames(ordered, (p) => p.category);
    return [
    {
      id: "bill", label: "VAT bill", kind: "chips",
      options: [
        { value: "all", label: "All" }, { value: "vat", label: "VAT bill" },
        ...(canSeeBills ? [{ value: "missing", label: "Needs bill", tone: "warn" }] : []),
      ],
      test: (p, v) => p.vatBill === true && (v !== "missing" || !billsOf.has(p.id)),
    },
    { id: "category", label: "Category", kind: "select", of: (p) => categories.keyOf(p.category), nameOf: categories.nameOf, any: "Any category", none: "No category" },
    { id: "party", label: "Bought from", kind: "select", of: (p) => parties.keyOf(p.expenseItem), nameOf: parties.nameOf, any: "Any supplier", none: "Not recorded" },
    { id: "via", label: "Paid with", kind: "select", of: payLabel, any: "Any way of paying" },
    { id: "amount", label: "Amount", kind: "range", get: (p) => Number(p.amountNPR), unit: "NPR" },
    ];
  }, [canSeeBills, billsOf, ordered]);
  const tf = useTabFilters(defs, found);
  const shown = tf.rows;
  // the bills still to file among the ones on screen (without the right to read the bills, "no bill filed" would be true of all)
  const missing = canSeeBills ? shown.filter((p) => p.vatBill === true && !billsOf.has(p.id)) : [];
  useHiddenNote(fresh, purchases, shown);                    // a record just typed in that the search or a filter hides is said so
  const total = shown.reduce((s, p) => s + Number(p.amountNPR || 0), 0);
  const vatTotal = shown.reduce((s, p) => s + (p.vatBill === true ? Number(p.vatAmountNPR || 0) : 0), 0);

  const open = card?.id ? regionPurchases.find((p) => p.id === card.id) || null : null;
  useEffect(() => { if (card?.id && !loading && !open) setCard(null); }, [card, loading, open]);

  // Expense numbers are meant to follow dates. When the series has drifted (purchases filed out of order, or a date edited
  // afterwards) say so and offer the fix, rather than renumbering issued numbers unasked. Judged on every purchase.
  const outOfOrder = useMemo(() => (showRenumber ? planPurchaseRenumber(allPurchases) : []), [showRenumber, allPurchases]);

  const columns = useMemo(() => [
    {
      id: "id", label: "Number", width: 112, drop: 3, first: "desc", sort: (p) => `${p.fiscalYear || ""}${p.expenseId || ""}`,
      render: (p) => <span className="fn-id"><b>{p.expenseId || "—"}</b>{p.fiscalYear ? <i>{p.fiscalYear.slice(2)}</i> : null}</span>,
    },
    {
      id: "date", label: "Date", width: 116, drop: 2, first: "desc", sort: (p) => p.date || "",
      render: (p) => <span className="dt-num">{show(p.date)}</span>,
    },
    {
      // a narrow table has no room for the number or the date: they go under the name
      id: "party", label: "Bought from", grow: true, min: 160, max: 560, sort: (p) => (p.expenseItem || "").trim().toLowerCase(),
      render: (p, { dropped }) => (
        <NameCell
          main={(p.expenseItem || "").trim() || "—"} rest={itemsLine(p)}
          extra={[dropped.has("id") && p.expenseId, dropped.has("date") && show(p.date), dropped.has("vat") && canSeeBills && p.vatBill === true && !billsOf.has(p.id) && "Needs VAT bill"]}
        />
      ),
    },
    {
      id: "cat", label: "Category", width: 150, drop: 5, sort: (p) => (p.category || "").toLowerCase(),
      render: (p) => <span className="dt-clip dt-dim">{p.category || "—"}</span>,
    },
    {
      id: "pay", label: "Paid by", width: 104, drop: 6, sort: (p) => payLabel(p).toLowerCase(),
      render: (p) => <span className="dt-clip dt-dim">{payLabel(p)}</span>,
    },
    {
      id: "vat", label: "VAT bill", width: 104, drop: 4, sort: (p) => (p.vatBill === true ? (billsOf.has(p.id) ? 2 : 1) : 0),
      render: (p) => {
        if (p.vatBill === true) {
          const b = billsOf.get(p.id);
          return b
            ? <a className="dt-act fn-link" href={b[0].fileUrl} target="_blank" rel="noopener noreferrer">View ↗</a>
            : (canSeeBills ? <Chip tone="warn">Needs bill</Chip> : <Chip tone="good">VAT</Chip>);
        }
        return <span className="dt-dim">{p.vatBill === false ? "No" : "N/A"}</span>;
      },
    },
    {
      id: "amt", label: "Amount", width: 124, align: "end", first: "desc", sort: (p) => Number(p.amountNPR) || 0,
      render: (p) => <Amt n={p.amountNPR} strong />,
    },
  ], [show, billsOf, canSeeBills]);

  const csv = useMemo(() => [
    { label: "Number", value: (p) => p.expenseId }, { label: "Fiscal year", value: (p) => p.fiscalYear }, { label: "Date", value: (p) => p.date },
    { label: "Bought from", value: (p) => (p.expenseItem || "").trim() }, { label: "Category", value: (p) => p.category },
    { label: "Items", value: (p) => itemNames(p).join("; ") }, { label: "Paid by", value: payLabel },
    { label: "VAT bill", value: (p) => (p.vatBill === true ? "Yes" : p.vatBill === false ? "No" : "N/A") },
    { label: "Subtotal NPR", value: (p) => p.subtotalNPR }, { label: "Discount NPR", value: (p) => p.discountAmt },
    { label: "VAT NPR", value: (p) => p.vatAmountNPR }, { label: "Total NPR", value: (p) => p.amountNPR },
  ], []);

  const empty = emptyWords({ fyActive, fy, noun: "purchases", regionCount: regionPurchases.length, fallback: "No purchases yet." });
  const [capped, more] = usePhoneRows(shown);

  async function renumber() {
    try {
      await resequencePurchaseExpenseIds();
      await reload();
      return { ok: true };
    } catch (err) {
      console.error("Failed to renumber purchases by date:", err);
      return { ok: false, message: "Could not renumber. Database migration 0046 may not be applied yet." };
    }
  }

  return (
    <>
      <FinPane
        title="Purchases"
        note={q || tf.count > 0 ? `${shown.length} of ${purchases.length}` : `${purchases.length} ${plural(purchases.length, "bill")}`}
        id="fin-pane" labelledBy={labelledBy}
        tools={<FindBar value={query} onChange={setQuery} placeholder="Search purchases" label="Search purchases by supplier, category, item or number" filters={tf} />}
        actions={(
          <>
            <ExportButton name="purchases" columns={csv} rows={shown} />
            {canEdit && (
              <button type="button" className="kb-btn kb-btn--primary" onClick={() => setCard({ id: null })} title="Shift + N">
                <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> New purchase
              </button>
            )}
          </>
        )}
        foot={(
          <Foot>
            <FootSum count label={plural(shown.length, "bill")} value={shown.length} />
            <FootSum label="Total" value={money(total)} />
            {vatTotal > 0 && <FootSum label="VAT in these" value={money(vatTotal)} />}
            {tf.values.bill !== "missing" && missing.length > 0 && <FootSum label="Need a bill" value={missing.length} tone="warn" />}
          </Foot>
        )}
      >
        {!canEdit && <p className="fn-viewonly">View only. You do not have permission to add or change purchases.</p>}
        {canEdit && outOfOrder.length > 0 && (
          <div className="fn-note">
            <Icons.Alert size={15} sw={1.9} aria-hidden="true" />
            <span><b>{outOfOrder.length}</b> expense {plural(outOfOrder.length, "number is", "numbers are")} out of date order.</span>
            <button type="button" onClick={() => setRenumbering(true)}>Renumber by date</button>
          </div>
        )}
        <DataTable
          className="fn-dense"
          label="Purchases"
          rows={capped}
          rowKey={(p) => p.id}
          columns={columns}
          defaultSort={{ id: "date", dir: "desc" }}
          onOpen={(p) => setCard({ id: p.id })}
          rowLabel={(p) => `Open ${p.expenseId || "purchase"} from ${(p.expenseItem || "").trim() || "no supplier"}, ${money(Number(p.amountNPR) || 0)}`}
          activeKey={card?.id || undefined}
          flashKey={fresh}
          entry={canEdit ? (c) => (fits(c, PURCHASE_NEEDS) ? <PurchaseEntry ctx={c} parties={parties} onSaved={flash} onFull={(seed, added) => setCard({ id: null, seed, added })} /> : null) : undefined}
          loading={loading}
          empty={<EmptyNote icon={<Icons.Cart size={22} sw={1.5} />}>{purchases.length === 0 ? empty : "Nothing matches that."}</EmptyNote>}
        />
        {more}
      </FinPane>

      {card && (!card.id || open) && (
        <PurchaseCard
          key={card.id || "new"} purchase={open} parties={parties} seed={card.seed} onAdded={card.added}
          bills={open ? billsOf.get(open.id) || [] : []} onClose={() => setCard(null)}
        />
      )}

      {renumbering && (
        <ConfirmDialog
          title="Renumber by date?" confirmLabel="Renumber" busyLabel="Renumbering…"
          onCancel={() => setRenumbering(false)} onConfirm={renumber}
        >
          <p>This renumbers {outOfOrder.length} existing {plural(outOfOrder.length, "purchase")} so the numbers keep following the dates:</p>
          <ul className="fn-changes">
            {outOfOrder.slice(0, 8).map((c) => <li key={c.id}><span>{c.from || "—"}</span> <i aria-hidden="true">→</i> <b>{c.to}</b></li>)}
          </ul>
          {outOfOrder.length > 8 && <p className="ec-note">…and {outOfOrder.length - 8} more.</p>}
        </ConfirmDialog>
      )}
    </>
  );
}
