
/**
 * The first-visit tour: a few cards that walk through the screen, each pointing at the part it talks about (a spotlight over the page
 * with that part left bright). It starts by itself only for someone who has never seen it (`tourSeen`), once they finish or skip it is
 * remembered on this computer, and it can be taken again from the help (Help.jsx).
 *
 * Keys: Esc leaves it, the arrow keys go back and forward, Tab stays on the card. It is a dialog over the page: while it is open the page
 * behind does not take clicks or keys (DigitizerEditor.jsx checks for `.dz-tour`).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const KEY = "kazi.digitizer.tour";
let seenHere = false; // where storage is blocked the tour is shown once per visit, not again at every step

/** Has this person seen (finished or skipped) the tour? */
export const tourSeen = () => {
  if (seenHere) return true;
  try { return localStorage.getItem(KEY) !== null; } catch { return false; }
};
const markSeen = () => {
  seenHere = true;
  try { localStorage.setItem(KEY, "1"); } catch { /* blocked: `seenHere` holds for this visit */ }
};

/**
 * `target`: a selector, or a list of them (the first that is on the page); none: the card is in the middle. `before(api)` sets the page up for
 * the step (the step of the editor it is about). `placement`: which side of the target the card prefers.
 */
export const TOUR = [
  {
    id: "welcome",
    title: "Welcome",
    text: "A quick tour of the embroidery digitizer: it turns a logo or lettering into a machine stitch file. Everything runs in your browser, and your pictures are never uploaded.",
  },
  {
    id: "start",
    target: [".dz-card-empty", ".dz-canvas-wrap"],
    placement: "right",
    title: "Start with a picture",
    text: "Drop your logo here, paste it with Ctrl+V, or choose a file. No picture to hand? Press Try the Kazi logo.",
  },
  {
    id: "steps",
    target: ".dz-steps-hd",
    placement: "left",
    title: "Three steps",
    text: "Picture turns your picture into shapes. Design is where you move, resize and recolour them and add text. Stitches shows the real stitches and saves the file for your machine.",
  },
  {
    id: "threads",
    before: (api) => api.setMode("picture"),
    target: '[data-tour="threads"]',
    placement: "left",
    title: "Your own threads",
    text: "Add the threads you have, and the picture is made in those colours only. Add none and it keeps its own colours.",
  },
  {
    id: "tools",
    before: (api) => api.setMode("design"),
    target: ".dz-rail",
    placement: "right",
    title: "Tools",
    text: "Select and move, draw shapes, add text, trace by hand, undo, open and save. Hover a button to see its name and its key.",
  },
  {
    id: "objects",
    target: '[data-tour="objects"]',
    placement: "right",
    title: "Objects",
    text: "Everything in the design, in the order it is sewn. Hide a shape, lock it, rename it or drag it to change when it is sewn.",
  },
  {
    id: "view",
    target: ".dz-chip",
    placement: "top",
    title: "Zoom and look",
    text: "Scroll to zoom, hold Space and drag to move around, and press Fit to see the whole hoop. The grid and the rulers are here too.",
  },
  {
    id: "save",
    target: ".dz-card-ft",
    placement: "left",
    title: "Save the file",
    text: "When it looks right, download the stitch file. DST works on most machines; the Stitches step also saves PES, EXP, JEF, VP3 and XXX.",
  },
  {
    id: "help",
    target: ".dz-help-btn",
    placement: "bottom",
    title: "Need more?",
    text: "Press ? at any time for short videos of every feature, or to take this tour again.",
  },
];

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Where the card goes: beside the target on the preferred side if it fits there without covering it, else another side, else the middle. */
function place(rect, w, h, pref = "right") {
  const vw = window.innerWidth, vh = window.innerHeight, margin = 12, gap = 16;
  if (!rect) return { left: Math.max(margin, (vw - w) / 2), top: Math.max(margin, (vh - h) / 2) };
  const spots = {
    right: [rect.right + gap, rect.top + rect.height / 2 - h / 2],
    left: [rect.left - gap - w, rect.top + rect.height / 2 - h / 2],
    bottom: [rect.left + rect.width / 2 - w / 2, rect.bottom + gap],
    top: [rect.left + rect.width / 2 - w / 2, rect.top - gap - h],
  };
  const covers = (l, t) => l < rect.right && l + w > rect.left && t < rect.bottom && t + h > rect.top;
  for (const side of [pref, ...["right", "left", "bottom", "top"].filter((s) => s !== pref)]) {
    const left = clamp(spots[side][0], margin, Math.max(margin, vw - w - margin));
    const top = clamp(spots[side][1], margin, Math.max(margin, vh - h - margin));
    if (!covers(left, top)) return { left, top };
  }
  return { left: clamp(rect.left + 16, margin, Math.max(margin, vw - w - margin)), top: clamp(rect.bottom - h - 16, margin, Math.max(margin, vh - h - margin)) };
}

