import { cn } from "./utils";

/* ── Statement ────────────────────────────────────────── */
/**
 * A financial statement: profit and loss, a balance sheet, a salary
 * calculation. Labels on the left, figures on the right, subtotals under their
 * section and one net line at the end.
 *
 *   sections  [{
 *     title, tone ("mint" | "terra" | undefined),
 *     rows: [{ key, label, value, hint?, muted?, onClick? }],
 *     total: { label, value } | undefined,
 *     empty: what to say when a section has no rows
 *   }]
 *   net       { label, value, tone } — the line that answers the question
 *   columns   2 (default) puts the sections side by side on a wide screen, 1 stacks them
 *
 * Values are nodes, so a page passes <Money> and the figures follow the
 * currency toggle.
 */
export function Statement({ sections, net, columns = 2, label, className }) {
  return (
    <div className={cn("k-stmt", `k-stmt--${columns}`, className)} role="group" aria-label={label}>
      <div className="k-stmt-cols">
        {sections.map((section) => (
          <section key={section.title} className="k-stmt-section">
            <h4 className={cn("k-stmt-title", section.tone && `is-${section.tone}`)}>{section.title}</h4>
            <dl className="k-stmt-rows">
              {section.rows.length === 0 && <p className="k-stmt-empty">{section.empty || "Nothing recorded."}</p>}
              {section.rows.map((row) => (
                <div key={row.key ?? row.label} className={cn("k-stmt-row", row.muted && "is-muted")}>
                  <dt>
                    {row.onClick
                      ? <button type="button" className="k-stmt-link" onClick={row.onClick}>{row.label}</button>
                      : row.label}
                    {row.hint && <span className="k-stmt-hint">{row.hint}</span>}
                  </dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            {section.total && (
              <div className="k-stmt-total">
                <span>{section.total.label}</span>
                <span>{section.total.value}</span>
              </div>
            )}
          </section>
        ))}
      </div>

      {net && (
        <div className={cn("k-stmt-net", net.tone && `is-${net.tone}`)}>
          <span>{net.label}</span>
          <span>{net.value}</span>
        </div>
      )}
    </div>
  );
}
