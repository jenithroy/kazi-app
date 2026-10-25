/**
 * Pictures in the tech pack editor: one slot, and a grid of captioned tiles.
 *
 * A picture is chosen by clicking, dropping a file on it, or pasting one (Ctrl+V while the slot or anything inside it has the cursor:
 * a screenshot works). Nothing is uploaded here. A chosen picture is a File the pack holds, drawn at once from an object URL
 * (`preview`); the editor's Save shrinks it and uploads it (lib/techpackWrites.js). Anything that is not a picture is turned down in
 * plain words, and a slow picture never blocks the card, because nothing is waiting for it until Save.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Ico, Icons, cn } from "../ui";
import { newId } from "../../lib/techpack";

/* ── Preview addresses ─────────────────────────────────────────── */

const PreviewCtx = createContext({ make: (file) => URL.createObjectURL(file), drop: () => {} });

/** Makes the object URLs a chosen picture is drawn from and lets them go when the card closes (or, a moment after, when a picture is replaced). */
export function PreviewProvider({ children }) {
  const urls = useRef(new Set());
  const make = useCallback((file) => {
    const u = URL.createObjectURL(file);
    urls.current.add(u);
    return u;
  }, []);
  const drop = useCallback((u) => {
    // a moment later, so the picture that is leaving the screen is not asked for again once its address is gone
    if (u && urls.current.delete(u)) setTimeout(() => URL.revokeObjectURL(u), 1000);
  }, []);
  useEffect(() => () => { for (const u of urls.current) URL.revokeObjectURL(u); urls.current.clear(); }, []);
  const value = useMemo(() => ({ make, drop }), [make, drop]);
  return <PreviewCtx.Provider value={value}>{children}</PreviewCtx.Provider>;
}

export const usePreviews = () => useContext(PreviewCtx);

/* ── Taking pictures in ────────────────────────────────────────── */

const isPicture = (f) => Boolean(f) && /^image\//.test(f.type || "");
const isHeic = (f) => /heic|heif/i.test(f.type || "") || /\.(heic|heif)$/i.test(f.name || "");

/** Split a list of files into the pictures the browser can draw and what was left out, with the plain sentence to say so. */
export function sortFiles(files) {
  const all = Array.from(files || []).filter(Boolean);
  const images = all.filter((f) => isPicture(f) && !isHeic(f));
  const heic = all.filter(isHeic).length;
  const other = all.length - images.length - heic;
  let note = "";
  if (heic) note = "A picture from an iPhone (HEIC) cannot be used here. Send it as a JPG, or take a screenshot of it.";
  else if (other) note = other === 1 ? "That file is not a picture, so it was left out. Choose a PNG or JPG." : `${other} files were not pictures, so they were left out.`;
  return { images, note };
}

/** Picture files on the clipboard (a screenshot, a copied image); text is left alone so pasting into a caption still works. */
function clipboardPictures(e) {
  const dt = e.clipboardData;
  if (!dt) return [];
  const files = Array.from(dt.files || []).filter(isPicture);
  if (files.length) return files;
  return Array.from(dt.items || []).filter((i) => i.kind === "file" && /^image\//.test(i.type)).map((i) => i.getAsFile()).filter(Boolean);
}

/**
 * What a place that takes pictures needs: drag-over state and the handlers to spread on it. `multiple` keeps every picture, else the first.
 * `onNote(text)` is told what was turned down ("" when all was fine) so the caller can say it next to the place.
 */
export function useDropZone({ onFiles, onNote, multiple = false, disabled = false }) {
  const [over, setOver] = useState(false);
  const take = useCallback((files) => {
    const { images, note } = sortFiles(files);
    onNote?.(note);
    const use = multiple ? images : images.slice(0, 1);
    if (use.length) onFiles(use);
  }, [onFiles, onNote, multiple]);
  const props = disabled ? {} : {
    onDragOver: (e) => { if (Array.from(e.dataTransfer?.types || []).includes("Files")) { e.preventDefault(); setOver(true); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); },
    onDrop: (e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); },
    onPaste: (e) => {
      const files = clipboardPictures(e);
      if (!files.length) return;
      // cells copied from a spreadsheet carry a picture of themselves as well as their text: into a box that takes text, the text is what was meant
      if (e.target?.closest?.("input, textarea, [contenteditable='true']") && Array.from(e.clipboardData?.types || []).includes("text/plain")) return;
      e.preventDefault();
      take(files);
    },
  };
  return { props, over, take };
}

