/**
 * Kazi UI Primitives
 * Shared components: Card, Btn, Pill, Avatar, KPI, Progress, Spark, Divider, SegBar
 */

export const cn = (...xs) => xs.filter(Boolean).join(" ");

export const fmt = {
  gbp: (n) => "£" + Math.round(n).toLocaleString("en-GB"),
  npr: (n) => "₨ " + Math.round(n).toLocaleString("en-IN"),
  int: (n) => Math.round(n).toLocaleString("en-GB"),
  pct: (n, d = 1) => Number(n).toFixed(d) + "%",
};

/* ── Card ─────────────────────────────────────────────── */
export function Card({ title, sub, action, accent, children, pad = true, className, hint, ...rest }) {
  return (
    <section className={cn("kazi-card", className)} {...rest}>
      {(title || action) && (
        <header className="kazi-card-h">
          <div className="kazi-card-h-l">
            {accent && <span className="kazi-card-tab" style={{ background: accent }} />}
            <div>
              {title && <h3 className="kazi-card-title">{title}</h3>}
              {sub && <p className="kazi-card-sub">{sub}</p>}
            </div>
          </div>
          {action && <div className="kazi-card-action">{action}</div>}
        </header>
      )}
      <div className={cn("kazi-card-body", !pad && "kazi-card-body--flush")}>{children}</div>
      {hint && <footer className="kazi-card-foot">{hint}</footer>}
    </section>
  );
}

/* ── Button ───────────────────────────────────────────── */
export function Btn({ kind = "ghost", size = "md", icon, iconRight, children, className, ...rest }) {
  return (
    <button className={cn("kbtn", `kbtn--${kind}`, `kbtn--${size}`, className)} {...rest}>
      {icon && <span className="kbtn-ico">{icon}</span>}
      {children && <span>{children}</span>}
      {iconRight && <span className="kbtn-ico">{iconRight}</span>}
    </button>
  );
}

/* ── Pill ─────────────────────────────────────────────── */
export function Pill({ tone = "neutral", children, dot, icon }) {
  return (
    <span className={cn("kpill", `kpill--${tone}`)}>
      {dot && <span className="kpill-dot" />}
      {icon && <span className="kpill-ico">{icon}</span>}
      {children}
    </span>
  );
}

