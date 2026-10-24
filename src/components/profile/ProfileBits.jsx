/**
 * Small pieces the profile cards are made of: a label-and-value row, a status tag, a count, the tabs of the right-hand pane.
 * The card is portalled to <body>, so these read the card's own tokens (--ink-*, --line, and the --pp-* pairs in profile.css),
 * never a page's --kb-* ones.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "../ui";

/** A label and its value, the way the profile card has always set them (`.kprof-row`). */
export function InfoRow({ k, children, empty }) {
  return (
    <div className="kprof-row">
      <span className="kprof-k">{k}</span>
      <span className={cn("kprof-v", empty && "kprof-v--empty")}>{children}</span>
    </div>
  );
}

/** A grey bar where a value is still on its way. */
export function Skel({ w }) {
  return <span className="kprof-skel" aria-hidden="true" style={w ? { width: w } : undefined} />;
}

/** A pill saying how a day or a record stands. `tone`: good | warn | bad | info | mute. */
export function Tag({ tone = "mute", children, title }) {
  return <span className={cn("kpp-tag", `kpp-tag--${tone}`)} title={title}>{children}</span>;
}

/** A count with its name under it. `tone` colours the number only while it is more than nought. */
export function Stat({ n, label, tone }) {
  return (
    <div className={cn("kpp-stat", n > 0 && tone && `kpp-stat--${tone}`)}>
      <b>{n}</b>
      <span>{label}</span>
    </div>
  );
}

/** Re-renders once a minute, so "in for 3h 20m" keeps up while a card stays open. */
export function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * The tabs at the top of the right-hand pane (Overview, Attendance, Pay). A tab list to a keyboard: one stop on the chosen tab, and the
 * arrow keys, Home and End move between them. `idPrefix` (from the card, via useId) names the tabs and the one panel they open:
 * tab `${idPrefix}-tab-${id}`, panel `${idPrefix}-panel`.
 */
export function ProfileTabs({ tabs, value, onChange, idPrefix }) {
  const ref = useRef(null);

  function onKeyDown(e) {
    const at = tabs.findIndex((t) => t.id === value);
    let to = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") to = (at + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = (at - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = tabs.length - 1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].id);
    ref.current?.querySelectorAll('[role="tab"]')[to]?.focus();       // the cursor follows the choice at once
  }

  return (
    <div className="kpp-tabbar">
      <div ref={ref} className="kregion-seg kpp-tabs" role="tablist" aria-label="Profile sections" onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={value === t.id}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={value === t.id ? 0 : -1}
            className={cn("kregion-seg-btn", value === t.id && "is-on")}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
