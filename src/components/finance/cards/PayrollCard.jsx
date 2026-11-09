/**
 * One person's pay for one month: new or opened. Choose the person and the month and the basic salary fills in; what the attendance
 * says is worked out beside it and can be adjusted by hand. The right pane is the salary calculation as it stands: gross, what comes
 * off (the attendance deduction, advance, PF or other, and TDS), the net.
 *
 * The maths is lib/payrollMath.js's, the same as the monthly run's, so a record made in either is one a card can open and save
 * unchanged. What the attendance gives depends on the day (lib/workRules.js): before the switch day a quarter day for each late
 * day flagged with the old cut; from it, one day of salary for every 7 unapproved absences; a month that holds the switch day has
 * both, each for its own days. Approved overtime (only time inside an approval made before the person clocked in) is paid from the
 * same attendance.
 *
 * A record only stored its final deduction, so opening one worked the figure out afresh from the attendance and the next save would
 * have quietly replaced what had been entered. Here the difference between the stored deduction and the attendance's is shown as the
 * adjustment, so a record saved as it was opened is unchanged. A record made before TDS was kept has no rate and stays without one
 * until somebody sets it.
 */
import { useEffect, useId, useMemo, useRef } from "react";
import EditCard, { Field, KV, NumberInput } from "../../EditCard";
import Select from "../../Select";
import { Chip, useMoney } from "../parts";
import useCardForm from "./useCardForm";
import usePayrollFacts from "../../../hooks/usePayrollFacts";
import { MONTHS } from "../../../lib/finance";
import { fmtMinutes } from "../../../lib/attendance";
import { leaveAmountOf, payLine } from "../../../lib/payrollMath";
import { emptyPayroll, removePayroll, savePayroll } from "../../../lib/payrollWrites";
import { rulesOfMonth, ABSENCES_PER_DAY_CUT, BONUS_REASON_MAX, BONUS_SUGGESTIONS, NEW_RULES_LABEL } from "../../../lib/workRules";
import { enterAdvance, focusFirst, thenAdvance } from "../flow";
import "../payroll-run.css";

const MONTH_OPTIONS = MONTHS.map((m) => ({ value: m, label: m }));
const blank = (v) => (Number(v) ? v : "");

function fromRecord(r) {
  return {
    staffName: r.staffName || "", role: r.role || "", personId: r.person_id || "",
    month: r.month || MONTHS[new Date().getMonth()], year: r.year || new Date().getFullYear(),
    basicNPR: r.basicNPR || "", bonusNPR: r.bonusNPR || "", bonusReason: r.bonusReason || "", pfDeductionNPR: r.pfDeductionNPR || "",
    receivableDueNPR: blank(r.receivableDueNPR), advanceNPR: blank(r.advanceNPR),
    tdsRatePct: r.tdsRatePct == null ? "" : String(Number(r.tdsRatePct)),       // a record from before TDS was kept has no rate
    leaveAmount: blank(leaveAmountOf(r)),              // a record made when leave was typed in days is priced at a day's pay each
    lateAdjustmentNPR: 0, note: r.note || "",
  };
}

