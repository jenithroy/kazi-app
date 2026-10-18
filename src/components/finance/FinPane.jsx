/**
 * The glass pane a Finance tab lives in: a bar (the tab's name and count, its search and filters, its buttons), the body
 * (a table that scrolls inside the pane, or a statement), and under it the strip that adds up what is shown. The bar
 * and the strip never scroll, so the table's head, the search and the totals are always where the hand expects them.
 */
import { cn } from "../ui";

export default function FinPane({ title, note, tools, actions, foot, className, area = "pane", id, labelledBy, tour, children }) {
  return (
    <section
      className={cn("kb-tile fn-pane", className)}
      style={{ gridArea: area }}
      data-tile={area}
      role={labelledBy ? "tabpanel" : undefined}
      id={id}
      aria-labelledby={labelledBy}
      data-tour={tour}
    >
      <header className="fn-bar">
        <div className="fn-bar-t">
          <h2>{title}</h2>
          {note ? <span className="fn-bar-n">{note}</span> : null}
        </div>
        {tools ? <div className="fn-bar-tools">{tools}</div> : null}
        {actions ? <div className="fn-bar-acts">{actions}</div> : null}
      </header>
      <div className="fn-body">{children}</div>
      {foot}
    </section>
  );
}
