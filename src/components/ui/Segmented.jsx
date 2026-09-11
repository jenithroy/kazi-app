import { handleRovingKeys } from "./roving";
import { cn } from "./utils";

/* ── Segmented control ────────────────────────────────── */
/**
 * A small set of mutually exclusive choices shown side by side: a view toggle,
 * % or amount, AD or BS, NPR or GBP. For switching whole sections of a page use
 * Tabs; for more than about five choices use a select.
 *
 *   options   [{ value, label, icon?, count?, disabled?, ariaLabel?, title? }]
 *             An icon-only option needs `ariaLabel`.
 *   value, onChange   the chosen value
 *   label     what is being chosen ("Currency"), for screen readers
 *   size      sm | md
 *   block     stretch to the container's width, with equal segments
 *
 * It is a radiogroup: Tab reaches the chosen option, the arrow keys change it.
 */
export function Segmented({ options, value, onChange, label, size = "md", block = false, className, ...rest }) {
  const enabled = options.filter((o) => !o.disabled).map((o) => o.value);
  const hasSelection = options.some((o) => o.value === value);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("k-seg", `k-seg--${size}`, block && "k-seg--block", className)}
      onKeyDown={(e) => handleRovingKeys(e, { values: enabled, current: value, onSelect: onChange, axis: "both" })}
      {...rest}
    >
      {options.map((o) => {
        const on = o.value === value;
        const focusable = on || (!hasSelection && o.value === enabled[0]);
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            className="k-seg-btn"
            data-value={o.value}
            aria-checked={on}
            aria-label={o.ariaLabel}
            title={o.title ?? o.ariaLabel}
            tabIndex={focusable ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.icon && <span className="k-seg-ico" aria-hidden="true">{o.icon}</span>}
            {o.label}
            {o.count != null && <span className="k-seg-count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
