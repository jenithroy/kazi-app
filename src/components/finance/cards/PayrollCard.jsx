/**
 * One person's pay for one month: new or opened. Choose the person and the month and the basic salary fills in; what the attendance says
 * about lateness is worked out beside it (how many late days, how many of them cost a quarter day's pay, and so what the cut is) and
 * can be adjusted by hand. The right pane is the salary calculation as it stands: gross, what comes off, the net.
 *
 * The maths is the old form's (`calcPayroll`: gross is basic plus bonus, net is gross less the late cut and PF, never below nothing).
 * One thing differs: the old form could not remember a manual adjustment (only the final late deduction is stored), so opening a record
 * worked the cut out afresh from the attendance and the next save quietly replaced what had been entered. Here the difference between
 * the stored deduction and the attendance's is shown as the adjustment, so a record saved as it was opened is unchanged.
 */
import { useEffect, useId, useMemo, useRef } from "react";
import EditCard, { Field, KV, NumberInput } from "../../EditCard";
import Select from "../../Select";
import { Chip, useMoney } from "../parts";
import useCardForm from "./useCardForm";
import useAttendanceCut from "../../../hooks/useAttendanceCut";
import { calcPayroll, MONTHS } from "../../../lib/finance";
import { emptyPayroll, removePayroll, savePayroll } from "../../../lib/payrollWrites";
import { enterAdvance, focusFirst, thenAdvance } from "../flow";

const MONTH_OPTIONS = MONTHS.map((m) => ({ value: m, label: m }));

function fromRecord(r) {
  return {
    staffName: r.staffName || "", role: r.role || "", month: r.month || MONTHS[new Date().getMonth()], year: r.year || new Date().getFullYear(),
    basicNPR: r.basicNPR || "", bonusNPR: r.bonusNPR || "", pfDeductionNPR: r.pfDeductionNPR || "", lateAdjustmentNPR: 0, note: r.note || "",
  };
}

