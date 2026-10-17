import { useEffect, useRef, useState } from "react";
import { cropGeometry, cropSquare, readImage } from "../lib/avatars";
import "./photo-cropper.css";

/**
 * The step between choosing a photo and using it as a profile picture: a circle to
 * move the photo around in, a zoom slider, and the two buttons.
 *
 * Moving and zooming change only which part of the photo is in the circle; nothing is
 * saved until "Use photo", which hands a small square JPEG (see lib/avatars.js) to
 * `onSave`. The parent does the uploading and says if it failed (`error`) or is still
 * working (`busy`). It works with a finger, a mouse, or the arrow keys and + / -.
 */

const VIEW = 168;          // px: the circle on screen
const ZOOM_MAX = 3;
const NUDGE = 0.04;        // of the visible square, per arrow-key press

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// The centre may go as far as keeps the square inside the photo.
function keepInside(pos, width, height, zoom) {
  const { side } = cropGeometry(width, height, zoom);
  const loX = side / 2 / width;
  const loY = side / 2 / height;
  return { cx: clamp(pos.cx, loX, 1 - loX), cy: clamp(pos.cy, loY, 1 - loY) };
}

export default function PhotoCropper({ file, busy = false, error = "", onCancel, onSave }) {
  const [photo, setPhoto] = useState(null);       // { img, url, width, height }
  const [problem, setProblem] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ cx: 0.5, cy: 0.5 });
  const [grabbing, setGrabbing] = useState(false);
  const drag = useRef(null);

  useEffect(() => {
    let live = true;
    let made = null;
    setPhoto(null);
    setProblem("");
    setZoom(1);
    setPos({ cx: 0.5, cy: 0.5 });
    readImage(file)
      .then((r) => {
        if (!live) { URL.revokeObjectURL(r.url); return; }
        made = r;
        setPhoto(r);
      })
      .catch((err) => { if (live) setProblem(err.message); });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made.url);
    };
  }, [file]);

  const g = photo ? cropGeometry(photo.width, photo.height, zoom, pos.cx, pos.cy) : null;
  const scale = g ? VIEW / g.side : 1;

  const move = (dx, dy) => {   // in photo pixels
    if (!photo) return;
    setPos((p) => keepInside({ cx: p.cx + dx / photo.width, cy: p.cy + dy / photo.height }, photo.width, photo.height, zoom));
  };

  const changeZoom = (next) => {
    const z = clamp(next, 1, ZOOM_MAX);
    setZoom(z);
    if (photo) setPos((p) => keepInside(p, photo.width, photo.height, z));
  };

  const onPointerDown = (e) => {
    if (!photo || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: pos.cx, cy: pos.cy };
    setGrabbing(true);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || !photo) return;
    const perPx = g.side / VIEW;   // photo pixels per screen pixel
    setPos(keepInside(
      { cx: d.cx - ((e.clientX - d.x) * perPx) / photo.width, cy: d.cy - ((e.clientY - d.y) * perPx) / photo.height },
      photo.width, photo.height, zoom,
    ));
  };
  const endDrag = () => { drag.current = null; setGrabbing(false); };

  const onKeyDown = (e) => {
    if (!g) return;
    const step = g.side * NUDGE;
    if (e.key === "ArrowLeft") move(-step, 0);
    else if (e.key === "ArrowRight") move(step, 0);
    else if (e.key === "ArrowUp") move(0, -step);
    else if (e.key === "ArrowDown") move(0, step);
    else if (e.key === "+" || e.key === "=") changeZoom(zoom + 0.1);
    else if (e.key === "-") changeZoom(zoom - 0.1);
    else return;
    e.preventDefault();
  };

  const [saveError, setSaveError] = useState("");
  async function save() {
    if (!photo || busy) return;
    setSaveError("");
    let blob;
    try {
      blob = await cropSquare(photo.img, { zoom, cx: pos.cx, cy: pos.cy });
    } catch (err) {
      setSaveError(err.message);
      return;
    }
    await onSave(blob);
  }

  const shown = problem || saveError || error;

  return (
    <div className="kcrop">
      <div
        className={`kcrop-view${grabbing ? " is-grabbing" : ""}`}
        tabIndex={photo ? 0 : -1}
        role="group"
        aria-label="Photo preview. Drag it, or use the arrow keys, to choose what shows in the circle. Plus and minus zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        {photo && (
          <img
            className="kcrop-img"
            src={photo.url}
            alt=""
            draggable={false}
            style={{
              width: photo.width * scale,
              height: photo.height * scale,
              transform: `translate(${-g.sx * scale}px, ${-g.sy * scale}px)`,
            }}
          />
        )}
        {!photo && !problem && <span className="kcrop-wait">Loading…</span>}
      </div>

      <label className="kcrop-zoom">
        <span>Zoom</span>
        <input
          type="range"
          min="1"
          max={ZOOM_MAX}
          step="0.01"
          value={zoom}
          onChange={(e) => changeZoom(Number(e.target.value))}
          disabled={!photo || busy}
        />
      </label>
      <p className="kcrop-hint">Drag the photo to move it.</p>

      {shown && <p className="kprof-ferr kcrop-err" role="alert">{shown}</p>}

      <div className="kcrop-acts">
        <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="primary-button" onClick={save} disabled={!photo || busy}>
          {busy ? "Saving…" : "Use photo"}
        </button>
      </div>
    </div>
  );
}
