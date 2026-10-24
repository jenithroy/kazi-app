/**
 * The product-wise stock ledger: Opening + In − Out = Closing for every item over a date range, grouped by category.
 *
 * On screen it is a DataTable that fits the window: the quantity and its value share a cell (the old report had ten
 * columns, a quantity and an amount for each of in, out and balance). Pressing an item opens its card.
 *
 * The page works the report's lines out (it needs them for the Filters panel, which also holds the From and To that used
 * to sit over the table) and hands over two lists: `report`, the lines that pass the search and the filters, for the
 * screen, and `printReport`, every item, for the printout. A printed ledger is the company's stock register: it is
 * always the whole of it, whatever is narrowed on screen.
 *
 * What gets PRINTED is not that table. It is the accounting document the old page printed, character for character: the
 * company heading, ten columns, subtotals, the total and the note. A document must not change with the screen, so it
 * lives in its own element (`#kinv-ledger-print-area`, the id styles.css's print rules know) rendered into <body>, hidden
 * on screen and shown only by the printer. In <body> because the glass panes on the page are size containers, and
 * anything printed from inside one is clipped to it.
 */
import { Fragment, useMemo } from "react";
import { createPortal } from "react-dom";
import DataTable from "../table/DataTable";
import { EmptyNote } from "../bento/Bento";
import { Icons } from "../ui";
import { useCurrency } from "../../context/CurrencyContext";
import { COMPANY_ADDR, COMPANY_NAME } from "../../utils/billing.jsx";
import { fmtLedgerQty as fmtQty, groupLedger } from "../../lib/inventory";

/** A quantity over what it is worth: "120" and, quieter beneath it, "1,32,000". */
function QtyAmount({ qty, amount, tone, num }) {
  return (
    <span className="dt-stack">
      <span className={`dt-num${tone ? ` dt-${tone}` : ""}`}>{fmtQty(qty)}</span>
      <small>{num(amount)}</small>
    </span>
  );
}

export default function LedgerReport({ report, printReport, from, to, onOpenItem, empty }) {
  const { currency, num } = useCurrency();
  const amtCcy = currency === "NPR" ? "" : ` (${currency})`;

  const { groups, grand } = useMemo(() => groupLedger(report), [report]);
  // the printout is every item, whatever the screen is narrowed to
  const printed = useMemo(() => groupLedger(printReport), [printReport]);

  const list = useMemo(() => {
    const out = [];
    for (const g of groups) {
      out.push({ id: `g:${g.category}`, kind: "group", label: g.category });
      g.items.forEach((r) => out.push({ ...r, kind: "item" }));
      out.push({ id: `s:${g.category}`, kind: "sum", label: "Subtotal", ...g.sub });
    }
    if (groups.length) out.push({ id: "total", kind: "total", label: "Total", ...grand });
    return out;
  }, [groups, grand]);

  const columns = useMemo(() => [
    {
      id: "desc", label: "Description", grow: true, min: 170, max: 380,
      render: (r) => (r.kind === "item"
        ? <span className="dt-two-t"><b>{r.item}</b><span>{r.unit || "—"}</span></span>
        : <span className="dt-clip">{r.label}</span>),
    },
    { id: "open", label: "Opening", width: 92, align: "end", drop: 5, render: (r) => <span className="dt-num dt-dim">{fmtQty(r.openingQty)}</span> },
    { id: "in", label: `In${amtCcy}`, width: 118, align: "end", drop: 4, render: (r) => <QtyAmount qty={r.inQty} amount={r.inAmount} tone={r.inQty ? "good" : "dim"} num={num} /> },
    { id: "out", label: `Out${amtCcy}`, width: 118, align: "end", drop: 3, render: (r) => <QtyAmount qty={r.outQty} amount={r.outAmount} tone={r.outQty ? "bad" : "dim"} num={num} /> },
    { id: "bal", label: `Balance${amtCcy}`, width: 128, align: "end", render: (r) => <QtyAmount qty={r.closingQty} amount={r.closingAmount} tone={r.closingQty < 0 ? "bad" : undefined} num={num} /> },
  ], [num, amtCcy]);

  return (
    <>
      {/* the dates are in the Filters panel (Period, Between); this line says them, and what the columns add up to */}
      <div className="inv-ledger-bar">
        <p className="inv-ledger-note">Opening + In − Out = Closing, from {from} to {to}</p>
        <button type="button" className="kb-pillbtn inv-print" onClick={() => window.print()} title="Prints every item for these dates, whatever is narrowed on screen">
          <Icons.File size={14} sw={1.8} aria-hidden="true" /> Print
        </button>
      </div>

      <DataTable
        label="Stock ledger"
        rows={list}
        rowKey={(r) => r.id}
        columns={columns}
        kindOf={(r) => (r.kind === "item" ? undefined : r.kind)}
        onOpen={onOpenItem ? (r) => onOpenItem(r.id) : undefined}
        rowLabel={(r) => `Open ${r.item}`}
        empty={empty || <EmptyNote icon={<Icons.Inventory size={22} sw={1.5} />}>No inventory items yet.</EmptyNote>}
      />

      {createPortal(<PrintArea groups={printed.groups} grand={printed.grand} count={printReport.length} from={from} to={to} num={num} amtCcy={amtCcy} />, document.body)}
    </>
  );
}

