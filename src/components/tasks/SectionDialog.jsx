import { useState } from "react";
import Modal from "../Modal";
import { Icons } from "../ui";
import { SECTION_TONES, TONE_DOT } from "./tones";
import "./tasks.css";

/**
 * Making a section, or changing one: its name, its colour, where it sits among the
 * others, and (when there is more than one) deleting it. A section that still holds
 * open tasks cannot be deleted without saying where they go, so none drops off the board.
 *
 * `onAdd` and `onDelete` say whether it worked; `onUpdate` and `onMove` report their own
 * failures, so this only has to close.
 */
export default function SectionDialog({ mode, col, columns, openCount = 0, nameProblem, onAdd, onUpdate, onMove, onDelete, onClose }) {
  const editing = mode === "edit";
  const [name, setName] = useState(editing ? col.label : "");
  const [tone, setTone] = useState(editing ? col.tone || "neutral" : "neutral");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const others = editing ? columns.filter((c) => c.id !== col.id) : [];
  const [target, setTarget] = useState(others[0]?.id || "");
  const index = editing ? columns.findIndex((c) => c.id === col.id) : -1;

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const label = name.trim();
    const problem = !label ? "Give the section a name." : nameProblem(label, editing ? col.id : undefined);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError("");
    if (editing) {
      const patch = {};
      if (label !== col.label) patch.label = label;
      if (tone !== (col.tone || "neutral")) patch.tone = tone;
      if (Object.keys(patch).length) await onUpdate(col, patch);
      onClose();
      return;
    }
    const message = await onAdd(label, tone);
    if (message) { setError(message); setBusy(false); return; }
    onClose();
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    const ok = await onDelete(col, target);
    if (ok) onClose(); else setBusy(false);
  }

  const footer = confirming ? (
    <>
      <button type="button" className="ghost-button" onClick={() => setConfirming(false)} disabled={busy}>Back</button>
      <button type="button" className="primary-button tk-btn-danger" onClick={remove} disabled={busy}>
        {busy ? "Deleting…" : "Delete section"}
      </button>
    </>
  ) : (
    <>
      {editing && others.length > 0 && (
        <button type="button" className="ghost-button tk-ft-l tk-danger" onClick={() => setConfirming(true)}>Delete section…</button>
      )}
      {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
      <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
      <button type="submit" className="primary-button" disabled={busy}>{editing ? "Save" : "Add section"}</button>
    </>
  );

  return (
    <Modal
      title={editing ? "Section settings" : "New section"}
      subtitle={editing ? undefined : "A section is a column of the board. Make as many as the team needs."}
      size="sm"
      glass
      onClose={onClose}
      onSubmit={confirming ? (e) => e.preventDefault() : submit}
      footer={footer}
    >
      {confirming ? (
        <div className="tk-form">
          <p className="tk-hint tk-full">
            {openCount > 0
              ? <>Delete <b>{col.label}</b>? Its {openCount} open task{openCount === 1 ? "" : "s"} will move to another section. Finished tasks are not affected.</>
              : <>Delete <b>{col.label}</b>? It has no open tasks.</>}
          </p>
          {openCount > 0 && (
            <label className="tk-f tk-full">Move its open tasks to
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                {others.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          )}
        </div>
      ) : (
        <div className="tk-form">
          <label className="tk-f tk-full">Name
            <input value={name} onChange={(e) => { setName(e.target.value); setError(""); }} placeholder="e.g. Waiting on supplier" maxLength={40} required />
          </label>
          <div className="tk-f tk-full" role="group" aria-label="Colour">
            Colour
            <div className="tk-swatches">
              {SECTION_TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="tk-swatch"
                  style={{ "--dot": TONE_DOT[t] }}
                  aria-pressed={tone === t}
                  aria-label={t === "ghost" ? "Grey" : t === "neutral" ? "Neutral" : t[0].toUpperCase() + t.slice(1)}
                  onClick={() => setTone(t)}
                />
              ))}
            </div>
          </div>
          {editing && (
            <div className="tk-f tk-full">
              Position
              <div className="tk-row">
                <button type="button" className="ghost-button" disabled={index <= 0} onClick={() => onMove(col, -1)}><Icons.ChevronLeft size={14} /> Move left</button>
                <button type="button" className="ghost-button" disabled={index >= columns.length - 1} onClick={() => onMove(col, 1)}>Move right <Icons.ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
