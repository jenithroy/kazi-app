import { cn } from "../ui";
import { STAGES, rampOf, stageIndex, stageShort } from "../../lib/production";

/**
 * The ten steps as ten short segments, filled up to the order's stage in that stage's step of
 * the colour ramp (pale at the start, deep at the end). It says the same thing as the stage
 * name beside it, so it is hidden from a screen reader.
 */
export function StageBar({ stage, className }) {
  const at = stageIndex(stage);
  return (
    <span className={cn("pr-seg", `pr-r${rampOf(stage)}`, className)} aria-hidden="true">
      {STAGES.map((s, i) => <i key={s} className={i <= at ? "is-on" : undefined} />)}
    </span>
  );
}

/** The stage as a quiet pill: a dot in its step of the ramp, then its name. */
export function StageTag({ stage, short, className }) {
  return (
    <span className={cn("pr-stage", `pr-r${rampOf(stage)}`, className)}>
      <i aria-hidden="true" />
      {short ? stageShort(stage) : stage}
    </span>
  );
}
