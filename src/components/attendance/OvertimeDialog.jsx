import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import Select from "../Select";
import DatePicker from "../DatePicker";
import { addDays, dayShort, fmtMinutes } from "../../lib/attendance";
import { OT_REASONS, fetchOvertimeDays, overtimeNotSetUp, overtimeProblem, reasonLabel, removeApproval, saveApproval } from "../../lib/overtime";
import { cn } from "../ui";
import "../tasks/tasks.css";       // the dialog's fields (.tk-f, .tk-form) are the Tasks dialogs' fields

const pad = (n) => String(n).padStart(2, "0");
/** "18:00" plus some hours, kept inside the day. */
const plusHours = (hhmm, h) => {
  const [a, b] = String(hhmm || "18:00").split(":").map(Number);
  const mins = Math.min(23 * 60 + 59, (a || 0) * 60 + (b || 0) + h * 60);
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
};

/**
 * Overtime: approved before the person clocks in, and only the time inside the approved window (after their own shift ends)
 * ever counts. Whoever may edit Attendance (tier 2 or above, as the database says) gets the form to approve it for a day and a
 * Remove on each; everyone else who can open it sees the list. The database refuses an approval for a person who has already
 * clocked in that day, and the dialog says so in a sentence. The list reads the days around today straight from the database,
 * and a table that is not there yet (migration 0064) reads as "not switched on".
 *
 * `staff` is the directory (with `personId`); `shiftOf(name, iso)` is that person's hours that day, so "from" starts at the end
 * of their shift.
 */