/** A hidden file box and the function that opens it. Choosing the same file twice in a row still counts (the box is emptied after). */
function useChooser({ onFiles, onNote, multiple }) {
  const input = useRef(null);
  const element = (
    <input
      ref={input} type="file" accept="image/*" multiple={multiple} hidden tabIndex={-1} aria-hidden="true"
      onChange={(e) => {
        const { images, note } = sortFiles(e.target.files);
        onNote?.(note);
        if (images.length) onFiles(multiple ? images : images.slice(0, 1));
        e.target.value = "";
      }}
    />
  );
  return { open: () => input.current?.click(), element };
}

/** Give the cursor back to something that is still on screen once the thing that had it is gone (a removed row would leave it nowhere). */
export function focusBack(root, selector) {
  requestAnimationFrame(() => {
    // several selectors: the first that is there and not disabled (a "move up" that has just reached the top is disabled)
    for (const s of Array.isArray(selector) ? selector : [selector]) {
      const el = root?.querySelector?.(s);
      if (el && !el.disabled) { el.focus?.({ preventScroll: true }); return; }
    }
  });
}

/** Focus something that is about to be drawn (a row just added): two frames, because React draws the row after this call returns. */
export function focusLater(selector) {
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(selector)?.focus?.()));
}

/* ── Small icons ───────────────────────────────────────────────── */

export const ArrowUp = (p) => <Ico {...p} d="M6 15l6-6 6 6" />;
export const ArrowDown = (p) => <Ico {...p} d="M6 9l6 6 6-6" />;

/* ── One picture ───────────────────────────────────────────────── */

/**
 * A place for ONE picture. Empty it is a button (click, drop or paste); with a picture it shows it, with Replace and Remove over a corner.
 * `shape`: "tall" (a garment view), "square" (a swatch, a print) or "wide" (a logo).
 */
export function ImageSlot({ src, alt, onFile, onRemove, disabled, busy, shape = "square", label = "picture", className }) {
  const [note, setNote] = useState("");
  const root = useRef(null);
  const choose = useChooser({ onFiles: (f) => onFile(f[0]), onNote: setNote, multiple: false });
  const zone = useDropZone({ onFiles: (f) => onFile(f[0]), onNote: setNote, disabled });
  return (
    <div ref={root} className={cn("tpe-slot", `is-${shape}`, zone.over && "is-over", className)} {...zone.props}>
      {src ? (
        <div className="tpe-slot-pic" tabIndex={disabled ? undefined : 0} role="group" aria-label={`${label}. Press Ctrl+V to paste another picture over it.`}>
          <img src={src} alt={alt || label} draggable={false} />
          {busy ? <span className="tpe-busy" role="status">Saving…</span> : null}
          {!disabled && (
            <span className="tpe-slot-acts">
              <button type="button" className="tpe-iconbtn" onClick={choose.open} aria-label={`Replace the ${label}`} title="Replace the picture"><Icons.Image size={15} sw={1.8} aria-hidden="true" /></button>
              <button type="button" className="tpe-iconbtn" onClick={() => { onRemove(); focusBack(root.current, ".tpe-drop"); }} aria-label={`Remove the ${label}`} title="Remove the picture"><Icons.X size={15} sw={2} aria-hidden="true" /></button>
            </span>
          )}
        </div>
      ) : (
        <button type="button" className="tpe-drop" onClick={choose.open} disabled={disabled}>
          <Icons.Image size={20} sw={1.6} aria-hidden="true" />
          <b>{disabled ? "No picture" : "Add a picture"}</b>{" "}
          {!disabled && <small>Click, drop or paste it</small>}
          {!disabled && <small className="tpe-drop-size">PNG or JPG. It is shrunk for you.</small>}
          <span className="tpe-sr"> ({label})</span>
        </button>
      )}
      {choose.element}
      {note ? <small className="tpe-msg" role="status">{note}</small> : null}
    </div>
  );
}

/* ── A grid of captioned pictures ──────────────────────────────── */

/** A new tile for a chosen file. */
export const tileFrom = (file, preview) => ({ id: newId(), url: "", caption: "", file, preview });

