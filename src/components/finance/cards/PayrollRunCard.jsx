/**
 * Run payroll: one month, everyone, on one screen, so the salary slips can be printed without anyone working a figure out.
 *
 * Pick the month. Each person's line is filled from their basic salary and what the attendance says for that month (lib/payrollRun.js,
 * lib/payrollMath.js): the attendance deduction by the month's rules, approved overtime, and TDS at their rate. Only the things nobody
 * else knows are typed: a bonus, receivable due, advance repaid, PF or other, and the TDS rate when it is not 1%.
 *
 *   Add a bonus     a bonus of any kind (Dashain, Tihar, performance ...): say what it is for, then a percentage of everyone's basic or
 *                   the same amount for each, and a switch fills every line and adds the bonuses up. "Dashain: 50% of basic" is the one
 *                   formula in the monthly sheet, one click. Every line can still be changed by hand (a figure typed in a line is
 *                   labelled with the same words), and switching it off puts back what was there.
 *   Save            writes one payroll record per person for the month (changing the one already made, if there is one)
 *   Save and print  the same, then prints every salary slip, one to a page, in the slip's usual layout
 *
 * It only ever reads attendance the person using it may read; a month with no attendance at all says so, since that looks exactly like
 * a month nobody was absent.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Modal from "../../Modal";
import Select from "../../Select";
import { Chip, useMoney } from "../parts";
import { MONTHS } from "../../../lib/finance";
import { fmtMinutes } from "../../../lib/attendance";
import { loadMonthFacts } from "../../../lib/payrollFacts";
import { runTotals } from "../../../lib/payrollMath";
import { bonusFor, runPeople, runRows, runSkipped, seedManual, slipFor } from "../../../lib/payrollRun";
import { savePayrollRun } from "../../../lib/payrollWrites";
import { openPrintWindow, slipDocument } from "../../../lib/salarySlip";
import { ABSENCES_PER_DAY_CUT, BONUS_REASON_MAX, BONUS_SUGGESTIONS, DASHAIN_PCT, NEW_RULES_LABEL, rulesOfMonth } from "../../../lib/workRules";
import "../payroll-run.css";

const MONTH_OPTIONS = MONTHS.map((m) => ({ value: m, label: m }));
const NONE = new Map();
const NO_BONUS = { on: false, name: "", basis: "percent", value: "" };       // the bonus panel: what for, how it is worked out, how much
const BASIS_OPTIONS = [{ value: "percent", label: "% of basic" }, { value: "amount", label: "NPR each" }];
const eachRow = (manual, fn) => Object.fromEntries(Object.entries(manual).map(([id, v]) => [id, fn(v, id)]));
const label = (name) => name.trim().slice(0, BONUS_REASON_MAX);

/** One typed cell: a small number field that says whose and what it is. `placeholder` is what a blank box means (the attendance's own count). */
function Cell({ value, onChange, label, disabled, unit, placeholder = "0", count = false }) {
  return (
    <span className="pyr-cell">
      <input type="number" inputMode="decimal" min="0" step="any" className={unit ? "pyr-in pyr-in--rate" : count ? "pyr-in pyr-in--count" : "pyr-in"} value={value} placeholder={placeholder} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.value)} />
      {unit ? <em>{unit}</em> : null}
    </span>
  );
}

/**
 * The table: a row for each person, and the month's totals. Plain props in, so it can be drawn (and checked) on its own.
 * `rows` are lib/payrollRun.js runRows; `onCell(personId, key, value)` is a typed cell changing.
 */
