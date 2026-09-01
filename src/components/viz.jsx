/**
 * Kazi Viz Components
 * AreaChart, AttendanceRing, ProductionPipeline, QCDial, Donut, Bars
 */
import { useState, useRef } from "react";
import { cn } from "./ui";
import { roundAmount } from "../utils/format";

/* ── Area chart with hover tooltip ───────────────────── */
export function AreaChart({ series, height = 220, dates }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 800, H = height;
  const padL = 40, padR = 16, padT = 16, padB = 28;
  const w = W - padL - padR;
  const h = H - padT - padB;

  const allValues = series.flatMap(s => s.data);
  const maxV = (Math.max(...allValues) || 1) * 1.15;
  const n = series[0].data.length;

  const x = (i) => padL + (i / (n - 1)) * w;
  const y = (v) => padT + h - (v / maxV) * h;
  const path = (data) => data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = (data) => path(data) + ` L${x(n-1).toFixed(1)} ${padT+h} L${x(0).toFixed(1)} ${padT+h} Z`;

  const onMove = (e) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n-1, Math.round((px - padL) / w * (n-1))));
    setHover(i);
  };

  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => Math.round(maxV * (yTicks - i) / yTicks));

  return (
    <div className="karea" style={{ position: "relative" }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`area-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={s.fillOpacity ?? 0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {yLabels.map((v, i) => {
          const yy = padT + (h / yTicks) * i;
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={padL + w} y2={yy} stroke="rgba(15,46,34,.06)" strokeDasharray={i === yTicks ? "0" : "2 3"} />
              <text x={padL - 8} y={yy + 4} textAnchor="end" fill="var(--ink-4)" fontSize="10.5" fontFamily="var(--mono)">£{roundAmount(v).toLocaleString()}</text>
            </g>
          );
        })}
        {dates && dates.map((d, i) => (i % 4 === 0 || i === n-1) && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fill="var(--ink-4)" fontSize="10.5" fontFamily="var(--mono)">{d}</text>
        ))}
        {series.map((s, i) => (
          <g key={i}>
            <path d={area(s.data)} fill={`url(#area-${i})`} />
            <path d={path(s.data)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT+h} stroke="var(--mint-deep)" strokeDasharray="3 3" />
            {series.map((s, i) => (
              <circle key={i} cx={x(hover)} cy={y(s.data[hover])} r="6" fill="#fff" stroke={s.color} strokeWidth="2.5" />
            ))}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="karea-tt" style={{ left: `${(x(hover) / W) * 100}%`, top: 8 }}>
          <div className="karea-tt-h">{dates?.[hover] ?? `Day ${hover + 1}`}</div>
          {series.map((s, i) => (
            <div key={i} className="karea-tt-r">
              <span className="karea-tt-c" style={{ background: s.color }} />
              <span>{s.label}</span>
              <strong className="mono">£{roundAmount(s.data[hover]).toLocaleString()}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Attendance ring ──────────────────────────────────── */
export function AttendanceRing({ present, late, leave, absent, total, size = 160 }) {
  const segments = [
    { v: present, color: "var(--mint-2)",  label: "Present" },
    { v: late,    color: "var(--amber)",   label: "Late" },
    { v: leave,   color: "var(--blue)",    label: "Leave" },
    { v: absent,  color: "var(--ink-5)",   label: "Absent" },
  ];
  const sum = segments.reduce((s, x) => s + x.v, 0) || 1;
  const R = size / 2 - 10;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="kring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={R} fill="none" stroke="rgba(15,46,34,.05)" strokeWidth="10" />
        {segments.map((s, i) => {
          const len = (s.v / sum) * C;
          const dash = `${len - 3} ${C}`;
          const dashOffset = -offset;
          offset += len;
          return (
            <circle key={i} cx={size/2} cy={size/2} r={R} fill="none"
              stroke={s.color} strokeWidth="10" strokeDasharray={dash} strokeDashoffset={dashOffset}
              strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
          );
        })}
      </svg>
      <div className="kring-c">
        <div className="num-xl" style={{ fontSize: 38 }}>
          {present}<span className="kring-c-d">/{total}</span>
        </div>
        <div className="kring-l">in today</div>
      </div>
    </div>
  );
}

/* ── Production pipeline ──────────────────────────────── */
const PIPE_STAGES = [
  { id: "Order Received",        label: "Received",  iconPath: "M14 3l7 7-4 1-3 3-2 7-2-2-5 5 5-5-2-2 7-2 3-3 1-4z" },
  { id: "Cutting",               label: "Cutting",   iconCircles: true },
  { id: "Stitching",             label: "Stitching", iconGear: true },
  { id: "Quality Check",         label: "QC",        iconShield: true },
  { id: "Shipped",               label: "Dispatch",  iconTruck: true },
];

export function ProductionPipeline({ orders = [] }) {
  const grouped = PIPE_STAGES.map(st => ({
    ...st,
    orders: orders.filter(o =>
      o.stage === st.id ||
      (st.id === "Stitching" && ["Fabric Sourcing","Stitching","Finishing & Pressing","Embellishment"].includes(o.stage)) ||
      (st.id === "Shipped" && ["Shipped","Delivered","Packing"].includes(o.stage))
    )
  }));
  const maxCount = Math.max(...grouped.map(g => g.orders.length), 1);

  return (
    <div className="kpipe">
      <div className="kpipe-rail">
        {grouped.map((g, i) => {
          const qty = g.orders.reduce((s, o) => s + Number(o.qty || o.quantity || 0), 0);
          const thick = 28 + (g.orders.length / maxCount) * 22;
          return (
            <div key={g.id} className="kpipe-col">
              <div className="kpipe-stage-h">
                <div className="kpipe-stage-ico" style={{ color: i === 4 ? "var(--mint-deep)" : "var(--ink-2)" }}>
                  <StageIcon stage={g} size={15} />
                </div>
                <div className="kpipe-stage-l">{g.label}</div>
                <div className="kpipe-stage-c mono">{g.orders.length}</div>
              </div>
              <div className="kpipe-track" style={{ height: thick }}>
                <div className="kpipe-track-fill" style={{
                  background: i === 0 ? "var(--mint-soft)"
                    : i === 4 ? "linear-gradient(90deg, var(--mint), var(--mint-2))"
                    : `linear-gradient(90deg, var(--mint-soft) 0%, var(--mint) ${30 + i*15}%)`
                }} />
                {qty > 0 && <div className="kpipe-track-qty mono">{qty.toLocaleString()} pcs</div>}
              </div>
              <div className="kpipe-orders">
                {g.orders.slice(0, 3).map(o => (
                  <div key={o.id || o.orderId} className="kpipe-order">
                    <span className="mono kpipe-order-id">{o.orderId || o.id || "—"}</span>
                    <span className="kpipe-order-c">{o.client || o.clientName || "—"}</span>
                    <span className={cn("kpipe-order-p", o.priority === "high" && "kpipe-order-p--hi")} />
                  </div>
                ))}
                {g.orders.length > 3 && <div className="kpipe-more">+{g.orders.length - 3} more</div>}
                {g.orders.length === 0 && <div className="kpipe-empty">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StageIcon({ stage, size }) {
  const s = size;
  if (stage.iconCircles) return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/>
      <path d="M8 8l13 13M14 14l7-8M14 10l-6 6"/>
    </svg>
  );
  if (stage.iconGear) return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/>
    </svg>
  );
  if (stage.iconShield) return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 3v5c0 4.5-3.4 8.5-8 10-4.6-1.5-8-5.5-8-10V6l8-3z"/>
      <path d="M9 12l2.2 2.2L15 10"/>
    </svg>
  );
  if (stage.iconTruck) return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/>
      <circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>
    </svg>
  );
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3l7 7-4 1-3 3-2 7-2-2-5 5 5-5-2-2 7-2 3-3 1-4z"/>
    </svg>
  );
}

/* ── QC Dial ──────────────────────────────────────────── */
export function QCDial({ batches = [], size = 200 }) {
  const totalChecked = batches.reduce((s, b) => s + Number(b.inspected || b.checked || 0), 0);
  const totalPassed  = batches.reduce((s, b) => s + Number(b.passed || 0), 0);
  const pct = totalChecked ? (totalPassed / totalChecked) * 100 : 0;
  const R = size / 2 - 14;
  const C = Math.PI * R; // half-circle circumference
  const fillC = (pct / 100) * C;
  const cx = size / 2;
  const cy = size / 2 + 4; // center y — slightly below mid to leave room for readout
  const rad = (deg) => (deg * Math.PI) / 180;

  // Needle: 0% → points left (180°), 100% → points right (0°)
  // So angle goes from 180 to 0 as pct goes from 0 to 100
  const needleAngle = 180 - (pct / 100) * 180;
  const needleLen = R - 18;
  const nx = cx + needleLen * Math.cos(rad(needleAngle));
  const ny = cy - needleLen * Math.sin(rad(needleAngle));

  // Arc: left point to right point, sweeping above center (top semicircle)
  const arcLeft  = `${cx - R} ${cy}`;
  const arcRight = `${cx + R} ${cy}`;

  return (
    <div className="kqcd" style={{ width: size }}>
      <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`}>
        <defs>
          <linearGradient id="qcg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="var(--terra)" />
            <stop offset="50%"  stopColor="var(--amber)" />
            <stop offset="100%" stopColor="var(--mint-2)" />
          </linearGradient>
        </defs>

        {/* Background track (top semicircle, left → right) */}
        <path d={`M ${arcLeft} A ${R} ${R} 0 0 1 ${arcRight}`}
          fill="none" stroke="rgba(15,46,34,.06)" strokeWidth="12" strokeLinecap="round" />

        {/* Filled arc (top semicircle, left → right) */}
        <path d={`M ${arcLeft} A ${R} ${R} 0 0 1 ${arcRight}`}
          fill="none" stroke="url(#qcg)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${fillC} ${C}`} />

        {/* Scale labels */}
        <text x={cx - R - 2} y={cy + 16} textAnchor="middle" fill="var(--ink-5)" fontSize="10" fontFamily="var(--mono)">0%</text>
        <text x={cx}         y={cy - R - 6} textAnchor="middle" fill="var(--ink-5)" fontSize="10" fontFamily="var(--mono)">50%</text>
        <text x={cx + R + 2} y={cy + 16} textAnchor="middle" fill="var(--ink-5)" fontSize="10" fontFamily="var(--mono)">100%</text>

        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny}
          stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6" fill="var(--ink)" />
        <circle cx={cx} cy={cy} r="2.5" fill="#fff" />
      </svg>

      <div className="kqcd-readout">
        <div className="num-xl" style={{ fontSize: 32, color: pct >= 95 ? "var(--mint-deep)" : pct >= 90 ? "var(--amber)" : "var(--terra)" }}>
          {pct.toFixed(1)}%
        </div>
        <div className="kqcd-label">pass rate · {batches.length} batches</div>
      </div>

      <div className="kqcd-dots">
        {batches.map((b, idx) => {
          const insp = Number(b.inspected || b.checked || 0);
          const pass = Number(b.passed || 0);
          const p = insp ? (pass / insp) * 100 : 0;
          const tone = p >= 98 ? "mint" : p >= 92 ? "amber" : "terra";
          const id = b.batchId || b.id || `B-${idx}`;
          return (
            <div key={id} className={`kqcd-dot kqcd-dot--${tone}`} title={`${id}: ${p.toFixed(1)}%`}>
              <span className="mono">{String(id).replace(/[^0-9]/g, "").slice(-3) || id}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Donut chart ──────────────────────────────────────── */
export function Donut({ segments, size = 140, thickness = 16 }) {
  const total = segments.reduce((s, x) => s + x.v, 0) || 1;
  const R = (size - thickness) / 2;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={R} fill="none" stroke="rgba(15,46,34,.05)" strokeWidth={thickness} />
      {segments.map((s, i) => {
        const len = (s.v / total) * C;
        const off = -offset;
        offset += len;
        return (
          <circle key={i} cx={size/2} cy={size/2} r={R} fill="none"
            stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${len} ${C}`} strokeDashoffset={off}
            transform={`rotate(-90 ${size/2} ${size/2})`} />
        );
      })}
    </svg>
  );
}

/* ── Bar chart ────────────────────────────────────────── */
export function Bars({ data, labels, max, color = "var(--mint-2)", height = 80 }) {
  const mx = max ?? (Math.max(...data) * 1.1 || 1);
  return (
    <div className="kbars" style={{ height }}>
      {data.map((v, i) => (
        <div key={i} className="kbars-col">
          <div className="kbars-bar" style={{
            height: `${(v / mx) * 100}%`,
            background: v === 0 ? "rgba(15,46,34,.06)" : color,
          }} title={`${labels?.[i]}: ${v}`}>
            {v > 0 && <span className="mono">{v}</span>}
          </div>
          {labels && <div className="kbars-l">{labels[i]}</div>}
        </div>
      ))}
    </div>
  );
}