export default function PayrollCard({ record, employees, canEdit, profile, reload, onClose }) {
  const money = useMoney();
  const uid = useId();
  const root = useRef(null);
  const creating = !record;
  const { form, set, reset, dirty } = useCardForm(() => (creating ? emptyPayroll() : fromRecord(record)));
  const att = useAttendanceCut({ staffName: form.staffName, month: form.month, year: form.year, basic: form.basicNPR });

  useEffect(() => { focusFirst(root.current?.closest("form")); }, []);

  // Opening a saved record: only the final deduction was stored, so what the attendance gives now is shown against it as an adjustment,
  // which keeps the record as it was unless somebody changes it.
  const seeded = useRef(creating);
  useEffect(() => {
    if (seeded.current || !att.ready || att.loading) return;
    seeded.current = true;
    reset({ ...form, lateAdjustmentNPR: Number(record.lateDeductionNPR || 0) - att.cut });
  }, [att.ready, att.loading]);   // eslint-disable-line react-hooks/exhaustive-deps

  const calc = calcPayroll({ ...form, lateSalaryCutDeduction: att.cut });
  const waiting = !seeded.current;
  const people = useMemo(
    () => employees.map((e) => ({ value: e.name, label: e.name, hint: e.status === "Inactive" ? "inactive" : e.role || undefined })),
    [employees],
  );

  function pickStaff(name) {
    const emp = employees.find((e) => e.name === name);
    set((f) => ({ ...f, staffName: name, role: emp?.role || f.role, basicNPR: emp?.basicSalaryNPR || f.basicNPR, lateAdjustmentNPR: 0 }));
  }

  async function save() {
    if (!form.staffName) return { ok: false, message: "Choose the person." };
    if (!form.role.trim()) return { ok: false, message: "Enter their role." };
    if (form.basicNPR === "" || !Number.isFinite(Number(form.basicNPR))) return { ok: false, message: "Enter the basic salary." };
    if (!form.year || Number(form.year) < 2020 || Number(form.year) > 2099) return { ok: false, message: "Enter the year (2020 to 2099)." };
    if (waiting) return { ok: false, message: "Wait a moment: the attendance is still being read." };
    const res = await savePayroll({ id: record?.id, form, late: att, profile });
    if (!res.ok) return res;
    await reload();
    return { ok: true };
  }

  const flow = { onKeyDown: (e) => enterAdvance(e, () => e.target.closest("form")?.requestSubmit()) };

  const main = (
    <div className="fn-flow" ref={root} {...flow}>
      <Field label="Staff" htmlFor={`${uid}-staff`} className="fn-s3">
        <Select id={`${uid}-staff`} label="Staff" value={form.staffName} onChange={thenAdvance(pickStaff)} options={people} placeholder="Choose the person" disabled={!canEdit} searchPlaceholder="Search staff" />
      </Field>
      <Field label="Role" htmlFor={`${uid}-role`} className="fn-s3">
        <input id={`${uid}-role`} type="text" value={form.role} placeholder="e.g. Operations Manager" disabled={!canEdit} onChange={(e) => set({ role: e.target.value })} />
      </Field>
      <Field label="Month" htmlFor={`${uid}-month`} className="fn-s2">
        <Select id={`${uid}-month`} label="Month" value={form.month} onChange={thenAdvance((v) => set({ month: v }))} options={MONTH_OPTIONS} disabled={!canEdit} searchable={false} />
      </Field>
      <Field label="Year" htmlFor={`${uid}-year`} className="fn-s2">
        <NumberInput id={`${uid}-year`} value={form.year} min="2020" max="2099" step="1" disabled={!canEdit} onChange={(e) => set({ year: e.target.value })} />
      </Field>
      <Field label="Basic salary" htmlFor={`${uid}-basic`} className="fn-s2">
        <NumberInput id={`${uid}-basic`} unit="NPR" value={form.basicNPR} placeholder="0" disabled={!canEdit} onChange={(e) => set({ basicNPR: e.target.value })} />
      </Field>
      <Field label="Bonus" htmlFor={`${uid}-bonus`} className="fn-s2">
        <NumberInput id={`${uid}-bonus`} unit="NPR" value={form.bonusNPR} placeholder="0" disabled={!canEdit} onChange={(e) => set({ bonusNPR: e.target.value })} />
      </Field>
      <Field label="PF or other deduction" htmlFor={`${uid}-pf`} className="fn-s2">
        <NumberInput id={`${uid}-pf`} unit="NPR" value={form.pfDeductionNPR} placeholder="0" disabled={!canEdit} onChange={(e) => set({ pfDeductionNPR: e.target.value })} />
      </Field>
      <Field label="Note" htmlFor={`${uid}-note`} className="fn-s2">
        <input id={`${uid}-note`} type="text" value={form.note} placeholder="Optional" disabled={!canEdit} onChange={(e) => set({ note: e.target.value })} />
      </Field>

      <div className="ec-f ec-wide fn-late" role="group" aria-label="Late deduction">
        <span className="ec-lbl">Late deduction <small>worked out from the attendance</small></span>
        <div className="fn-late-grid">
          <div><span>Late days</span><b>{att.loading ? "…" : att.lateDays}</b></div>
          <div><span>Quarter-day cuts</span><b className={att.lateCutsCount > 0 ? "is-bad" : undefined}>{att.loading ? "…" : att.lateCutsCount}</b></div>
          <div><span>From attendance</span><b className={att.cut > 0 ? "is-bad" : undefined}>{att.loading ? "…" : `− ${money(att.cut)}`}</b></div>
          <label className="fn-late-adj">
            <span>Adjustment (+ more, − less)</span>
            <NumberInput aria-label="Adjustment to the late deduction" value={form.lateAdjustmentNPR} placeholder="0" disabled={!canEdit || waiting} onChange={(e) => set({ lateAdjustmentNPR: e.target.value })} step="any" min={undefined} />
          </label>
          <div><span>Final</span><b className={calc.late > 0 ? "is-bad" : undefined}>{waiting ? "…" : `− ${money(calc.late)}`}</b></div>
        </div>
        {Number(form.lateAdjustmentNPR || 0) !== 0 && !waiting && (
          <small className="ec-hint">
            {Number(form.lateAdjustmentNPR) > 0 ? `Adding ${money(Number(form.lateAdjustmentNPR))} to` : `Taking ${money(Math.abs(Number(form.lateAdjustmentNPR)))} off`} what the attendance gives. Say why in the note.
          </small>
        )}
      </div>
    </div>
  );

  const side = (
    <div className="fn-flow">
      <div className="ec-block ec-wide">
        <span className="ec-cap">Net pay</span>
        <div className="ec-fig">{waiting ? "…" : money(calc.net)}</div>
      </div>
      <KV rows={[
        ["Basic salary", money(Number(form.basicNPR) || 0)],
        ["Bonus", money(Number(form.bonusNPR) || 0)],
        ["Gross pay", money(calc.gross)],
        [`Late deduction${att.lateCutsCount ? ` (${att.lateCutsCount} × ¼ day)` : ""}`, waiting ? "…" : `− ${money(calc.late)}`, calc.late > 0 ? "bad" : undefined],
        ["PF or other", `− ${money(calc.pf)}`, calc.pf > 0 ? "bad" : undefined],
        ["Net pay", waiting ? "…" : money(calc.net), "good"],
      ]} />
      {calc.deductionsExceedGross && <p className="ec-strip ec-wide is-warn" role="alert"><span><b>Deductions are more than the gross pay</b><small>The net pay is held at nothing.</small></span></p>}
      {att.warning && <p className="ec-note ec-wide" role="status"><Chip tone="warn">Check</Chip> {att.warning}</p>}
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
