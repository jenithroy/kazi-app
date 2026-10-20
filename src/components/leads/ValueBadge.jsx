/** The tier chip next to a lead's name — click for the evidence behind it,
 * never just an asserted number. Renders nothing until the bot has actually
 * scored the conversation. */

import { useRef, useState } from "react";
import { Popover } from "../chat/ChatBits";
import { VALUE_TIER_LABEL } from "../../lib/leadsFormat";

export default function ValueBadge({ value }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  if (!value?.tier) return null;

  return (
    <span className="kchat-value-anchor">
      <button
        ref={triggerRef}
        type="button"
        className={`kchat-value-chip kchat-value-chip--${value.tier}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        title="Why this lead is ranked here"
      >
        {value.tier === "high" && "🔥 "}
        {VALUE_TIER_LABEL[value.tier]}
      </button>

      <Popover open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} className="kchat-value-pop" label="Why this lead is ranked here" width={250} align="start">
        <div className="kchat-value-pop-score">
          {VALUE_TIER_LABEL[value.tier]}
          {Number.isFinite(value.score) ? ` · ${value.score}/100` : ""}
        </div>
        {value.reasons?.length > 0 ? (
          <ul>
            {value.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p>No detail yet.</p>
        )}
      </Popover>
    </span>
  );
}
