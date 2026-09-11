import { Link } from "react-router-dom";
import { Icons } from "./Icons";
import { cn } from "./utils";

/* ── Page header ──────────────────────────────────────── */
/**
 * The top of a page: what it is, and what can be done on it.
 *
 *   title        the page's name, in sentence case
 *   description  one or two plain sentences on what the page is for
 *   back         { to, label }: a link to the page this one belongs to
 *   actions      controls that act on the whole page: region switch, currency,
 *                the primary action (put the primary action last)
 *   stats        [{ label, value }]: a compact strip of counts beside the actions
 *
 * On a phone it stacks: the title first, then the stats and actions full width.
 * (components/PageHeader.jsx is the older header; pages move to this one as
 * they are redesigned.)
 */
export function PageHeader({ title, description, back, actions, stats, className }) {
  const hasStats = Array.isArray(stats) && stats.length > 0;
  return (
    <header className={cn("k-page-head", className)}>
      <div className="k-page-main">
        {back && (
          <Link to={back.to} className="k-page-back" aria-label={`Back to ${back.label}`}>
            <Icons.ChevronLeft size={14} sw={2} />
            {back.label}
          </Link>
        )}
        <h1 className="k-page-title">{title}</h1>
        {description && <p className="k-page-desc">{description}</p>}
      </div>
      {(hasStats || actions) && (
        <div className="k-page-side">
          {hasStats && (
            <dl className="k-page-stats">
              {stats.map((s) => (
                <div key={s.label} className="k-page-stat">
                  <dt className="k-page-stat-l">{s.label}</dt>
                  <dd className="k-page-stat-n">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {actions && <div className="k-page-actions">{actions}</div>}
        </div>
      )}
    </header>
  );
}