/* ── The printed document: unchanged from the old page ──────────── */

function PrintArea({ groups, grand, count, from, to, num, amtCcy }) {
  const fmtAmt = (n) => num(n);
  let sn = 0;
  const th = { textAlign: "right", padding: "6px 10px", fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)", borderBottom: "2px solid var(--line-strong)" };
  const thLeft = { ...th, textAlign: "left" };
  const td = { textAlign: "right", padding: "5px 10px", fontSize: 12.5, fontFamily: "var(--mono)", borderBottom: "1px solid var(--line)" };
  const tdLeft = { ...td, textAlign: "left", fontFamily: "var(--font)" };

  return (
    <div className="inv-print-root">
      <div id="kinv-ledger-print-area">
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: ".02em" }}>{COMPANY_NAME.toUpperCase()}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-2)", marginTop: 2 }}>Stock Ledger — Product Wise</div>
          <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>{COMPANY_ADDR}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>Report Date: {from}  to  {to}</div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={thLeft}>S.N.</th>
                <th style={thLeft}>Description</th>
                <th style={th}>Opening Qty</th>
                <th style={th}>In Qty</th>
                <th style={th}>In Amount{amtCcy}</th>
                <th style={th}>Out Qty</th>
                <th style={th}>Out Amount{amtCcy}</th>
                <th style={th}>Balance Qty</th>
                <th style={th}>Balance Amount{amtCcy}</th>
                <th style={thLeft}>Unit</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(({ category, items, sub }) => (
                <Fragment key={category}>
                  <tr>
                    <td colSpan={10} style={{ padding: "10px 10px 4px", fontSize: 12, fontWeight: 700, color: "var(--ink-2)", background: "var(--bg-2)" }}>{category}</td>
                  </tr>
                  {items.map((r) => {
                    sn += 1;
                    return (
                      <tr key={r.id}>
                        <td style={tdLeft}>{sn}</td>
                        <td style={tdLeft}>{r.item}</td>
                        <td style={td}>{fmtQty(r.openingQty)}</td>
                        <td style={td}>{fmtQty(r.inQty)}</td>
                        <td style={td}>{fmtAmt(r.inAmount)}</td>
                        <td style={td}>{fmtQty(r.outQty)}</td>
                        <td style={td}>{fmtAmt(r.outAmount)}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{fmtQty(r.closingQty)}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{fmtAmt(r.closingAmount)}</td>
                        <td style={tdLeft}>{r.unit}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={tdLeft} colSpan={2}>Subtotal</td>
                    <td style={{ ...td, fontWeight: 600 }}>{fmtQty(sub.openingQty)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{fmtQty(sub.inQty)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{fmtAmt(sub.inAmount)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{fmtQty(sub.outQty)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{fmtAmt(sub.outAmount)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{fmtQty(sub.closingQty)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{fmtAmt(sub.closingAmount)}</td>
                    <td style={td}></td>
                  </tr>
                </Fragment>
              ))}
              {count === 0 && (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: "28px 0", color: "var(--ink-4)", fontSize: 13 }}>No inventory items yet</td></tr>
              )}
            </tbody>
            {count > 0 && (
              <tfoot>
                <tr>
                  <td style={{ ...tdLeft, fontWeight: 800, borderTop: "2px solid var(--line-strong)" }} colSpan={2}>TOTAL</td>
                  <td style={{ ...td, fontWeight: 800, borderTop: "2px solid var(--line-strong)" }}>{fmtQty(grand.openingQty)}</td>
                  <td style={{ ...td, fontWeight: 800, borderTop: "2px solid var(--line-strong)" }}>{fmtQty(grand.inQty)}</td>
                  <td style={{ ...td, fontWeight: 800, borderTop: "2px solid var(--line-strong)" }}>{fmtAmt(grand.inAmount)}</td>
                  <td style={{ ...td, fontWeight: 800, borderTop: "2px solid var(--line-strong)" }}>{fmtQty(grand.outQty)}</td>
                  <td style={{ ...td, fontWeight: 800, borderTop: "2px solid var(--line-strong)" }}>{fmtAmt(grand.outAmount)}</td>
                  <td style={{ ...td, fontWeight: 800, borderTop: "2px solid var(--line-strong)" }}>{fmtQty(grand.closingQty)}</td>
                  <td style={{ ...td, fontWeight: 800, borderTop: "2px solid var(--line-strong)" }}>{fmtAmt(grand.closingAmount)}</td>
                  <td style={{ ...td, borderTop: "2px solid var(--line-strong)" }}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 16, lineHeight: 1.6 }}>
          <div><strong>Note:</strong></div>
          <div>Opening Qty = Previous period's closing balance.</div>
          <div>In Qty (Purchase) = Total quantity purchased. Out Qty (Sales/Issue) = Total quantity sold/issued.</div>
          <div>Balance Qty = Opening Qty + In Qty − Out Qty. Amounts are valued at each item's recorded unit cost.</div>
        </div>
      </div>
    </div>
  );
}
