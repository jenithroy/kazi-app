import { useRef } from "react";
import { Icons } from "./Icons";
import { Progress } from "./Progress";
import { useElementWidth } from "./useElementWidth";
import { cn } from "./utils";

/* ── Stepper ──────────────────────────────────────────── */
/**
 * Where something has got to in a fixed run of stages: an order through the
 * ten production stages, a request through review.
 *
 *   steps      ["Order Received", …] or [{ value, label }]
 *   current    the index, or the value of the stage it is on
 *   onSelect   (step, index) => … turns the steps into buttons. Leave it off
 *              and they are a picture: Production moves stages with its own
 *              Previous and Advance buttons, which enforce the rules.
 *   label      what the run is, for screen readers ("Order stage")
 *   compactAt  below this width — its own, not the screen's — it becomes one
 *              line and a bar: "Stage 4 of 10 · Stitching"
 */
export function Stepper({ steps, current = 0, onSelect, label = "Progress", compactAt = 560, className }) {
  const ref = useRef(null);
  const width = useElementWidth(ref);

  const list = steps.map((step) => (typeof step === "string" ? { value: step, label: step } : step));
  const index = typeof current === "number"
    ? Math.max(0, Math.min(current, list.length - 1))
    : Math.max(0, list.findIndex((step) => step.value === current));
  const pct = list.length > 1 ? (index / (list.length - 1)) * 100 : 0;
  const now = list[index];
  const compact = width != null && width < compactAt;

  if (compact) {
    return (
      <div ref={ref} className={cn("k-step", "k-step--compact", className)}>
        <p className="k-step-now">
          <span className="k-step-count">Stage {index + 1} of {list.length}</span>
          <span aria-hidden="true"> · </span>
          <strong>{now?.label}</strong>
        </p>
        <Progress pct={pct} label={`${label}: stage ${index + 1} of ${list.length}, ${now?.label}`} />
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("k-step", className)}>
      <ol className="k-step-list" aria-label={label}>
        {list.map((step, i) => {
          const state = i < index ? "done" : i === index ? "current" : "todo";
          const inner = (
            <>
              <span className="k-step-mark" aria-hidden="true">
                {state === "done" ? <Icons.Check size={12} sw={3} /> : i + 1}
              </span>
              <span className="k-step-label">{step.label}</span>
            </>
          );
          return (
            <li
              key={step.value ?? i}
              className={cn("k-step-item", `is-${state}`)}
              aria-current={state === "current" ? "step" : undefined}
            >
              {onSelect
                ? <button type="button" className="k-step-btn" onClick={() => onSelect(step, i)}>{inner}</button>
                : inner}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
