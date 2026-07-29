import { useState } from "react";
import NepaliDate from "nepali-date-converter";

function adToBs(adIso) {
  if (!adIso) return null;
  const [y, m, d] = adIso.split("-").map(Number);
  if (!y || !m || !d) return null;
  try {
    return new NepaliDate(new Date(y, m - 1, d)).format("YYYY-MM-DD");
  } catch {
    return null;
  }
}

function bsToAd(bsStr) {
  if (!bsStr) return null;
  try {
    const jsDate = new NepaliDate(bsStr.trim()).toJsDate();
    const y = jsDate.getFullYear();
    const m = String(jsDate.getMonth() + 1).padStart(2, "0");
    const d = String(jsDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return null;
  }
}

// AD/BS dual date input. Underlying value is always an AD "YYYY-MM-DD" string —
// the calendar shown is purely a display/entry preference, toggled by clicking the secondary label.
export default function DualDateInput({ value, onChange, required, className = "kfin-input" }) {
  const [mode, setMode] = useState("ad");
  const [bsDraft, setBsDraft] = useState(() => adToBs(value) || "");

  function switchToBs() {
    setBsDraft(adToBs(value) || "");
    setMode("bs");
  }

  const bsParsed = mode === "bs" ? bsToAd(bsDraft) : null;
  const bsInvalid = mode === "bs" && bsDraft !== "" && bsParsed == null;
  const secondary = mode === "ad" ? adToBs(value) : value;
  const secondarySuffix = mode === "ad" ? "B.S." : "A.D.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {mode === "ad" ? (
        <input type="date" className={className} value={value || ""} required={required}
          onChange={e => onChange(e.target.value)} />
      ) : (
        <input type="text" className={className} value={bsDraft} required={required}
          placeholder="YYYY-MM-DD (B.S.)"
          style={bsInvalid ? { borderColor: "var(--terra)" } : undefined}
          onChange={e => {
            const v = e.target.value;
            setBsDraft(v);
            const ad = bsToAd(v);
            if (ad) onChange(ad);
          }} />
      )}
      <span
        onClick={mode === "ad" ? switchToBs : () => setMode("ad")}
        title="Click to switch calendar"
        style={{ fontSize: 11, color: "var(--ink-4)", cursor: "pointer" }}
      >
        {secondary ? `${secondary} ${secondarySuffix}` : "—"} ⇄
      </span>
    </div>
  );
}
