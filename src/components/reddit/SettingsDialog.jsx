/**
 * What the check looks for, in words the team can change without a developer: which subreddits to read, the phrases that make a post a
 * lead, the words that only count together, the phrases that rule a post out, and how many points a post needs to be kept.
 *
 * A change applies to posts found from the next check on; posts already on the list keep the score they had. One line is one phrase;
 * a `*` stands for up to three words ("looking for a * manufacturer" also hits "looking for a high-end outerwear manufacturer").
 */
import { useId, useState } from "react";
import Modal from "../Modal";
import { settingsDraft, settingsProblem } from "../../lib/redditLeads";

export default function SettingsDialog({ settings, canEdit, onSave, onClose }) {
  const id = useId();
  const start = settingsDraft(settings);
  const [draft, setDraft] = useState(start);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => { setDraft((d) => ({ ...d, [k]: e.target.value })); setError(""); };
  const dirty = Object.keys(start).some((k) => start[k] !== draft[k]);

  async function submit(e) {
    e.preventDefault();
    if (saving || !canEdit) return;
    const problem = settingsProblem(draft);
    if (problem) { setError(problem); return; }
    setSaving(true);
    const res = await onSave(draft, start);
    setSaving(false);
    if (res.ok) onClose();
    else setError(res.message);
  }

  return (
    <Modal
      title="What to look for" subtitle="Used by every check from now on" size="lg" glass className="kmodal--reddit" onClose={saving ? undefined : onClose} onSubmit={submit}
      footer={(
        <>
          {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
          <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>{canEdit ? "Cancel" : "Close"}</button>
          {canEdit && <button type="submit" className="primary-button" disabled={saving || !dirty}>{saving ? "Saving…" : "Save"}</button>}
        </>
      )}
    >
      <div className="rdl-set">
        <div className="ec-f rdl-set-a">
          <label htmlFor={`${id}-subs`}>Subreddits to read</label>
          <textarea id={`${id}-subs`} rows={7} value={draft.subs} onChange={set("subs")} disabled={!canEdit} spellCheck={false} />
          <small className="ec-hint">One per line, like ClothingStartups. Only the newest 300 posts of each are read per check.</small>
        </div>
        <div className="ec-f rdl-set-b">
          <label htmlFor={`${id}-strong`}>Strong phrases</label>
          <textarea id={`${id}-strong`} rows={7} value={draft.strong} onChange={set("strong")} disabled={!canEdit} spellCheck={false} />
          <small className="ec-hint">One phrase per line. Each one a post contains is worth 40 points: one is enough.</small>
        </div>
        <div className="ec-f rdl-set-c">
          <label htmlFor={`${id}-weak`}>Weak words</label>
          <textarea id={`${id}-weak`} rows={6} value={draft.weak} onChange={set("weak")} disabled={!canEdit} spellCheck={false} />
          <small className="ec-hint">Each is worth 10 points, so they only make a lead together.</small>
        </div>
        <div className="ec-f rdl-set-d">
          <label htmlFor={`${id}-block`}>Rule a post out</label>
          <textarea id={`${id}-block`} rows={6} value={draft.block} onChange={set("block")} disabled={!canEdit} spellCheck={false} />
          <small className="ec-hint">A post with any of these is dropped, whatever else it says: sellers advertising, jobs, careers.</small>
        </div>
        <div className="ec-f rdl-set-e">
          <label htmlFor={`${id}-min`}>Points a post needs</label>
          <input id={`${id}-min`} type="text" inputMode="numeric" value={draft.minScore} onChange={set("minScore")} disabled={!canEdit} />
          <small className="ec-hint">30 keeps a post with one strong phrase or three weak words. Higher means fewer, surer leads.</small>
        </div>
      </div>
    </Modal>
  );
}
