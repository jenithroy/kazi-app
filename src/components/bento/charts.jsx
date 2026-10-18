/**
 * Charts that size themselves to the tile they are in.
 *
 * Nothing here takes a pixel size: each one is an SVG on a fixed viewBox, or
 * plain flex boxes, and the stylesheet decides how big it gets. Colours come in
 * as CSS values so they follow the tile's tone and the page's theme.
 *
 * The line and the bars answer the pointer: a guide, a dot and a small label follow it and say
 * what the chart holds at that spot. A tile is one big link (its `.kb-hit` sits over everything),
 * so a chart that listens for the pointer has to sit above that link (`.kb-act`) and hand a click
 * back to it, which is all `passClick` does. A finger has no hover, so a touch just taps through
 * to the tile as it always did.
 */
import { useId, useRef, useState } from "react";
import { cn } from "../ui";

function passClick(e) {
  e.currentTarget.closest(".kb-tile")?.querySelector(":scope > .kb-hit")?.click();
}
const hoverable = (e) => e.pointerType !== "touch";
/** What a hover label says when its chart was given no `format`: the number grouped the way the app writes them (12,50,000), not raw digits. */
const plain = (v) => (Number.isFinite(v) ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(v));

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
 * point are marked; pointing at it moves a guide and a dot along the line and says the date
 * and the amount there (`format` turns a value into words, e.g. money in the chosen currency).
 */
export function Trend({ values, labels = [], empty, format }) {
  const id = useId();
  const plot = useRef(null);
  const [hover, setHover] = useState(null);     // the index the pointer is over, or null
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

  const follow = (e) => {
    if (!hoverable(e) || !plot.current) return;
    const r = plot.current.getBoundingClientRect();
    const t = r.width > 0 ? (e.clientX - r.left) / r.width : 0;
    setHover(Math.max(0, Math.min(n - 1, Math.round(t * (n - 1)))));
  };
  const h = hover == null ? null : { ...at(hover), x: (hover / (n - 1)) * 100, above: y(values[hover]) > 30 };      // room over the point for the label? (the peak has none)

  return (
    <div className="kb-trend kb-fill">
      <div className="kb-trend-plot kb-act is-live" ref={plot} onPointerMove={follow} onPointerLeave={() => setHover(null)} onClick={passClick}>
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
        {h && (
          <>
            <span className="kb-trend-guide" style={{ left: `${h.x}%` }} aria-hidden="true" />
            <span className="kb-trend-dot kb-trend-dot--hover" style={{ left: h.left, bottom: h.bottom }} aria-hidden="true" />
            <span
              className="kb-tip"
              aria-hidden="true"
              // the label's own x% sits on the plot's x%: centred in the middle, flush with the edge at either end, so it never leaves the tile
              style={{ left: `${h.x}%`, transform: `translateX(-${h.x}%)`, ...(h.above ? { bottom: `calc(${parseFloat(h.bottom)}% + 12px)` } : { top: `calc(${100 - parseFloat(h.bottom)}% + 12px)` }) }}
            >
              <b>{format ? format(values[hover]) : plain(values[hover])}</b>
              {labels[hover] != null && <span>{labels[hover]}</span>}
            </span>
          </>
        )}
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

/**
 * Columns scaled to the tallest; the latest one is the accent. Pointing at one lights it and
 * says its label and amount (`format` turns a value into words).
 */
export function MiniBars({ values, labels = [], format }) {
  const max = Math.max(0, ...values) || 1;
  const [hover, setHover] = useState(null);
  return (
    <div className="kb-bars kb-fill kb-act is-live" aria-hidden="true" onPointerLeave={() => setHover(null)} onClick={passClick}>
      {values.map((v, i) => {
        const fill = Math.max(v / max, v > 0 ? 0.05 : 0.025) * 100;
        return (
          <div key={i} className={cn("kb-bar", i === values.length - 1 && "is-last", v === 0 && "is-zero", hover === i && "is-hover")} onPointerEnter={(e) => { if (hoverable(e)) setHover(i); }}>
            <div className="kb-bar-track">
              <i style={{ height: `${fill}%` }} />
              {hover === i && (
                <span className={cn("kb-tip kb-tip--bar", i === 0 && "kb-tip--l", i === values.length - 1 && "kb-tip--r")} style={{ bottom: `calc(${fill}% + 6px)` }}>
                  <b>{format ? format(v) : plain(v)}</b>
                  {labels[i] != null && <span>{labels[i]}</span>}
                </span>
              )}
            </div>
            {labels[i] != null && <span className="kb-bar-l kb-h-200">{labels[i]}</span>}
          </div>
        );
      })}
    </div>
  );
}
