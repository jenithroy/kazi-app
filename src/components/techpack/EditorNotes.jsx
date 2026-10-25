/**
 * Finishing & notes: the two lists printed at the bottom of the sheet (one item to a line, with a live count of how many fit on the
 * first page) and the wash care line. A first-generation pack's old remarks and trims are shown read-only beneath, so nothing typed on
 * the old sheet is hidden; the editor never writes them.
 */
import { useId } from "react";
import { Field } from "../EditCard";
import { bullets } from "../../lib/techpack";
import { Flow, useEditor } from "./editorContext";

/** "7 lines. Up to 12 lines fit on the first page." (and what happens past that). */
function Count({ text, fit, id }) {
  const n = bullets(text).length;
  const over = n > fit;
  return (
    <small id={id} className={`ec-hint${over ? " tpe-over" : ""}`} aria-live="polite">
      {n} {n === 1 ? "line" : "lines"}. {over ? `Only the first ${fit} fit on the first page.` : `Up to ${fit} lines fit on the first page.`}
    </small>
  );
}

export function NotesMain() {
  const { pack, set, canEdit } = useEditor();
  const uid = useId();
  return (
    <Flow>
      <Field label="Finishing and construction" htmlFor={`${uid}-fin`} wide hint="One item to a line, like “Double-breasted front (6 buttons)”.">
        <textarea
          id={`${uid}-fin`} className="tpe-lines-box" rows={13} value={pack.finishing} disabled={!canEdit} aria-describedby={`${uid}-fin-n`}
          placeholder={"Double-breasted front (6 buttons)\nStructured high collar, no buckle\nFully lined"} onChange={(e) => set({ finishing: e.target.value })}
        />
        <Count text={pack.finishing} fit={12} id={`${uid}-fin-n`} />
      </Field>
    </Flow>
  );
}

export function NotesSide() {
  const { pack, set, canEdit, oldSheet } = useEditor();
  const uid = useId();
  return (
    <Flow>
      <Field label="Notes" htmlFor={`${uid}-notes`} wide hint="One to a line. What the factory must not get wrong.">
        <textarea
          id={`${uid}-notes`} className="tpe-lines-box" rows={6} value={pack.notes} disabled={!canEdit} aria-describedby={`${uid}-notes-n`}
          placeholder={"The collar must stand upright on its own.\nNo exterior logo."} onChange={(e) => set({ notes: e.target.value })}
        />
        <Count text={pack.notes} fit={6} id={`${uid}-notes-n`} />
      </Field>
      <Field label="Wash care" htmlFor={`${uid}-wash`} wide hint="One line.">
        <input id={`${uid}-wash`} value={pack.washCare} maxLength={160} placeholder="Machine wash cold, inside out" disabled={!canEdit} onChange={(e) => set({ washCare: e.target.value })} />
      </Field>
      {oldSheet.length > 0 && (
        <div className="ec-wide tpe-old">
          <span className="ec-cap">From the old sheet</span>
          {oldSheet.map(([label, text]) => (
            <p key={label} className="ec-note"><b>{label}:</b> {text}</p>
          ))}
          <p className="ec-note">Kept as it was. It is not printed on the new sheet, so copy anything that matters into the lists.</p>
        </div>
      )}
    </Flow>
  );
}
