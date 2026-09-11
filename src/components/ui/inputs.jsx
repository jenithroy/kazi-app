import { forwardRef, useId } from "react";
import { useField } from "./Field";
import { Icons } from "./Icons";
import { cn } from "./utils";

/*
 * Form controls. Each renders the real native element (<input>, <select>,
 * <textarea>) so everything that finds fields by tag keeps working: the
 * Enter-to-advance chains, KeyboardSelect's advanceFocus, data-role hooks.
 * Pass any native attribute straight through.
 */

/** Props a control takes from its enclosing Field, unless it sets them itself. */
function fromField(props, field) {
  return {
    id: props.id ?? field?.id,
    "aria-describedby": props["aria-describedby"] ?? field?.describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field?.invalid ? true : undefined),
    required: props.required ?? (field?.required || undefined),
  };
}

/* ── Input ────────────────────────────────────────────── */
/**
 * A text-like input: text, number, date, email, tel, password.
 *
 *   compact         a denser height, for tables and toolbars
 *   prefix, suffix  a unit or currency beside the value ("NPR", "pcs", "%")
 */
export const Input = forwardRef(function Input({ className, compact = false, prefix, suffix, ...props }, ref) {
  const field = useField();
  const adorned = prefix != null || suffix != null;
  const input = (
    <input
      ref={ref}
      className={cn("k-input", compact && "k-input--sm", adorned && "k-input--bare", !adorned && className)}
      {...props}
      {...fromField(props, field)}
    />
  );
  if (!adorned) return input;
  return (
    <div className={cn("k-input-group", compact && "k-input-group--sm", props.disabled && "is-disabled", className)}>
      {prefix != null && <span className="k-input-affix">{prefix}</span>}
      {input}
      {suffix != null && <span className="k-input-affix">{suffix}</span>}
    </div>
  );
});

/* ── Textarea ─────────────────────────────────────────── */
export const Textarea = forwardRef(function Textarea({ className, rows = 3, ...props }, ref) {
  const field = useField();
  return <textarea ref={ref} rows={rows} className={cn("k-input", "k-textarea", className)} {...props} {...fromField(props, field)} />;
});

/* ── Select ───────────────────────────────────────────── */
/**
 * A native select with the kit's chevron. Children are <option>s.
 *
 *   placeholder  a first, empty option ("Choose a customer")
 *   compact      a denser height
 *
 * For keyboard-first data entry rows, where Enter must move to the next field,
 * use KeyboardSelect instead: a native select ignores Enter.
 */
export const Select = forwardRef(function Select({ className, compact = false, placeholder, children, ...props }, ref) {
  const field = useField();
  return (
    <span className={cn("k-select", compact && "k-select--sm", props.disabled && "is-disabled", className)}>
      <select ref={ref} className="k-input k-select-el" {...props} {...fromField(props, field)}>
        {placeholder != null && <option value="">{placeholder}</option>}
        {children}
      </select>
      <Icons.ChevronDown size={15} aria-hidden="true" />
    </span>
  );
});

/* ── Checkbox ─────────────────────────────────────────── */
/**
 * A checkbox with its label beside it. For a choice that waits for the form's
 * Save; for a setting that applies the moment it flips, use Switch.
 *
 *   label        what checking it means
 *   description  a second, quieter line under the label
 */
export const Checkbox = forwardRef(function Checkbox({ label, description, className, ...props }, ref) {
  const autoId = useId();
  const id = props.id ?? `c${autoId.replace(/:/g, "")}`;
  return (
    <label className={cn("k-check", props.disabled && "is-disabled", className)} htmlFor={id}>
      <input ref={ref} type="checkbox" className="k-check-input" {...props} id={id} />
      <span className="k-check-box" aria-hidden="true">
        <Icons.Check size={12} sw={2.8} />
      </span>
      {(label || description) && (
        <span className="k-check-text">
          {label && <span className="k-check-label">{label}</span>}
          {description && <span className="k-check-desc">{description}</span>}
        </span>
      )}
    </label>
  );
});

/* ── Switch ───────────────────────────────────────────── */
/**
 * An on/off setting that takes effect as it flips.
 *
 *   checked, onChange  controlled; onChange receives the new boolean
 *   label              visible label beside the switch
 *   description        a second line under the label
 *   ariaLabel          the name when there is no visible label (a table row's own text names it)
 *   size               sm | md
 */
export function Switch({ checked, onChange, label, description, ariaLabel, disabled, size = "md", id, className }) {
  const autoId = useId();
  const switchId = id ?? `w${autoId.replace(/:/g, "")}`;
  const control = (
    <button
      type="button"
      role="switch"
      id={switchId}
      aria-checked={Boolean(checked)}
      aria-label={label ? undefined : ariaLabel}
      disabled={disabled}
      className={cn("k-switch", `k-switch--${size}`, checked && "is-on", !label && className)}
      onClick={() => onChange(!checked)}
    >
      <span className="k-switch-knob" aria-hidden="true" />
    </button>
  );
  if (!label) return control;
  return (
    <div className={cn("k-switch-row", disabled && "is-disabled", className)}>
      {control}
      <label htmlFor={switchId} className="k-check-text">
        <span className="k-check-label">{label}</span>
        {description && <span className="k-check-desc">{description}</span>}
      </label>
    </div>
  );
}
