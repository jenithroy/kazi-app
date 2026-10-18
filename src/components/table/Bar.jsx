/**
 * The bar above a table: tabs to say which table, a search box, and filter chips that carry counts.
 * They take the page's `--kb-*` tokens, so they follow light, dark and the glass of whatever pane they sit on.
 */
import { useRef } from "react";
import Select from "../Select";
import { Icons, cn } from "../ui";
import "./table.css";

/** A pill-shaped search box. */
export function SearchBox({ value, onChange, placeholder = "Search", label, className }) {
  return (
    <label className={cn("dt-search", className)}>
      <Icons.Search size={14} sw={1.9} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label || placeholder}
        autoComplete="off"
      />
    </label>
  );
}

/**
 * Filters that say how many each would show: [All 42] [Low 3]. One is always chosen.
 * `tone: "warn" | "bad"` colours the count of a filter that means trouble, so it reads before it is pressed.
 */
export function FilterChips({ label, value, onChange, options }) {
  return (
    <div className="dt-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={cn("dt-chip", value === o.value && "is-on", o.tone && `dt-chip--${o.tone}`)}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null && <i>{o.count}</i>}
        </button>
      ))}
    </div>
  );
}

/**
 * Tabs as a row of pills; on a phone the same choice is a dropdown, so there is nothing to scroll sideways.
 * A tab `{ id, label, count? }`; `{ gap: true }` between two puts a thin divider there.
 */
export function PageTabs({ label, tabs, value, onChange, ...rest }) {
  const listRef = useRef(null);
  const real = tabs.filter((t) => !t.gap);

  function onKey(e) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    const at = real.findIndex((t) => t.id === value);
    const next = e.key === "Home" ? 0 : e.key === "End" ? real.length - 1 : (at + (e.key === "ArrowRight" ? 1 : -1) + real.length) % real.length;
    e.preventDefault();
    onChange(real[next].id);
    requestAnimationFrame(() => listRef.current?.querySelector('[aria-selected="true"]')?.focus());
  }

  return (
    <>
      <div ref={listRef} className="dt-tabs" role="tablist" aria-label={label} onKeyDown={onKey} {...rest}>
        {tabs.map((t, i) => (t.gap ? (
          <span key={`gap-${i}`} className="dt-tabs-sep" aria-hidden="true" />
        ) : (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={value === t.id}
            tabIndex={value === t.id ? 0 : -1}
            className="dt-tab"
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {t.count != null && <i>{t.count}</i>}
          </button>
        )))}
      </div>
      <Select
        variant="pill"
        className="dt-tabsel"
        label={label}
        value={value}
        onChange={onChange}
        searchable={false}
        on={false}
        options={real.map((t) => ({ value: t.id, label: t.label, hint: t.count != null ? String(t.count) : undefined }))}
      />
    </>
  );
}
