import { chartColor } from "./charts";
import { cn } from "./utils";

/* ── Bar list ─────────────────────────────────────────── */
/**
 * A ranked list where the bar shows the share: orders by stage, customers by
 * revenue, pages by how much they are used. For amounts over time use a chart.
 *
 *   rows      [{ key, label, value, display?, meta?, color?, onClick? }]
 *             `display` is the figure to print when it is not the raw number
 *             (a <Money>, a percentage)
 *   max       what a full bar means; the largest value by default
 *   rank      number the rows 1, 2, 3 …
 *   empty     what to say when there is nothing to rank
 */
export function BarList({ rows, max, rank = false, empty = "Nothing to show yet.", label, className }) {
  if (!rows.length) return <p className="k-bars-empty">{empty}</p>;
  const ceiling = max ?? Math.max(...rows.map((r) => Number(r.value) || 0), 1);

  return (
    <ol className={cn("k-bars", rank && "k-bars--ranked", className)} aria-label={label}>
      {rows.map((row, i) => {
        const value = Number(row.value) || 0;
        const pct = ceiling > 0 ? Math.min(100, (value / ceiling) * 100) : 0;
        const content = (
          <>
            {rank && <span className="k-bars-n" aria-hidden="true">{i + 1}</span>}
            <span className="k-bars-label">{row.label}</span>
            <span className="k-bars-value">{row.display ?? value.toLocaleString()}</span>
            <span className="k-bars-track">
              {/* width and colour are this row's data, so they stay inline */}
              <span className="k-bars-fill" style={{ width: `${pct}%`, background: row.color || chartColor(i) }} />
            </span>
            {row.meta && <span className="k-bars-meta">{row.meta}</span>}
          </>
        );
        return (
          <li key={row.key ?? row.label} className="k-bars-row">
            {row.onClick
              ? <button type="button" className="k-bars-btn" onClick={row.onClick}>{content}</button>
              : content}
          </li>
        );
      })}
    </ol>
  );
}
