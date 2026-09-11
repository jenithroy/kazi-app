import { statusTone } from "../../lib/status";
import { cn } from "./utils";

/* ── Pill ─────────────────────────────────────────────── */
/**
 * A small label for a state or a category.
 *
 *   <Pill status="Paid" />              tone from lib/status.js; the text is the status
 *   <Pill tone="amber" dot>Late</Pill>  an explicit tone
 *
 * tone: neutral | mint | amber | terra | blue | dark | ghost | mint-solid
 */
export function Pill({ tone, status, children, dot, icon, className }) {
  const resolved = tone || (status ? statusTone(status) : "neutral");
  return (
    <span className={cn("kpill", `kpill--${resolved}`, className)}>
      {dot && <span className="kpill-dot" aria-hidden="true" />}
      {icon && <span className="kpill-ico" aria-hidden="true">{icon}</span>}
      {children ?? status}
    </span>
  );
}
