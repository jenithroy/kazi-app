import { Btn } from "../ui";

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

/** dateFrom/dateTo are "yyyy-mm-dd" strings, or "" for no bound. */
export default function DateRangePicker({ dateFrom, dateTo, onChange }) {
  const today = isoDaysAgo(0);

  return (
    <div className="kmkt-daterange">
      {PRESETS.map((p) => {
        const from = isoDaysAgo(p.days);
        const active = dateFrom === from && dateTo === today;
        return (
          <Btn
            key={p.label}
            kind={active ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onChange({ dateFrom: from, dateTo: today })}
          >
            {p.label}
          </Btn>
        );
      })}
      <input
        type="date"
        value={dateFrom}
        max={dateTo || today}
        onChange={(e) => onChange({ dateFrom: e.target.value, dateTo })}
      />
      <span className="kmkt-daterange-sep">–</span>
      <input
        type="date"
        value={dateTo}
        min={dateFrom}
        max={today}
        onChange={(e) => onChange({ dateFrom, dateTo: e.target.value })}
      />
    </div>
  );
}

export { isoDaysAgo };
