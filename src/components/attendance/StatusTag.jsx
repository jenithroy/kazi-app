import { STATE_LABEL, STATE_TONE } from "../../lib/attendance";
import { cn } from "../ui";

/** How a day went, in a word and a colour (the page's own words: lib/attendance.js). */
export default function StatusTag({ state, children, className }) {
  const tone = STATE_TONE[state];
  return (
    <span className={cn("kb-tag", tone && tone !== "mute" && `kb-tag--${tone}`, className)}>
      {children ?? STATE_LABEL[state]}
    </span>
  );
}
