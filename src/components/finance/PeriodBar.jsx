/**
 * The period and the calendar, in the page header: one menu of the usual stretches ("This month", "Fiscal year 2083/84"), two
 * date pills for a custom From / To, and the A.D. / B.S. switch for every date on the page.
 *
 * The choices are written to the same two shared stores the old controls used (a fiscal year, and a From/To range on top of it:
 * FiscalYearFilter.jsx, DateRangeFilter.jsx), so Billing and the other finance pages still see the same period. Nothing here
 * filters anything itself.
 */
import { useFiscalYearFilter } from "../FiscalYearFilter";
import { useDateRangeFilter } from "../DateRangeFilter";
import Select from "../Select";
import DatePicker from "../DatePicker";
import useDateMode from "../../hooks/useDateMode";
import { isDateRangeActive, isFiscalYearLabel } from "../../utils/fiscalYear";
import { kathmanduDate } from "../../utils/date";
import { applyChoice, chosenValue, periodOptions, rangeShortcuts } from "../../lib/period";
import { cn } from "../ui";

export function DateModeSwitch({ className }) {
  const [mode, setMode] = useDateMode();
  return (
    <div className={cn("kregion-seg fn-modeseg", className)} role="radiogroup" aria-label="Show dates in">
      {[["ad", "A.D."], ["bs", "B.S."]].map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          className={cn("kregion-seg-btn", mode === id && "is-on")}
          title={id === "ad" ? "English dates" : "Nepali (Bikram Sambat) dates"}
          onClick={() => setMode(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export default function PeriodBar({ years }) {
  const [fy, setFy] = useFiscalYearFilter();
  const [range, setRange] = useDateRangeFilter();
  const today = kathmanduDate();
  const value = chosenValue({ fy, range, today });
  const options = periodOptions({ today, years, fy, range });
  const short = rangeShortcuts({ today });
  const active = isFiscalYearLabel(fy) || isDateRangeActive(range);

  function choose(v) {
    const next = applyChoice(v, { today });
    if (!next) return;
    setFy(next.fy);
    setRange(next.range);
  }

  // Dates that cross are brought together rather than left to filter everything out
  const setFrom = (v) => setRange({ from: v, to: v && range.to && range.to < v ? v : range.to });
  const setTo = (v) => setRange({ from: v && range.from && range.from > v ? v : range.from, to: v });

  return (
    <div className="fn-period" role="group" aria-label="Period">
      <Select
        variant="pill" label="Period" value={value} onChange={choose} options={options}
        searchable={false} on={active} minWidth={236} placeholder="All time"
      />
      <span className="fn-range">
        <span className="fn-range-l">From</span>
        <DatePicker variant="pill" label="From" placeholder="Any date" value={range.from} onChange={setFrom} shortcuts={short.from} />
        <span className="fn-range-l">to</span>
        <DatePicker variant="pill" label="To" placeholder="Any date" value={range.to} onChange={setTo} shortcuts={short.to} />
      </span>
    </div>
  );
}
