/**
 * The measurement board: the owner's main ask. Measurements are done in the ERP with dots. Two taps on a picture draw a lettered
 * line; the number for each size is typed in the table beside it; the sheet prints both.
 *
 * Left: the picture of one view, with every line drawn on it (red lines, a dot at each end, the letter in a small circle in the
 * middle). Right: one row per line (letter, name, a number box per size) and the controls that go with it (unit, reference size,
 * "Start from a garment").
 *
 * How a line is drawn. Positions are FRACTIONS of the picture's own rectangle (0 to 1), never pixels, so a line lands in the same
 * place on a laptop, a phone and a printout. The `<img>` sits in a wrapper that shrinks to the image (`inline-block`, no padding), so
 * the wrapper IS the picture's rectangle and a pointer position is `(clientX - rect.left) / rect.width`. Two taps make a line: the
 * first drops a pulsing start dot, the second finishes it. Press, drag and let go also works. A tap on the start dot, or Escape,
 * cancels a half-drawn line; a tap within 2% of the start is ignored rather than making a line of no length.
 *
 * Without a pointer: "Add a line without drawing" makes a row; "Draw this one" arms a row so the next two taps fill its line; the
 * picture itself takes the keyboard (Enter places a line in the middle), and the dots at the ends of a line are buttons that the
 * arrow keys move (1%, Shift 5%) and Delete takes off the picture (the row and its numbers stay).
 *
 * Letters are never typed: `letterFor(index)` is worked out again whenever a line is added, removed or moved, so the sheet never
 * has a gap. The numbers are text (what was typed: "11,5" with a comma is fine) and are never parsed.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Field, Seg } from "../EditCard";
import Select from "../Select";
import Suggest from "../Suggest";
import { Icons, cn } from "../ui";
import { letterFor, MEASURE_TEMPLATES, UNITS } from "../../lib/techpack";
import { droppedSizes } from "../../lib/techpackWrites";
import { Flow, useEditor } from "./editorContext";
import { focusBack, focusLater, ArrowDown, ArrowUp } from "./Pictures";
import {
  addTemplateRows, appendPoint, blankPoint, boardSizes, hasPicture, movePoint, nameSuggestions, NUMBER_NOTE, numberKeyRefused, patchPoint,
  pickBoardView, removePoint, reletter, sanitizeNumber, setPointValue, viewName,
} from "./editorModel";

const MIN_GAP = 0.02;            // a second tap closer than this to the first is not a line
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const coarse = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pct = (n) => `${(n * 100).toFixed(3)}%`;
const mid = (l) => ({ x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2 });
const UNIT_OPTIONS = UNITS.map((u) => [u.id, u.label]);
const TEMPLATE_OPTIONS = MEASURE_TEMPLATES.map((t) => ({ value: t.id, label: t.label, hint: `${t.names.length} lines` }));

/** Keep the pointer's moves coming to `el` even when it leaves it. A browser may refuse (the pointer is already gone): the drawing goes on without. */
function capture(el, id) {
  try { el?.setPointerCapture?.(id); } catch { /* not needed to draw */ }
}

/** Where a pointer is on the picture, as fractions, clamped to the picture. */
function fracOf(e, el) {
  const r = el?.getBoundingClientRect();
  if (!r || !r.width || !r.height) return null;
  return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
}

/* ── The picture ───────────────────────────────────────────────── */

