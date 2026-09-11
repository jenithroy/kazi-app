/* ── Progress bar ─────────────────────────────────────── */
export function Progress({ pct, color = "var(--mint-deep)", track = "rgba(15,46,34,.07)", h = 6 }) {
  return (
    <div className="kprog" style={{ height: h, background: track }}>
      <span style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}
