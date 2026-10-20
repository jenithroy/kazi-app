/**
 * The card a piece of work opens in (the shared EditCard): its title, type, day, time and notes on the left, its picture and where
 * it stands on the right. Nothing is saved until Save is pressed (the old drawer saved on every keystroke, so a half-typed title
 * was already in the database); a card with typing in it asks before it is thrown away.
 *
 * The day decides where the work lives: pick one and it goes on the calendar, clear it and it goes back to the ideas inbox. A
 * phone uses the same field to put work on a day, since there is no dragging there.
 *
 * `item` is the saved row (null for new work, which starts from `draft`). The card opens on what it was given and is not rewritten by
 * a later look at the database, so a colleague's change cannot overwrite what is being typed; Save then writes only the fields this card
 * changed, so a colleague's change to the others (the day, say) is not undone either.
 */
import { useId, useState } from "react";
import EditCard, { Field, KV, Seg } from "../EditCard";
import DatePicker from "../DatePicker";
import { fmtField, fmtWords } from "../../lib/calendar";
import { TYPES, changesOf, draftOf, formProblem, isDirty, payloadOf, titleOf } from "../../lib/contentCalendar";

const WEB = /^https?:\/\/\S+$/i;

/** The picture the link points at, or why there is none. A link that will not load says so rather than showing a broken image. */
function Picture({ url, hint }) {
  const [bad, setBad] = useState("");
  const ok = url && bad !== url;
  return (
    <div className="mk-pic ec-wide">
      {ok ? (
        <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBad(url)} />
      ) : (
        <span>{url ? "That link did not load as a picture." : hint}</span>
      )}
    </div>
  );
}

export default function ItemCard({ item, draft, canEdit, onClose, onSave, onDelete }) {
  const uid = useId();
  const creating = !item;
  const [base] = useState(() => (item ? draftOf(item) : draft));
  const [form, setForm] = useState(base);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const url = form.mediaUrl.trim();
  const off = !canEdit;

  async function save() {
    const problem = formProblem(form);
    if (problem) return { ok: false, message: problem };
    if (!item) return onSave(payloadOf(form), null);
    const changes = changesOf(form, base);          // only what was changed here: a colleague's change to the rest is not undone
    return Object.keys(changes).length ? onSave(changes, item.id) : { ok: true };
  }

  const main = (
    <>
      <Field label="Title" htmlFor={`${uid}-title`} wide>
        <input
          id={`${uid}-title`} value={form.title} onChange={(e) => set("title", e.target.value)} required maxLength={200}
          placeholder="e.g. Heavyweight hoodie shoot" autoFocus={creating} disabled={off} autoComplete="off"
        />
      </Field>
      <Field label="Type" wide>
        <Seg value={form.type} onChange={(v) => set("type", v)} options={TYPES.map((t) => [t, t])} label="Type" disabled={off} />
      </Field>
      <Field label="Day" htmlFor={`${uid}-day`} hint={form.date ? undefined : "No day: it stays in the ideas inbox."}>
        <DatePicker id={`${uid}-day`} value={form.date} onChange={(v) => set("date", v)} label="Day" placeholder="No day" disabled={off} />
      </Field>
      <Field label="Time" htmlFor={`${uid}-time`}>
        <input id={`${uid}-time`} value={form.timeSlot} onChange={(e) => set("timeSlot", e.target.value)} placeholder="e.g. 10:00 AM – 2:00 PM" maxLength={60} disabled={off} autoComplete="off" />
      </Field>
      <Field label="Caption, notes, hook" htmlFor={`${uid}-notes`} wide>
        <textarea
          id={`${uid}-notes`} rows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)}
          placeholder="A caption draft, hook ideas, shoot notes…" disabled={off}
        />
      </Field>
      <Field
        label="Picture link" htmlFor={`${uid}-pic`} wide
        hint={url && !WEB.test(url) ? undefined : "Optional: a link to an image. It shows as the thumbnail."}
      >
        <input
          id={`${uid}-pic`} inputMode="url" value={form.mediaUrl} onChange={(e) => set("mediaUrl", e.target.value)}
          placeholder="https://…" disabled={off} autoComplete="off" spellCheck={false}
        />
      </Field>
    </>
  );

  const side = (
    <>
      <Picture key={WEB.test(url) ? url : ""} url={WEB.test(url) ? url : ""} hint="No picture yet. Paste a link on the left and it shows here." />
      <KV
        rows={[
          ["Where it is", form.date ? fmtWords(form.date) : "In the ideas inbox"],
          ["Type", form.type],
          ...(item?.createdAt ? [["Added", fmtField(item.createdAt.slice(0, 10))]] : []),
        ]}
      />
    </>
  );

  return (
    <EditCard
      title={creating ? (base.date ? "New plan" : "New idea") : titleOf(item)}
      subtitle={form.date ? fmtWords(form.date) : "In the ideas inbox"}
      main={main} side={side} mainLabel="Details" sideLabel="Picture"
      canEdit={canEdit} creating={creating} dirty={isDirty(form, base)}
      submitLabel={creating ? "Add" : "Save changes"} className="kmodal--mk"
      onSave={save} onDelete={creating || !onDelete ? undefined : onDelete} deleteName={creating ? "" : titleOf(item)}
      onClose={onClose}
    />
  );
}
