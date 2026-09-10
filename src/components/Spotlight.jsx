import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getTour } from "../lib/tours";

/**
 * The "Show me" overlay.
 *
 * Roles links to a page with ?tour=<key>; this finds the control that tour is
 * about, rings it, and says what it's for. Mounted once in the layout, so it
 * works on whatever page the link lands on and no page has to know it exists
 * beyond putting data-tour on the one element.
 *
 * It does not try to drive the app. An overlay that waits for you to click the
 * real button has to know what "done" looks like for every flow, and breaks
 * silently the day a button becomes a menu item. This says its piece, gets out
 * of the way, and leaves you on the page with the thing you were looking for.
 *
 * The anchor is polled rather than read once: pages here fetch before they
 * render, so the target usually isn't in the DOM when the route settles.
 */

const FIND_TIMEOUT_MS = 5000;
const PAD = 8;          // breathing room around the ringed element
const TIP_GAP = 14;     // between ring and tooltip
const TIP_W = 340;

export default function Spotlight() {
  const [params, setParams] = useSearchParams();
  const key = params.get("tour");
  const tour = getTour(key);
  const stepIdx = Math.max(0, Math.min(Number(params.get("step") || 0), (tour?.steps.length || 1) - 1));
  const step = tour?.steps[stepIdx];

  const [rect, setRect] = useState(null);
  const [missing, setMissing] = useState(false);
  const tipRef = useRef(null);

  const close = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("tour");
    next.delete("step");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const goto = useCallback((i) => {
    const next = new URLSearchParams(params);
    next.set("step", String(i));
    setParams(next, { replace: true });
  }, [params, setParams]);

  /* Find the anchor. It may not exist yet — or at all, if this person's role
     is view-only and the control was never rendered. Both are normal. */
  useEffect(() => {
    if (!step) return undefined;
    setRect(null);
    setMissing(false);

    let raf = 0;
    let settle = 0;
    const started = Date.now();

    const tick = () => {
      const el = document.querySelector(`[data-tour="${step.anchor}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        // Let the smooth scroll settle before measuring, or the ring lands
        // where the element used to be.
        settle = setTimeout(() => setRect(el.getBoundingClientRect()), 320);
        return;
      }
      if (Date.now() - started > FIND_TIMEOUT_MS) { setMissing(true); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearTimeout(settle); };
  }, [step?.anchor, stepIdx, key]);

  /* Keep the ring on the element while the page moves under it. */
  useLayoutEffect(() => {
    if (!step || missing) return undefined;
    const sync = () => {
      const el = document.querySelector(`[data-tour="${step.anchor}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [step?.anchor, missing]);

  /* Esc is the way out of anything. */
  useEffect(() => {
    if (!tour) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" && stepIdx < tour.steps.length - 1) goto(stepIdx + 1);
      if (e.key === "ArrowLeft" && stepIdx > 0) goto(stepIdx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, stepIdx, close, goto]);

  if (!tour || !step) return null;

  const last = stepIdx === tour.steps.length - 1;

  /* Tooltip below the ring where there's room, above where there isn't, and
     centred when there's nothing to ring at all. */
  let tipStyle = { left: "50%", top: "50%", transform: "translate(-50%,-50%)" };
  if (rect && !missing) {
    const belowRoom = window.innerHeight - rect.bottom;
    const above = belowRoom < 220 && rect.top > 240;
    const left = Math.min(
      Math.max(12, rect.left + rect.width / 2 - TIP_W / 2),
      Math.max(12, window.innerWidth - TIP_W - 12),
    );
    tipStyle = above
      ? { left, bottom: window.innerHeight - rect.top + PAD + TIP_GAP }
      : { left, top: rect.bottom + PAD + TIP_GAP };
  }

  return (
    <div className="kspot" role="dialog" aria-modal="true" aria-label={tour.label}>
      <div className="kspot-scrim" onClick={close} />

      {rect && !missing && (
        <div
          className="kspot-ring"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      )}

      <div className="kspot-tip" ref={tipRef} style={{ ...tipStyle, width: TIP_W }}>
        <div className="kspot-tip-head">
          <span className="kspot-tip-flow">{tour.label}</span>
          <button type="button" className="kspot-x" onClick={close} aria-label="Close">✕</button>
        </div>

        {missing ? (
          <>
            <div className="kspot-tip-title">That control isn't on your screen</div>
            <p className="kspot-tip-body">
              Usually this means your role can view this page but not change it, so the button
              was never drawn. If you're meant to be logging here, ask an administrator to
              check your position — or report it and we'll look.
            </p>
          </>
        ) : (
          <>
            <div className="kspot-tip-title">{step.title}</div>
            <p className="kspot-tip-body">{step.body}</p>
          </>
        )}

        <div className="kspot-tip-foot">
          <span className="kspot-dots">
            {tour.steps.map((_, i) => (
              <span key={i} className={i === stepIdx ? "kspot-dot kspot-dot--on" : "kspot-dot"} />
            ))}
          </span>
          <div className="kspot-btns">
            {stepIdx > 0 && (
              <button type="button" className="ghost-button kspot-btn" onClick={() => goto(stepIdx - 1)}>Back</button>
            )}
            {last || missing ? (
              <button type="button" className="primary-button kspot-btn" onClick={close}>Got it</button>
            ) : (
              <button type="button" className="primary-button kspot-btn" onClick={() => goto(stepIdx + 1)}>Next</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
