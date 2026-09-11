import { cn } from "./utils";

/* ── Divider ──────────────────────────────────────────── */
export function Divider({ vertical }) {
  return <span className={cn("kdiv", vertical && "kdiv--v")} />;
}
