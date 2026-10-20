/**
 * Small pieces the Meta Ads views share: a number tile, a delivery tag, a notice strip, a thumbnail that falls back to an icon, and the
 * wording for the loading and failing states.
 */
import { useState } from "react";
import { Icons, cn } from "../ui";
import { Figure, Sub, Tile } from "../bento/Bento";
import { Tag } from "../EditCard";
import { statusOf } from "../../lib/metaCalc";

export const ico = { size: 14, sw: 1.8 };
/** One shared empty list, so a view that has not read yet has the same array every render (a fresh [] each time would rerun every memo). */
export const NONE = Object.freeze([]);
export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
export const num = (n) => Math.round(Number(n) || 0).toLocaleString();

/** A short tile with one figure and one line under it (the same shape as the Customers page's money tiles). */
export function Kpi({ area, title, icon, value, sub, tone, loading }) {
  const len = String(value ?? "").length;          // a long amount ("NPR 290,000", "$60.00 + £10.00") is set smaller so it fits a narrow tile whole
  return (
    <Tile area={area} title={title} icon={icon} tone={tone} loading={loading} align="top" className="ma-kpi">
      <Figure className={len > 14 ? "ma-fig-xs" : len > 9 ? "ma-fig-s" : undefined}>{value}</Figure>
      <Sub>{sub}</Sub>
    </Tile>
  );
}

/** A delivery status as a small tag; `card` is for one inside a card or a dialog, which has the card's tags, not the page's. */
export function StatusTag({ effectiveStatus, status, card }) {
  const s = statusOf(effectiveStatus, status);
  if (card) return <Tag tone={s.tone || undefined}>{s.label}</Tag>;
  return <span className={cn("kb-tag", s.tone && `kb-tag--${s.tone}`)}>{s.label}</span>;
}

/** A strip above the grid: `tone` is "warn", "bad" or "info"; `action` is a { label, onClick } button at its right. */
export function Notice({ tone = "info", children, action, role = "status" }) {
  const Icon = tone === "info" ? Icons.Info : Icons.Alert;
  return (
    <div className={cn("ma-banner", `is-${tone}`)} role={role}>
      <Icon size={16} sw={1.9} aria-hidden="true" />
      <span>{children}</span>
      {action && <button type="button" onClick={action.onClick} disabled={action.disabled}>{action.label}</button>}
    </div>
  );
}

/** A picture somebody's ad carries, or an icon where there is none or it will not load. */
export function Thumb({ url, size = 34 }) {
  const [bad, setBad] = useState("");
  const ok = url && bad !== url;
  return ok
    ? <img className="ma-thumb" style={{ width: size, height: size }} src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(url)} />
    : <span className="ma-thumb ma-thumb--none" style={{ width: size, height: size }} aria-hidden="true"><Icons.Image size={Math.round(size / 2.2)} sw={1.6} /></span>;
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
