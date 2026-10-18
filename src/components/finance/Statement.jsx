/**
 * A statement block: a heading, the lines under it with their amounts, and a total. The profit and loss and the balance sheet are
 * built of these. A line that has a record behind it can be pressed to go there.
 */
import { useMoney } from "./parts";
import { cn } from "../ui";

export function StatBlock({ title, tone, rows, total, totalLabel, note }) {
  const money = useMoney();
  return (
    <section className={cn("fn-stb", tone && `fn-stb--${tone}`)}>
      <h3>{title}</h3>
      {note ? <p className="fn-stb-note">{note}</p> : null}
      <div className="fn-stb-rows">
        {rows.map((r) => {
          const inner = (
            <>
              <span className="fn-stb-l"><span>{r.label}</span>{r.sub ? <small>{r.sub}</small> : null}</span>
              <span className={cn("fn-stb-v", r.value < 0 && "is-neg")}>{money(r.value)}</span>
            </>
          );
          return r.go ? (
            <button key={r.key || r.label} type="button" className="fn-stb-row is-go" onClick={r.go} title={r.title}>{inner}</button>
          ) : (
            <div key={r.key || r.label} className="fn-stb-row">{inner}</div>
          );
        })}
      </div>
      {total != null && (
        <div className="fn-stb-total">
          <span>{totalLabel || `Total ${title.toLowerCase()}`}</span>
          <b className={cn(total < 0 && "is-neg")}>{money(total)}</b>
        </div>
      )}
    </section>
  );
}
