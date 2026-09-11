import { cn } from "./utils";

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
