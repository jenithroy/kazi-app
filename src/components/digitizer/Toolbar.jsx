/**
 * The controls that float over the canvas, as on the Atelier page: a slim pine rail down the left edge (the tools, undo and redo,
 * the file buttons and the Objects list) and a small chip for the view (zoom, fit, grid, rulers). Icons only, small, with the name
 * and the key in the tooltip. Tool keys are the usual ones (V select, H hand, R rectangle, O ellipse, T text, P trace by hand) and
 * are handled by the page. The steps (Picture, Design, Stitches) are in the panel on the right.
 */
import { ArrowUUpLeft, ArrowUUpRight, FolderOpen, FloppyDisk, FilePlus, Stack, MagnifyingGlassPlus, MagnifyingGlassMinus, GridFour, Ruler } from "./icons";

const I = (d, extra) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}{extra}</svg>
);

export const TOOL_ICONS = {
  select: I(<path d="M5 3l14 7-6 2-2 6L5 3z" />),
  hand: I(<><path d="M9 11V5.5a1.5 1.5 0 013 0V10" /><path d="M12 10V4.5a1.5 1.5 0 013 0V10" /><path d="M15 10V6a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L4 13.5a1.5 1.5 0 012.4-1.8L9 14" /></>),
  rect: I(<rect x="4" y="6" width="16" height="12" rx="1.5" />),
  ellipse: I(<ellipse cx="12" cy="12" rx="8" ry="6" />),
  text: I(<><path d="M5 6V4.5h14V6" /><path d="M12 4.5V19" /><path d="M9 19h6" /></>),
  trace: I(<><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></>),
};

const TOOLS = [
  { id: "select", label: "Select", key: "V" },
  { id: "hand", label: "Move around", key: "H" },
  { id: "rect", label: "Rectangle", key: "R" },
  { id: "ellipse", label: "Ellipse", key: "O" },
  { id: "text", label: "Text", key: "T" },
  { id: "trace", label: "Trace by hand", key: "P" },
];

const ICON = 16;

/** The rail on the left: tools, history, file, and the switch for the Objects list. */
export default function ToolRail({ api, objectsOpen, onToggleObjects, onOpenFile }) {
  const { tool, setTool, mode, design } = api;
  const inPicture = mode === "picture";
  const empty = !design.objects.length && !design.reference && !api.stitches;
  const count = design.objects.length;
  return (
    <div className="dz-toolbar dz-rail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
      {TOOLS.map((t) => {
        const on = tool === t.id && !inPicture;
        return (
          <button
            key={t.id}
            type="button"
            className={`dz-rail-btn${on ? " is-on" : ""}`}
            aria-pressed={on}
            aria-label={`${t.label} (${t.key})`}
            title={`${t.label} (${t.key})`}
            disabled={inPicture}
            onClick={() => setTool(t.id)}
          >
            {TOOL_ICONS[t.id]}
          </button>
        );
      })}

      <span className="dz-rail-sep" aria-hidden="true" />
      <button type="button" className="dz-rail-btn" onClick={api.undo} disabled={!api.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)"><ArrowUUpLeft size={ICON} aria-hidden="true" /></button>
      <button type="button" className="dz-rail-btn" onClick={api.redo} disabled={!api.canRedo} aria-label="Redo" title="Redo (Ctrl+Y)"><ArrowUUpRight size={ICON} aria-hidden="true" /></button>

      <span className="dz-rail-sep" aria-hidden="true" />
      <button type="button" className="dz-rail-btn" onClick={onOpenFile} aria-label="Open a file" title="Open a design saved from this page, or a machine file (DST, PES, EXP, JEF, VP3, XXX) to look at it or save it as another type"><FolderOpen size={ICON} aria-hidden="true" /></button>
      <button type="button" className="dz-rail-btn" onClick={api.saveDesignFile} disabled={!count} aria-label="Save design" title="Save the design to edit later (Ctrl+S)"><FloppyDisk size={ICON} aria-hidden="true" /></button>
      <button type="button" className="dz-rail-btn" onClick={api.newFile} disabled={empty} aria-label="New design" title="Start a new design"><FilePlus size={ICON} aria-hidden="true" /></button>

      <span className="dz-rail-sep" aria-hidden="true" />
      <button type="button" data-tour="objects" className={`dz-rail-btn${objectsOpen ? " is-on" : ""}`} onClick={onToggleObjects} aria-pressed={objectsOpen} aria-label={`Objects (${count})`} title={`Objects, in the order they are sewn (${count})`}>
        <Stack size={ICON} aria-hidden="true" />
        {count > 0 && <span className="dz-rail-badge" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
      </button>
    </div>
  );
}

/** The view chip, bottom left of the canvas: zoom, fit, grid and rulers. */
export function ZoomBar({ api, zoomPct, onZoom, onFit }) {
  return (
    <div className="dz-toolbar dz-chip" data-dz-float="bottom" role="toolbar" aria-label="View">
      <button type="button" className="dz-chip-btn" aria-label="Zoom out" title="Zoom out" onClick={() => onZoom(1 / 1.25)}><MagnifyingGlassMinus size={ICON} aria-hidden="true" /></button>
      <span className="dz-zoom-pct" aria-live="polite">{Math.round(zoomPct)}%</span>
      <button type="button" className="dz-chip-btn" aria-label="Zoom in" title="Zoom in" onClick={() => onZoom(1.25)}><MagnifyingGlassPlus size={ICON} aria-hidden="true" /></button>
      <button type="button" className="dz-chip-btn dz-chip-btn--text" title="Fit the hoop in the window (F)" onClick={onFit}>Fit</button>
      <span className="dz-chip-sep" aria-hidden="true" />
      <button type="button" className={`dz-chip-btn${api.prefs.showGrid ? " is-on" : ""}`} aria-pressed={!!api.prefs.showGrid} aria-label="Grid" title="Grid" onClick={() => api.setPrefs({ showGrid: !api.prefs.showGrid })}><GridFour size={ICON} aria-hidden="true" /></button>
      <button type="button" className={`dz-chip-btn${api.prefs.showRulers ? " is-on" : ""}`} aria-pressed={!!api.prefs.showRulers} aria-label="Rulers" title="Rulers" onClick={() => api.setPrefs({ showRulers: !api.prefs.showRulers })}><Ruler size={ICON} aria-hidden="true" /></button>
    </div>
  );
}