/* ── Avatar ───────────────────────────────────────────── */
export function Avatar({ name, hue, size = 28, ring }) {
  const initials = name
    ? name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  const h = hue ?? 145;
  const bg = `oklch(0.78 0.08 ${h})`;
  const fg = `oklch(0.28 0.08 ${h})`;
  return (
    <span
      className="kavatar"
      style={{
        width: size, height: size,
        background: bg, color: fg,
        fontSize: size * 0.4,
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
    >
      {initials}
    </span>
  );
}

/* ── KPI Card ─────────────────────────────────────────── */
export function KPI({ label, value, unit, delta, deltaLabel, spark, accent = "var(--mint-deep)", icon }) {
  return (
    <div className="kkpi">
      <div className="kkpi-h">
        <span className="kkpi-label">{label}</span>
        {icon && <span className="kkpi-ico" style={{ color: accent }}>{icon}</span>}
      </div>
      <div className="kkpi-val">
        <span className="num-xl" style={{ fontSize: 30, lineHeight: 1 }}>{value}</span>
        {unit && <span className="kkpi-unit">{unit}</span>}
      </div>
      <div className="kkpi-foot">
        {delta != null && (
          <Pill tone={delta >= 0 ? "mint" : "terra"}>
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%
          </Pill>
        )}
        {deltaLabel && <span className="kkpi-deltal">{deltaLabel}</span>}
        {spark && <span className="kkpi-spark">{spark}</span>}
      </div>
    </div>
  );
}

/* ── Spark (mini sparkline) ───────────────────────────── */
export function Spark({ data, w = 80, h = 28, color = "var(--mint-deep)", fill }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data) || 1;
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / range) * (h - 4) - 2,
  ]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const areaD = d + ` L${w} ${h} L0 ${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {fill && <path d={areaD} fill={fill} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── Progress bar ─────────────────────────────────────── */
export function Progress({ pct, color = "var(--mint-deep)", track = "rgba(15,46,34,.07)", h = 6 }) {
  return (
    <div className="kprog" style={{ height: h, background: track }}>
      <span style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

/* ── Segmented bar ────────────────────────────────────── */
export function SegBar({ segments, height = 6 }) {
  const total = segments.reduce((s, x) => s + x.v, 0) || 1;
  return (
    <div className="ksegbar" style={{ height }}>
      {segments.map((s, i) => (
        <span key={i} title={`${s.label}: ${s.v}`} style={{ width: `${(s.v / total) * 100}%`, background: s.color }} />
      ))}
    </div>
  );
}

/* ── Divider ──────────────────────────────────────────── */
export function Divider({ vertical }) {
  return <span className={cn("kdiv", vertical && "kdiv--v")} />;
}

/* ── Icon helper ──────────────────────────────────────── */
export function Ico({ d, s, size = 18, sw = 1.6, fill, ...rest }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={fill || "none"} stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" {...rest}
    >
      {d && <path d={d} />}
      {s}
    </svg>
  );
}

/* ── Common icons ─────────────────────────────────────── */
export const Icons = {
  Dashboard:  (p) => <Ico {...p} s={<><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>}/>,
  Tasks:      (p) => <Ico {...p} s={<><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M7 9h10M7 13h6M7 17h8"/></>}/>,
  Attendance: (p) => <Ico {...p} s={<><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9h17M8 3v4M16 3v4"/><circle cx="9" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="13" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="17" cy="14" r="1" fill="currentColor" stroke="none"/></>}/>,
  Production: (p) => <Ico {...p} s={<><path d="M3 20h18M5 20V10l4 2V8l5 3V6l5 4v10"/></>}/>,
  QC:         (p) => <Ico {...p} s={<><path d="M12 3l8 3v5c0 4.5-3.4 8.5-8 10-4.6-1.5-8-5.5-8-10V6l8-3z"/><path d="M9 12l2.2 2.2L15 10"/></>}/>,
  Inventory:  (p) => <Ico {...p} s={<><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></>}/>,
  Finance:    (p) => <Ico {...p} s={<><circle cx="12" cy="12" r="9"/><path d="M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5 1.3 2 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5M12 5v2M12 17v2"/></>}/>,
  Billing:    (p) => <Ico {...p} s={<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></>}/>,
  Budget:     (p) => <Ico {...p} s={<><path d="M4 7h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7z"/><path d="M9 11l2 2 4-4"/><path d="M4 7l2-3h12l2 3"/></>}/>,
  Employees:  (p) => <Ico {...p} s={<><circle cx="9" cy="8" r="3.5"/><path d="M3 20c.6-3.4 3.1-5.5 6-5.5s5.4 2.1 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.7.4 4.4 2.2 5 5.3"/></>}/>,
  Admin:      (p) => <Ico {...p} s={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/></>}/>,
  Search:     (p) => <Ico {...p} s={<><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></>}/>,
  Bell:       (p) => <Ico {...p} s={<><path d="M6 9a6 6 0 1112 0v4l1.5 3h-15L6 13V9z"/><path d="M10 19a2 2 0 004 0"/></>}/>,
  ChevronDown:(p) => <Ico {...p} d="M6 9l6 6 6-6"/>,
  ChevronRight:(p)=> <Ico {...p} d="M9 6l6 6-6 6"/>,
  ChevronLeft:(p) => <Ico {...p} d="M15 6l-6 6 6 6"/>,
  ArrowRight: (p) => <Ico {...p} d="M5 12h14M13 6l6 6-6 6"/>,
  Plus:       (p) => <Ico {...p} d="M12 5v14M5 12h14"/>,
  Check:      (p) => <Ico {...p} d="M5 12.5l4.5 4.5L19 7" sw={2}/>,
  X:          (p) => <Ico {...p} d="M6 6l12 12M18 6L6 18"/>,
  Filter:     (p) => <Ico {...p} d="M3 5h18l-7 9v6l-4-2v-4L3 5z"/>,
  Calendar:   (p) => <Ico {...p} s={<><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9h17M8 3v4M16 3v4"/></>}/>,
  MapPin:     (p) => <Ico {...p} s={<><path d="M12 22s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></>}/>,
  Crosshair:  (p) => <Ico {...p} s={<><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>}/>,
  Alert:      (p) => <Ico {...p} s={<><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.1"/></>}/>,
  Wifi:       (p) => <Ico {...p} s={<><path d="M5 12.5a10 10 0 0114 0M8 16a6 6 0 018 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none"/></>}/>,
  Clock:      (p) => <Ico {...p} s={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>}/>,
  Logout:     (p) => <Ico {...p} s={<><path d="M14 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7a2 2 0 002-2v-3"/><path d="M9 12h12M17 8l4 4-4 4"/></>}/>,
  Sidebar:    (p) => <Ico {...p} s={<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M5.5 8h1M5.5 11h1"/></>}/>,
  Truck:      (p) => <Ico {...p} s={<><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>}/>,
  Scissors:   (p) => <Ico {...p} s={<><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 8l13 13M14 14l7-8M14 10l-6 6"/></>}/>,
  Pin:        (p) => <Ico {...p} s={<><path d="M14 3l7 7-4 1-3 3-2 7-2-2-5 5 5-5-2-2 7-2 3-3 1-4z"/></>}/>,
  Send:       (p) => <Ico {...p} d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>,
  Settings:   (p) => <Ico {...p} s={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/></>}/>,
  Menu:       (p) => <Ico {...p} d="M4 6h16M4 12h16M4 18h16"/>,
  Directors:  (p) => <Ico {...p} s={<><path d="M3 21V7a2 2 0 012-2h14a2 2 0 012 2v14"/><path d="M9 21v-6h6v6"/><path d="M9 10h2M13 10h2M9 14h2"/></>}/>,
  Customers:  (p) => <Ico {...p} s={<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>}/>,
  Message:    (p) => <Ico {...p} s={<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>}/>,
};
