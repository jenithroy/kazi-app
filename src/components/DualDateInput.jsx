import { useState } from "react";
import NepaliDate, { dateConfigMap } from "nepali-date-converter";

const BS_MONTHS = ["Baisakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Aswin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];
const BS_YEARS = Object.keys(dateConfigMap).map(Number).sort((a, b) => a - b);

function daysInBsMonth(year, monthIdx) {
  return dateConfigMap[year]?.[BS_MONTHS[monthIdx]] || 30;
}

function adToBsParts(adIso) {
  if (!adIso) return null;
  const [y, m, d] = adIso.split("-").map(Number);
  if (!y || !m || !d) return null;
  try {
    const nd = new NepaliDate(new Date(y, m - 1, d));
    return { year: nd.getYear(), month: nd.getMonth(), day: nd.getDate() };
  } catch {
    return null;
  }
}

function bsPartsToAd(year, month, day) {
  try {
    const jsDate = new NepaliDate(year, month, day).toJsDate();
    const y = jsDate.getFullYear();
    const m = String(jsDate.getMonth() + 1).padStart(2, "0");
    const d = String(jsDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return null;
  }
}

function adToBsLabel(adIso) {
  const parts = adToBsParts(adIso);
  if (!parts) return null;
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

// AD/BS dual date input. Underlying value is always an AD "YYYY-MM-DD" string —
// the calendar shown is purely a display/entry preference, toggled by clicking the secondary label.
// BS entry uses Year/Month/Day dropdowns (BS months don't have fixed lengths, so free text invites typos).
export default function DualDateInput({ value, onChange, required, className = "kfin-input" }) {
  const [mode, setMode] = useState("ad");
  const [bsParts, setBsParts] = useState(() => adToBsParts(value) || { year: BS_YEARS[Math.floor(BS_YEARS.length / 2)], month: 0, day: 1 });

  function switchToBs() {
    setBsParts(adToBsParts(value) || bsParts);
    setMode("bs");
  }

  function updateBs(patch) {
    const next = { ...bsParts, ...patch };
    const maxDay = daysInBsMonth(next.year, next.month);
    if (next.day > maxDay) next.day = maxDay;
    setBsParts(next);
    const ad = bsPartsToAd(next.year, next.month, next.day);
    if (ad) onChange(ad);
  }

  const secondary = mode === "ad" ? adToBsLabel(value) : value;
  const secondarySuffix = mode === "ad" ? "B.S." : "A.D.";
  const dayCount = daysInBsMonth(bsParts.year, bsParts.month);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {mode === "ad" ? (
        <input type="date" className={className} value={value || ""} required={required}
          data-role="purchase-date"
          onChange={e => onChange(e.target.value)} />
      ) : (
        <div style={{ display: "flex", gap: 3 }}>
          <select className={className} style={{ width: "auto", minWidth: 56, padding: "4px 2px", fontSize: 13 }} value={bsParts.year}
            onChange={e => updateBs({ year: Number(e.target.value) })}>
            {BS_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className={className} style={{ width: "auto", minWidth: 78, padding: "4px 2px", fontSize: 13 }} value={bsParts.month}
            onChange={e => updateBs({ month: Number(e.target.value) })}>
            {BS_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select className={className} style={{ width: "auto", minWidth: 40, padding: "4px 2px", fontSize: 13 }} value={bsParts.day}
            onChange={e => updateBs({ day: Number(e.target.value) })}>
            {Array.from({ length: dayCount }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      )}
      <button
        type="button"
        onClick={mode === "ad" ? switchToBs : () => setMode("ad")}
        title="Click to switch calendar"
        style={{
          display: "inline-flex", alignItems: "center", gap: 4, alignSelf: "flex-start",
          fontSize: 11, fontWeight: 600, color: "var(--mint-deep)", cursor: "pointer",
          background: "var(--mint-wash)", border: "1px solid rgba(45,155,111,.25)",
          borderRadius: 20, padding: "2px 8px 2px 7px", lineHeight: 1.4
        }}
      >
        <span style={{ fontSize: 13 }}>⇄</span>
        {secondary ? `${secondary} ${secondarySuffix}` : "—"}
      </button>
    </div>
  );
}
