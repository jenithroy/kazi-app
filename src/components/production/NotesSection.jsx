import { useState } from "react";
import { updateRow } from "../../lib/db";
import { todayDate } from "../../utils/date";
import { fmtField } from "../../lib/calendar";
import { Icons } from "../ui";
import PersonLink from "../profile/PersonLink";

/**
 * An order's notes: what people wrote about it. Anyone can read them; people who can edit Production add
 * and delete. The form is a button until someone wants it (so opening an order does not put a cursor in
 * a box), deleting asks in place ("Delete this note? Delete / Keep") instead of in a pop-up, and a failure
 * is said under the form.
 *
 * There is no "attach a picture" here on purpose. The old page offered one, uploaded the file, and then saved
 * the note without it: the notes table has columns for the text and the author and nothing else, so the picture
 * could never come back (and no one has ever uploaded one). A note shows its date only when the database
 * sends one; it does not today.
 *
 * `onChanged` is called after a note was added or removed so the page can read the order again.
 */
export default function NotesSection({ order, canEdit, profile, onChanged }) {
  const [noteText, setNoteText] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState("");        // the note whose delete is being confirmed
  const [error, setError] = useState("");

  async function handleAddNote(e) {
    e.preventDefault();
    if (!noteText.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const newNote = {
        id: `note_${Date.now()}`,
        text: noteText.trim(),
        date: todayDate(),
        by: profile?.name || "Unknown",
      };
      await updateRow("orders", order.id, { notesList: [...(order.notesList || []), newNote] });
      setNoteText("");
      setAdding(false);
      onChanged?.();
    } catch (err) {
      console.error("Failed to add note:", err);
      setError(`Could not add the note: ${err?.message || "try again"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNote(noteId) {
    setError("");
    try {
      await updateRow("orders", order.id, { notesList: (order.notesList || []).filter((n) => n.id !== noteId) });
      setAsking("");
      onChanged?.();
    } catch (err) {
      console.error("Failed to delete note:", err);
      setError(`Could not delete the note: ${err?.message || "try again"}`);
    }
  }

  const notes = order.notesList || [];

  return (
    <section className="pr-notes" aria-label="Notes">
      <h3 className="pr-h">Notes <span>{notes.length || ""}</span></h3>

      {notes.length === 0 ? (
        <p className="pr-notes-none">No notes yet.</p>
      ) : (
        <ul className="pr-notes-list">
          {notes.map((n) => (
            <li key={n.id} className="pr-note">
              <div className="pr-note-meta">
                <span><b>{n.by ? <PersonLink name={n.by} /> : "Someone"}</b>{n.date ? ` · ${fmtField(n.date) || n.date}` : ""}</span>
                {canEdit && (asking === n.id ? (
                  <span className="pr-note-ask">
                    Delete this note?
                    <button type="button" className="pr-note-del" onClick={() => handleDeleteNote(n.id)}>Delete</button>
                    <button type="button" onClick={() => setAsking("")}>Keep</button>
                  </span>
                ) : (
                  <button type="button" className="pr-note-x" onClick={() => setAsking(n.id)} aria-label={`Delete the note by ${n.by || "someone"}${n.date ? ` on ${fmtField(n.date) || n.date}` : ""}`}>
                    <Icons.Trash size={13} sw={1.8} aria-hidden="true" />
                  </button>
                ))}
              </div>
              {n.text && <p className="pr-note-text">{n.text}</p>}
              {n.imageUrl && (
                <a href={n.imageUrl} target="_blank" rel="noopener noreferrer" className="pr-note-img" aria-label="Open the attached picture">
                  <img src={n.imageUrl} alt="Attachment" loading="lazy" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !adding && (
        <div>
          <button type="button" className="ghost-button pr-note-add" onClick={() => setAdding(true)}>
            <Icons.Plus size={14} sw={2} aria-hidden="true" /> Add a note
          </button>
        </div>
      )}

      {canEdit && adding && (
        <form className="pr-note-form" onSubmit={handleAddNote}>
          <textarea
            placeholder="Write a note…"
            aria-label="New note"
            value={noteText}
            onChange={(e) => { setNoteText(e.target.value); setError(""); }}
            rows={2}
            autoFocus
          />
          <div className="pr-note-actions">
            <span className="pr-note-btns">
              <button type="button" className="ghost-button" onClick={() => { setAdding(false); setNoteText(""); setError(""); }} disabled={saving}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving || !noteText.trim()}>
                {saving ? "Adding…" : "Add note"}
              </button>
            </span>
          </div>
          {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
        </form>
      )}

      {error && !adding && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
    </section>
  );
}
