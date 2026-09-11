/* ── Segmented bar ────────────────────────────────────── */
export function SegBar({ segments, height = 6 }) {
  const total = segments.reduce((s, x) => s + x.v, 0) || 1;
  return (
    <div className="ksegbar" style={{ height }}>
      {segments.map((s, i) => (
        <span key={i} title={`${s.label}: ${s.v}`} style={{ width: `${(s.v / total) * 100}%`, background: s.color }} />
      ))}
    </div>
  );
}
