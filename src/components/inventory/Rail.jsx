/**
 * The rail beside the stock and cost tables: what to buy, and what just moved.
 *
 * A wide window has room the table does not need (its columns stay together on the left), so it goes to the two
 * things a person looking at stock actually wants next: which items have run down to their reorder level (press one to
 * log what has come in), and the latest movements across everything (press one to see that item's history).
 * Both read what the page already loaded. Below 1280px the rail is not drawn; the Low filter and the table say the same.
 */
import { EmptyNote, RowList, Tile } from "../bento/Bento";
import { Icons } from "../ui";
import { fmtQty } from "../../lib/inventory";

const SOURCE = { purchase: "Purchase", sale: "Sale", manual: "Manual", opening: "Opening", production: "Production" };
const short = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function Rail({ stock, movements, loading, onOpen }) {
  // the worst first: furthest under its level
  const low = stock.filter((s) => s.low).sort((a, b) => (a.closing - Number(a.row.minLevel || 0)) - (b.closing - Number(b.row.minLevel || 0)));
  const byId = new Map(stock.map((s) => [s.id, s.row]));
  const recent = movements
    .filter((m) => byId.has(m.itemId))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 12);

  return (
    <aside className="inv-rail" aria-label="Reordering and latest movements">
      <Tile
        tone={low.length ? "amber" : "wash"}
        icon={<Icons.Alert size={14} sw={1.8} />}
        title="Needs reordering"
        note={low.length ? `${low.length}` : undefined}
        loading={loading}
        align="top"
      >
        {low.length === 0 ? (
          <EmptyNote icon={<Icons.Check size={22} sw={1.8} />}>Everything is above its reorder level.</EmptyNote>
        ) : (
          <RowList className="kb-fill">
            {low.map((s) => (
              <li key={s.id} className="kb-row inv-rrow">
                <button type="button" className="inv-rbtn" title={`Log stock for ${s.row.item}`} onClick={() => onOpen(s.row, "moves")}>
                  <span className="inv-rbtn-t"><b>{s.row.item}</b><span>reorder at {fmtQty(s.row.minLevel || 0)} {s.row.unit}</span></span>
                  <span className="inv-rbtn-q"><b className={s.closing <= 0 ? "kb-bad" : undefined}>{fmtQty(s.closing)}</b><small>{s.row.unit}</small></span>
                </button>
              </li>
            ))}
          </RowList>
        )}
      </Tile>

      <Tile icon={<Icons.Clock size={14} sw={1.8} />} title="Latest movements" loading={loading} align="top">
        {recent.length === 0 ? (
          <EmptyNote icon={<Icons.Inventory size={22} sw={1.5} />}>No stock has moved yet.</EmptyNote>
        ) : (
          <RowList className="kb-fill">
            {recent.map((m) => {
              const row = byId.get(m.itemId);
              return (
                <li key={m.id} className="kb-row inv-rrow">
                  <button type="button" className="inv-rbtn" title={`See the history of ${row.item}`} onClick={() => onOpen(row, "moves")}>
                    <span className="inv-rbtn-t"><b>{row.item}</b><span>{SOURCE[m.source] || m.source} · {short(m.date)}</span></span>
                    <span className="inv-rbtn-q"><b className={m.direction === "in" ? "kb-good" : "kb-bad"}>{m.direction === "in" ? "+" : "−"}{fmtQty(m.qty)}</b><small>{row.unit}</small></span>
                  </button>
                </li>
              );
            })}
          </RowList>
        )}
      </Tile>
    </aside>
  );
}
