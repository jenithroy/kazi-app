import { useEffect, useRef, useState } from "react";
import { NOTE_MAX } from "../../lib/attendance";

/**
 * A short note on one day: a text box with Save and Cancel. `onSave(text)` resolves to `true` when it
 * saved (the caller then closes this) or to a sentence saying what went wrong, which is shown and
 * leaves the box open so nothing typed is lost. Escape cancels; Ctrl or Cmd + Enter saves.
 */
export default function NoteEditor({ value = "", label, placeholder, onSave, onCancel, rows = 3 }) {
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const box = useRef(null);

  useEffect(() => { box.current?.focus({ preventScroll: true }); }, []);

  const clean = text.trim();
  async function save() {
    if (busy) return;
    setBusy(true);
    setProblem("");
    const result = await onSave(clean);
    if (result !== true) { setProblem(typeof result === "string" ? result : "Not saved. Try again."); setBusy(false); }
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
  }

  return (
    <div className="at-noter">
      <textarea
        ref={box}
        className="at-noter-box"
        rows={rows}
        maxLength={NOTE_MAX}
        value={text}
        placeholder={placeholder}
        aria-label={label}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="at-noter-foot">
        {problem
          ? <span className="at-noter-err" role="alert">{problem}</span>
          : <span className="at-noter-count" aria-hidden="true">{text.length > NOTE_MAX - 80 ? `${text.length}/${NOTE_MAX}` : ""}</span>}
        <button type="button" className="kb-btn kb-btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="kb-btn kb-btn--primary" onClick={save} disabled={busy || clean === value.trim()}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
