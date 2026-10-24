/**
 * The Filters button of a page, beside its search box, and the panel it opens: the one place where everything that narrows or switches what
 * a page shows lives, so the bar above a list is only a search box and a button.
 *
 *   This list      the page's own filters (useFilters.js): paid or not, a category, a person, a customer, an amount range, a day range, a
 *                  yes/no switch like "Late only"; each with how many it would show
 *   scope          what is the same for the whole page (or the whole of Finance), and is kept in a shared store, so changing it here
 *                  changes it everywhere it is shown: which side of the business is on screen (Nepal or UK), whether dates are written in
 *                  A.D. or B.S., and the period (a month, a fiscal year, or any From / To)
 *
 * Whatever is narrowing the list shows beside the button as a small pill that clears with one press, so a narrowed list is never silent.
 * The page's header line says the side and the period in words.
 *
 * On a wide screen, when a page has several shared choices (Finance: side, dates and period), the two groups sit side by side (the page's
 * own on the left, the shared ones on the right) so nothing needs scrolling; a page with only the side of the business (Tasks, Inventory…)
 * has one column with that choice on top; on a narrow screen the groups stack.
 *
 * The panel is portalled to <body> so no pane can clip it, and it is the same frosted glass as the dropdown lists (`ksel-pop`). The
 * lists and calendars it opens (the period menu, a category list, a day picker) are portalled too; a press in one of them is not
 * "outside" the panel. Escape closes the panel (or, first, the list or calendar open on top of it) and gives the cursor back to the
 * button; Tab stays inside while it is open.
 *
 * `scope` is optional:  { label: "All of Finance", region: { untagged: 3 }, dates: true, period: { years: [...] } }
 * Without it the panel is the page's own filters only (a page with no shared choice, such as Usage, passes none).
 * The styles are the `.fn-*` rules of finance.css (the first page to have this, and the rules did not move).
 */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icons, cn } from "../ui";
import { SearchBox } from "../table/Bar";
import Select from "../Select";
import DatePicker from "../DatePicker";
import { useRegion } from "../../context/RegionContext";
import useDateMode from "../../hooks/useDateMode";
import { useAnchoredPopover } from "../../hooks/useAnchoredPopover";
import { DEFAULT_REGION, REGIONS } from "../../utils/region";
import { kathmanduDate } from "../../utils/date";
import { describePeriod } from "../../lib/period";
import { usePeriod } from "../finance/PeriodBar";
import "./filters.css";

const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const MODES = [["ad", "A.D."], ["bs", "B.S."]];
const nf = (n) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** A short choice, drawn as one pill split in parts (`seg`) or as separate chips that wrap (`chips`, with the count each would show). */
function Choice({ variant = "seg", labelledBy, value, onChange, options }) {
  // the one Tab stop of the group is the checked option; with none checked (a custom range was typed instead of a preset) it is the first
  const stop = options.some((o) => o.value === value) ? value : options[0]?.value;
  function onKeyDown(e) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step || e.altKey || e.ctrlKey || e.metaKey) return;
    const at = options.findIndex((o) => o.value === value);
    const to = at < 0 ? (step > 0 ? 0 : options.length - 1) : (at + step + options.length) % options.length;
    e.preventDefault();
    onChange(options[to].value);
    e.currentTarget.querySelectorAll('[role="radio"]')[to]?.focus();
  }
  return (
    <div className={variant === "seg" ? "fn-fseg" : "fn-fchips"} role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={o.value === stop ? 0 : -1}
          className={cn(variant === "seg" ? "fn-fopt" : "fn-fchip", value === o.value && "is-on", o.tone && `fn-fchip--${o.tone}`)}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null && <i>{o.count}</i>}
        </button>
      ))}
    </div>
  );
}

