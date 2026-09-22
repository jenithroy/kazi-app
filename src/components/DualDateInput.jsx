import { useState } from "react";
import {
  BS_MONTHS, BS_YEARS, daysInBsMonth,
  adToBsParts, bsPartsToAd, fmtDateBSNumeric,
} from "../utils/fiscalYear";

// The look of the calendar-switch chip, shared by the per-field switch below and the
// column-header DateModeToggle; each adds its own size and padding.
const chipStyle = {
  display: "inline-flex", alignItems: "center", fontWeight: 600, color: "var(--mint-deep)",
  cursor: "pointer", background: "var(--mint-wash)", border: "1px solid rgba(45,155,111,.25)",
  borderRadius: 20, lineHeight: 1.4,
};

// AD/BS dual date input. Underlying value is always an AD "YYYY-MM-DD" string —
// the calendar shown is purely a display/entry preference, toggled by clicking the secondary label.
// BS entry uses Year/Month/Day dropdowns (BS months don't have fixed lengths, so free text invites typos).
//
// The calendar can be left to the component (one field at a time, like the
// new-purchase row on Finance) or driven from the page by passing `mode`/`onModeChange`,
// so that a page showing several dates switches all of them at once instead of field
// by field. A page that puts a DateModeToggle in the column header passes `hideToggle`
// too, so the rows don't each carry a switch of their own.
export default function DualDateInput({
  value, onChange, required, disabled, className = "kfin-input", dataRole,
  mode: modeProp, onModeChange, hideToggle,
}) {
  const [ownMode, setOwnMode] = useState("ad");
  const mode = modeProp ?? ownMode;
  const setMode = onModeChange ?? setOwnMode;

  // Only consulted when `value` is empty or unparseable — otherwise the dropdowns
  // read straight off the current value, so loading a different document into the
  // form (or any other outside change) can't leave them showing a stale date.
  const [fallbackParts, setFallbackParts] = useState(
    () => adToBsParts(value) || { year: BS_YEARS[Math.floor(BS_YEARS.length / 2)], month: 0, day: 1 }
  );
  const bsParts = adToBsParts(value) || fallbackParts;

  function updateBs(patch) {
    const next = { ...bsParts, ...patch };
    const maxDay = daysInBsMonth(next.year, next.month);
    if (next.day > maxDay) next.day = maxDay;
    setFallbackParts(next);
    const ad = bsPartsToAd(next.year, next.month, next.day);
    if (ad) onChange(ad);
  }

  const secondary = mode === "ad" ? fmtDateBSNumeric(value) : value;
  const secondarySuffix = mode === "ad" ? "B.S." : "A.D.";
  const dayCount = daysInBsMonth(bsParts.year, bsParts.month);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {mode === "ad" ? (
        <input type="date" className={className} value={value || ""} required={required}
          disabled={disabled} data-role={dataRole}
          onChange={e => onChange(e.target.value)} />
      ) : (
        <div style={{ display: "flex", gap: 3 }}>
          <select className={className} style={{ width: "auto", minWidth: 56, padding: "4px 2px", fontSize: 13 }} value={bsParts.year} disabled={disabled}
            onChange={e => updateBs({ year: Number(e.target.value) })}>
            {BS_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className={className} style={{ width: "auto", minWidth: 78, padding: "4px 2px", fontSize: 13 }} value={bsParts.month} disabled={disabled}
            onChange={e => updateBs({ month: Number(e.target.value) })}>
            {BS_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select className={className} style={{ width: "auto", minWidth: 40, padding: "4px 2px", fontSize: 13 }} value={bsParts.day} disabled={disabled}
            onChange={e => updateBs({ day: Number(e.target.value) })}>
            {Array.from({ length: dayCount }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      )}
      {!hideToggle && (
        <button
          type="button"
          onClick={() => setMode(mode === "ad" ? "bs" : "ad")}
          title="Click to switch calendar"
          style={{ ...chipStyle, gap: 4, alignSelf: "flex-start", fontSize: 11, padding: "2px 8px 2px 7px" }}
        >
          <span style={{ fontSize: 13 }}>⇄</span>
          {secondary ? `${secondary} ${secondarySuffix}` : "—"}
        </button>
      )}
    </div>
  );
}

// The one switch for a whole column of dates, for the table header. The page owns
// `mode` and hands it to every DualDateInput in the column (with `hideToggle`).
export function DateModeToggle({ mode, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title="Switch between English (A.D.) and Nepali (B.S.) dates"
      style={{ ...chipStyle, gap: 3, fontSize: 10.5, padding: "2px 7px 2px 6px", textTransform: "none" }}
    >
      <span style={{ fontSize: 11 }}>⇄</span>{mode === "ad" ? "B.S." : "A.D."}
    </button>
  );
}