function Picture({ view, points, selectedId, onSelect, canEdit, drawing, onLine, onCancelDraw, pending, onPending, armedPoint, onTakeOff, onNudge, onDrag, picRef, announce, onNote }) {
  const downRef = useRef(null);                        // { id, fresh } the press that is on the picture now
  const dragRef = useRef(null);                        // { id, end, dx, dy, pointerId } an end dot being moved
  const [cursor, setCursor] = useState(null);          // where the pointer is, for the line that follows it after the first tap
  const pendingRef = useRef(null);
  pendingRef.current = pending;

  function down(e) {
    if (!canEdit || (e.pointerType === "mouse" && e.button !== 0)) return;
    const at = fracOf(e, picRef.current);
    if (!at) return;
    capture(picRef.current, e.pointerId);
    onNote?.("");
    const onDot = Boolean(e.target.closest?.(".tpe-start"));
    if (!pendingRef.current) {
      pendingRef.current = at;
      onPending(at);
      downRef.current = { id: e.pointerId, fresh: true, onDot: false };
    } else {
      downRef.current = { id: e.pointerId, fresh: false, onDot };
    }
    setCursor(at);
  }
  function move(e) {
    if (!pendingRef.current) return;
    const at = fracOf(e, picRef.current);
    if (at) setCursor(at);
  }
  function up(e) {
    const d = downRef.current;
    if (!d || d.id !== e.pointerId) return;
    downRef.current = null;
    const start = pendingRef.current;
    const at = fracOf(e, picRef.current);
    if (!start || !at) return;
    if (dist(start, at) >= MIN_GAP) { setCursor(null); onLine(start, at, false, e.pointerType); }
    else if (d.onDot && !d.fresh) { setCursor(null); onCancelDraw(); announce("Line cancelled."); }       // pressed the start dot and let go on it
    // any other tap within 2% of the start: the first tap stays as the start; a later one is ignored, never a line of no length
  }
  function cancel(e) {
    if (downRef.current && downRef.current.id === e.pointerId && downRef.current.fresh) onPending(null);
    downRef.current = null;
  }
  const clearCursor = () => { if (!pendingRef.current) setCursor(null); };

  // the keyboard's way to a first line: Enter on the picture places one in the middle, then the arrow keys move its ends
  function pictureKeys(e) {
    if (e.target !== e.currentTarget) return;
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (step && points.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const at = points.findIndex((p) => p.id === selectedId);
      const to = at < 0 ? (step > 0 ? 0 : points.length - 1) : (at + step + points.length) % points.length;
      const p = points[to];
      onSelect(p.id);
      announce(`Line ${p.letter}${p.label.trim() ? `, ${p.label.trim()}` : ""} chosen. Press Tab to move its ends with the arrow keys.`);
      return;
    }
    if (!canEdit) return;
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      onLine(null, null, true);
    }
  }

  function dotDown(e, p, end) {
    e.stopPropagation();
    onSelect(p.id);
    if (!canEdit) return;
    const at = fracOf(e, picRef.current);
    const now = end === 1 ? { x: p.line.x1, y: p.line.y1 } : { x: p.line.x2, y: p.line.y2 };
    capture(e.currentTarget, e.pointerId);
    dragRef.current = { id: p.id, end, pointerId: e.pointerId, dx: at ? now.x - at.x : 0, dy: at ? now.y - at.y : 0 };
  }
  function dotMove(e) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const at = fracOf(e, picRef.current);
    if (at) onDrag(d.id, d.end, clamp01(at.x + d.dx), clamp01(at.y + d.dy));
  }
  function dotUp(e) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }
  function dotKeys(e, p, end) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const by = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (by) {
      e.preventDefault();
      e.stopPropagation();
      if (canEdit) onNudge(p.id, end, by[0], by[1]);
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && canEdit) {
      e.preventDefault();
      e.stopPropagation();
      onTakeOff(p.id);
    }
  }

  const src = view.preview || view.url;
  return (
    <div className="tpe-stage">
      <div
        ref={picRef}
        className={cn("tpe-pic", canEdit && "is-live", drawing && "is-drawing")}
        role="group" tabIndex={canEdit || points.length ? 0 : undefined}
        aria-label={`${viewName(view)}. ${points.length ? "Arrow keys choose a line. " : ""}${canEdit ? "Press Enter to place a new line in the middle, then Tab to its ends and move them with the arrow keys." : ""}`.trim()}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onPointerLeave={clearCursor}
        onKeyDown={pictureKeys} onContextMenu={(e) => { if (canEdit) e.preventDefault(); }}
      >
        <img src={src} alt={`${viewName(view)}, the picture the lines are drawn on`} draggable={false} />
        <svg className="tpe-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {points.map((p) => (
            <g key={p.id} className={cn("tpe-line", p.id === selectedId && "is-sel")}>
              <line className="tpe-hit" x1={p.line.x1 * 100} y1={p.line.y1 * 100} x2={p.line.x2 * 100} y2={p.line.y2 * 100} vectorEffect="non-scaling-stroke"
                onPointerDown={(e) => { e.stopPropagation(); onSelect(p.id, true); }} />
              <line className="tpe-halo" x1={p.line.x1 * 100} y1={p.line.y1 * 100} x2={p.line.x2 * 100} y2={p.line.y2 * 100} vectorEffect="non-scaling-stroke" />
              <line className="tpe-stroke" x1={p.line.x1 * 100} y1={p.line.y1 * 100} x2={p.line.x2 * 100} y2={p.line.y2 * 100} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          {pending && cursor && (
            <line className="tpe-rubber" x1={pending.x * 100} y1={pending.y * 100} x2={cursor.x * 100} y2={cursor.y * 100} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {points.map((p) => {
          const m = mid(p.line);
          const sel = p.id === selectedId;
          const name = p.label.trim() ? `line ${p.letter}, ${p.label.trim()}` : `line ${p.letter}`;
          return (
            <span key={p.id} data-pt={p.id} className={cn("tpe-pts", sel && "is-sel")}>
              <button
                type="button" tabIndex={sel ? 0 : -1} className="tpe-end" style={{ left: pct(p.line.x1), top: pct(p.line.y1) }} aria-label={`Start of ${name}. Arrow keys move it; Delete takes the line off the picture.`}
                onPointerDown={(e) => dotDown(e, p, 1)} onPointerMove={dotMove} onPointerUp={dotUp} onPointerCancel={dotUp}
                onFocus={() => onSelect(p.id)} onKeyDown={(e) => dotKeys(e, p, 1)} onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button" tabIndex={sel ? 0 : -1} className="tpe-end" style={{ left: pct(p.line.x2), top: pct(p.line.y2) }} aria-label={`End of ${name}. Arrow keys move it; Delete takes the line off the picture.`}
                onPointerDown={(e) => dotDown(e, p, 2)} onPointerMove={dotMove} onPointerUp={dotUp} onPointerCancel={dotUp}
                onFocus={() => onSelect(p.id)} onKeyDown={(e) => dotKeys(e, p, 2)} onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button" tabIndex={-1} className="tpe-tag" style={{ left: pct(m.x), top: pct(m.y) }} aria-label={`Select ${name}`}
                onPointerDown={(e) => { e.stopPropagation(); onSelect(p.id, true); }} onClick={(e) => e.stopPropagation()}
              >
                {p.letter}
              </button>
            </span>
          );
        })}
        {pending && (
          <button
            type="button" className="tpe-start" style={{ left: pct(pending.x), top: pct(pending.y) }}
            aria-label={`Start of the new line${armedPoint ? ` ${armedPoint.letter}` : ""}. Press to cancel it.`}
            onClick={(e) => { e.stopPropagation(); if (e.detail === 0) { onCancelDraw(); announce("Line cancelled."); picRef.current?.focus?.({ preventScroll: true }); } }}      // from the keyboard; a pointer is handled by the press above
          />
        )}
      </div>
    </div>
  );
}

/* ── One row of the table ──────────────────────────────────────── */

function Row({ p, i, count, sizes, listed, refSize, view, selected, suggestions, canEdit, refused, onRefuse, onSelect, onDraw, onTakeOff, onRemove, onMove, onValue, onLabel, tableRef }) {
  const drawn = Boolean(p.line);
  const label = p.label.trim() ? `${p.label.trim()}` : `line ${p.letter}`;

  // A key that is not part of a number (a letter, a space, a slash) is turned down and the box says so; Enter goes to the same size's box in the next row
  function numKeys(e, size) {
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const el = e.currentTarget;
      if (numberKeyRefused(e.key, el.value, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length)) { e.preventDefault(); onRefuse(p.id); return; }
    }
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    e.preventDefault();
    const rows = [...tableRef.current.querySelectorAll("[data-pt-row]")];
    const at = rows.findIndex((r) => r.dataset.ptRow === p.id);
    const next = rows[at + 1]?.querySelector(`input[data-size="${CSS.escape(size)}"]`);
    if (next) { next.focus(); next.select?.(); }
  }

  return (
    <div
      role="row" className={cn("tpe-tr", selected && "is-sel", drawn && "is-drawn")} data-pt-row={p.id}
      onFocusCapture={() => onSelect(p.id)} onPointerDown={() => onSelect(p.id)}
    >
      <div role="rowheader" className="tpe-td tpe-td-letter"><span className="tpe-letter">{p.letter}</span></div>
      <div role="cell" className="tpe-td tpe-td-name">
        <Suggest
          className="tpe-name" value={p.label} onChange={(v) => onLabel(p.id, v)} options={suggestions} placeholder="Name, like Chest width"
          label={`Name of line ${p.letter}`} disabled={!canEdit} passEnter
        />
      </div>
      <div role="presentation" className="tpe-cells">
        {sizes.map((s) => (
          <div role="cell" key={s} className={cn("tpe-td tpe-td-num", s === refSize && "is-ref", !listed.includes(s) && "is-off")}>
            <span className="tpe-size-label" aria-hidden="true">{s}</span>
            <input
              type="text" inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={8} className="tpe-num" data-size={s} value={p.values[s] || ""} disabled={!canEdit}
              aria-label={`${label}, size ${s}${s === refSize ? " (reference)" : ""}`} onKeyDown={(e) => numKeys(e, s)} onBlur={() => onRefuse("")}
              onChange={(e) => { const raw = e.target.value; onValue(p.id, s, raw); onRefuse(sanitizeNumber(raw) !== raw.trim() ? p.id : ""); }}
            />
          </div>
        ))}
        {refused ? <div role="cell" className="tpe-numnote"><span role="status">{NUMBER_NOTE}</span></div> : null}
      </div>
      <div role="cell" className="tpe-td tpe-td-acts">
        {canEdit && (
          <span className="tpe-row-acts">
            <button type="button" className="tpe-iconbtn tpe-up" disabled={i === 0} onClick={() => onMove(p.id, -1, "tpe-up")} aria-label={`Move line ${p.letter} up`} title="Move up"><ArrowUp size={15} sw={2} aria-hidden="true" /></button>
            <button type="button" className="tpe-iconbtn tpe-down" disabled={i === count - 1} onClick={() => onMove(p.id, 1, "tpe-down")} aria-label={`Move line ${p.letter} down`} title="Move down"><ArrowDown size={15} sw={2} aria-hidden="true" /></button>
            <button type="button" className="tpe-iconbtn tpe-rm" onClick={() => onRemove(p.id)} aria-label={`Remove line ${p.letter}${p.label.trim() ? `, ${p.label.trim()}` : ""}`} title="Remove this line"><Icons.X size={15} sw={2} aria-hidden="true" /></button>
          </span>
        )}
      </div>
      {/* under the name on screen, but after the number boxes for the keyboard: Tab goes along the row, not into this first */}
      <div role="cell" className="tpe-td tpe-td-sub">
        <span className="tpe-sub">
          {drawn ? <span title={view ? viewName(view) : undefined}>Drawn on {view ? viewName(view) : "a picture"}</span> : <span>Not drawn</span>}
          {canEdit && !drawn && <button type="button" className="tpe-link tpe-draw" onClick={(e) => onDraw(p.id, e.detail === 0)}>Draw this one<span className="tpe-sr"> for line {p.letter}</span></button>}
          {canEdit && drawn && <button type="button" className="tpe-link" onClick={() => onTakeOff(p.id)}>Take off<span className="tpe-sr"> line {p.letter} from the picture</span></button>}
        </span>
      </div>
    </div>
  );
}

