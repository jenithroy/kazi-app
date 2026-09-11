import { cn } from "./utils";

/* ── Button ───────────────────────────────────────────── */
/**
 * Canonical Btn component — use this everywhere instead of ad-hoc className strings.
 *
 * Variants (kind prop):
 *   primary   — filled green, main actions (replaces kbil-btn-primary, primary-button)
 *   ghost     — outlined/transparent, secondary actions (replaces ghost-button, kbil-btn-ghost)
 *   danger    — filled red, destructive actions
 *   secondary — subtle filled, alternative to ghost when you want more weight
 *
 * Sizes (size prop): sm | md (default) | lg
 *
 * Usage:
 *   <Btn kind="primary" onClick={…}>Save</Btn>
 *   <Btn kind="ghost" onClick={…}>Cancel</Btn>
 *   <Btn kind="danger" onClick={…}>Delete</Btn>
 *   <Btn kind="secondary" icon={<Icons.Plus />}>Add item</Btn>
 */
export function Btn({ kind = "ghost", size = "md", icon, iconRight, children, className, ...rest }) {
  return (
    <button className={cn("kbtn", `kbtn--${kind}`, `kbtn--${size}`, className)} {...rest}>
      {icon && <span className="kbtn-ico">{icon}</span>}
      {children && <span>{children}</span>}
      {iconRight && <span className="kbtn-ico">{iconRight}</span>}
    </button>
  );
}
