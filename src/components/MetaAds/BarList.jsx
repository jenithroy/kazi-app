import { cn } from "../ui";

export default function BarList({ rows = [], max, rank = false, empty = "Nothing to chart yet.", className }) {
  if (!rows || rows.length === 0) return <p className="kmkt-muted">{empty}</p>;
  const ceiling = max ?? Math.max(...rows.map((r) => Number(r.value) || 0), 1);

  return (
    <div className={cn("kmkt-barlist", className)}>
      {rows.map((r, i) => {
        const val = Number(r.value) || 0;
        const pct = ceiling > 0 ? Math.min(100, (val / ceiling) * 100) : 0;
        return (
          <div key={r.key || r.label || i} className="kmkt-barlist-row">
            <div className="kmkt-barlist-header">
              <span className="kmkt-barlist-label" title={r.fullLabel || r.label}>
                {rank && <span className="kmkt-barlist-rank">{i + 1}. </span>}
                {r.label}
              </span>
              <span className="kmkt-barlist-val mono kmkt-num">{r.display ?? val.toLocaleString()}</span>
            </div>
            <div className="kmkt-barlist-track">
              <div
                className="kmkt-barlist-fill"
                style={{ width: `${pct}%`, background: r.color || "var(--mint-deep)" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