/* ── The board ─────────────────────────────────────────────────── */

export function MeasureBoard() {
  const { pack, update, canEdit, goTo, board, setBoard, keepSizes } = useEditor();
  const uid = useId();
  const picRef = useRef(null);
  const tableRef = useRef(null);
  const wrapRef = useRef(null);
  const [pending, setPendingState] = useState(null);       // the first tap of a line: { x, y }
  const [armedId, setArmedId] = useState("");              // a row waiting for its line
  const [said, setSaidOnly] = useState("");                // what just happened, for the status line and a screen reader
  const [note, setNote] = useState("");                    // the same, under the picture, for a finger (the status line is out of sight below)
  const [undo, setUndo] = useState(null);                  // { point, index } the line just removed
  const [refusedRow, setRefusedRow] = useState("");          // the row whose number box just turned a key down
  const [scrolls, setScrolls] = useState(false);

  const views = pack.views.filter(hasPicture);
  const view = views.find((v) => v.id === board.viewId) || pickBoardView(pack.views);
  const sizes = boardSizes(pack);
  const points = pack.points;
  const drawnHere = view ? points.filter((p) => p.line && p.view === view.id) : [];
  const selectedId = points.some((p) => p.id === board.selectedId) ? board.selectedId : "";
  const armedPoint = points.find((p) => p.id === armedId) || null;
  const drawing = Boolean(pending || armedPoint);
  // a line nobody has named or numbered is not saved; say so once the person has moved on from it (not while they are about to type in it)
  const empties = points.filter((p) => p.id !== selectedId && !p.label.trim() && Object.keys(p.values).length === 0);
  const suggestions = useMemo(() => nameSuggestions(pack, board.templateId).map((label) => ({ label })), [pack, board.templateId]);
  const dropped = new Set(droppedSizes(pack, keepSizes));     // the columns whose numbers a Save will not keep

  const setSaid = (text) => { setSaidOnly(text); setUndo(null); };      // a new message takes any Undo with it (removeRow sets its own after)
  const setPending = (v) => setPendingState(v);
  const cancelDraw = () => { setPendingState(null); setArmedId(""); };
  const select = (id, scroll = false) => {
    setBoard({ selectedId: id });
    if (scroll) requestAnimationFrame(() => document.querySelector(`[data-pt-row="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" }));
  };

  // Escape cancels a half-drawn line (and an armed row) before it can close the card. Only an Escape pressed on this card: one pressed in the
  // sheet preview (a second dialog over it) or on the "Throw away what you typed?" question belongs to that.
  useEffect(() => {
    if (!pending && !armedId) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const t = e.target;
      const card = picRef.current?.closest(".tpe-card");
      if (!card || !(t instanceof Node) || !card.contains(t) || card.querySelector(".ec-confirm")) return;
      if (t.getAttribute?.("aria-expanded") === "true" || t.closest?.('[role="listbox"], [role="dialog"][aria-label]:not(.kmodal)')) return;     // an open list closes itself first
      e.preventDefault();
      e.stopPropagation();
      if (t.closest?.(".tpe-start")) picRef.current?.focus?.({ preventScroll: true });          // the dot that had the cursor goes away with the line
      setPendingState(null);
      setArmedId("");
      setSaid("Line cancelled.");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pending, armedId]);

  // a half-drawn line does not survive moving to another picture or leaving the board
  useEffect(() => { setPendingState(null); }, [view?.id]);

  // the table scrolls sideways only when there are too many sizes for it; then it needs a way in for the keyboard
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const check = () => setScrolls(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [sizes.length, points.length]);

  /* ── changes to the lines ── */

  const writePoints = (fn) => update((p) => ({ ...p, points: fn(p.points) }));

  // a line is finished: it fills the armed row, or makes a new one
  function finishLine(a, b, byKey = false, pointerType = "") {
    if (!view) return;
    let line;
    if (byKey) {
      const n = drawnHere.length % 6;
      line = { x1: 0.3, y1: 0.28 + 0.09 * n, x2: 0.7, y2: 0.28 + 0.09 * n };
    } else {
      line = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    const fill = armedPoint;
    setPendingState(null);
    setArmedId("");
    if (fill) {
      writePoints((pts) => patchPoint(pts, fill.id, { view: view.id, line }));
      select(fill.id, true);
      setSaid(`Line ${fill.letter} drawn on ${viewName(view)}.`);
      if (byKey) focusLater(`[data-pt="${CSS.escape(fill.id)}"] .tpe-end`);
      return;
    }
    const pt = blankPoint({ view: view.id, line });
    const letter = letterFor(points.length);
    writePoints((pts) => appendPoint(pts, pt));
    setSaid(`Line ${letter} drawn on ${viewName(view)}. Type its name and numbers in the table.`);
    if (byKey) { select(pt.id, true); focusLater(`.tpe-pts.is-sel .tpe-end`); return; }
    if (pointerType ? pointerType !== "mouse" : coarse()) {
      // a finger has no cursor to put in a box: the keyboard would cover half the screen and the table would scroll the picture away
      select(pt.id, false);
      setNote(`Line ${letter} drawn. Its name and numbers go in the table below.`);
      return;
    }
    select(pt.id, true);
    focusLater(`[data-pt-row="${CSS.escape(pt.id)}"] .tpe-name input`);
  }

  function drag(id, end, x, y) {
    update((p) => ({
      ...p,
      points: p.points.map((q) => (q.id === id && q.line ? { ...q, line: end === 1 ? { ...q.line, x1: x, y1: y } : { ...q.line, x2: x, y2: y } } : q)),
    }));
  }
  function nudge(id, end, dx, dy) {
    update((p) => ({
      ...p,
      points: p.points.map((q) => {
        if (q.id !== id || !q.line) return q;
        const l = q.line;
        return { ...q, line: end === 1 ? { ...l, x1: clamp01(l.x1 + dx), y1: clamp01(l.y1 + dy) } : { ...l, x2: clamp01(l.x2 + dx), y2: clamp01(l.y2 + dy) } };
      }),
    }));
  }

  function takeOff(id) {
    const p = points.find((q) => q.id === id);
    writePoints((pts) => patchPoint(pts, id, { view: null, line: null }));
    setSaid(`Line ${p?.letter || ""} is off the picture. Its row and numbers are kept.`);
    focusLater(`[data-pt-row="${CSS.escape(id)}"] .tpe-draw`);
  }

  function removeRow(id) {
    const index = points.findIndex((q) => q.id === id);
    const point = points[index];
    if (!point) return;
    writePoints((pts) => removePoint(pts, id));
    setSaid(`Removed line ${point.letter}${point.label.trim() ? `, ${point.label.trim()}` : ""}.`);
    setUndo({ point, index });
    if (armedId === id) setArmedId("");
    focusLater(".tpe-addline");
  }

  function undoRemove() {
    if (!undo) return;
    const { point, index } = undo;
    writePoints((pts) => {
      const next = pts.slice();
      next.splice(Math.min(index, next.length), 0, point);
      return reletter(next);
    });
    setUndo(null);
    setSaid("Line put back.");
    select(point.id, true);
    focusLater(coarse() ? ".tpe-addline" : `[data-pt-row="${CSS.escape(point.id)}"] .tpe-name input`);        // the Undo button is gone: the cursor goes to the line that came back
  }

  function moveRow(id, d, which) {
    writePoints((pts) => movePoint(pts, id, d));
    const other = which === "tpe-up" ? "tpe-down" : "tpe-up";
    focusBack(tableRef.current, [`[data-pt-row="${CSS.escape(id)}"] .${which}`, `[data-pt-row="${CSS.escape(id)}"] .${other}`]);
  }

  function addBlank() {
    const pt = blankPoint();
    writePoints((pts) => appendPoint(pts, pt));
    select(pt.id, true);
    setSaid("");
    focusLater(`[data-pt-row="${CSS.escape(pt.id)}"] .tpe-name input`);
  }

  function arm(id, byKeyboard) {
    if (!view) { goTo("pictures"); return; }
    setPendingState(null);
    setArmedId(id);
    select(id, false);
    const p = points.find((q) => q.id === id);
    setSaid(`Tap two places on the picture to draw line ${p?.letter || ""}.`);
    if (byKeyboard) focusLater(".tpe-pic");
  }

  function applyTemplate(id) {
    const t = MEASURE_TEMPLATES.find((m) => m.id === id);
    if (!t) return;
    const { points: next, added } = addTemplateRows(points, t);
    setBoard({ templateId: id });
    if (!added) { setSaid(`Every name in the ${t.label} list is already there. Nothing was changed.`); return; }
    update((p) => ({ ...p, points: next }));
    setSaid(`Added ${added} ${added === 1 ? "line" : "lines"} from the ${t.label} list. Nothing you typed was changed. Type the numbers, and draw each line on the picture if you like.`);
  }

  const unitWord = pack.measureUnit === "inch" ? "inch" : "cm";
  const help = pending
    ? "Now tap the other end of the line. Tap the pulsing dot or press Escape to cancel."
    : armedPoint
      ? `Drawing line ${armedPoint.letter}: tap two places on the picture. Press Escape to cancel.`
      : note || (canEdit ? "Tap two places on the picture to draw a line. Drag a dot to move it." : "Select a line to see where it is taken.");

  return (
    <Flow>
      <div className="tpe-boardc ec-wide"><div className="tpe-board">
        {/* ── the picture ── */}
        <section className="tpe-board-pic" aria-label="The picture the lines are drawn on">
          {view ? (
            <>
              {views.length > 1 ? (
                <div className="tpe-viewseg">
                  <Seg
                    label="Draw on this picture" value={view.id} options={views.map((v) => [v.id, <span className="tpe-vname" title={viewName(v)}>{viewName(v)}</span>])}
                    onChange={(id) => { setBoard({ viewId: id }); setPendingState(null); }}
                  />
                </div>
              ) : null}
              {armedPoint && (
                <div className="tpe-armed" role="status">
                  <span>Drawing line <b>{armedPoint.letter}</b>{armedPoint.label.trim() ? `, ${armedPoint.label.trim()}` : ""}</span>
                  <button type="button" className="tpe-link" onClick={() => { cancelDraw(); focusLater(".tpe-pic"); }}>Cancel</button>
                </div>
              )}
              <Picture
                view={view} points={drawnHere} selectedId={selectedId} onSelect={select} canEdit={canEdit} drawing={drawing} picRef={picRef}
                pending={pending} onPending={setPending} onCancelDraw={cancelDraw} armedPoint={armedPoint} announce={setSaid} onNote={setNote}
                onLine={finishLine} onTakeOff={takeOff} onNudge={nudge} onDrag={drag}
              />
              <p className="tpe-help" id={`${uid}-help`}>{help}</p>
            </>
          ) : (
            <div className="tpe-nopic">
              <Icons.Image size={26} sw={1.5} aria-hidden="true" />
              <p>Add a front picture in Pictures, then draw the measurements on it.</p>
              <button type="button" className="ghost-button" onClick={() => goTo("pictures")}>Go to Pictures</button>
            </div>
          )}
        </section>

        {/* ── the table ── */}
        <section className="tpe-board-table" aria-label="Measurements by size">
          <div className="tpe-controls">
            <Field label="Unit" labelId={`${uid}-unit`} hint="Changes the label only. The numbers stay as you typed them.">
              <Seg label="Unit" value={pack.measureUnit} onChange={(v) => update((p) => ({ ...p, measureUnit: v }))} options={UNIT_OPTIONS} disabled={!canEdit} />
            </Field>
            <Field label="Reference size" htmlFor={`${uid}-ref`} hint="The size the sheet's list is read for.">
              <Select
                id={`${uid}-ref`} label="Reference size" value={pack.refSize} onChange={(v) => update((p) => ({ ...p, refSize: v }))} disabled={!canEdit}
                options={pack.sizes.map((s) => ({ value: s, label: s }))} placeholder="Choose the sizes first"
              />
            </Field>
            {canEdit && (
              <Field label="Start from a garment" htmlFor={`${uid}-tpl`} hint="Adds the usual names. Nothing you typed is touched.">
                <Select id={`${uid}-tpl`} label="Start from a garment" value="" onChange={applyTemplate} options={TEMPLATE_OPTIONS} placeholder="Choose a garment" searchable={false} />
              </Field>
            )}
          </div>

          {points.length === 0 ? (
            <p className="tpe-empty">
              No measurements yet. {view && canEdit ? "Tap two places on the picture to draw the first line, or " : ""}
              {canEdit ? "add a line without drawing." : "Nobody has added any."}
            </p>
          ) : (
            <div
              ref={wrapRef} className="tpe-tablewrap" tabIndex={scrolls ? 0 : undefined} role={scrolls ? "region" : undefined} aria-label={scrolls ? `Measurements in ${unitWord}, by size` : undefined}
            >
              <div ref={tableRef} role="table" aria-label={`Measurements in ${unitWord}`} className="tpe-table" style={{ "--n": sizes.length }}>
                <div role="rowgroup" className="tpe-thead">
                  <div role="row" className="tpe-tr tpe-th">
                    <div role="columnheader" className="tpe-td tpe-td-letter">Line</div>
                    <div role="columnheader" className="tpe-td tpe-td-name">Name</div>
                    <div role="presentation" className="tpe-cells">
                      {sizes.map((s) => (
                        <div role="columnheader" key={s} className={cn("tpe-td tpe-td-num", s === pack.refSize && "is-ref", !pack.sizes.includes(s) && "is-off")} title={!pack.sizes.includes(s) ? (dropped.has(s) ? "Not on the size list: its numbers are dropped when you press Save" : "Not on the size list. Its numbers are kept.") : undefined}>
                          {s}{s === pack.refSize ? <em>ref</em> : null}
                        </div>
                      ))}
                    </div>
                    <div role="columnheader" className="tpe-td tpe-td-acts"><span className="tpe-sr">Actions</span></div>
                  </div>
                </div>
                <div role="rowgroup" className="tpe-tbody">
                  {points.map((p, i) => (
                    <Row
                      key={p.id} p={p} i={i} count={points.length} sizes={sizes} listed={pack.sizes} refSize={pack.refSize} selected={p.id === selectedId}
                      view={pack.views.find((v) => v.id === p.view)} suggestions={suggestions} canEdit={canEdit} tableRef={tableRef}
                      refused={refusedRow === p.id} onRefuse={setRefusedRow} onSelect={select} onDraw={arm} onTakeOff={takeOff} onRemove={removeRow} onMove={moveRow}
                      onValue={(id, size, v) => writePoints((pts) => setPointValue(pts, id, size, v))}
                      onLabel={(id, v) => writePoints((pts) => patchPoint(pts, id, { label: v }))}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="tpe-board-foot">
            {canEdit && (
              <button type="button" className="ghost-button tpe-addline" onClick={addBlank}><Icons.Plus size={14} sw={2} aria-hidden="true" /> Add a line without drawing</button>
            )}
            <p className="tpe-said" role="status">
              {said}
              {undo && <button type="button" className="tpe-link" onClick={undoRemove}>Undo</button>}
            </p>
          </div>
          {empties.length > 0 && (
            <p className="ec-note tpe-warn">A line with no name and no number is not saved: <b>{empties.map((p) => p.letter).join(", ")}</b>. Give {empties.length === 1 ? "it" : "them"} a name or a number, or remove {empties.length === 1 ? "it" : "them"}.</p>
          )}
        </section>
      </div></div>
    </Flow>
  );
}
