/**
 * Small pieces the Reddit Leads views share: a number tile, a notice strip, the wording for a view that could not load.
 */
import { Icons, cn } from "../ui";
import { Figure, Sub, Tile } from "../bento/Bento";

export const ico = { size: 14, sw: 1.8 };

/** A short tile with one figure and one line under it (the same shape as the Meta Ads and Customers number tiles). */
export function Kpi({ area, title, icon, value, sub, tone, loading }) {
  return (
    <Tile area={area} title={title} icon={icon} tone={tone} loading={loading} align="top" className="rdl-kpi">
      <Figure>{value}</Figure>
      <Sub>{sub}</Sub>
    </Tile>
  );
}

/** A strip above the grid: `tone` is "warn", "bad" or "info"; `action` is a { label, onClick } button at its right. */
export function Notice({ tone = "info", children, action, role = "status" }) {
  const Icon = tone === "info" ? Icons.Info : Icons.Alert;
  return (
    <div className={cn("rdl-banner", `is-${tone}`)} role={role}>
      <Icon size={16} sw={1.9} aria-hidden="true" />
      <span>{children}</span>
      {action && <button type="button" onClick={action.onClick} disabled={action.disabled}>{action.label}</button>}
    </div>
  );
}

/** The panel that stands in for a view that could not be read at all. */
export function LoadError({ what, onRetry, busy }) {
  return (
    <div className="kb-error" role="alert">
      <p>{what} could not load. Check your connection and try again.</p>
      <button type="button" className="kb-btn kb-btn--ghost" onClick={onRetry} disabled={busy}>{busy ? "Trying…" : "Try again"}</button>
    </div>
  );
}
