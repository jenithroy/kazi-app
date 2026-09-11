import { Fragment, useEffect, useRef, useState } from "react";
import { Icons } from "./Icons";
import { handleRovingKeys } from "./roving";
import { PHONE_QUERY, useMediaQuery } from "./useMediaQuery";
import { cn } from "./utils";

/* ── Tabs ─────────────────────────────────────────────── */
/**
 * A bar of underline tabs that switches between views of one page. The page
 * renders the content; Tabs only reports which tab is chosen.
 *
 *   items     [{ value, label, count?, icon?, group?, shortcut?, disabled? }]
 *             `group`: consecutive items with the same group get a separator
 *             before them, and the group's name on wide screens.
 *             `shortcut`: a letter the page already binds to Shift+letter. Tabs
 *             only announces it (title, aria-keyshortcuts); the page keeps the
 *             key listener.
 *   value, onChange   the selected tab's value
 *   label     what the tabs switch between ("Finance sections"), for screen readers
 *   size      sm | md
 *   phoneSelect       on a phone, show more than five tabs as a select (default on)
 *   showShortcuts     print the shortcut on each tab, on mouse-and-keyboard screens only
 *
 * Anything else, such as data-tour, lands on the outer element, so tour anchors
 * keep working in both the tab-bar and the select form.
 */
export function Tabs({ items, value, onChange, label, size = "md", phoneSelect = true, showShortcuts = false, className, ...rest }) {
  const scrollRef = useRef(null);
  const [fade, setFade] = useState({ left: false, right: false });
  const phone = useMediaQuery(PHONE_QUERY);
  const asSelect = phoneSelect && phone && items.length > 5;

  const enabled = items.filter((t) => !t.disabled).map((t) => t.value);
  const hasSelection = items.some((t) => t.value === value);

  // Fade whichever edge still has tabs scrolled out of sight.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setFade({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [asSelect, items.length]);

  // Keep the selected tab inside the visible part of the bar.
  useEffect(() => {
    const el = scrollRef.current;
    const tab = el?.querySelector('[aria-selected="true"]');
    if (!el || !tab) return;
    const start = tab.offsetLeft;
    const end = start + tab.offsetWidth;
    if (start < el.scrollLeft) el.scrollLeft = Math.max(0, start - 24);
    else if (end > el.scrollLeft + el.clientWidth) el.scrollLeft = end - el.clientWidth + 24;
  }, [value, asSelect]);

  if (asSelect) {
    const pick = (raw) => items.find((t) => String(t.value) === raw)?.value;
    const option = (t) => (
      <option key={String(t.value)} value={String(t.value)} disabled={t.disabled}>
        {t.count != null ? `${t.label} (${t.count})` : t.label}
      </option>
    );
    const groups = [];
    for (const t of items) {
      const last = groups[groups.length - 1];
      if (last && last.name === (t.group || "")) last.items.push(t);
      else groups.push({ name: t.group || "", items: [t] });
    }
    return (
      <div className={cn("k-tabs", "k-tabs--select", className)} {...rest}>
        <label className="k-tabs-select">
          <span className="k-sr">{label}</span>
          <select value={hasSelection ? String(value) : ""} onChange={(e) => onChange(pick(e.target.value))}>
            {!hasSelection && <option value="" disabled>Choose…</option>}
            {groups.map((g, i) =>
              g.name
                ? <optgroup key={g.name} label={g.name}>{g.items.map(option)}</optgroup>
                : <Fragment key={`ungrouped-${i}`}>{g.items.map(option)}</Fragment>,
            )}
          </select>
          <Icons.ChevronDown size={16} aria-hidden="true" />
        </label>
      </div>
    );
  }

  return (
    <div
      className={cn("k-tabs", `k-tabs--${size}`, fade.left && "is-fade-l", fade.right && "is-fade-r", className)}
      {...rest}
    >
      <div
        ref={scrollRef}
        className="k-tabs-scroll"
        role="tablist"
        aria-label={label}
        onKeyDown={(e) => handleRovingKeys(e, { values: enabled, current: value, onSelect: onChange })}
      >
        {items.map((t, i) => {
          const selected = t.value === value;
          const startsGroup = Boolean(t.group) && t.group !== items[i - 1]?.group;
          const focusable = selected || (!hasSelection && t.value === enabled[0]);
          const keys = t.shortcut ? `Shift+${String(t.shortcut).toUpperCase()}` : undefined;
          return (
            <Fragment key={String(t.value)}>
              {startsGroup && i > 0 && <span className="k-tabs-sep" aria-hidden="true" />}
              {startsGroup && <span className="k-tabs-group" aria-hidden="true">{t.group}</span>}
              <button
                type="button"
                role="tab"
                className="k-tab"
                data-value={t.value}
                aria-selected={selected}
                tabIndex={focusable ? 0 : -1}
                disabled={t.disabled}
                title={keys}
                aria-keyshortcuts={keys}
                onClick={() => onChange(t.value)}
              >
                {t.icon && <span className="k-tab-ico" aria-hidden="true">{t.icon}</span>}
                <span>{t.label}</span>
                {t.count != null && <span className="k-tab-count">{t.count}</span>}
                {showShortcuts && keys && <kbd className="k-tab-kbd">{keys}</kbd>}
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