/** A From and a To day, for a "dates" filter. A day that would cross the other is brought together with it, rather than left to show nothing. */
function DayRange({ s, head, uid }) {
  const today = kathmanduDate();
  const { from, to } = s.value;
  const setFrom = (v) => s.set({ from: v, to: v && to && to < v ? v : to });
  const setTo = (v) => s.set({ from: v && from && from > v ? v : from, to: v });
  return (
    <>
      <div className="fn-fp-range" role="group" aria-labelledby={head}>
        <div className="fn-fp-date">
          <label htmlFor={`${uid}-f-${s.id}`}>From</label>
          <DatePicker id={`${uid}-f-${s.id}`} label={`${s.label}, from`} placeholder="Any day" value={from} onChange={setFrom} shortcuts={[["Today", today]]} />
        </div>
        <div className="fn-fp-date">
          <label htmlFor={`${uid}-t-${s.id}`}>To</label>
          <DatePicker id={`${uid}-t-${s.id}`} label={`${s.label}, to`} placeholder="Any day" value={to} onChange={setTo} shortcuts={[["Today", today]]} />
        </div>
      </div>
      {s.lo && s.hi ? <p className="fn-fp-note">{s.lo === s.hi ? s.show(s.lo) : `${s.show(s.lo)} to ${s.show(s.hi)}`} in this list</p> : null}
    </>
  );
}

/** One of the page's filters, by its kind. */
function TabFilter({ s, uid }) {
  const head = `${uid}-h-${s.id}`;
  return (
    <section className="fn-fp-sec">
      <h2 className="fn-fp-h" id={head}>{s.label}</h2>
      {s.kind === "chips" && <Choice variant="chips" labelledBy={head} value={s.value} onChange={s.set} options={s.options} />}
      {s.kind === "select" && (
        <Select
          id={`${uid}-s-${s.id}`} label={s.label} value={s.value} onChange={s.set} options={s.options}
          placeholder={s.options[0]?.label} searchPlaceholder={`Find ${s.label.toLowerCase()}`}
        />
      )}
      {s.kind === "range" && (
        <>
        <div className="fn-frange" role="group" aria-labelledby={head}>
          {[["min", "Smallest", s.lo], ["max", "Largest", s.hi]].map(([end, text, hint]) => (
            <label key={end} className="fn-frange-f">
              <span>{text}{s.unit ? ` (${s.unit})` : ""}</span>
              <input
                type="number" inputMode="decimal" min="0" step="any" autoComplete="off"
                value={s.value[end]} placeholder={hint != null ? nf(hint) : "Any"}
                onChange={(e) => s.set({ ...s.value, [end]: e.target.value })}
              />
            </label>
          ))}
        </div>
        {s.value.min !== "" && s.value.max !== "" && Number(s.value.min) > Number(s.value.max) && <p className="fn-fp-note" role="status">Smallest is above largest, so nothing can match.</p>}
        </>
      )}
      {s.kind === "dates" && <DayRange s={s} head={head} uid={uid} />}
    </section>
  );
}

/** Yes/no switches that come one after another are drawn as one row of chips under one heading, so a page with several takes the room of one. */
function Switches({ list, uid }) {
  const head = `${uid}-h-${list[0].id}`;
  return (
    <section className="fn-fp-sec">
      <h2 className="fn-fp-h" id={head}>Only show</h2>
      <div className="fn-fchips" role="group" aria-labelledby={head}>
        {list.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.value} className={cn("fn-fchip fn-ftoggle", s.value && "is-on")} onClick={() => s.set(!s.value)}>
            {s.text}
            {s.count != null && <i>{s.count}</i>}
          </button>
        ))}
      </div>
    </section>
  );
}

/** The page's filters in the order the page declared them, with neighbouring yes/no switches drawn together. */
function PageFilters({ sections, uid }) {
  const out = [];
  let run = [];
  const flush = () => { if (run.length) { out.push(<Switches key={`sw-${run[0].id}`} list={run} uid={uid} />); run = []; } };
  sections.forEach((s) => {
    if (s.kind === "toggle") { run.push(s); return; }
    flush();
    out.push(<TabFilter key={s.id} s={s} uid={uid} />);
  });
  flush();
  return out;
}

