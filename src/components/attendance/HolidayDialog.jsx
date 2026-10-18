import { useMemo, useState } from "react";
import Modal from "../Modal";
import Select from "../Select";
import DatePicker from "../DatePicker";
import { holidayDays, holidaySpan } from "../../lib/holidayDays";
import { cn } from "../ui";
import "../tasks/tasks.css";       // the dialog's fields (.tk-f, .tk-form) are the Tasks dialogs' fields

const REGIONS = [
  { value: "nepal", label: "Nepal" },
  { value: "uk", label: "UK" },
  { value: "", label: "Everyone" },
];
const regionWord = (r) => (r === "nepal" ? "Nepal" : r === "uk" ? "UK" : "Everyone");

/**
 * The days the office is closed besides Saturdays. Everyone can read the list; whoever may edit
 * Attendance (at tier 2 or above, the same rule the database applies) also gets the form to add a
 * run of days, and a Remove on each. `onAdd({ name, start, end, region })` and `onRemove(id)` say
 * whether it worked (true) or what went wrong (a sentence), and the dialog stays open either way so
 * a second holiday (Tihar after Dashain) is one more pass through the form.
 */
export default function HolidayDialog({ holidays, status, canManage, today, defaultRegion = "nepal", firstDay, onAdd, onRemove, onRetry, onClose }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState(firstDay || "");
  const [end, setEnd] = useState("");
  const [region, setRegion] = useState(defaultRegion);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(null);          // the holiday whose Remove has been pressed once

  const { coming, past } = useMemo(() => ({
    coming: holidays.filter((h) => h.end >= today).sort((a, b) => a.start.localeCompare(b.start)),
    past: holidays.filter((h) => h.end < today).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 12),
  }), [holidays, today]);

  async function submit(e) {
    e.preventDefault();
    if (busy || status !== "ready") return;         // Enter in the name box while the list has not arrived
    const label = name.trim();
    if (!label) { setError("Give the holiday a name."); return; }
    if (!start) { setError("Choose the first day."); return; }
    const last = end || start;
    if (last < start) { setError("The last day cannot be before the first."); return; }
    if (holidayDays({ start, end: last }) > 60) { setError("A holiday can run for at most 60 days. Add a second one for the rest."); return; }
    setBusy(true);
    setError("");
    setDone("");
    const result = await onAdd({ name: label, start, end: last, region });
    setBusy(false);
    if (result !== true) { setError(result || "Not saved. Try again."); return; }
    setDone(`Added ${label}.`);
    setName("");
    setStart("");
    setEnd("");
  }

  async function remove(h) {
    if (sure !== h.id) { setSure(h.id); return; }
    setSure(null);
    setError("");
    const result = await onRemove(h.id);
    if (result !== true) setError(result || "Not removed. Try again.");
  }

  const listed = status === "ready";       // anything else is not an empty list: it is a list that has not arrived

  const row = (h) => (
    <li key={h.id} className="at-hol-row">
      <div className="at-hol-t">
        <b>{h.name}</b>
        <span>{holidaySpan(h)} · {holidayDays(h)} {holidayDays(h) === 1 ? "day" : "days"} · {regionWord(h.region)}</span>
      </div>
      {canManage && (
        <button type="button" className={cn("ghost-button at-hol-del", sure === h.id && "is-sure")} aria-label={`${sure === h.id ? "Remove it?" : "Remove"} ${h.name}`} onClick={() => remove(h)} onBlur={() => setSure((s) => (s === h.id ? null : s))}>
          {sure === h.id ? "Remove it?" : "Remove"}
        </button>
      )}
    </li>
  );

  const footer = (
    <>
      {error ? <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p> : done ? <p className="kmodal-msg" role="status">{done}</p> : null}
      <button type="button" className="ghost-button" onClick={onClose}>{canManage ? "Close" : "Done"}</button>
      {canManage && status !== "unavailable" && <button type="submit" className="primary-button" disabled={busy || !listed}>{busy ? "Adding…" : "Add holiday"}</button>}
    </>
  );

  return (
    <Modal
      title="Holidays"
      subtitle={canManage ? "Days the office is closed besides Saturdays. Nobody is marked absent on them." : "Days the office is closed besides Saturdays."}
      size="md"
      glass
      onClose={onClose}
      onSubmit={canManage ? submit : undefined}
      footer={footer}
    >
      {status === "unavailable" ? (
        <p className="tk-hint">Holidays are not switched on in the database yet (it needs migration 0059), so there is nothing to show or add.</p>
      ) : (
        <div className="at-hol">
          {canManage && (
            <div className="tk-form at-hol-form">
              <label className="tk-f tk-full">Name
                <input value={name} onChange={(e) => { setName(e.target.value); setError(""); setDone(""); }} placeholder="e.g. Dashain" maxLength={80} />
              </label>
              <div className="tk-f">From
                <DatePicker label="From" value={start} onChange={(v) => { setStart(v); setError(""); setDone(""); }} placeholder="First day" clearable={false} />
              </div>
              <div className="tk-f">To
                <DatePicker label="To" value={end} onChange={(v) => { setEnd(v); setError(""); }} placeholder="Same day" />
              </div>
              <div className="tk-f tk-full">For
                <Select label="For" value={region} onChange={setRegion} options={REGIONS} searchable={false} />
              </div>
            </div>
          )}

          {!listed ? (
            <p className="tk-hint" role="status">
              {status === "error"
                ? <>The list could not be loaded, so nothing can be added yet. {onRetry && <button type="button" className="ghost-button at-hol-retry" onClick={onRetry}>Try again</button>}</>
                : "Loading the list…"}
            </p>
          ) : (
            <>
              <h3 className="at-hol-h">{coming.length ? "On now and coming up" : "Nothing coming up"}</h3>
              {coming.length > 0 && <ul className="at-hol-list">{coming.map(row)}</ul>}
              {coming.length === 0 && <p className="tk-hint">{canManage ? "Add the next one above." : "No holidays are booked."}</p>}
            </>
          )}

          {listed && past.length > 0 && (
            <details className="at-hol-past">
              <summary>Earlier ({past.length})</summary>
              <ul className="at-hol-list">{past.map(row)}</ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