/**
 * Close-up photos with a caption each (Details, Labels and tags, Construction): `items` is `[{ id, url, caption, file?, preview? }]`,
 * `onChange(next)` gets the whole new list. "Add pictures" takes many files at once; drop and paste work anywhere on the grid.
 */
export function TileGrid({ items, onChange, canEdit, noun = "picture", altBase = "Picture", captionPlaceholder = "Caption", busyIds, className }) {
  const previews = usePreviews();
  const [note, setNote] = useState("");
  const root = useRef(null);
  const add = useCallback((files) => onChange([...items, ...files.map((f) => tileFrom(f, previews.make(f)))]), [items, onChange, previews]);
  const zone = useDropZone({ onFiles: add, onNote: setNote, multiple: true, disabled: !canEdit });
  const choose = useChooser({ onFiles: add, onNote: setNote, multiple: true });

  const patch = (id, p) => onChange(items.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const remove = (id) => {
    const at = items.findIndex((t) => t.id === id);
    const gone = items[at];
    previews.drop(gone?.preview);
    onChange(items.filter((t) => t.id !== id));
    const next = items[at + 1] || items[at - 1];
    focusBack(root.current, next ? `[data-tile="${CSS.escape(next.id)}"] .tpe-tile-remove` : ".tpe-addtile");
  };
  const move = (id, d, which) => {
    const from = items.findIndex((t) => t.id === id);
    const to = from + d;
    if (to < 0 || to >= items.length) return;
    const next = items.slice();
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
    const other = which === "tpe-tile-earlier" ? "tpe-tile-later" : "tpe-tile-earlier";
    focusBack(root.current, [`[data-tile="${CSS.escape(id)}"] .${which}`, `[data-tile="${CSS.escape(id)}"] .${other}`]);
  };

  return (
    <div className={cn("tpe-tiles-wrap", zone.over && "is-over", className)} ref={root} {...zone.props}>
      <ul className="tpe-tiles">
        {items.map((t, i) => {
          const src = t.preview || t.url;
          const name = t.caption.trim();
          return (
            <li key={t.id} className="tpe-tile" data-tile={t.id}>
              <div className="tpe-tile-pic">
                {src ? <img src={src} alt={name ? "" : `${altBase} ${i + 1}`} draggable={false} /> : <span className="tpe-tile-none">No picture</span>}
                {busyIds?.has(t.id) ? <span className="tpe-busy" role="status">Saving…</span> : null}
              </div>
              <textarea
                className="tpe-tile-cap" rows={2} maxLength={90} value={t.caption} disabled={!canEdit}
                placeholder={captionPlaceholder} aria-label={`Caption for ${noun} ${i + 1}`}
                onChange={(e) => patch(t.id, { caption: e.target.value.replace(/\n/g, " ") })}
              />
              {canEdit && (
                <span className="tpe-tile-acts">
                  <button type="button" className="tpe-iconbtn tpe-tile-earlier" disabled={i === 0} onClick={() => move(t.id, -1, "tpe-tile-earlier")} aria-label={`Move ${noun} ${i + 1} earlier`} title="Move earlier"><Icons.ChevronLeft size={15} sw={2} aria-hidden="true" /></button>
                  <button type="button" className="tpe-iconbtn tpe-tile-later" disabled={i === items.length - 1} onClick={() => move(t.id, 1, "tpe-tile-later")} aria-label={`Move ${noun} ${i + 1} later`} title="Move later"><Icons.ChevronRight size={15} sw={2} aria-hidden="true" /></button>
                  <button type="button" className="tpe-iconbtn tpe-tile-remove" onClick={() => remove(t.id)} aria-label={`Remove ${noun} ${i + 1}`} title="Remove"><Icons.X size={15} sw={2} aria-hidden="true" /></button>
                </span>
              )}
            </li>
          );
        })}
        {canEdit && (
          <li className="tpe-tile-add">
            <button type="button" className="tpe-addtile" onClick={choose.open}>
              <Icons.Plus size={20} sw={1.8} aria-hidden="true" />
              <b>Add pictures</b>{" "}
              <small>Choose several, drop or paste</small>
              <span className="tpe-sr"> of {noun}s</span>
            </button>
          </li>
        )}
      </ul>
      {choose.element}
      {note ? <small className="tpe-msg" role="status">{note}</small> : null}
      {!canEdit && items.length === 0 ? <p className="ec-note">No pictures.</p> : null}
    </div>
  );
}
