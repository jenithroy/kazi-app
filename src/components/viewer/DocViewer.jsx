/**
 * DocViewer: the glass dialog a finished document is looked at in.
 *
 * It is the frame, not the document. The sheet itself (a letterhead, a table, a signature line) comes in as `children`
 * at its natural size (`paper`, A4 at 96 dpi by default) and is only ever scaled for the screen, on a wrapper, so whatever
 * the owner prints or saves is untouched and the viewer can show any other fixed sheet the same way.
 *
 *   header   what it is (title, the number), who it is for, how it stands          never scrolls
 *   stage    the sheet on a veiled pane: fit to width, the whole page, or a zoom   the only part that scrolls
 *   footer   zoom, Print, Download PDF (and a line saying why one did not work)     never scrolls
 *
 * It is a <Modal size="card" glass>, so it is the same glass, edge light, scrim, focus handling and phone bottom sheet as every other
 * card. On top of that it takes the keys a viewer is expected to take (Escape, + and - and 0 and 1 to zoom, Ctrl + P to print,
 * Ctrl + S to save) before the page behind can see them, and zooms with a trackpad pinch (Ctrl + wheel) and a two-finger pinch.
 *
 * Props
 *   title, number          "Tax Invoice", "INV-034" (the number is set in the mono face)
 *   meta                   short pieces for the line under the title: ["Client name", "12 Oct 2026"]
 *   status                 { text, tone } a small pill after them (tone: good | warn | bad | info)
 *   paper                  { width, height } of the sheet in CSS px
 *   banner                 something the person must know before trusting the sheet (a strip above it)
 *   notice                 { tone: "good" | "bad", text } what the last Print or Download said, in the footer
 *   busy, busyLabel        the file is being made: the button says so and ignores presses (aria-disabled, so the cursor stays)
 *   onPrint, onDownload    the two actions; a button is drawn only for one that is given
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Modal from "../Modal";
import { Ico, Icons } from "../ui";
import "./viewer.css";

const STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const MIN = STEPS[0];
const MAX = STEPS[STEPS.length - 1];
const FLOOR = 0.1;          // a fit never goes below this, however short the window
const clamp = (n, lo = MIN, hi = MAX) => Math.min(hi, Math.max(lo, n));

const PrinterIcon = (p) => <Ico {...p} s={<><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>} />;
const MinusIcon = (p) => <Ico {...p} d="M5 12h14" />;
const FitWidthIcon = (p) => <Ico {...p} s={<><path d="M3 12h18" /><path d="M7 8l-4 4 4 4" /><path d="M17 8l4 4-4 4" /></>} />;
const FitPageIcon = (p) => <Ico {...p} s={<><rect x="6.5" y="3" width="11" height="18" rx="2" /><path d="M9.5 8h5M9.5 12h5M9.5 16h3" /></>} />;
const SpinnerIcon = (p) => <Ico {...p} d="M21 12a9 9 0 1 1-6.22-8.56" />;

export default function DocViewer({
  title, number, meta = [], status, paper = { width: 794, height: 1123 }, banner, notice,
  busy = false, busyLabel = "Making the PDF…", downloadLabel = "Download PDF",
  onClose, onPrint, onDownload, children,
}) {
  const W = paper.width;
  const H = paper.height;
  const stageRef = useRef(null);

  // "width": as wide as the stage allows, never bigger than the sheet itself · "page": the whole sheet at once · a number: a chosen zoom
  const [zoom, setZoom] = useState("width");
  const [box, setBox] = useState({ w: 0, h: 0, l: 0, t: 0 });      // the room the sheet has inside the stage's padding

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const read = () => {
      const cs = getComputedStyle(el);
      const l = parseFloat(cs.paddingLeft) || 0;
      const t = parseFloat(cs.paddingTop) || 0;
      const next = {
        w: Math.max(0, el.clientWidth - l - (parseFloat(cs.paddingRight) || 0)),
        h: Math.max(0, el.clientHeight - t - (parseFloat(cs.paddingBottom) || 0)),
        l, t,
      };
      setBox((b) => (b.w === next.w && b.h === next.h && b.l === next.l && b.t === next.t ? b : next));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const measured = box.w > 0 && box.h > 0;
  const fitW = measured ? clamp(box.w / W, FLOOR, 1) : 1;
  const fitP = measured ? clamp(Math.min(box.w / W, box.h / H), FLOOR, 1) : 1;
  const scale = zoom === "width" ? fitW : zoom === "page" ? fitP : zoom;
  const percent = Math.round(scale * 100);
  const canFitPage = Math.abs(fitP - fitW) > 0.01;      // on a phone the two are the same sheet size: no button for it

  // Zooming keeps the point under the pointer (or the middle of the stage) where it was, so the sheet does not jump away from what is
  // being read. `anchor` is set by whatever asked for the zoom, in the stage's own coordinates.
  const scaleRef = useRef(scale);
  const prevScale = useRef(null);
  const anchor = useRef(null);
  useLayoutEffect(() => {
    const el = stageRef.current;
    const before = prevScale.current;
    prevScale.current = scale;
    scaleRef.current = scale;
    if (!el || before == null || before === scale) return;
    const a = anchor.current || { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    anchor.current = null;
    // where the sheet's corner sits in the scrolled area at a scale (the sheet is centred while it is smaller than the room)
    const at = (s) => ({ l: box.l + Math.max(0, (box.w - W * s) / 2), t: box.t + Math.max(0, (box.h - H * s) / 2) });
    const b = at(before);
    const n = at(scale);
    const u = (el.scrollLeft + a.x - b.l) / before;      // the point of the sheet under the anchor, in sheet pixels
    const v = (el.scrollTop + a.y - b.t) / before;
    el.scrollLeft = Math.max(0, u * scale + n.l - a.x);
    el.scrollTop = Math.max(0, v * scale + n.t - a.y);
  }, [scale]);                                           // eslint-disable-line react-hooks/exhaustive-deps

  // A key or a button zooms about the middle of the stage, not about where a pinch last was
  const zoomTo = useCallback((z) => { anchor.current = null; setZoom(z); }, []);
  const stepZoom = useCallback((dir) => {
    const cur = scaleRef.current;
    zoomTo(dir > 0
      ? STEPS.find((s) => s > cur + 0.004) ?? MAX
      : [...STEPS].reverse().find((s) => s < cur - 0.004) ?? MIN);
  }, [zoomTo]);
  const toggleFit = () => zoomTo(zoom === "page" ? "width" : "page");

  // The latest callbacks, for the listeners that are put up once
  const live = useRef({});
  live.current = { onClose, onPrint, onDownload, stepZoom, zoomTo, busy };

  // Keys. They are taken in the capture phase, before the page behind (or a card behind it) can see them: an Escape that closed this
  // must not also close the card under it, and Ctrl + P must print the sheet, not the app around it.
  useEffect(() => {
    const onKey = (e) => {
      const fn = live.current;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.preventDefault(); e.stopPropagation();
        fn.onClose?.();
        return;
      }
      if (e.key === "Tab") {
        // Modal keeps Tab inside while the cursor is in it; this brings it back in when it has strayed (a closed menu, a removed button)
        const panel = stageRef.current?.closest(".kmodal");
        if (panel && !panel.contains(document.activeElement)) {
          const stops = [...panel.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null);
          if (stops.length) { e.preventDefault(); (e.shiftKey ? stops[stops.length - 1] : stops[0]).focus(); }
        }
        return;
      }
      if (mod && !e.shiftKey && !e.altKey && /^p$/i.test(e.key) && fn.onPrint) { e.preventDefault(); e.stopPropagation(); fn.onPrint(); return; }
      if (mod && !e.shiftKey && !e.altKey && /^s$/i.test(e.key) && fn.onDownload) { e.preventDefault(); e.stopPropagation(); if (!fn.busy) fn.onDownload(); return; }
      if (mod || e.altKey) return;
      if (e.key === "+" || e.key === "=") { e.preventDefault(); fn.stepZoom(1); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); fn.stepZoom(-1); }
      else if (e.key === "0") { e.preventDefault(); fn.zoomTo("width"); }
      else if (e.key === "1") { e.preventDefault(); fn.zoomTo(1); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // The cursor starts on the sheet, so the arrow keys, Page Up / Down, Home and End scroll it at once. (Modal puts it on the dialog
  // first; this runs after that.)
  useEffect(() => {
    const raf = requestAnimationFrame(() => stageRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Zoom with the hands: a trackpad pinch arrives as Ctrl + wheel, a finger pinch as two touches. Both need listeners that may cancel the
  // browser's own page zoom, which a React prop cannot say.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const local = (cx, cy) => { const r = el.getBoundingClientRect(); return { x: cx - r.left - el.clientLeft, y: cy - r.top - el.clientTop }; };

    // Move to a new zoom about a point, unless it is where it already is (at 25% or 300% the anchor would be left over for the next zoom)
    const zoomAbout = (next, x, y) => {
      if (Math.abs(next - scaleRef.current) < 0.0005) return;
      anchor.current = { x, y };
      setZoom(next);
    };

    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = clamp(Math.exp(-e.deltaY * 0.01), 0.8, 1.25);       // a mouse notch is about a step; a pinch sends many small ones
      const p = local(e.clientX, e.clientY);
      zoomAbout(clamp(scaleRef.current * factor), p.x, p.y);
    };

    let pinch = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e) => {
      if (e.touches.length === 2) pinch = { d: dist(e.touches), s: scaleRef.current };
      else pinch = null;
    };
    const onTouchMove = (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const t = e.touches;
      const p = local((t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2);
      zoomAbout(clamp(pinch.s * (dist(t) / pinch.d)), p.x, p.y);
    };
    const onTouchEnd = (e) => { if (e.touches.length < 2) pinch = null; };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const press = (fn) => () => { if (!busy) fn?.(); };

  const heading = (
    <>
      {title}
      {number ? <span className="dv-num">{number}</span> : null}
    </>
  );
  const pieces = meta.filter(Boolean);
  const sub = (pieces.length || status) ? (
    <span className="dv-sub">
      {pieces.map((m, i) => <span key={i} className={i === 0 ? "dv-first" : undefined}>{m}</span>)}
      {status ? <span className={`dv-tag${status.tone ? ` dv-tag--${status.tone}` : ""}`}>{status.text}</span> : null}
    </span>
  ) : null;

  const footer = (
    <>
      {notice ? (
        <p className={`kmodal-msg dv-msg dv-msg--${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}>{notice.text}</p>
      ) : null}

      <div className="dv-zoom" role="group" aria-label="Zoom">
        <button type="button" className="dv-zb" onClick={() => stepZoom(-1)} aria-disabled={scale <= MIN + 0.004} aria-label="Zoom out" title="Zoom out (−)">
          <MinusIcon size={16} sw={1.9} aria-hidden="true" />
        </button>
        <span className="dv-pct" role="status" aria-label={`Zoom ${percent} percent`}>{percent}%</span>
        <button type="button" className="dv-zb" onClick={() => stepZoom(1)} aria-disabled={scale >= MAX - 0.004} aria-label="Zoom in" title="Zoom in (+)">
          <Icons.Plus size={16} sw={1.9} aria-hidden="true" />
        </button>
        {canFitPage ? (
          <>
            <span className="dv-zsep" aria-hidden="true" />
            <button type="button" className="dv-zb" onClick={toggleFit} aria-label={zoom === "page" ? "Fit to width" : "Show the whole page"} title={zoom === "page" ? "Fit to width (0)" : "Show the whole page"}>
              {zoom === "page" ? <FitWidthIcon size={16} sw={1.8} aria-hidden="true" /> : <FitPageIcon size={16} sw={1.8} aria-hidden="true" />}
            </button>
          </>
        ) : null}
      </div>

      {onPrint ? (
        <button type="button" className="ghost-button dv-print" onClick={onPrint} aria-label="Print" title="Print (Ctrl + P)">
          <PrinterIcon size={15} sw={1.9} aria-hidden="true" />
          <span className="dv-lbl">Print</span>
        </button>
      ) : null}
      {onDownload ? (
        <button type="button" className="primary-button dv-download" onClick={press(onDownload)} aria-disabled={busy} aria-busy={busy} title="Download as a PDF file (Ctrl + S)">
          {busy ? <SpinnerIcon size={15} sw={2.2} className="dv-spin" aria-hidden="true" /> : <Icons.Download size={15} sw={1.9} aria-hidden="true" />}
          {busy ? busyLabel : downloadLabel}
        </button>
      ) : null}
    </>
  );

  return (
    <Modal title={heading} subtitle={sub} size="card" glass className="kmodal--viewer" onClose={onClose} footer={footer}>
      {banner ? (
        <div className="dv-banner" role="status">
          <Icons.Alert size={16} sw={1.8} aria-hidden="true" />
          <span>{banner}</span>
        </div>
      ) : null}

      <div ref={stageRef} className="dv-stage" tabIndex={0} role="region" aria-label={`${title} ${number || ""}, preview`.replace(/\s+/g, " ").trim()}>
        <div className="dv-paper" style={{ width: W * scale, height: H * scale }}>
          <div className="dv-sheet" style={{ width: W, height: H, transform: `scale(${scale})` }}>
            {children}
          </div>
        </div>
      </div>
    </Modal>
  );
}
