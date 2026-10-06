import { useState, useRef } from "react";
import { money } from "./money";
import { roundAmount } from "../../utils/format";

function formatShortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function ChartFrame({
  title = "Daily trend",
  metrics = [],
  metric,
  onMetricChange,
  dates = [],
  data = [],
  currency = "USD",
  dataStartsNotice,
}) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);

  const W = 800;
  const H = 220;
  const padL = 48;
  const padR = 20;
  const padT = 16;
  const padB = 28;
  const w = W - padL - padR;
  const h = H - padT - padB;

  const n = data.length;
  const maxV = (Math.max(...data, 0) || 1) * 1.15;

  const x = (i) => padL + (n > 1 ? (i / (n - 1)) * w : w / 2);
  const y = (v) => padT + h - (v / maxV) * h;
  const path = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = path + ` L${x(n - 1).toFixed(1)} ${padT + h} L${x(0).toFixed(1)} ${padT + h} Z`;

  const onMove = (e) => {
    if (!ref.current || n <= 0) return;
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = n > 1 ? Math.max(0, Math.min(n - 1, Math.round(((px - padL) / w) * (n - 1)))) : 0;
    setHover(i);
  };

  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((maxV * (yTicks - i)) / yTicks));

  // Pick up to 7 evenly distributed date label indices
  const labelIndices = [];
  if (n > 0) {
    const step = Math.max(1, Math.floor((n - 1) / 5));
    for (let i = 0; i < n; i += step) {
      labelIndices.push(i);
    }
    if (labelIndices[labelIndices.length - 1] !== n - 1) {
      labelIndices.push(n - 1);
    }
  }

  const formatValue = (val) => {
    if (metric === "spend") return money(val, currency);
    return roundAmount(val).toLocaleString();
  };

  return (
    <div className="kmkt-chartframe">
      <div className="kmkt-chartframe-head">
        <div className="kmkt-chartframe-title-group">
          <span className="kmkt-chartframe-title">{title}</span>
          {dataStartsNotice && (
            <span className="kmkt-chartframe-notice" title="The selected range starts before data was recorded">
              {dataStartsNotice}
            </span>
          )}
        </div>
        {metrics.length > 0 && (
          <div className="kmkt-metric-pick">
            {metrics.map((m) => (
              <button
                key={m.id}
                type="button"
                className={m.id === metric ? "is-on" : ""}
                onClick={() => onMetricChange(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="karea" style={{ position: "relative" }}>
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          style={{ display: "block" }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onTouchMove={(e) => {
            if (e.touches?.[0]) onMove(e.touches[0]);
          }}
        >
          <defs>
            <linearGradient id="meta-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--mint-deep)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--mint-deep)" stopOpacity={0.0} />
            </linearGradient>
          </defs>

          {yLabels.map((v, i) => {
            const yy = padT + (h / yTicks) * i;
            return (
              <g key={i}>
                <line
                  x1={padL}
                  y1={yy}
                  x2={padL + w}
                  y2={yy}
                  stroke="rgba(15,46,34,.06)"
                  strokeDasharray={i === yTicks ? "0" : "2 3"}
                />
                <text
                  x={padL - 8}
                  y={yy + 4}
                  textAnchor="end"
                  fill="var(--ink-4)"
                  fontSize="10.5"
                  fontFamily="var(--mono)"
                >
                  {formatValue(v)}
                </text>
              </g>
            );
          })}

          {labelIndices.map((idx) => (
            <text
              key={idx}
              x={x(idx)}
              y={H - 8}
              textAnchor="middle"
              fill="var(--ink-4)"
              fontSize="10.5"
              fontFamily="var(--mono)"
            >
              {formatShortDate(dates[idx])}
            </text>
          ))}

          {n > 0 && (
            <g>
              <path d={area} fill="url(#meta-area-grad)" />
              <path d={path} fill="none" stroke="var(--mint-deep)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )}

          {hover != null && dates[hover] && (
            <g>
              <line
                x1={x(hover)}
                y1={padT}
                x2={x(hover)}
                y2={padT + h}
                stroke="var(--mint-deep)"
                strokeDasharray="3 3"
              />
              <circle
                cx={x(hover)}
                cy={y(data[hover])}
                r="5"
                fill="#fff"
                stroke="var(--mint-deep)"
                strokeWidth="2.5"
              />
            </g>
          )}
        </svg>

        {hover != null && dates[hover] && (
          <div className="karea-tt" style={{ left: `${(x(hover) / W) * 100}%`, top: 8 }}>
            <div className="karea-tt-h">{formatShortDate(dates[hover])}</div>
            <div className="karea-tt-r">
              <span className="karea-tt-c" style={{ background: "var(--mint-deep)" }} />
              <span>{metrics.find((m) => m.id === metric)?.label || metric}</span>
              <strong className="mono">{formatValue(data[hover])}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
