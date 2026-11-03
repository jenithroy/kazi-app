import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../Modal";
import Select from "../Select";
import DatePicker from "../DatePicker";
import { addDays, dayShort, fmtMinutes } from "../../lib/attendance";
import {
  OT_REASONS, declineRequest, fetchOvertimeDays, fetchRequests, fetchShift, overtimeNotSetUp, overtimeProblem, reasonLabel,
  removeApproval, requestState, requestsNotSetUp, saveApproval, saveRequest, withdrawRequest,
} from "../../lib/overtime";
import { DEFAULT_SHIFT } from "../../lib/workRules";
import { cn } from "../ui";
import "../tasks/tasks.css";       // the dialog's fields (.tk-f, .tk-form) are the Tasks dialogs' fields

const pad = (n) => String(n).padStart(2, "0");
/** "18:00" plus some hours, kept inside the day. */
const plusHours = (hhmm, h) => {
  const [a, b] = String(hhmm || "18:00").split(":").map(Number);
  const mins = Math.min(23 * 60 + 59, (a || 0) * 60 + (b || 0) + h * 60);
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
};

/** How a request stands, in a word and a colour (the dialog's own tags; the page's `.kb-tag` does not reach a portalled dialog). */
const STATE = {
  waiting: { label: "Waiting", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  declined: { label: "Declined", tone: "bad" },
  late: { label: "Not approved in time", tone: "" },
};
const Tag = ({ state }) => <span className={cn("at-ot-st", STATE[state].tone && `at-ot-st--${STATE[state].tone}`)}>{STATE[state].label}</span>;

/**
 * Overtime: asked for and approved before the person clocks in, and only the time inside the approved window (after their own shift
 * ends) ever counts.
 *
 *   A person         asks for themselves (day, from, until, why), sees where each request stands (waiting, approved, declined), withdraws
 *                    one that is waiting, and asks again after a decline.
 *   An approver      (tier 2 or above with Attendance, as the database says) sees the requests waiting and approves or declines each, and
 *                    can still approve anyone for a day without a request. Approving a request is an approval like any other: a request
 *                    is "approved" because an approval exists for that person and day (lib/overtime.js `requestState`).
 *
 * The database refuses a request or an approval once the person has clocked in that day, and a request for a day that has passed;
 * the dialog says so in a sentence. A table that is not there yet (migration 0064 for approvals, 0065 for requests) reads as
 * "not switched on", and the rest of the dialog still works.
 *
 * The two times are the OVERTIME only, never the whole day: the database counts nothing before the person's own shift ends. So the
 * form says so, shows that person's normal day for the chosen day (asked of the database, `fetchShift`, so it is what is counted; the
 * page's own reading of their hours until it answers), starts the window where that day ends, warns when the window starts inside the
 * normal day, and refuses one that ends before the normal day does (it could never count).
 *
 * `staff` is the directory (with `personId`; just the person themselves for someone who cannot see the team), `me` the signed-in
 * person's id, `shiftOf(name, iso)` that person's hours that day (the page's own reading).
 */
export default function OvertimeDialog({ staff, me, date, today, canManage, shiftOf, onChanged, onClose }) {
  const people = useMemo(() => staff.filter((s) => s.personId).sort((a, b) => a.name.localeCompare(b.name)), [staff]);
  const options = useMemo(() => people.map((s) => ({ value: s.personId, label: s.name, hint: s.jobRole || undefined })), [people]);
  const nameOf = useCallback((id) => people.find((s) => s.personId === id)?.name || "Someone", [people]);

  const first = date >= today ? date : today;
  const [state, setState] = useState({ status: "loading", rows: [] });        // approvals: loading | ready | unavailable | error
  const [asks, setAsks] = useState({ status: "loading", rows: [] });          // requests: the same
  const [personId, setPersonId] = useState(canManage ? "" : me);
  const [day, setDay] = useState(first);
  const [from, setFrom] = useState("18:00");
  const [until, setUntil] = useState("20:00");
  const [reason, setReason] = useState("other");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(null);                                       // the approval or request whose Remove / Withdraw has been pressed once
  const [declining, setDeclining] = useState(null);                             // { id, note }: the request an approver is writing a decline for
  const working = useRef(false);                                                 // a press that spends a write: a ref, because two quick presses both pass a state guard
  const formTop = useRef(null);
  const [shift, setShift] = useState(null);                                     // their normal day on the chosen day: { start, end, source: "database" | "app" | "default" }
  const typedTimes = useRef(false);                                              // the person has typed their own times: the window stops following the normal day

  const load = useCallback(async () => {
    const own = canManage ? {} : { personId: me };
    const range = { from: addDays(today, -14), to: addDays(today, 60) };
    const [a, r] = await Promise.allSettled([fetchOvertimeDays({ ...range, ...own }), fetchRequests({ ...range, ...own })]);
    let approvals = null;
    if (a.status === "fulfilled") { approvals = a.value; setState({ status: "ready", rows: a.value }); }
    else {
      console.error("Failed to read overtime:", a.reason);
      setState((s) => ({ status: overtimeNotSetUp(a.reason) ? "unavailable" : "error", rows: s.rows }));
    }
    if (r.status === "fulfilled") setAsks({ status: "ready", rows: r.value });
    else {
      if (!requestsNotSetUp(r.reason)) console.error("Failed to read overtime requests:", r.reason);
      setAsks((s) => ({ status: requestsNotSetUp(r.reason) ? "unavailable" : "error", rows: s.rows }));
    }
    return approvals;
  }, [today, canManage, me]);
  useEffect(() => { load(); }, [load]);

  // Their normal day on the chosen day: the page's own reading at once, then what the database says (the hours it counts overtime after).
  useEffect(() => {
    if (!personId || !day) { setShift(null); return undefined; }
    let live = true;
    const own = shiftOf?.(nameOf(personId), day);
    setShift({ start: own?.start || DEFAULT_SHIFT.start, end: own?.end || DEFAULT_SHIFT.end, source: own ? "app" : "default" });
    fetchShift({ personId, date: day }).then((s) => { if (live) setShift({ ...s, source: "database" }); }, () => {});
    return () => { live = false; };
  }, [personId, day, shiftOf, nameOf]);

  // The window starts where that normal day ends, until the person types their own times.
  useEffect(() => {
    if (!shift || typedTimes.current) return;
    setFrom(shift.end);
    setUntil(plusHours(shift.end, 2));
  }, [shift?.end]);   // eslint-disable-line react-hooks/exhaustive-deps

  const clearMsg = () => { setError(""); setDone(""); };

  async function submit(e) {
    e.preventDefault();
    if (busy || working.current || state.status !== "ready") return;
    if (!personId) { setError(canManage ? "Choose the person." : "Your profile could not be found, so nothing can be asked for."); return; }
    if (!day) { setError("Choose the day."); return; }
    if (!canManage && day < today) { setError("Choose today or a coming day."); return; }
    if (until <= from) { setError("The end time has to be after the start time."); return; }
    // overtime is only the time after the normal day: a window that ends before it does could never count (asked of the database, so it is not a guess)
    if (shift?.source === "database" && until <= shift.end) {
      setError(`${canManage ? `${nameOf(personId)}'s` : "Your"} normal day ends at ${shift.end}, and only the time after it counts as overtime. Choose an end time after that.`);
      return;
    }
    working.current = true;
    setBusy(true);
    clearMsg();
    try {
      if (canManage) {
        await saveApproval({ personId, date: day, from, until, reason, note });
        setDone(`Approved ${nameOf(personId)} for ${dayShort(day)}, ${from} to ${until}.`);
      } else {
        await saveRequest({ personId, date: day, from, until, reason, note });
        setDone(`Asked for ${dayShort(day)}, ${from} to ${until}. It counts only once it is approved, before you clock in.`);
      }
      await load();
      onChanged?.();
      setNote("");
    } catch (err) {
      console.error(canManage ? "Failed to approve the overtime:" : "Failed to ask for the overtime:", err);
      setError(overtimeProblem(err, { self: !canManage }));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function remove(o) {
    if (sure !== `a${o.id}`) { setSure(`a${o.id}`); return; }
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

  // an approver says yes to a request exactly as asked: it is an approval like any other
  async function approve(r) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    clearMsg();
    try {
      await saveApproval({ personId: r.personId, date: r.date, from: r.from, until: r.until, reason: r.reason, note: r.note });
      await load();
      onChanged?.();
      setDone(`Approved ${nameOf(r.personId)} for ${dayShort(r.date)}, ${r.from} to ${r.until}.`);
    } catch (err) {
      console.error("Failed to approve the overtime request:", err);
      setError(overtimeProblem(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function decline() {
    if (!declining || working.current) return;
    working.current = true;
    setBusy(true);
    clearMsg();
    const r = asks.rows.find((x) => x.id === declining.id);
    try {
      await declineRequest(declining.id, declining.note);
      setDeclining(null);
      await load();
      onChanged?.();
      setDone(`Declined ${r ? `${nameOf(r.personId)}'s request for ${dayShort(r.date)}` : "the request"}.`);
    } catch (err) {
      console.error("Failed to decline the overtime request:", err);
      setError(overtimeProblem(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function withdraw(r) {
    if (sure !== `r${r.id}`) { setSure(`r${r.id}`); return; }
    setSure(null);
    setError("");
    try {
      await withdrawRequest(r.id);
      await load();
      onChanged?.();
    } catch (err) {
      console.error("Failed to withdraw the overtime request:", err);
      setError(overtimeProblem(err, { self: true }));
    }
  }

  // ask again after a decline: the same words in the form, ready to send
  function again(r) {
    typedTimes.current = true;                       // these are the times they asked for: the window must not jump back to the end of the normal day
    setDay(r.date >= today ? r.date : today);
    setFrom(r.from);
    setUntil(r.until);
    setReason(r.reason);
    setNote(r.note);
    clearMsg();
    formTop.current?.scrollIntoView?.({ block: "nearest" });
    formTop.current?.querySelector("input")?.focus?.();
  }

  const listed = state.status === "ready";
  const asksReady = asks.status === "ready";

  const { coming, past } = useMemo(() => ({
    coming: state.rows.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date) || nameOf(a.personId).localeCompare(nameOf(b.personId))),
    past: state.rows.filter((r) => r.date < today).sort((a, b) => b.date.localeCompare(a.date)),
  }), [state.rows, today, nameOf]);

  // everything one person has asked for or been given, newest first within "coming" and "earlier" (a person's own list)
  const items = useMemo(() => {
    const list = asks.rows.map((r) => ({ key: `r${r.id}`, request: r, personId: r.personId, date: r.date, ...requestState(r, state.rows, today) }));
    state.rows.forEach((a) => {
      if (!asks.rows.some((r) => r.personId === a.personId && r.date === a.date)) list.push({ key: `a${a.id}`, request: null, approval: a, personId: a.personId, date: a.date, state: "approved" });
    });
    return list;
  }, [asks.rows, state.rows, today]);
  const myComing = useMemo(() => items.filter((i) => i.date >= today).sort((a, b) => a.date.localeCompare(b.date)), [items, today]);
  const myPast = useMemo(() => items.filter((i) => i.date < today).sort((a, b) => b.date.localeCompare(a.date)), [items, today]);

  const waiting = useMemo(
    () => asks.rows.map((r) => ({ r, ...requestState(r, state.rows, today) })).filter((x) => x.state === "waiting")
      .sort((a, b) => a.r.date.localeCompare(b.r.date) || nameOf(a.r.personId).localeCompare(nameOf(b.r.personId))).map((x) => x.r),
    [asks.rows, state.rows, today, nameOf],
  );

  const counted = (o, past) => (past || (o.date === today && o.clockedOut) ? ` · ${o.minutes > 0 ? `${fmtMinutes(o.minutes)} counted` : "none counted"}` : "");

  // an approver's list of approvals (unchanged), with a Remove on each
  const approvalRow = (o) => (
    <li key={o.id} className="at-hol-row">
      <div className="at-hol-t">
        <b>{nameOf(o.personId)}</b>
        <span>{dayShort(o.date)} · {o.from} to {o.until} · {reasonLabel(o.reason)}{counted(o, o.date < today)}</span>
      </div>
      {canManage && (
        <button type="button" className={cn("ghost-button at-hol-del", sure === `a${o.id}` && "is-sure")} aria-label={`${sure === `a${o.id}` ? "Remove it?" : "Remove"} overtime for ${nameOf(o.personId)} on ${dayShort(o.date)}`} onClick={() => remove(o)} onBlur={() => setSure((s) => (s === `a${o.id}` ? null : s))}>
          {sure === `a${o.id}` ? "Remove it?" : "Remove"}
        </button>
      )}
    </li>
  );

  // an approver's waiting request: who, when, why, and Approve or Decline
  const waitingRow = (r) => (
    <li key={r.id} className="at-hol-row at-ot-ask">
      <div className="at-hol-t">
        <b>{nameOf(r.personId)}</b>
        <span>{dayShort(r.date)} · {r.from} to {r.until} · {reasonLabel(r.reason)}{r.note ? ` · “${r.note}”` : ""}</span>
        {declining?.id === r.id && (
          <span className="at-ot-why">
            <input value={declining.note} maxLength={280} placeholder="Say why (optional)" aria-label={`Why you decline ${nameOf(r.personId)}'s request`} autoFocus
              onChange={(e) => setDeclining({ id: r.id, note: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); decline(); } if (e.key === "Escape") { e.stopPropagation(); setDeclining(null); } }} />
          </span>
        )}
      </div>
      <div className="at-ot-acts">
        {declining?.id === r.id ? (
          <>
            <button type="button" className={cn("ghost-button at-hol-del", "is-sure")} disabled={busy} onClick={decline}>Decline</button>
            <button type="button" className="ghost-button at-hol-del" onClick={() => setDeclining(null)}>Keep</button>
          </>
        ) : (
          <>
            <button type="button" className="primary-button at-ot-yes" disabled={busy} aria-label={`Approve ${nameOf(r.personId)} for ${dayShort(r.date)}`} onClick={() => approve(r)}>Approve</button>
            <button type="button" className="ghost-button at-hol-del" disabled={busy} aria-label={`Decline ${nameOf(r.personId)}'s request for ${dayShort(r.date)}`} onClick={() => setDeclining({ id: r.id, note: "" })}>Decline</button>
          </>
        )}
      </div>
    </li>
  );

  // a person's own line: what they asked, where it stands, and what they can do about it
  const myRow = (i) => {
    const r = i.request;
    const a = i.approval;
    const times = a ? `${a.from} to ${a.until}` : `${r.from} to ${r.until}`;
    const why = reasonLabel((a || r).reason);
    return (
      <li key={i.key} className="at-hol-row">
        <div className="at-hol-t">
          <b>{dayShort(i.date)} · {times}</b>
          <span>
            <Tag state={i.state} /> {why}
            {i.state === "approved" && a ? counted(a, i.date < today) : ""}
            {i.state === "declined" && r.decisionNote ? ` · “${r.decisionNote}”` : ""}
            {i.state === "late" ? " · The day passed before anyone approved it." : ""}
          </span>
        </div>
        {r && i.state === "waiting" && (
          <button type="button" className={cn("ghost-button at-hol-del", sure === `r${r.id}` && "is-sure")} aria-label={`${sure === `r${r.id}` ? "Withdraw it?" : "Withdraw"} the request for ${dayShort(r.date)}`} onClick={() => withdraw(r)} onBlur={() => setSure((s) => (s === `r${r.id}` ? null : s))}>
            {sure === `r${r.id}` ? "Withdraw it?" : "Withdraw"}
          </button>
        )}
        {r && (i.state === "declined" || i.state === "late") && i.date >= today && (
          <button type="button" className="ghost-button at-hol-del" aria-label={`Ask again for ${dayShort(r.date)}`} onClick={() => again(r)}>Ask again</button>
        )}
      </li>
    );
  };

  const canAsk = !canManage && asksReady && Boolean(me);
  const showForm = canManage || canAsk;

  // What the two times mean, said next to them: only the time after the person's normal day ends is overtime, never the day itself.
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const whose = canManage ? (personId ? `${nameOf(personId)}'s` : "the person's") : "your";
  const onDay = day ? dayShort(day) : "that day";
  const hint = !shift
    ? { tone: "", text: "Only the time after the person's normal day ends counts as overtime, not the normal day itself." }
    : until <= shift.end
      ? { tone: "bad", text: `This ends at ${until}, before ${whose} normal day does (${shift.start} to ${shift.end} on ${onDay}), so none of it would count.` }
      : from < shift.end
        ? { tone: "warn", text: `${cap(whose)} normal day on ${onDay} is ${shift.start} to ${shift.end}. This starts at ${from}, inside it, so only the time after ${shift.end} will count.` }
        : { tone: "", text: `${cap(whose)} normal day on ${onDay} is ${shift.start} to ${shift.end}. Only the time after ${shift.end} counts as overtime, not the normal day itself.` };

  const footer = (
    <>
      {error ? <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p> : done ? <p className="kmodal-msg" role="status">{done}</p> : null}
      <button type="button" className="ghost-button" onClick={onClose}>{showForm ? "Close" : "Done"}</button>
      {showForm && state.status !== "unavailable" && (
        <button type="submit" className="primary-button" disabled={busy || !listed}>
          {canManage ? (busy ? "Approving…" : "Approve overtime") : (busy ? "Asking…" : "Ask for overtime")}
        </button>
      )}
    </>
  );

  return (
    <Modal
      title="Overtime"
      subtitle={canManage
        ? "Approve it before the person clocks in. Only the extra time after their normal day, inside the window you set, counts."
        : "Ask for it before you clock in. It counts only once it is approved, and only the extra time after your normal day."}
      size="md"
      glass
      onClose={onClose}
      onSubmit={showForm ? submit : undefined}
      footer={footer}
    >
      {state.status === "unavailable" ? (
        <p className="tk-hint">Overtime is not switched on in the database yet (it needs migration 0064), so there is nothing to show or approve.</p>
      ) : (
        <div className="at-hol">
          {canManage && listed && asksReady && waiting.length > 0 && (
            <section className="at-ot-wait" aria-label="Requests waiting for a decision">
              <h3 className="at-hol-h">Waiting for a decision ({waiting.length})</h3>
              <ul className="at-hol-list">{waiting.map(waitingRow)}</ul>
            </section>
          )}

          {canManage && listed && asks.status === "error" && (
            <p className="tk-hint" role="status">The requests could not be loaded. <button type="button" className="ghost-button at-hol-retry" onClick={load}>Try again</button></p>
          )}

          {canManage && waiting.length > 0 && <h3 className="at-hol-h">Or approve it yourself</h3>}

          {showForm && (
            <div className="tk-form at-hol-form" ref={formTop}>
              {canManage ? (
                <div className="tk-f tk-full">Person
                  <Select
                    label="Person" value={personId} placeholder="Choose the person" searchPlaceholder="Search staff" options={options}
                    onChange={(v) => { setPersonId(v); typedTimes.current = false; clearMsg(); }}
                  />
                </div>
              ) : null}
              <div className="tk-f tk-full">Day
                <DatePicker label="Day" value={day} onChange={(v) => { setDay(v); typedTimes.current = false; clearMsg(); }} placeholder="The day" clearable={false} />
              </div>
              <label className="tk-f">Overtime from
                <input type="time" value={from} onChange={(e) => { typedTimes.current = true; setFrom(e.target.value); clearMsg(); }} />
              </label>
              <label className="tk-f">Overtime until
                <input type="time" value={until} onChange={(e) => { typedTimes.current = true; setUntil(e.target.value); clearMsg(); }} />
              </label>
              <p className={cn("at-ot-hint", "tk-full", hint.tone && `is-${hint.tone}`)} role="status">{hint.text}</p>
              <div className="tk-f tk-full">Why it is needed
                <Select label="Why it is needed" value={reason} onChange={setReason} options={OT_REASONS} searchable={false} />
              </div>
              <label className="tk-f tk-full">Note
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" maxLength={280} />
              </label>
            </div>
          )}

          {!canManage && asks.status === "unavailable" && (
            <p className="tk-hint">Asking for overtime is not switched on in the database yet (it needs migration 0065). An approver can still approve it for you.</p>
          )}
          {!canManage && asks.status === "error" && (
            <p className="tk-hint" role="status">Your requests could not be loaded. <button type="button" className="ghost-button at-hol-retry" onClick={load}>Try again</button></p>
          )}

          {!listed ? (
            <p className="tk-hint" role="status">
              {state.status === "error"
                ? <>The list could not be loaded, so nothing can be {canManage ? "approved" : "asked for"} yet. <button type="button" className="ghost-button at-hol-retry" onClick={load}>Try again</button></>
                : "Loading the list…"}
            </p>
          ) : canManage ? (
            <>
              <h3 className="at-hol-h">{coming.length ? "Approved: today and coming up" : "Nothing approved ahead"}</h3>
              {coming.length > 0 && <ul className="at-hol-list">{coming.map(approvalRow)}</ul>}
              {coming.length === 0 && <p className="tk-hint">Approve it above, or from a request, before the person clocks in.</p>}
            </>
          ) : (
            <>
              <h3 className="at-hol-h">{myComing.length ? "Your requests: today and coming up" : "Nothing asked for or approved ahead"}</h3>
              {myComing.length > 0 && <ul className="at-hol-list">{myComing.map(myRow)}</ul>}
              {myComing.length === 0 && <p className="tk-hint">{canAsk ? "Ask for it above, before you clock in." : "No overtime is approved."}</p>}
            </>
          )}

          {listed && canManage && past.length > 0 && (
            <details className="at-hol-past">
              <summary>Earlier ({past.length})</summary>
              <ul className="at-hol-list">{past.map(approvalRow)}</ul>
            </details>
          )}
          {listed && !canManage && myPast.length > 0 && (
            <details className="at-hol-past">
              <summary>Earlier ({myPast.length})</summary>
              <ul className="at-hol-list">{myPast.map(myRow)}</ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
