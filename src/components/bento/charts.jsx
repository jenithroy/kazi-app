/**
 * Charts that size themselves to the tile they are in.
 *
 * Nothing here takes a pixel size: each one is an SVG on a fixed viewBox, or
 * plain flex boxes, and the stylesheet decides how big it gets. Colours come in
 * as CSS values so they follow the tile's tone and the page's theme.
 */
import { useId } from "react";
import { cn } from "../ui";

/**
 * Proportions of a whole as a ring. `segments` is [{ v, color }]; zero-sized
 * ones are skipped. With nothing to show it draws the empty track, never a
 * made-up arc.
 */
export function Ring({ segments, thickness = 12 }) {
  const R = 50 - thickness / 2;
  const C = 2 * Math.PI * R;
  const live = segments.filter((s) => s.v > 0);
  const total = live.reduce((s, x) => s + x.v, 0);
  const gap = live.length > 1 ? 1.8 : 0;
  let offset = 0;

  return (
    <svg className="kb-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={R} fill="none" strokeWidth={thickness} className="kb-ring-track" />
      {total > 0 && live.map((s, i) => {
        const len = (s.v / total) * C;
        const seg = (
          <circle
            key={i} cx="50" cy="50" r={R} fill="none"
            stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${Math.max(len - gap, 0.01)} ${C}`} strokeDashoffset={-offset}
            transform="rotate(-90 50 50)" className="kb-ring-seg"
          />
        );
        offset += len;
        return seg;
      })}
    </svg>
  );
}

/**
 * A filled line over time, stretched to fill its box. The peak and the latest
 * point are marked; there is no hover, because the tile around it is a link.
 */
export function Trend({ values, labels = [], empty }) {
  const id = useId();
  const n = values.length;
  const max = Math.max(0, ...values);
  if (n < 2 || max <= 0) return <div className="kb-trend-empty">{empty}</div>;

  const y = (v) => 96 - (v / max) * 88;
  const pts = values.map((v, i) => [(i / (n - 1)) * 300, y(v)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L300 100 L0 100 Z`;
  const peak = values.indexOf(max);
  const at = (i) => ({ left: `${(i / (n - 1)) * 100}%`, bottom: `${100 - y(values[i])}%` });
  const mid = labels[Math.floor((n - 1) / 2)];

  return (
    <div className="kb-trend kb-fill">
      <div className="kb-trend-plot">
        <svg viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--kb-accent)", stopOpacity: 0.32 }} />
              <stop offset="100%" style={{ stopColor: "var(--kb-accent)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
          <path d={line} className="kb-trend-line" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="kb-trend-dot kb-trend-dot--peak" style={at(peak)} />
        {peak !== n - 1 && <span className="kb-trend-dot" style={at(n - 1)} />}
      </div>
      {labels.length > 0 && (
        <div className="kb-trend-x kb-h-180" aria-hidden="true">
          <span>{labels[0]}</span><span>{mid}</span><span>{labels[n - 1]}</span>
        </div>
      )}
    </div>
  );
}

/** One bar split into parts, widest first reads left to right. Zero parts are skipped. */
export function StackBar({ parts }) {
  const live = parts.filter((p) => p.v > 0);
  const total = live.reduce((s, p) => s + p.v, 0);
  return (
    <div className="kb-stack" aria-hidden="true">
      {total > 0
        ? live.map((p, i) => <i key={i} style={{ flexGrow: p.v, background: p.color }} />)
        : <i style={{ flexGrow: 1, background: "var(--kb-track)" }} />}
    </div>
  );
}

/** Columns scaled to the tallest; the latest one is the accent. */
export function MiniBars({ values, labels = [] }) {
  const max = Math.max(0, ...values) || 1;
  return (
    <div className="kb-bars kb-fill" aria-hidden="true">
      {values.map((v, i) => (
        <div key={i} className={cn("kb-bar", i === values.length - 1 && "is-last", v === 0 && "is-zero")}>
          <div className="kb-bar-track">
            <i style={{ height: `${Math.max(v / max, v > 0 ? 0.05 : 0.025) * 100}%` }} />
          </div>
          {labels[i] != null && <span className="kb-bar-l kb-h-200">{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}