export default function PayrollCard({ record, employees, canEdit, profile, reload, onClose }) {
  const money = useMoney();
  const uid = useId();
  const root = useRef(null);
  const creating = !record;
  const { form, set, reset, dirty } = useCardForm(() => (creating ? emptyPayroll() : fromRecord(record)));

  // whose attendance: the person the record was made for, else the one the name says (an older record carries only the name)
  const personId = form.personId || employees.find((e) => e.name === form.staffName)?.id || "";
  const att = usePayrollFacts({ personId, month: form.month, year: form.year });
  const rules = rulesOfMonth(Number(form.year) || 0, MONTHS.indexOf(form.month));
  const deductionName = rules === "new" ? "Absence deduction" : rules === "mixed" ? "Late and absence deduction" : "Late deduction";
  const facts = att.facts;

  useEffect(() => { focusFirst(root.current?.closest("form")); }, []);

  const manual = {
    bonus: form.bonusNPR, receivable: form.receivableDueNPR, advance: form.advanceNPR, other: form.pfDeductionNPR,
    leaveAmount: form.leaveAmount, adjustment: form.lateAdjustmentNPR, tdsRate: form.tdsRatePct,
  };
  const line = payLine({ basic: form.basicNPR, rules, facts, manual });

  // Opening a saved record: only the final deduction was stored, so what the attendance gives now is shown against it as an adjustment,
  // which keeps the record as it was unless somebody changes it.
  const seeded = useRef(creating);
  useEffect(() => {
    if (seeded.current || !att.ready || att.loading) return;
    seeded.current = true;
    reset({ ...form, lateAdjustmentNPR: Math.round((Number(record.lateDeductionNPR || 0) - line.att.amount) * 100) / 100 });
  }, [att.ready, att.loading]);   // eslint-disable-line react-hooks/exhaustive-deps
  const waiting = !seeded.current;

  const people = useMemo(
    () => employees.map((e) => ({ value: e.name, label: e.name, hint: e.status === "Inactive" ? "inactive" : e.role || undefined })),
    [employees],
  );

  function pickStaff(name) {
    const emp = employees.find((e) => e.name === name);
    set((f) => ({ ...f, staffName: name, personId: emp?.id || "", role: emp?.role || f.role, basicNPR: emp?.basicSalaryNPR || f.basicNPR, lateAdjustmentNPR: 0 }));
  }

  async function save() {
    if (!form.staffName) return { ok: false, message: "Choose the person." };
    if (!form.role.trim()) return { ok: false, message: "Enter their role." };
    if (form.basicNPR === "" || !Number.isFinite(Number(form.basicNPR))) return { ok: false, message: "Enter the basic salary." };
    if (!form.year || Number(form.year) < 2020 || Number(form.year) > 2099) return { ok: false, message: "Enter the year (2020 to 2099)." };
    if (form.tdsRatePct !== "" && !(Number(form.tdsRatePct) >= 0 && Number(form.tdsRatePct) <= 100)) return { ok: false, message: "The TDS rate is a percentage from 0 to 100." };
    if (waiting || att.loading || (personId && !att.ready)) return { ok: false, message: "Wait a moment: the attendance is still being read." };
    const res = await savePayroll({ id: record?.id, form, line, facts, personId, profile });
    if (!res.ok) return res;
    await reload();
    return { ok: true };
  }

  const flow = { onKeyDown: (e) => enterAdvance(e, () => e.target.closest("form")?.requestSubmit()) };
  const off = !canEdit;
  const num = (e, key) => set({ [key]: e.target.value });

  const main = (
    <div className="fn-flow" ref={root} {...flow}>
      <Field label="Staff" htmlFor={`${uid}-staff`} className="fn-s3">
        <Select id={`${uid}-staff`} label="Staff" value={form.staffName} onChange={thenAdvance(pickStaff)} options={people} placeholder="Choose the person" disabled={off} searchPlaceholder="Search staff" />
      </Field>
      <Field label="Role" htmlFor={`${uid}-role`} className="fn-s3">
        <input id={`${uid}-role`} type="text" value={form.role} placeholder="e.g. Operations Manager" disabled={off} onChange={(e) => set({ role: e.target.value })} />
      </Field>
      <Field label="Month" htmlFor={`${uid}-month`} className="fn-s2">
        <Select id={`${uid}-month`} label="Month" value={form.month} onChange={thenAdvance((v) => set({ month: v }))} options={MONTH_OPTIONS} disabled={off} searchable={false} />
      </Field>
      <Field label="Year" htmlFor={`${uid}-year`} className="fn-s2">
        <NumberInput id={`${uid}-year`} value={form.year} min="2020" max="2099" step="1" disabled={off} onChange={(e) => num(e, "year")} />
      </Field>
      <Field label="Basic salary" htmlFor={`${uid}-basic`} className="fn-s2">
        <NumberInput id={`${uid}-basic`} unit="NPR" value={form.basicNPR} placeholder="0" disabled={off} onChange={(e) => num(e, "basicNPR")} />
      </Field>
      <Field label="Bonus or allowance" htmlFor={`${uid}-bonus`} className="fn-s2">
        <NumberInput id={`${uid}-bonus`} unit="NPR" value={form.bonusNPR} placeholder="0" disabled={off} onChange={(e) => num(e, "bonusNPR")} />
      </Field>
      <Field label="Bonus for" htmlFor={`${uid}-bfor`} className="fn-s2" hint="What the bonus is for. Kept with the record.">
        <input id={`${uid}-bfor`} type="text" list={`${uid}-kinds`} value={form.bonusReason} maxLength={BONUS_REASON_MAX} placeholder="e.g. Tihar" disabled={off} onChange={(e) => set({ bonusReason: e.target.value })} />
        <datalist id={`${uid}-kinds`}>{BONUS_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>
      <Field label="Receivable due" htmlFor={`${uid}-rec`} className="fn-s2" hint="Money the company owes them: added to their pay.">
        <NumberInput id={`${uid}-rec`} unit="NPR" value={form.receivableDueNPR} placeholder="0" disabled={off} onChange={(e) => num(e, "receivableDueNPR")} />
      </Field>
      <Field label="Advance repaid" htmlFor={`${uid}-adv`} className="fn-s2" hint="Money they pay back: taken off their pay.">
        <NumberInput id={`${uid}-adv`} unit="NPR" value={form.advanceNPR} placeholder="0" disabled={off} onChange={(e) => num(e, "advanceNPR")} />
      </Field>
      <Field label="PF or other deduction" htmlFor={`${uid}-pf`} className="fn-s2">
        <NumberInput id={`${uid}-pf`} unit="NPR" value={form.pfDeductionNPR} placeholder="0" disabled={off} onChange={(e) => num(e, "pfDeductionNPR")} />
      </Field>
      <Field label="TDS rate" htmlFor={`${uid}-tds`} className="fn-s2" hint={form.tdsRatePct === "" ? "No TDS on this record." : "Of the basic salary and any bonus, as on the slips. 0 is an exemption."}>
        <NumberInput id={`${uid}-tds`} unit="%" value={form.tdsRatePct} placeholder="none" max="100" disabled={off} onChange={(e) => num(e, "tdsRatePct")} />
      </Field>
      <Field label="Leave amount" htmlFor={`${uid}-leave`} className="fn-s2" hint="How much to cut for leave, typed as on the slip.">
        <NumberInput id={`${uid}-leave`} unit="NPR" value={form.leaveAmount} placeholder="0" step="any" disabled={off} onChange={(e) => num(e, "leaveAmount")} />
      </Field>
      <Field label="Note" htmlFor={`${uid}-note`} className="fn-s2">
        <input id={`${uid}-note`} type="text" value={form.note} placeholder="Optional" disabled={off} onChange={(e) => set({ note: e.target.value })} />
      </Field>

      <div className="ec-f ec-wide fn-late" role="group" aria-label={deductionName}>
        <span className="ec-lbl">{deductionName} <small>worked out from the attendance</small></span>
        <div className="fn-late-grid">
          {rules === "mixed" ? (
            <>
              <div><span>Quarter-day cuts (before {NEW_RULES_LABEL})</span><b className={facts.cuts > 0 ? "is-bad" : undefined}>{att.loading ? "…" : facts.cuts}</b></div>
              <div><span>Unapproved absences (from then)</span><b className={facts.absences >= ABSENCES_PER_DAY_CUT ? "is-bad" : undefined}>{att.loading ? "…" : facts.absences}</b></div>
            </>
          ) : rules === "new" ? (
            <>
              <div><span>Unapproved absences</span><b>{att.loading ? "…" : facts.absences}</b></div>
              <div><span>Days cut ({ABSENCES_PER_DAY_CUT} absences = 1 day)</span><b className={facts.absences >= ABSENCES_PER_DAY_CUT ? "is-bad" : undefined}>{att.loading ? "…" : Math.floor(facts.absences / ABSENCES_PER_DAY_CUT)}</b></div>
            </>
          ) : (
            <>
              <div><span>Late days</span><b>{att.loading ? "…" : facts.lateDays}</b></div>
              <div><span>Quarter-day cuts</span><b className={facts.cuts > 0 ? "is-bad" : undefined}>{att.loading ? "…" : facts.cuts}</b></div>
            </>
          )}
          <div><span>From attendance{line.att.parts.leave > 0 ? " and leave" : ""}</span><b className={line.att.amount > 0 ? "is-bad" : undefined}>{att.loading ? "…" : `− ${money(line.att.amount)}`}</b></div>
          <label className="fn-late-adj">
            <span>Adjustment (+ more, − less)</span>
            <NumberInput aria-label="Adjustment to the deduction" value={form.lateAdjustmentNPR} placeholder="0" disabled={off || waiting} onChange={(e) => num(e, "lateAdjustmentNPR")} step="any" min={undefined} />
          </label>
          <div><span>Final</span><b className={line.late > 0 ? "is-bad" : undefined}>{waiting ? "…" : `− ${money(line.late)}`}</b></div>
        </div>
        {Number(form.lateAdjustmentNPR || 0) !== 0 && !waiting && (
          <small className="ec-hint">
            {Number(form.lateAdjustmentNPR) > 0 ? `Adding ${money(Number(form.lateAdjustmentNPR))} to` : `Taking ${money(Math.abs(Number(form.lateAdjustmentNPR)))} off`} what the attendance gives. Say why in the note.
          </small>
        )}
      </div>

      <div className="ec-f ec-wide fn-late" role="group" aria-label="Overtime">
        <span className="ec-lbl">Overtime <small>only time approved before they clocked in</small></span>
        <div className="fn-late-grid fn-late-grid--2">
          <div><span>Approved overtime worked</span><b>{att.loading ? "…" : facts.overtimeMinutes > 0 ? fmtMinutes(facts.overtimeMinutes) : "None"}</b></div>
          <div><span>Overtime pay</span><b>{att.loading ? "…" : money(line.overtime)}</b></div>
        </div>
      </div>
    </div>
  );

  const missed = rules !== "old" ? facts.missedClockOuts : 0;
  const side = (
    <div className="fn-flow">
      <div className="ec-block ec-wide">
        <span className="ec-cap">Net pay</span>
        <div className="ec-fig">{waiting ? "…" : money(line.net)}</div>
      </div>
      <KV rows={[
        ["Basic salary", money(line.basic)],
        [line.bonus > 0 && form.bonusReason.trim() ? `Bonus (${form.bonusReason.trim()})` : "Bonus or allowance", money(line.bonus)],
        ["Overtime", money(line.overtime)],
        ["Receivable due", money(line.receivable)],
        ["Gross pay", money(line.gross)],
        [rules === "new" ? "Absence deduction" : rules === "mixed" ? "Late and absence deduction" : `Late deduction${facts.cuts ? ` (${facts.cuts} × ¼ day)` : ""}`, waiting ? "…" : `− ${money(Math.max(0, line.late - line.att.parts.leave))}`, line.late - line.att.parts.leave > 0 ? "bad" : undefined],
        ...(line.att.parts.leave > 0 ? [["Leave", `− ${money(line.att.parts.leave)}`, "bad"]] : []),
        ["Advance repaid", `− ${money(line.advance)}`, line.advance > 0 ? "bad" : undefined],
        ["PF or other", `− ${money(line.pf)}`, line.pf > 0 ? "bad" : undefined],
        [line.tdsRatePct == null ? "TDS" : `TDS (${line.tdsRatePct}%)`, line.tdsRatePct == null ? "none" : `− ${money(line.tds)}`, line.tds > 0 ? "bad" : undefined],
        ["Net pay", waiting ? "…" : money(line.net), "good"],
      ]} />
      {line.deductionsExceedGross && <p className="ec-strip ec-wide is-warn" role="alert"><span><b>Deductions are more than the gross pay</b><small>The net pay is held at nothing.</small></span></p>}
      {att.ready && !att.loading && facts.records === 0 && Number(form.basicNPR) > 0 && personId && (
        <p className="ec-note ec-wide" role="status"><Chip tone="warn">Check</Chip> No attendance was found for {form.staffName} in {form.month}. If they were here, you may not be allowed to read the attendance, so nothing is deducted.</p>
      )}
      {!personId && form.staffName && <p className="ec-note ec-wide" role="status"><Chip tone="warn">Check</Chip> {form.staffName} is not in the staff list, so no attendance can be read for them.</p>}
      {missed > 0 && <p className="ec-note ec-wide" role="status"><Chip tone="warn">Check</Chip> {missed} of the absences {missed === 1 ? "is a clock-in" : "are clock-ins"} with no clock-out. Correct {missed === 1 ? "it" : "them"} on the Attendance page first if they were at work.</p>}
      {att.ready && !att.overtimeReady && <p className="ec-note ec-wide" role="status"><Chip tone="warn">Check</Chip> Overtime is not switched on in the database yet (migration 0064), so none is counted.</p>}
      {att.error && <p className="ec-note ec-wide" role="alert"><Chip tone="warn">Check</Chip> {att.error}</p>}
      {!canEdit && <p className="ec-note ec-wide">View only. Only staff with edit rights can add or change payroll.</p>}
    </div>
  );

  return (
    <EditCard
      title={creating ? "New payroll record" : `${record.staffName}: ${record.month} ${record.year}`}
      subtitle={creating ? "One person's pay for one month" : (record.role || "Payroll record")}
      className="fn-pc fn-yc" main={main} side={side} canEdit={canEdit} creating={creating} dirty={dirty}
      onClose={onClose} onSave={save} submitLabel={creating ? "Save payroll" : "Save changes"}
      onDelete={creating ? undefined : async () => { const r = await removePayroll(record.id); if (r.ok) await reload(); return r; }}
      deleteName={record ? `${record.staffName}, ${record.month} ${record.year}` : ""} deleteNote="It is taken out of the books. This can't be undone."
    />
  );
}
