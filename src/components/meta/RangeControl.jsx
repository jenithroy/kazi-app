/**
 * The date range the Overview, Campaigns and Attribution views follow: All, 7d, 30d, 90d, and the two ends as date pickers. Nothing here
 * decides what a range may be (lib/metaCalc.js `pickRange`: not after today, never backwards, the other end following); this draws it
 * and reports the range the person asked for.
 */
import DatePicker from "../DatePicker";
import { cn } from "../ui";
import { addDays } from "../../lib/calendar";
import { PRESETS, pickRange, presetOf, presetRange } from "../../lib/metaCalc";

export default function RangeControl({ range, today, onChange }) {
  const preset = presetOf(range, today);
  const shortcuts = [["Today", today], ["30 days ago", addDays(today, -30)]];

  return (
    <div className="ma-range" role="group" aria-label="Date range">
      <div className="ma-presets">
        <button type="button" className={cn("ma-preset", preset === "all" && "is-on")} aria-pressed={preset === "all"} onClick={() => onChange({ dateFrom: "", dateTo: "" })}>All</button>
        {PRESETS.map((p) => (
          <button key={p.days} type="button" className={cn("ma-preset", preset === p.days && "is-on")} aria-pressed={preset === p.days} onClick={() => onChange(presetRange(p.days, today))}>{p.label}</button>
        ))}
      </div>
      <div className="ma-dates">
        <DatePicker variant="pill" label="From" value={range.dateFrom} placeholder="Start" today={today} shortcuts={shortcuts} align="end" onChange={(v) => onChange(pickRange(range, "from", v, today))} />
        <span className="ma-dash" aria-hidden="true">–</span>
        <DatePicker variant="pill" label="To" value={range.dateTo} placeholder="End" today={today} shortcuts={shortcuts} align="end" onChange={(v) => onChange(pickRange(range, "to", v, today))} />
      </div>
    </div>
  );
}
