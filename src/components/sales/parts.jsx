import { cn } from "../ui";
import { initialsOf, stageRamp, stageShort } from "../../lib/sales";

/**
 * Small pieces the Sales tiles share. They read the page's `--kb-*` tokens (sales.css), so
 * light, dark and the glass of whatever pane they sit in come for free.
 */

/** A customer's initials in the table's little rounded square (`dt-thumb`). A company is not a person, so it gets no photo and no colour of its own. */
export function Initials({ name }) {
  return <span className="dt-thumb" aria-hidden="true">{initialsOf(name)}</span>;
}

/** The stage as a quiet pill: a dot in its step of the colour ramp, then its name. */
export function StageTag({ stage, short }) {
  return (
    <span className={cn("sl-stage", `sl-r${stageRamp(stage)}`)}>
      <i aria-hidden="true" />
      <span>{short ? stageShort(stage) : stage || "—"}</span>
    </span>
  );
}
