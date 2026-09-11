import { Pill } from "./Pill";

/* ── KPI Card ─────────────────────────────────────────── */
export function KPI({ label, value, unit, delta, deltaLabel, spark, accent = "var(--mint-deep)", icon }) {
  return (
    <div className="kkpi">
      <div className="kkpi-h">
        <span className="kkpi-label">{label}</span>
        {icon && <span className="kkpi-ico" style={{ color: accent }}>{icon}</span>}
      </div>
      <div className="kkpi-val">
        <span className="num-xl" style={{ fontSize: 30, lineHeight: 1 }}>{value}</span>
        {unit && <span className="kkpi-unit">{unit}</span>}
      </div>
      <div className="kkpi-foot">
        {delta != null && (
          <Pill tone={delta >= 0 ? "mint" : "terra"}>
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%
          </Pill>
        )}
        {deltaLabel && <span className="kkpi-deltal">{deltaLabel}</span>}
        {spark && <span className="kkpi-spark">{spark}</span>}
      </div>
    </div>
  );
}
