/* ── Progress bar ─────────────────────────────────────── */
/** A thin bar for a share of a whole. Pass `label` when nothing nearby says what it measures. */
export function Progress({ pct, color = "var(--mint-deep)", track = "var(--line)", h = 6, label }) {
  const value = Math.min(100, Math.max(0, Number(pct) || 0));
  return (
    <div
      className="kprog"
      style={{ height: h, background: track }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-label={label}
    >
      <span style={{ width: `${value}%`, background: color }} />
    </div>
  );
}
