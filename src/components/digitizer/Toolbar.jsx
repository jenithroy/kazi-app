/**
 * The strip above the canvas: the tools, the three steps (picture, design, stitches) and the zoom. Tool keys are the usual
 * ones (V select, H hand, R rectangle, O ellipse, T text) and are handled by the page.
 */
import { Icons } from "../ui";
import { Segmented } from "./Controls";

const I = (d, extra) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}{extra}</svg>
);

export const TOOL_ICONS = {
  select: I(<path d="M5 3l14 7-6 2-2 6L5 3z" />),
  hand: I(<><path d="M9 11V5.5a1.5 1.5 0 013 0V10" /><path d="M12 10V4.5a1.5 1.5 0 013 0V10" /><path d="M15 10V6a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L4 13.5a1.5 1.5 0 012.4-1.8L9 14" /></>),
  rect: I(<rect x="4" y="6" width="16" height="12" rx="1.5" />),
  ellipse: I(<ellipse cx="12" cy="12" rx="8" ry="6" />),
  text: I(<><path d="M5 6V4.5h14V6" /><path d="M12 4.5V19" /><path d="M9 19h6" /></>),
};

const TOOLS = [
  { id: "select", label: "Select", key: "V" },
  { id: "hand", label: "Move around", key: "H" },
  { id: "rect", label: "Rectangle", key: "R" },
  { id: "ellipse", label: "Ellipse", key: "O" },
  { id: "text", label: "Text", key: "T" },
];

export default function Toolbar({ api, onZoom, onFit, zoomPct }) {
  const { tool, setTool, mode, setMode, hasImage } = api;
  const inPicture = mode === "picture";
  return (
    <div className="dz-toolbar" role="toolbar" aria-label="Design tools">
      <div className="dz-tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`dz-tool${tool === t.id && !inPicture ? " is-on" : ""}`}
            aria-pressed={tool === t.id && !inPicture}
            aria-label={`${t.label} (${t.key})`}
            title={`${t.label} (${t.key})`}
            disabled={inPicture}
            onClick={() => setTool(t.id)}
          >
            {TOOL_ICONS[t.id]}
          </button>
        ))}
      </div>

      <Segmented
        label="Step"
        value={mode}
        onChange={setMode}
        options={[
          { value: "picture", label: "Picture", title: "The picture, its size, crop and colours", disabled: !hasImage && !api.design.reference },
          { value: "design", label: "Design", title: "Move, resize and recolour shapes" },
          { value: "stitches", label: "Stitches", title: "See the stitches and save the file" },
        ]}
        size="step"
      />

      <div className="dz-zoom">
        <button type="button" className="dz-tool" aria-label="Zoom out" title="Zoom out" onClick={() => onZoom(1 / 1.25)}>{I(<path d="M5 12h14" />)}</button>
        <span className="dz-zoom-pct" aria-live="polite">{Math.round(zoomPct)}%</span>
        <button type="button" className="dz-tool" aria-label="Zoom in" title="Zoom in" onClick={() => onZoom(1.25)}>{I(<path d="M12 5v14M5 12h14" />)}</button>
        <button type="button" className="dz-tool dz-tool--text" title="Fit the hoop in the window (F)" onClick={onFit}>Fit</button>
        <button type="button" className={`dz-tool${api.prefs.showGrid ? " is-on" : ""}`} aria-pressed={api.prefs.showGrid} aria-label="Grid" title="Grid" onClick={() => api.setPrefs({ showGrid: !api.prefs.showGrid })}>
          {I(<><path d="M4 4h16v16H4z" /><path d="M4 10h16M4 15h16M10 4v16M15 4v16" /></>)}
        </button>
      </div>
    </div>
  );
}

export { Icons };