export default function Tour({ api, onClose }) {
  const [i, setI] = useState(0);
  const step = TOUR[i];
  const [box, setBox] = useState({ rect: null, card: { left: 12, top: 12 } });
  const card = useRef(null);
  const next = useRef(null);
  const apiRef = useRef(api);
  apiRef.current = api;
  const startMode = useRef(api.mode);
  const last = i === TOUR.length - 1;

  const finish = useCallback(() => {
    markSeen();
    const a = apiRef.current;
    if (a.mode !== startMode.current && !a.design.reference) a.setMode(startMode.current); // the step the person was in comes back
    onClose();
  }, [onClose]);

  const measure = useCallback(() => {
    const s = TOUR[i];
    const el = s.target ? [].concat(s.target).map((q) => document.querySelector(q)).find(Boolean) : null;
    const r = el ? el.getBoundingClientRect() : null;
    const rect = r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
    const c = card.current;
    setBox({ rect, card: place(rect, c ? c.offsetWidth : 320, c ? c.offsetHeight : 190, s.placement) });
  }, [i]);

  // A step sets the page up (which step of the editor), brings its target into view (a phone stacks the page and scrolls), then measures: the
  // panel may take a moment to change, and everything is measured again if the window changes.
  useEffect(() => {
    TOUR[i].before?.(apiRef.current);
    const t = setTimeout(() => {
      const el = TOUR[i].target ? [].concat(TOUR[i].target).map((q) => document.querySelector(q)).find(Boolean) : null;
      el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      measure();
    }, 90);
    return () => clearTimeout(t);
  }, [i, measure]);
  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [measure]);
  useEffect(() => { next.current?.focus({ preventScroll: true }); }, [i]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); if (last) finish(); else setI((n) => n + 1); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); setI((n) => Math.max(0, n - 1)); return; }
      if (e.key === "Tab" && card.current) {
        const items = [...card.current.querySelectorAll("button:not([disabled])")];
        if (!items.length) return;
        const first = items[0], end = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
        else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
        else if (!card.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [finish, last]);

  const { rect } = box;
  return createPortal(
    <div className="dz-tour">
      {/* nothing behind the tour takes a click while it is open */}
      <div className="dz-tour-block" />
      {rect
        ? <div className="dz-tour-hole" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />
        : <div className="dz-tour-dim" />}
      <div ref={card} className="dz-tour-card" role="dialog" aria-modal="true" aria-labelledby="dz-tour-title" aria-describedby="dz-tour-text" style={{ left: box.card.left, top: box.card.top }}>
        <p className="dz-tour-count" aria-live="polite">Step {i + 1} of {TOUR.length}</p>
        <h2 id="dz-tour-title">{step.title}</h2>
        <p id="dz-tour-text">{step.text}</p>
        <div className="dz-tour-foot">
          <button type="button" className="dz-linkbtn" onClick={finish}>Skip tour</button>
          <span className="dz-tour-dots" aria-hidden="true">{TOUR.map((s, k) => <i key={s.id} className={k === i ? "is-on" : k < i ? "is-done" : ""} />)}</span>
          {i > 0 && <button type="button" className="kb-btn" onClick={() => setI(i - 1)}>Back</button>}
          <button type="button" ref={next} className="kb-btn kb-btn--primary" onClick={() => (last ? finish() : setI(i + 1))}>{last ? "Done" : "Next"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
