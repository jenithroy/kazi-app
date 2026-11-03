/**
 * The strip over the canvas while the Trace tool is on: what to do next in plain words, the kind of the next points (corner or
 * curve), and buttons for the things the keyboard does (Backspace, Enter, Esc) so a touch screen can use them too.
 */
import { Segmented } from "./Controls";

export default function TraceBar({ api }) {
  const count = api.trace ? api.trace.pts.length : 0;
  const curve = !!api.prefs.traceCurve;
  const hasPicture = !!api.design.reference && api.hasImage;
  const msg = count === 0
    ? (hasPicture ? "Click round the edge of a shape in the picture." : "Click to put the first point of a shape.")
    : count < 3
      ? "Keep going round the edge. A shape needs three points or more."
      : "Click the first point (or press Enter) to close the shape.";
  return (
    // A click on a button here must not take the keyboard from the canvas: Enter has to close the shape, not press the button again.
    <div className="dz-tracebar" role="group" aria-label="Trace by hand" onMouseDown={(e) => { if (e.target.closest("button")) e.preventDefault(); }}>
      <span className="dz-tracebar-msg" role="status">{msg}</span>
      <div className="dz-tracebar-ctl">
        <Segmented
          label="Kind of the next points"
          value={curve ? "curve" : "corner"}
          onChange={(v) => api.setPrefs({ traceCurve: v === "curve" })}
          options={[
            { value: "corner", label: "Corner", title: "The outline turns at the point. Hold Alt while clicking for a curve point." },
            { value: "curve", label: "Curve", title: "The outline runs smoothly through the point. Hold Alt while clicking for a corner." },
          ]}
        />
        <button type="button" className="dz-tool dz-tool--text" disabled={!count} onClick={api.traceBack} title="Take the last point back (Backspace)">Undo point</button>
        <button type="button" className="dz-tool dz-tool--text" disabled={count < 3} onClick={api.traceFinish} title="Close the shape (Enter)">Finish shape</button>
        <button type="button" className="dz-tool dz-tool--text" disabled={!count} onClick={api.traceCancel} title="Throw the unfinished shape away (Esc)">Cancel</button>
        <button type="button" className="dz-tool dz-tool--text is-on" onClick={() => api.setTool("select")} title="Stop tracing (V)">Done</button>
      </div>
    </div>
  );
}
