import { cn } from "./utils";

/* ── Card ─────────────────────────────────────────────── */
export function Card({ title, sub, action, accent, children, pad = true, className, hint, ...rest }) {
  return (
    <section className={cn("kazi-card", className)} {...rest}>
      {(title || action) && (
        <header className="kazi-card-h">
          <div className="kazi-card-h-l">
            {accent && <span className="kazi-card-tab" style={{ background: accent }} />}
            <div>
              {title && <h3 className="kazi-card-title">{title}</h3>}
              {sub && <p className="kazi-card-sub">{sub}</p>}
            </div>
          </div>
          {action && <div className="kazi-card-action">{action}</div>}
        </header>
      )}
      <div className={cn("kazi-card-body", !pad && "kazi-card-body--flush")}>{children}</div>
      {hint && <footer className="kazi-card-foot">{hint}</footer>}
    </section>
  );
}