export default function OvertimeDialog({ staff, date, today, canManage, shiftOf, onChanged, onClose }) {
  const people = useMemo(() => staff.filter((s) => s.personId).sort((a, b) => a.name.localeCompare(b.name)), [staff]);
  const options = useMemo(() => people.map((s) => ({ value: s.personId, label: s.name, hint: s.jobRole || undefined })), [people]);
  const nameOf = useCallback((id) => people.find((s) => s.personId === id)?.name || "Someone", [people]);

  const first = date >= today ? date : today;
  const [state, setState] = useState({ status: "loading", rows: [] });        // loading | ready | unavailable | error
  const [personId, setPersonId] = useState("");
  const [day, setDay] = useState(first);
  const [from, setFrom] = useState("18:00");
  const [until, setUntil] = useState("20:00");
  const [reason, setReason] = useState("other");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(null);                                       // the approval whose Remove has been pressed once

  const load = useCallback(async () => {
    try {
      const rows = await fetchOvertimeDays({ from: addDays(today, -14), to: addDays(today, 60) });
      setState({ status: "ready", rows });
      return rows;
    } catch (err) {
      console.error("Failed to read overtime:", err);
      setState((s) => ({ status: overtimeNotSetUp(err) ? "unavailable" : "error", rows: s.rows }));
      return null;
    }
  }, [today]);
  useEffect(() => { load(); }, [load]);

  // the start of the window is the end of their shift that day
  function chooseWindow(id, iso) {
    const who = people.find((s) => s.personId === id);
    const end = (who && shiftOf?.(who.name, iso)?.end) || "18:00";
    setFrom(end);
    setUntil(plusHours(end, 2));
  }

  async function submit(e) {
    e.preventDefault();
    if (busy || state.status !== "ready") return;
    if (!personId) { setError("Choose the person."); return; }
    if (!day) { setError("Choose the day."); return; }
    if (until <= from) { setError("The end time has to be after the start time."); return; }
    setBusy(true);
    setError("");
    setDone("");
    try {
      await saveApproval({ personId, date: day, from, until, reason, note });
      await load();
      onChanged?.();
      setDone(`Approved ${nameOf(personId)} for ${dayShort(day)}, ${from} to ${until}.`);
      setNote("");
    } catch (err) {
      console.error("Failed to approve the overtime:", err);
      setError(overtimeProblem(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(o) {
    if (sure !== o.id) { setSure(o.id); return; }
    setSure(null);
    setError("");
    try {
      await removeApproval(o.id);
      const rows = await load();
      // a delete the database does not allow removes nothing and says nothing: only the list proves it went
      if (rows?.some((r) => r.id === o.id)) setError("Not removed. You may not be allowed to change overtime.");
      else onChanged?.();
    } catch (err) {
      console.error("Failed to remove the overtime:", err);
      setError(overtimeProblem(err));
    }
  }

  const { coming, past } = useMemo(() => ({
    coming: state.rows.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date) || nameOf(a.personId).localeCompare(nameOf(b.personId))),
    past: state.rows.filter((r) => r.date < today).sort((a, b) => b.date.localeCompare(a.date)),
  }), [state.rows, today, nameOf]);

  const listed = state.status === "ready";

  const row = (o) => (
    <li key={o.id} className="at-hol-row">
      <div className="at-hol-t">
        <b>{nameOf(o.personId)}</b>
        <span>
          {dayShort(o.date)} · {o.from} to {o.until} · {reasonLabel(o.reason)}
          {o.date < today || (o.date === today && o.clockedOut) ? ` · ${o.minutes > 0 ? `${fmtMinutes(o.minutes)} counted` : "none counted"}` : ""}
        </span>
      </div>
      {canManage && (
        <button type="button" className={cn("ghost-button at-hol-del", sure === o.id && "is-sure")} aria-label={`${sure === o.id ? "Remove it?" : "Remove"} overtime for ${nameOf(o.personId)} on ${dayShort(o.date)}`} onClick={() => remove(o)} onBlur={() => setSure((s) => (s === o.id ? null : s))}>
          {sure === o.id ? "Remove it?" : "Remove"}
        </button>
      )}
    </li>
  );

  const footer = (
    <>
      {error ? <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p> : done ? <p className="kmodal-msg" role="status">{done}</p> : null}
      <button type="button" className="ghost-button" onClick={onClose}>{canManage ? "Close" : "Done"}</button>
      {canManage && state.status !== "unavailable" && <button type="submit" className="primary-button" disabled={busy || !listed}>{busy ? "Approving…" : "Approve overtime"}</button>}
    </>
  );

  return (
    <Modal
      title="Overtime"
      subtitle={canManage
        ? "Approve it before the person clocks in. Only the time inside the approved window, after their shift ends, counts."
        : "Approved before the person clocked in. Only the time inside the approved window counts."}
      size="md"
      glass
      onClose={onClose}
      onSubmit={canManage ? submit : undefined}
      footer={footer}
    >
      {state.status === "unavailable" ? (
        <p className="tk-hint">Overtime is not switched on in the database yet (it needs migration 0064), so there is nothing to show or approve.</p>
      ) : (
        <div className="at-hol">
          {canManage && (
            <div className="tk-form at-hol-form">
              <div className="tk-f tk-full">Person
                <Select
                  label="Person" value={personId} placeholder="Choose the person" searchPlaceholder="Search staff" options={options}
                  onChange={(v) => { setPersonId(v); chooseWindow(v, day); setError(""); setDone(""); }}
                />
              </div>
              <div className="tk-f tk-full">Day
                <DatePicker label="Day" value={day} onChange={(v) => { setDay(v); if (personId) chooseWindow(personId, v); setError(""); setDone(""); }} placeholder="The day" clearable={false} />
              </div>
              <label className="tk-f">From
                <input type="time" value={from} onChange={(e) => { setFrom(e.target.value); setError(""); setDone(""); }} />
              </label>
              <label className="tk-f">Until
                <input type="time" value={until} onChange={(e) => { setUntil(e.target.value); setError(""); setDone(""); }} />
              </label>
              <div className="tk-f tk-full">Why it is needed
                <Select label="Why it is needed" value={reason} onChange={setReason} options={OT_REASONS} searchable={false} />
              </div>
              <label className="tk-f tk-full">Note
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" maxLength={280} />
              </label>
            </div>
          )}

          {!listed ? (
            <p className="tk-hint" role="status">
              {state.status === "error"
                ? <>The list could not be loaded, so nothing can be approved yet. <button type="button" className="ghost-button at-hol-retry" onClick={load}>Try again</button></>
                : "Loading the list…"}
            </p>
          ) : (
            <>
              <h3 className="at-hol-h">{coming.length ? "Today and coming up" : "Nothing approved ahead"}</h3>
              {coming.length > 0 && <ul className="at-hol-list">{coming.map(row)}</ul>}
              {coming.length === 0 && <p className="tk-hint">{canManage ? "Approve it above, before the person clocks in." : "No overtime is approved."}</p>}
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
