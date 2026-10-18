/**
 * A date in a finance card, in whichever calendar the page is set to.
 *
 * The value is always an A.D. "YYYY-MM-DD" (or "" for none): the calendar only decides how it is shown and entered. A.D. is the
 * glass date picker. B.S. is Year / Month / Day menus, because Nepali months are not a fixed length; while there is no date they
 * would have to show some date and look chosen, so a blank one is a button that starts from today instead.
 *
 * Under the field it says the same day in the other calendar, which is what the old per-field switch showed.
 */
import { useId, useState } from "react";
import DatePicker from "../DatePicker";
import Select from "../Select";
import { DateModeSwitch } from "./PeriodBar";
import useDateMode from "../../hooks/useDateMode";
import { BS_MONTHS, BS_YEARS, adToBsParts, bsPartsToAd, daysInBsMonth, fmtDateBS } from "../../utils/fiscalYear";
import { kathmanduDate } from "../../utils/date";
import { fmtField } from "../../lib/calendar";

const YEAR_OPTIONS = BS_YEARS.map((y) => ({ value: String(y), label: String(y) }));
const MONTH_OPTIONS = BS_MONTHS.map((m, i) => ({ value: String(i), label: m }));

export default function DateField({ value, onChange, label = "Date", id: idProp, wide, required, disabled, hint, role, startBlank, className }) {
  const autoId = useId();
  const id = idProp || autoId;
  const [mode] = useDateMode();
  const today = kathmanduDate();
  const bs = adToBsParts(value);
  // while the date is blank the B.S. menus would have to show some date; remember the last one touched
  const [fallback] = useState(() => adToBsParts(today) || { year: BS_YEARS[Math.floor(BS_YEARS.length / 2)], month: 0, day: 1 });
  const parts = bs || fallback;

  function setPart(patch) {
    const next = { ...parts, ...patch };
    const maxDay = daysInBsMonth(next.year, next.month);
    if (next.day > maxDay) next.day = maxDay;
    const ad = bsPartsToAd(next.year, next.month, next.day);
    if (ad) onChange(ad);
  }

  const dayCount = daysInBsMonth(parts.year, parts.month);
  const dayOptions = Array.from({ length: dayCount }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
  const other = value ? (mode === "ad" ? `${fmtDateBS(value)} B.S.` : `${fmtField(value)} A.D.`) : "";

  return (
    <div className={`ec-f${wide ? " ec-wide" : ""} fn-datef${className ? ` ${className}` : ""}`} data-role={role}>
      <div className="fn-datef-head">
        <span className="ec-lbl" id={`${id}-l`}>{label}{required ? <i aria-hidden="true"> *</i> : null}</span>
        <DateModeSwitch className="fn-modeseg--mini" />
      </div>
      {mode === "bs" ? (
        !bs ? (
          <button type="button" className="ghost-button fn-datef-start" disabled={disabled} onClick={() => onChange(today)} id={id}>
            {startBlank || "Pick a date"}
          </button>
        ) : (
          <div className="fn-bs" role="group" aria-labelledby={`${id}-l`}>
            <Select label={`${label}, year`} value={String(parts.year)} onChange={(v) => setPart({ year: Number(v) })} options={YEAR_OPTIONS} disabled={disabled} id={id} />
            <Select label={`${label}, month`} value={String(parts.month)} onChange={(v) => setPart({ month: Number(v) })} options={MONTH_OPTIONS} disabled={disabled} searchable={false} />
            <Select label={`${label}, day`} value={String(parts.day)} onChange={(v) => setPart({ day: Number(v) })} options={dayOptions} disabled={disabled} />
          </div>
        )
      ) : (
        <DatePicker id={id} label={label} value={value} onChange={onChange} disabled={disabled} clearable={!required} placeholder="Pick a date" shortcuts={[["Today", today]]} />
      )}
      {hint ? <small className="ec-hint">{hint}</small> : other ? <small className="ec-hint">{other}</small> : null}
    </div>
  );
}
