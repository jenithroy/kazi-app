/**
 * The sections of Finance as a list down the left of the page, in three groups, each with how many records it holds.
 *
 * Ten tabs do not fit a row of pills without wrapping, and a row costs the table a line of height it needs. A list
 * down the side costs width, which a wide window has to spare, and shows the whole shape of Finance at once. Under 1100px
 * it is not drawn; the page shows the same choice as a dropdown (PageTabs) instead.
 *
 * Keyboard: Up / Down / Home / End move between sections (and select, like the tabs on the other pages); the Shift+letter
 * shortcuts are handled by the page and shown here on a computer with a pointer.
 */
import { useRef } from "react";
import { cn } from "../ui";
import { shortcutOf, tabLabel } from "../../lib/finance";

export default function TabRail({ groups, value, onChange, counts = {}, area = "rail", labelPrefix = "fin", anchor }) {
  const listRef = useRef(null);
  const flat = groups.flatMap((g) => g.tabs);

  function onKey(e) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const at = flat.indexOf(value);
    const next = e.key === "Home" ? 0 : e.key === "End" ? flat.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length;
    e.preventDefault();
    onChange(flat[next]);
    requestAnimationFrame(() => listRef.current?.querySelector('[aria-selected="true"]')?.focus());
  }

  return (
    <nav className="kb-tile fn-rail" style={{ gridArea: area }} data-tile={area} aria-label="Finance sections" data-tour={anchor}>
      <div ref={listRef} className="fn-rail-in" role="tablist" aria-orientation="vertical" onKeyDown={onKey}>
        {groups.map((g) => (
          <div className="fn-rg" role="presentation" key={g.label}>
            <span className="fn-rg-h">{g.label}</span>
            {g.tabs.map((t) => {
              const key = shortcutOf(t);
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  id={`${labelPrefix}-tab-${t.replace(/\W+/g, "-")}`}
                  aria-selected={value === t}
                  aria-controls={`${labelPrefix}-pane`}
                  tabIndex={value === t ? 0 : -1}
                  className={cn("fn-ri", value === t && "is-on")}
                  onClick={() => onChange(t)}
                >
                  <span className="fn-ri-l">{tabLabel(t)}</span>
                  {counts[t] != null ? <i>{counts[t]}</i> : null}
                  {key ? <kbd aria-hidden="true">⇧{key.toUpperCase()}</kbd> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
