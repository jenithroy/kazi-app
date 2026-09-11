import { Link } from "react-router-dom";
import { Icons } from "./Icons";
import { Pill } from "./Pill";
import { cn } from "./utils";

/* ── KPI Card ─────────────────────────────────────────── */
/**
 * One headline number.
 *
 *   label       what is counted, in sentence case
 *   value       the number, already formatted
 *   unit        after the number: "%", "pcs", "/ 12"
 *   icon        a small icon in the corner, tinted with `accent`
 *   to          a route: the whole card links to where the number comes from
 *   href        the same for a plain link; onClick for an action instead
 *   delta, deltaLabel, spark
 *               a change against an earlier period. Pass only real comparisons,
 *               never a placeholder.
 */
export function KPI({ label, value, unit, delta, deltaLabel, spark, accent = "var(--mint-deep)", icon, to, href, onClick, className }) {
  const body = (
    <>
      <span className="kkpi-h">
        <span className="kkpi-label">{label}</span>
        {icon && <span className="kkpi-ico" style={{ color: accent }}>{icon}</span>}
      </span>
      <span className="kkpi-val">
        <span className="num-xl kkpi-num">{value}</span>
        {unit && <span className="kkpi-unit">{unit}</span>}
      </span>
      {(delta != null || deltaLabel || spark) && (
        <span className="kkpi-foot">
          {delta != null && (
            <Pill tone={delta >= 0 ? "mint" : "terra"} icon={delta >= 0 ? <Icons.ArrowUp size={11} sw={2.2} /> : <Icons.ArrowDown size={11} sw={2.2} />}>
              {Math.abs(delta)}%
            </Pill>
          )}
          {deltaLabel && <span className="kkpi-deltal">{deltaLabel}</span>}
          {spark && <span className="kkpi-spark">{spark}</span>}
        </span>
      )}
    </>
  );

  const linked = to || href || onClick;
  const cls = cn("kkpi", linked && "kkpi--link", className);
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (href) return <a href={href} className={cls}>{body}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}