export default function FilterMenu({ filters, scope, name }) {
  const global = Boolean(scope);                              // the page's header no longer carries the side, the calendar and the period
  const wantsRegion = Boolean(scope?.region);
  const wantsDates = Boolean(scope?.dates);
  const wantsPeriod = Boolean(scope?.period);
  const shared = [wantsRegion, wantsDates, wantsPeriod].filter(Boolean).length;
  const { region, setRegion } = useRegion();
  const [mode, setMode] = useDateMode();
  const period = usePeriod(scope?.period?.years);

  const uid = useId();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const focused = useRef(false);
  const hasTab = Boolean(filters && filters.sections.length > 0);
  const two = hasTab && shared >= 2;                          // the page's filters beside the choices that are the same on every list
  const flow = !two && hasTab && filters.sections.length + (shared ? 1 : 0) >= 6;      // a page with many filters: they flow into two columns when there is room
  const { pos } = useAnchoredPopover({ open, triggerRef: btnRef, popRef, onDismiss: () => {}, estimate: 420, minWidth: two || flow ? 640 : 360, maxHeight: 640 });

  const regionName = REGIONS.find((r) => r.id === region)?.label || region;
  const changed = [
    ...(filters ? filters.active.map((a) => a.text) : []),
    wantsRegion && region !== DEFAULT_REGION && regionName,
    wantsDates && mode !== "ad" && "B.S. dates",
    wantsPeriod && period.active && (period.options.find((o) => o.value === period.value)?.label || "A period"),
  ].filter(Boolean);
  const narrowing = (filters?.count || 0) > 0 || (wantsPeriod && period.active);

  const close = (giveBack = false) => {
    setOpen(false);
    focused.current = false;
    if (giveBack) btnRef.current?.focus();
  };

  // A press outside the button and the panel closes it, except one inside a list or calendar opened from the panel (they are portalled elsewhere).
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t) || t.closest(".ksel-pop, .kdp-pop")) return;
      close();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [open]);

  // The cursor goes into the panel when it opens: onto its first control (in a short choice that is the one chosen, the others being skipped by Tab).
  useEffect(() => {
    if (!open || !pos || focused.current) return;
    focused.current = true;
    popRef.current?.querySelector(FOCUSABLE)?.focus({ preventScroll: true });
  }, [open, pos]);

  function onKeyDown(e) {
    if (e.key === "Escape" && !e.defaultPrevented) {          // a list or calendar on top took its own Escape first
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = [...popRef.current.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const here = document.activeElement;
    if (e.shiftKey && (here === first || here === popRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && here === last) { e.preventDefault(); first.focus(); }
  }

  const clearAll = () => {
    filters?.clear();
    if (wantsPeriod && period.active) period.choose("all");
    popRef.current?.querySelector(".fn-fp-done")?.focus();      // the button just pressed goes away: keep the cursor in the panel
  };

  const panelId = `${uid}-panel`;
  const side = `${uid}-side`;
  const dates = `${uid}-dates`;
  const per = `${uid}-period`;
  const from = `${uid}-from`;
  const to = `${uid}-to`;

  // The choices that are the same for the whole page. They sit in a column of their own beside the page's filters when there are several
  // (Finance), and above them when there is one (the side of the business).
  const sharedSections = global && shared > 0 ? (
    <>
      {wantsRegion && (
        <section className="fn-fp-sec">
          <h2 className="fn-fp-h" id={side}>Side of the business</h2>
          <Choice labelledBy={side} value={region} onChange={setRegion} options={REGIONS.map((r) => ({ value: r.id, label: r.label }))} />
          {scope.region.untagged > 0 && (
            <p className="fn-fp-note">{scope.region.untagged} {scope.region.untagged === 1 ? "record has" : "records have"} no side yet, so {scope.region.untagged === 1 ? "it shows" : "they show"} under both.</p>
          )}
        </section>
      )}
      {wantsDates && (
        <section className="fn-fp-sec">
          <h2 className="fn-fp-h" id={dates}>Show dates in</h2>
          <Choice labelledBy={dates} value={mode} onChange={setMode} options={MODES.map(([value, label]) => ({ value, label }))} />
        </section>
      )}
      {wantsPeriod && (
        <section className="fn-fp-sec">
          <h2 className="fn-fp-h" id={per}>Period</h2>
          <Select
            id={`${per}-sel`} label="Period" value={period.value} onChange={period.choose}
            options={period.options} searchable={false} placeholder="All time"
          />
          <div className="fn-fp-range">
            <div className="fn-fp-date">
              <label htmlFor={from}>From</label>
              <DatePicker id={from} label="From" placeholder="Any date" value={period.range.from} onChange={period.setFrom} shortcuts={period.short.from} />
            </div>
            <div className="fn-fp-date">
              <label htmlFor={to}>To</label>
              <DatePicker id={to} label="To" placeholder="Any date" value={period.range.to} onChange={period.setTo} shortcuts={period.short.to} />
            </div>
          </div>
        </section>
      )}
    </>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cn("kb-pillbtn fn-filterbtn", (open || narrowing) && "is-on")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={changed.length ? `Filters: ${changed.join(", ")}` : "Narrow what is shown"}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icons.Filter size={14} sw={1.9} aria-hidden="true" />
        <span className="fn-filterbtn-t">Filters</span>
        {/* its name is what it says, so a screen reader hears "Filters 2 changed" and the visible "Filters 2" is part of it */}
        {changed.length > 0 && <>{" "}<i className="fn-filterbtn-n">{changed.length}</i><span className="fn-sr"> changed</span></>}
        {name && <span className="fn-sr">, {name}</span>}
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          id={panelId}
          role="dialog"
          aria-label="Filters"
          tabIndex={-1}
          data-no-shortcuts=""
          className={cn("ksel-pop fn-filter-pop", pos.up && "is-up")}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
          onKeyDown={onKeyDown}
        >
          <div className={cn("fn-fp-body", two && "is-two")}>
            {two ? (
              <>
                <div className="fn-fp-col">
                  <p className="fn-fp-group">{scope.thisLabel || "This list"}</p>
                  <PageFilters sections={filters.sections} uid={uid} />
                </div>
                <div className="fn-fp-col">
                  <p className="fn-fp-group">{scope.label || "Whole page"}</p>
                  {sharedSections}
                </div>
              </>
            ) : (
              <div className={cn("fn-fp-col", flow && "is-flow")}>
                {sharedSections}
                {hasTab && <PageFilters sections={filters.sections} uid={uid} />}
              </div>
            )}
          </div>

          <div className="fn-fp-ft">
            {narrowing
              ? <button type="button" className="fn-fp-clear" onClick={clearAll}>Clear filters</button>
              : <span />}
            <button type="button" className="fn-fp-done" onClick={() => close(true)}>Done</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** What is narrowing the list right now, as pills that each clear with one press: the page's filters, then the period. */
export function ActiveFilters({ filters, scope }) {
  const wantsPeriod = Boolean(scope?.period);
  const period = usePeriod(scope?.period?.years);
  const [mode] = useDateMode();

  const pills = [
    ...(filters ? filters.active.map((a) => ({ key: a.id, text: a.text, clear: a.clear })) : []),
    ...(wantsPeriod && period.active ? [{
      key: "period",
      text: period.value === "custom" ? describePeriod({ fy: period.fy, range: period.range, mode }) : period.options.find((o) => o.value === period.value)?.label || "A period",
      clear: () => period.choose("all"),
    }] : []),
  ];
  if (!pills.length) return null;
  return (
    <span className="fn-pills" role="group" aria-label="Filters in use">
      {pills.map((p) => (
        <button
          key={p.key} type="button" className="fn-pill" aria-label={`Clear: ${p.text}`} title={`Clear: ${p.text}`}
          onClick={(e) => {
            const me = e.currentTarget;
            const group = me.closest(".fn-pills");
            const mates = [...group.querySelectorAll(".fn-pill")];
            const at = mates.indexOf(me);
            const next = mates[at + 1] || mates[at - 1] || group.previousElementSibling?.querySelector(".fn-filterbtn");
            p.clear();
            next?.focus();                                    // the pressed pill goes away: the cursor must not fall to the page
          }}
        >
          <span>{p.text}</span>
          <Icons.X size={12} sw={2.2} aria-hidden="true" />
        </button>
      ))}
    </span>
  );
}

/**
 * A page's search box with the Filters button right beside it, and the pills for what is narrowed after them. Without `onChange` there is
 * no search box (a statement has none) and the button stands alone. `search` is a search box of the page's own to draw in place of the shared
 * one (Tasks has a glass one). On a phone the pair takes the bar's whole first row (the search grows, the button stays its size): each page's
 * stylesheet says so for its own bar. A page with two of them (Sales: customers and orders) gives each a `name`, which a screen reader hears after
 * the button's own words ("Filters, customers"); the visible word stays "Filters".
 */
export function FindBar({ value, onChange, placeholder, label, filters, scope, search, name }) {
  return (
    <>
      <span className="fn-find">
        {search || (onChange ? <SearchBox value={value} onChange={onChange} placeholder={placeholder} label={label} /> : null)}
        <FilterMenu filters={filters} scope={scope} name={name} />
      </span>
      <ActiveFilters filters={filters} scope={scope} />
    </>
  );
}
