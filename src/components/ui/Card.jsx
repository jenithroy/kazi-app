import { cn } from "./utils";

/* ── Card ─────────────────────────────────────────────── */
/**
 * A surface for one block of content: white, hairline border, 14px corners.
 *
 * With a title, the header sits on a hairline divider with the card's actions
 * on the right; on a narrow card the actions wrap under the title.
 *
 *   title    sentence case: "Stock levels", not "STOCK LEVELS"
 *   sub      one line under the title
 *   actions  whatever acts on this card: buttons, a Segmented, a link (older name: action)
 *   flush    no body padding, for tables and lists that run edge to edge (older: pad={false})
 *   hint     a footer line under the body
 *   accent   a small colour tab before the title
 */
export function Card({ title, sub, action, actions, accent, children, pad = true, flush = false, className, hint, ...rest }) {
  const act = actions ?? action;
  return (
    <section className={cn("kazi-card", className)} {...rest}>
      {(title || act) && (
        <header className="kazi-card-h">
          <div className="kazi-card-h-l">
            {accent && <span className="kazi-card-tab" style={{ background: accent }} />}
            <div className="kazi-card-id">
              {title && <h3 className="kazi-card-title">{title}</h3>}
              {sub && <p className="kazi-card-sub">{sub}</p>}
            </div>
          </div>
          {act && <div className="kazi-card-action">{act}</div>}
        </header>
      )}
      <div className={cn("kazi-card-body", (flush || !pad) && "kazi-card-body--flush")}>{children}</div>
      {hint && <footer className="kazi-card-foot">{hint}</footer>}
    </section>
  );
}
