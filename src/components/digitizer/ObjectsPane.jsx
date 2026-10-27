/**
 * The list of everything in the design, in the order it is sewn (first at the top). Press a row to select it (Shift or Ctrl to
 * add more), drag a row to change when it is sewn, use the eye to hide it and the padlock to keep it from being moved.
 */
import { useRef, useState } from "react";
import { Icons } from "../ui";

const Eye = ({ off }) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off ? <><path d="M3 3l18 18" /><path d="M10.6 6.2A9.6 9.6 0 0112 6c4.5 0 8 4.5 9 6a14 14 0 01-3 3.4M6.5 7.6C4.6 9 3.3 11 3 12c1 1.5 4.5 6 9 6 1.4 0 2.7-.4 3.8-1" /></> : <><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="2.6" /></>}
  </svg>
);
const Lock = ({ on }) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" />{on ? <path d="M8 11V8a4 4 0 018 0v3" /> : <path d="M8 11V8a4 4 0 017.5-2" />}
  </svg>
);

export default function ObjectsPane({ api }) {
  const { design, selection, setSelection } = api;
  const [dragId, setDragId] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const last = useRef(null);

  const pick = (e, id, idx) => {
    if (e.shiftKey && last.current != null) {
      const a = Math.min(last.current, idx), b = Math.max(last.current, idx);
      setSelection(design.objects.slice(a, b + 1).map((o) => o.id));
      return;
    }
    last.current = idx;
    if (e.ctrlKey || e.metaKey) setSelection(selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id]);
    else setSelection([id]);
  };

  const [editing, setEditing] = useState(null); // the id of the row being renamed
  const finishRename = (o, text, save) => {
    setEditing(null);
    const name = text.trim().slice(0, 40);
    if (save && name && name !== o.name) api.patchObject([o.id], { name }, "commit");
  };

  return (
    <div className="dz-objects">
      {design.objects.length === 0 ? (
        <p className="dz-empty">Nothing here yet. Add a picture, some text or a shape.</p>
      ) : (
        <ol className="dz-olist" aria-label="Objects, in the order they are sewn">
          {design.objects.map((o, i) => {
            const on = selection.includes(o.id);
            return (
              <li
                key={o.id}
                className={`dz-orow${on ? " is-on" : ""}${o.visible ? "" : " is-hidden"}${overIdx === i && dragId && dragId !== o.id ? " is-over" : ""}`}
                draggable
                onDragStart={(e) => { setDragId(o.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", o.id); }}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverIdx(i); } }}
                onDragLeave={() => setOverIdx((v) => (v === i ? null : v))}
                onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== o.id) api.reorder(dragId, i); setDragId(null); setOverIdx(null); }}
                onDragEnd={() => { setDragId(null); setOverIdx(null); }}
              >
                <span className="dz-onum" aria-hidden="true">{i + 1}</span>
                {editing === o.id ? (
                  <span className="dz-oname dz-oname--edit">
                    <span className="dz-dot" style={{ background: o.fill.type === "none" ? "transparent" : o.fill.color }} />
                    <input
                      className="dz-rename"
                      aria-label={`Rename ${o.name}`}
                      defaultValue={o.name}
                      maxLength={40}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => finishRename(o, e.target.value, true)}
                      onKeyDown={(e) => { if (e.key === "Enter") finishRename(o, e.currentTarget.value, true); else if (e.key === "Escape") finishRename(o, "", false); }}
                    />
                  </span>
                ) : (
                  <button type="button" className="dz-oname" aria-pressed={on} onClick={(e) => pick(e, o.id, i)} onDoubleClick={() => setEditing(o.id)} onKeyDown={(e) => { if (e.key === "F2") setEditing(o.id); }} title="Click to select. Drag to change when it is sewn. Double-click (or F2) to rename.">
                    <span className="dz-dot" style={{ background: o.fill.type === "none" ? "transparent" : o.fill.color, borderColor: o.fill.type === "none" ? o.stroke.color : undefined }} />
                    <span className="dz-oname-t">{o.name}</span>
                    {o.kind === "text" && <span className="dz-badge">Aa</span>}
                  </button>
                )}
                <button type="button" className="dz-oicon" aria-label={o.visible ? `Hide ${o.name}` : `Show ${o.name}`} aria-pressed={!o.visible} onClick={() => api.patchObject([o.id], { visible: !o.visible }, "commit")}><Eye off={!o.visible} /></button>
                <button type="button" className={`dz-oicon${o.locked ? " is-on" : ""}`} aria-label={o.locked ? `Unlock ${o.name}` : `Lock ${o.name}`} aria-pressed={o.locked} onClick={() => api.patchObject([o.id], { locked: !o.locked }, "commit")}><Lock on={o.locked} /></button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="dz-obar">
        <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.setSelection(design.objects.filter((o) => !o.locked).map((o) => o.id))} disabled={!design.objects.some((o) => !o.locked)}>Select all</button>
        <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.removeObjects(selection)} disabled={!selection.length}><Icons.Trash size={13} sw={1.8} aria-hidden="true" /> Delete</button>
      </div>
    </div>
  );
}
