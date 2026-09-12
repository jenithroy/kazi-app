import { dayHeading, isSameDay, monthCells, toISODate, weekdayLabels } from "./dates";
import { cn } from "./utils";

/* ── Month grid ───────────────────────────────────────── */
/**
 * A month of days. The page decides what a day shows.
 *
 *   month       any Date inside the month
 *   weekStart   "mon" (Attendance, Production, the dashboard) or "sun" (Marketing)
 *   fill        "blank" leaves the days either side empty, "adjacent" shows them greyed
 *   weeks       force the number of rows, so the grid keeps its height month to month
 *   selected    the selected day as "YYYY-MM-DD"
 *   onSelectDay (iso, cell) => … makes the days buttons
 *   renderDay   (cell) => what sits under the day number: dots, events, a count
 *   size        md, or sm for a small read-only calendar
 *   label       what the month is, for screen readers
 *
 * Days are local days: a cell's `iso` is the day someone in Kathmandu or the
 * UK sees, not a UTC day.
 */
export function MonthGrid({
  month,
  weekStart = "mon",
  fill = "blank",
  weeks,
  selected,
  onSelectDay,
  renderDay,
  dayLabels,
  size = "md",
  label,
  className,
}) {
  const cells = monthCells(month, { weekStart, fill, weeks });
  const headings = dayLabels || weekdayLabels(weekStart);
  const todayIso = toISODate(new Date());

  return (
    <div className={cn("k-cal", size === "sm" && "k-cal--sm", className)} role="group" aria-label={label}>
      <div className="k-cal-dow" aria-hidden="true">
        {headings.map((d, i) => <span key={`${d}-${i}`}>{d}</span>)}
      </div>
      <div className="k-cal-grid">
        {cells.map((cell, i) => {
          if (!cell) return <span key={`blank-${i}`} className="k-cal-day k-cal-day--blank" aria-hidden="true" />;
          const isToday = cell.iso === todayIso;
          const isSelected = selected != null && cell.iso === selected;
          const content = (
            <>
              <span className="k-cal-num">{cell.day}</span>
              {renderDay?.(cell)}
            </>
          );
          const classes = cn(
            "k-cal-day",
            !cell.inMonth && "is-out",
            isToday && "is-today",
            isSelected && "is-selected",
          );
          const dayName = cell.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
          return onSelectDay ? (
            <button
              key={cell.iso}
              type="button"
              className={classes}
              aria-pressed={isSelected || undefined}
              aria-label={dayName}
              onClick={() => onSelectDay(cell.iso, cell)}
            >
              {content}
            </button>
          ) : (
            <div key={cell.iso} className={classes} aria-label={dayName}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Agenda ───────────────────────────────────────────── */
/**
 * The same days as a list, for a phone: one heading per day that has
 * something on it, nothing for the days that do not.
 *
 *   items      whatever is scheduled
 *   dateOf     (item) => its day, as a Date or "YYYY-MM-DD"
 *   renderItem (item) => the row
 *   itemKey    (item) => a stable key
 *   empty      what to say when nothing is scheduled at all
 */
export function Agenda({ items, dateOf, renderItem, itemKey = (item) => item.id, empty = "Nothing scheduled.", label, className }) {
  const days = new Map();
  for (const item of items) {
    const raw = dateOf(item);
    if (!raw) continue;
    const iso = typeof raw === "string" ? raw.slice(0, 10) : toISODate(raw);
    if (!days.has(iso)) days.set(iso, []);
    days.get(iso).push(item);
  }
  const sorted = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));

  if (sorted.length === 0) return <p className="k-agenda-empty">{empty}</p>;

  return (
    <div className={cn("k-agenda", className)} role="list" aria-label={label}>
      {sorted.map(([iso, dayItems]) => (
        <section key={iso} className="k-agenda-day" role="listitem">
          <h3 className="k-agenda-h">{dayHeading(iso)}</h3>
          <ul className="k-agenda-items">
            {dayItems.map((item) => <li key={String(itemKey(item))}>{renderItem(item)}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}

export { toISODate, isSameDay };