export function RunTable({ rows, totals, rules, money, canEdit, onCell }) {
  const showCuts = rules !== "new";            // the old rule's column: a quarter day for each flagged late day (old months, and the days before the switch)
  const showAbs = rules !== "old";             // the new rule's column: unapproved absences (new months, and the days from the switch)
  return (
    <div className="pyr-scroll">
      <table className={`pyr-table${rules === "mixed" ? " pyr-table--mixed" : ""}`} aria-label="Pay for each person this month">
        <thead>
          <tr>
            <th scope="col">Staff</th>
            <th scope="col" className="pyr-n">Basic</th>
            {showCuts && <th scope="col" className="pyr-n">Late cuts</th>}
            {showAbs && <th scope="col" className="pyr-n">Absences</th>}
            <th scope="col" className="pyr-n">Leave days</th>
            <th scope="col" className="pyr-n">Overtime</th>
            <th scope="col" className="pyr-n">Bonus</th>
            <th scope="col" className="pyr-n">Receivable due</th>
            <th scope="col" className="pyr-n">Advance repaid</th>
            <th scope="col" className="pyr-n">PF or other</th>
            <th scope="col" className="pyr-n">TDS %</th>
            <th scope="col" className="pyr-n">TDS</th>
            <th scope="col" className="pyr-n">Net pay</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ e, f, rec, line, manual }) => {
            return (
              <tr key={e.id}>
                <th scope="row" className="pyr-who">
                  <b>{e.name}</b>
                  <span>{e.role || ""}{rec ? " · saved" : ""}</span>
                </th>
                <td className="pyr-n">{money(line.basic)}</td>
                {showCuts && (
                  <td className="pyr-n" title={`A quarter of a day's pay for each late day flagged with the old cut${rules === "mixed" ? " (the days before the change)" : ""}. The grey number is what the attendance says; type another to use that instead.`}>
                    <Cell count value={manual.cuts ?? ""} placeholder={String(f.cuts)} label={`Late cuts for ${e.name}`} disabled={!canEdit} onChange={(v) => onCell(e.id, "cuts", v)} />
                    <small className={line.att.parts.cuts > 0 ? "pyr-bad" : undefined}>{line.att.parts.cuts > 0 ? `− ${money(line.att.parts.cuts)}` : "—"}</small>
                    {line.adjustment ? <small className="pyr-warn">{line.adjustment > 0 ? "+" : "−"} {money(Math.abs(line.adjustment))} adjusted</small> : null}
                  </td>
                )}
                {showAbs && (
                  <td className="pyr-n" title={`${ABSENCES_PER_DAY_CUT} unapproved absences cost a day of salary${rules === "mixed" ? " (the days from the change)" : ""}. The grey number is what the attendance says; type another to use that instead.`}>
                    <Cell count value={manual.absences ?? ""} placeholder={String(f.absences)} label={`Unapproved absences for ${e.name}`} disabled={!canEdit} onChange={(v) => onCell(e.id, "absences", v)} />
                    <small className={line.att.parts.absences > 0 ? "pyr-bad" : undefined}>{line.att.parts.absences > 0 ? `− ${money(line.att.parts.absences)}` : "—"}</small>
                    {!showCuts && line.adjustment ? <small className="pyr-warn">{line.adjustment > 0 ? "+" : "−"} {money(Math.abs(line.adjustment))} adjusted</small> : null}
                    {f.missedClockOuts > 0 ? <small className="pyr-warn">{f.missedClockOuts} no clock-out</small> : null}
                  </td>
                )}
                <td className="pyr-n" title="Days away, typed as on the slip: each costs a day's pay (basic ÷ 30). Half a day is 0.5.">
                  <Cell count value={manual.leaveDays ?? ""} label={`Leave days for ${e.name}`} disabled={!canEdit} onChange={(v) => onCell(e.id, "leaveDays", v)} />
                  <small className={line.att.parts.leave > 0 ? "pyr-bad" : undefined}>
                    {line.att.parts.leave > 0 ? `− ${money(line.att.parts.leave)}` : f.leaveRecorded > 0 ? `${f.leaveRecorded} marked on Attendance` : "—"}
                  </small>
                </td>
                <td className="pyr-n">
                  <span>{f.overtimeMinutes > 0 ? fmtMinutes(f.overtimeMinutes) : "—"}</span>
                  <small>{line.overtime > 0 ? money(line.overtime) : ""}</small>
                </td>
                <td className="pyr-n">
                  <Cell value={manual.bonus} label={`Bonus for ${e.name}`} disabled={!canEdit} onChange={(v) => onCell(e.id, "bonus", v)} />
                  {Number(manual.bonus) > 0 && manual.bonusReason ? <small>{manual.bonusReason}</small> : null}
                </td>
                <td className="pyr-n"><Cell value={manual.receivable} label={`Receivable due for ${e.name}`} disabled={!canEdit} onChange={(v) => onCell(e.id, "receivable", v)} /></td>
                <td className="pyr-n"><Cell value={manual.advance} label={`Advance repaid by ${e.name}`} disabled={!canEdit} onChange={(v) => onCell(e.id, "advance", v)} /></td>
                <td className="pyr-n"><Cell value={manual.other} label={`PF or other deduction for ${e.name}`} disabled={!canEdit} onChange={(v) => onCell(e.id, "other", v)} /></td>
                <td className="pyr-n"><Cell value={manual.tdsRate} label={`TDS rate for ${e.name}`} disabled={!canEdit} onChange={(v) => onCell(e.id, "tdsRate", v)} unit="%" /></td>
                <td className="pyr-n">{line.tds > 0 ? money(line.tds) : "—"}</td>
                <td className="pyr-n pyr-net">{money(line.net)}{line.deductionsExceedGross ? <small className="pyr-bad">held at 0</small> : null}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{totals.people} {totals.people === 1 ? "person" : "people"}</th>
            <td className="pyr-n">{money(totals.basic)}</td>
            <td className="pyr-n" title="Late cuts, absences and leave days, together">{totals.attendance > 0 ? `− ${money(totals.attendance)}` : "—"}</td>
            {showCuts && showAbs && <td className="pyr-n" />}
            <td className="pyr-n" />
            <td className="pyr-n">{totals.overtime > 0 ? money(totals.overtime) : "—"}</td>
            <td className="pyr-n">{totals.bonus > 0 ? money(totals.bonus) : "—"}</td>
            <td className="pyr-n">{totals.receivable > 0 ? money(totals.receivable) : "—"}</td>
            <td className="pyr-n">{totals.advance > 0 ? `− ${money(totals.advance)}` : "—"}</td>
            <td className="pyr-n">{totals.pf > 0 ? `− ${money(totals.pf)}` : "—"}</td>
            <td className="pyr-n" />
            <td className="pyr-n">{totals.tds > 0 ? `− ${money(totals.tds)}` : "—"}</td>
            <td className="pyr-n pyr-net">{money(totals.net)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function PayrollRunCard({ employees, payroll, canEdit, profile, reload, onClose }) {
  const money = useMoney();
  const uid = useId();
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);       // the month just ended is the one usually run
  const [month, setMonth] = useState(MONTHS[last.getMonth()]);
  const [year, setYear] = useState(String(last.getFullYear()));
  const [facts, setFacts] = useState({ status: "loading", byPerson: NONE, records: 0, overtimeReady: true, error: "" });
  const [manual, setManual] = useState({});
  const [bonus, setBonus] = useState(NO_BONUS);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);                                   // { tone: "ok" | "err", text }
  const [savedIds, setSavedIds] = useState({});                           // "Month|Year|person" -> the record this card made, so saving again changes it even if the page's list is slow to catch up
  const seededFor = useRef("");                                           // "Month|Year" the typed fields were last filled for
  const backup = useRef({});                                              // what the bonus fields held before the bonus switch filled them
  const payrollRef = useRef(payroll);
  payrollRef.current = payroll;

  const people = useMemo(() => runPeople(employees), [employees]);
  const skipped = useMemo(() => runSkipped(employees), [employees]);
  const rules = rulesOfMonth(Number(year), MONTHS.indexOf(month));
  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1].map((v) => ({ value: String(v), label: String(v) }));
  }, []);

  // read the month's attendance whenever the month changes
  useEffect(() => {
    let live = true;
    setFacts((f) => ({ ...f, status: "loading", error: "" }));
    setMsg(null);
    loadMonthFacts({ month, year }).then(
      (res) => { if (live) setFacts({ status: "ready", ...res, error: "" }); },
      (err) => { console.error("Payroll run: could not read the attendance:", err); if (live) setFacts({ status: "error", byPerson: NONE, records: 0, overtimeReady: true, error: "Could not read the attendance for that month." }); },
    );
    return () => { live = false; };
  }, [month, year]);

  // Fill the typed fields once the month's attendance is in (the adjustment needs it), and again only for another month, so a later
  // reload of the records cannot wipe what is being typed. Somebody who was not in the staff list when the month was filled (the list
  // arrived late) is filled in on their own, so their line starts from the defaults, not from nothing.
  useEffect(() => {
    if (facts.status !== "ready") return;
    const key = `${month}|${year}`;
    if (seededFor.current !== key) {
      seededFor.current = key;
      setManual(seedManual({ people, payroll: payrollRef.current, byPerson: facts.byPerson, month, year }));
      setBonus(NO_BONUS);                                                 // a bonus is for one month's run
      backup.current = {};
      return;
    }
    setManual((m) => {
      const missing = people.filter((e) => !m[e.id]);
      return missing.length ? { ...m, ...seedManual({ people: missing, payroll: payrollRef.current, byPerson: facts.byPerson, month, year }) } : m;
    });
  }, [facts.status, facts.byPerson, month, year, people]);

  const ready = facts.status === "ready" && seededFor.current === `${month}|${year}`;
  const rows = useMemo(
    () => (ready ? runRows({ people, payroll, byPerson: facts.byPerson, manual, month, year }) : []),
    [ready, people, payroll, facts.byPerson, manual, month, year],
  );
  const totals = useMemo(() => runTotals(rows.map((r) => r.line)), [rows]);
  const missedClockOuts = rules !== "old" ? rows.reduce((s, r) => s + r.f.missedClockOuts, 0) : 0;

  // a bonus typed into a line is for the same thing as the panel says, unless that line already says what its own is for
  const setCell = (id, key, value) => setManual((m) => ({
    ...m,
    [id]: { ...m[id], [key]: value, ...(key === "bonus" && Number(value) > 0 && !m[id]?.bonusReason ? { bonusReason: label(bonus.name) } : {}) },
  }));

  /** Give everyone the bonus `next` describes ({ on, name, basis, value }), or take it back off: every line goes back to what it held. */
  function giveBonus(next) {
    if (next.on) {
      if (!bonus.on) backup.current = eachRow(manual, (m) => ({ bonus: m.bonus, bonusReason: m.bonusReason }));
      const fill = bonusFor(people, next);
      setManual((m) => eachRow(m, (v, id) => ({ ...v, bonus: fill[id] ?? "", bonusReason: fill[id] ? label(next.name) : "" })));
    } else if (bonus.on) {
      setManual((m) => eachRow(m, (v, id) => ({ ...v, bonus: backup.current[id]?.bonus ?? "", bonusReason: backup.current[id]?.bonusReason ?? "" })));
    }
    setBonus(next);
  }

  // only the words changed: the bonuses already given are relabelled, not worked out again (so a figure typed over stays)
  function nameBonus(name) {
    if (bonus.on) setManual((m) => eachRow(m, (v) => (Number(v.bonus) > 0 ? { ...v, bonusReason: label(name) } : v)));
    setBonus({ ...bonus, name });
  }

  async function run({ print }) {
    if (busy || !rows.length || !canEdit) return;
    setBusy(true);
    setMsg(null);
    const entries = rows.map((r) => ({
      id: r.rec?.id || savedIds[`${month}|${year}|${r.e.id}`] || null, personId: r.e.id, facts: r.f, line: r.line,
      form: { staffName: r.e.name, role: r.e.role || r.rec?.role || "", month, year, note: r.rec?.note || "", bonusReason: r.manual.bonusReason },
    }));
    const res = await savePayrollRun({ entries, profile });
    setSavedIds((s) => ({ ...s, ...Object.fromEntries(Object.entries(res.ids || {}).map(([pid, id]) => [`${month}|${year}|${pid}`, id])) }));
    await reload();
    setBusy(false);
    if (!res.ok) {
      setMsg({ tone: "err", text: `Saved ${res.saved} of ${entries.length}. Not saved: ${res.failed.map((f) => f.name).join(", ")}. ${res.failed[0].message}` });
      return;
    }
    if (print && !openPrintWindow(slipDocument(rows.map((r) => slipFor(r, month, year))))) {
      setMsg({ tone: "err", text: "Saved, but your browser blocked the print window. Allow pop-ups for this site, then press Save and print again." });
      return;
    }
    setMsg({ tone: "ok", text: `${print ? "Saved and sent to print: " : "Saved "}${res.saved} ${res.saved === 1 ? "record" : "records"} for ${month} ${year}.` });
  }

  const loading = facts.status === "loading" || (facts.status === "ready" && !ready);
  const footer = (
    <>
      {msg ? <p className={`kmodal-msg${msg.tone === "err" ? " kmodal-msg--err" : ""}`} role={msg.tone === "err" ? "alert" : "status"}>{msg.text}</p> : null}
      <button type="button" className="ghost-button" onClick={onClose}>Close</button>
      {canEdit && (
        <>
          <button type="button" className="ghost-button" disabled={busy || loading || !rows.length} onClick={() => run({ print: false })}>{busy ? "Saving…" : "Save records"}</button>
          <button type="button" className="primary-button" disabled={busy || loading || !rows.length} onClick={() => run({ print: true })}>{busy ? "Saving…" : "Save and print slips"}</button>
        </>
      )}
    </>
  );

  return (
    <Modal
      title="Run payroll"
      subtitle="Everyone's pay for one month, worked out from salary and attendance. Type only what is not known."
      size="card" glass className="pyr-run" onClose={onClose} footer={footer} dismissOnBackdrop={false}
    >
      <div className="pyr-body">
      <div className="pyr-top">
        <label className="pyr-pick">Month
          <Select label="Month" value={month} onChange={setMonth} options={MONTH_OPTIONS} searchable={false} />
        </label>
        <label className="pyr-pick pyr-pick--year">Year
          <Select label="Year" value={year} onChange={setYear} options={yearOptions} searchable={false} />
        </label>
      </div>

      <div className={`pyr-bonus${bonus.on ? " is-on" : ""}`} role="group" aria-label="A bonus for everyone">
        <label className="pyr-switch">
          <input type="checkbox" role="switch" checked={bonus.on} disabled={!canEdit || loading || !rows.length || (!bonus.on && !(Number(bonus.value) > 0))} onChange={(e) => giveBonus({ ...bonus, on: e.target.checked })} />
          <span>Add a bonus</span>
        </label>
        <input type="text" list={`${uid}-for`} className="pyr-in pyr-in--text" value={bonus.name} maxLength={BONUS_REASON_MAX} placeholder="What for, e.g. Tihar" aria-label="What the bonus is for" disabled={!canEdit || loading} onChange={(e) => nameBonus(e.target.value)} />
        <datalist id={`${uid}-for`}>{BONUS_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
        <span className="pyr-give">
          <input type="number" min="0" step="any" className="pyr-in" value={bonus.value} placeholder="0" aria-label="Bonus amount" disabled={!canEdit || loading} onChange={(e) => giveBonus({ ...bonus, value: e.target.value })} />
          <Select label="How the bonus is worked out" value={bonus.basis} onChange={(basis) => giveBonus({ ...bonus, basis })} options={BASIS_OPTIONS} searchable={false} disabled={!canEdit || loading} />
        </span>
        {canEdit && <button type="button" className="pyr-link" disabled={loading || !rows.length} onClick={() => giveBonus({ on: true, name: "Dashain", basis: "percent", value: String(DASHAIN_PCT) })}>Dashain: {DASHAIN_PCT}% of basic</button>}
        <b className="pyr-bonus-total" aria-live="polite">{totals.bonus > 0 ? `${money(totals.bonus)} in total` : "no bonus yet"}</b>
      </div>

      <p className="pyr-rule">
        {rules === "new"
          ? `From ${NEW_RULES_LABEL}: ${ABSENCES_PER_DAY_CUT} unapproved absences cost a day of salary (basic ÷ 30). No cut for lateness.`
          : rules === "mixed"
            ? `This month holds the change on ${NEW_RULES_LABEL}. Late days before it cost a quarter of a day's pay each (the old cut); from it, ${ABSENCES_PER_DAY_CUT} unapproved absences cost a day of salary (basic ÷ 30) and lateness costs nothing. Each day is judged by the rule of its own day.`
            : `Before ${NEW_RULES_LABEL}: a quarter of a day's pay for each late day flagged with the old cut.`}
        {" "}Leave days are typed, as on the slip: each costs a day's pay (basic ÷ 30). If your own record of late days or absences differs from the attendance's, type your count over it. TDS is taken on the basic salary and any bonus.
      </p>

      {facts.status === "error" && <p className="pyr-note pyr-note--bad" role="alert"><Chip tone="bad">Problem</Chip> {facts.error} Nothing below can be trusted until it loads.</p>}
      {ready && facts.records === 0 && people.length > 0 && <p className="pyr-note" role="status"><Chip tone="warn">Check</Chip> No attendance could be read for {month} {year}, so no deductions or overtime are counted. If people were working, you may not be allowed to read Attendance.</p>}
      {ready && !facts.overtimeReady && <p className="pyr-note" role="status"><Chip tone="warn">Check</Chip> Overtime is not switched on in the database yet (migration 0064), so none is counted.</p>}
      {ready && missedClockOuts > 0 && <p className="pyr-note" role="status"><Chip tone="warn">Check</Chip> {missedClockOuts} of the absences {missedClockOuts === 1 ? "is a clock-in" : "are clock-ins"} with no clock-out. Correct {missedClockOuts === 1 ? "it" : "them"} on the Attendance page first if they were at work.</p>}
      {skipped.length > 0 && <p className="pyr-note" role="status"><Chip>Left out</Chip> No basic salary on the profile of {skipped.join(", ")}.</p>}

      {loading ? (
        <p className="pyr-note" role="status">Reading the attendance…</p>
      ) : rows.length === 0 ? (
        <p className="pyr-note" role="status">Nobody has a basic salary on their profile yet, so there is nothing to run.</p>
      ) : (
        <RunTable rows={rows} totals={totals} rules={rules} money={money} canEdit={canEdit} onCell={setCell} />
      )}
      </div>
    </Modal>
  );
}
