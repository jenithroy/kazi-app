import { cn } from "../ui";

/** Roll call or report: the two things the middle of the team page can be. Two toggle buttons, one pressed. */
export default function ModeSwitch({ mode, onMode }) {
  return (
    <div className="at-seg" role="group" aria-label="View">
      {[["day", "Roll call"], ["report", "Report"]].map(([id, label]) => (
        <button key={id} type="button" className={cn("at-seg-btn", mode === id && "is-on")} aria-pressed={mode === id} onClick={() => onMode(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
