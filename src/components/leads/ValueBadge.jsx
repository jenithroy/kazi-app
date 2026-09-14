/** The tier chip next to a lead's name — click for the evidence behind it,
 * never just an asserted number. Renders nothing until the bot has actually
 * scored the conversation. */

import { useRef, useState } from "react";
import { useDismiss } from "../chat/ChatBits";
import { VALUE_TIER_LABEL } from "../../lib/leadsFormat";

export default function ValueBadge({ value }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const popRef = useDismiss(open, () => setOpen(false), triggerRef);

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
        title="Why this lead is ranked here"
      >
        {value.tier === "high" && "🔥 "}
        {VALUE_TIER_LABEL[value.tier]}
      </button>

      {open && (
        <div ref={popRef} className="kchat-value-pop" onClick={(e) => e.stopPropagation()}>
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
            <p style={{ margin: 0, fontSize: 11, color: "var(--ink-4)" }}>No detail yet.</p>
          )}
        </div>
      )}
    </span>
  );
}
