import { cn } from "./utils";

/* ── Button ───────────────────────────────────────────── */
/**
 * The button. Use it rather than ad-hoc button classes.
 *
 * kind
 *   primary    mint-deep fill: the one main action in a view (Save, New invoice)
 *   secondary  white with a border: an ordinary action beside it (Cancel, Export)
 *   ghost      no chrome: low-emphasis actions in toolbars and card headers
 *   danger     soft terra fill: destructive actions (Delete, Reject)
 *   mint       bright mint fill: kept for clocking in and out
 *   soft       faint fill: a quieter alternative to secondary
 *   outline    the older name for secondary, kept so existing pages still work
 *
 * size     xs | sm | md (default) | lg
 * loading  shows a spinner in place of the icon, keeps the label so the width
 *          does not jump, and disables the button until the work is done
 *
 *   <Btn kind="primary" loading={saving} onClick={save}>Save</Btn>
 *   <Btn kind="secondary" icon={<Icons.Plus size={14} />}>Add item</Btn>
 */
export function Btn({ kind = "ghost", size = "md", icon, iconRight, loading = false, disabled, children, className, ...rest }) {
  return (
    <button
      className={cn("kbtn", `kbtn--${kind}`, `kbtn--${size}`, loading && "is-loading", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon && <span className="kbtn-ico">{icon}</span>}
      {children && <span>{children}</span>}
      {iconRight && !loading && <span className="kbtn-ico">{iconRight}</span>}
    </button>
  );
}

/**
 * A button that is only an icon. `label` is required: with no visible text it
 * is the button's accessible name, and its tooltip.
 */
export function IconBtn({ icon, label, kind = "ghost", size = "md", className, ...rest }) {
  return (
    <button
      type="button"
      className={cn("kiconbtn", `kiconbtn--${kind}`, `kiconbtn--${size}`, className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      {icon}
    </button>
  );
}

/** The loading spinner, sized to sit where a button icon would. */
export function Spinner({ size = 14, className }) {
  return (
    <svg
      className={cn("kspin", className)}
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </svg>
  );
}
