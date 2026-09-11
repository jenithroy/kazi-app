import { createContext, useContext, useId } from "react";
import { Icons } from "./Icons";
import { cn } from "./utils";

/* ── Field ────────────────────────────────────────────── */

const FieldContext = createContext(null);

/**
 * What a kit control inside a Field needs to wire itself up: its id (so the
 * label points at it), the ids of the hint and error that describe it, and
 * whether it is invalid or required. Controls outside a Field get null.
 */
export const useField = () => useContext(FieldContext);

/**
 * A label, one control, and the words around it.
 *
 *   <Field label="Quantity" hint="Pieces, not dozens" error={errors.qty} required span={2}>
 *     <Input type="number" value={qty} onChange={…} />
 *   </Field>
 *
 *   label     the field's name, short
 *   hint      a line under the control saying what to enter or what it affects
 *   error     what is wrong and how to fix it; marks the control invalid
 *   required  shows a marker and sets `required` on a kit control
 *   optional  says "optional" instead, for a form where most fields are required
 *   span      2 | 3 | 4 | "full": columns to take inside a FormGrid
 *   htmlFor   the id of a control that is not a kit one (KeyboardSelect, a
 *             page's own component), so the label still points at it
 *
 * Kit controls (Input, Select, Textarea) pick up the id, description and
 * invalid state on their own; nothing needs threading through by hand.
 */
export function Field({ label, hint, error, required = false, optional = false, span, htmlFor, children, className }) {
  const autoId = useId();
  const id = htmlFor || `f${autoId.replace(/:/g, "")}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("k-field", span && `k-span-${span}`, error && "is-invalid", className)}>
      {label && (
        <label className="k-field-label" htmlFor={id}>
          {label}
          {required && <span className="k-field-req" aria-hidden="true">*</span>}
          {optional && !required && <span className="k-field-opt">optional</span>}
        </label>
      )}
      <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error), required }}>
        {children}
      </FieldContext.Provider>
      {hint && <p id={hintId} className="k-field-hint">{hint}</p>}
      {error && (
        <p id={errorId} className="k-field-error">
          <Icons.Alert size={13} sw={2} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/* ── Form layout ──────────────────────────────────────── */

/**
 * Lays fields out in columns that collapse as the form gets narrow. It reads
 * the form's own width, not the screen's, so a form in a narrow sheet on a
 * desktop collapses the way it would on a phone.
 *
 *   columns  the most columns on a wide form: 1 | 2 | 3 | 4
 *
 * Fields widen with <Field span={2}> or span="full". A span never exceeds the
 * columns available at the current width.
 */
export function FormGrid({ columns = 2, children, className }) {
  return (
    <div className="k-form-wrap">
      <div className={cn("k-form-grid", `k-form-grid--${columns}`, className)}>{children}</div>
    </div>
  );
}

/** A titled group of fields inside a long form: Details, Assignment, Schedule. */
export function FormSection({ title, description, children, className }) {
  const headingId = `s${useId().replace(/:/g, "")}`;
  return (
    <section className={cn("k-form-section", className)} aria-labelledby={headingId}>
      <div className="k-form-section-head">
        <h3 id={headingId} className="k-form-section-title">{title}</h3>
        {description && <p className="k-form-section-desc">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * The row of buttons that ends a form: secondary actions first, the primary
 * last. `note` is a line of context on the left (what saving will do).
 */
export function FormActions({ note, children, className }) {
  return (
    <div className={cn("k-form-actions", className)}>
      {note && <p className="k-form-actions-note">{note}</p>}
      <div className="k-form-actions-btns">{children}</div>
    </div>
  );
}
