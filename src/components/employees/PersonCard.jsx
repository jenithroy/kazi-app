import { useEffect, useId, useMemo, useRef, useState } from "react";
import EditCard, { Field, KV, NumberInput, Seg, Tag } from "../EditCard";
import Select from "../Select";
import DatePicker from "../DatePicker";
import useCardForm from "../finance/cards/useCardForm";
import { advance, enterAdvance, focusFirst, thenAdvance } from "../finance/flow";
import { useCurrency } from "../../context/CurrencyContext";
import { npr, useMoney } from "../finance/parts";
import { fmtDateBS } from "../../utils/fiscalYear";
import { createPerson, removePerson, savePerson } from "../../lib/employeesWrites";
import {
  LOCATIONS, PRIVATE_FIELDS, departmentOptions, hoursOf, isActive, locationLabel, managerOptions, personForm, positionOptions,
} from "../../lib/employees";
import { DaysPicker, Exceptions, RuleNote, WeekGlance } from "./Hours";
import { Face, personName } from "./parts";
import "./employees.css";

const STATUS = [["Active", "Active"], ["Inactive", "Inactive"]];
const YESNO = [["no", "No"], ["yes", "Yes"]];
const clean = (v) => String(v ?? "").trim();

/** "12 Mar 2024", or "" when the date is unusable. */
function fmtJoined(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * One person, in the card in the middle of the screen (EditCard): who they are, what they are paid and where it goes, and the
 * hours the attendance rules hold them to. With edit rights the same card saves a change, and a new person is this card opened
 * empty. `row` is null for a new person.
 *
 * Saving writes only the fields that were changed (lib/employeesWrites.js). A person whose position cannot see pay, PAN and bank
 * details gets those fields shown as hidden rather than empty: the directory returns null for them, and a null that means
 * "hidden" must not be read as "nothing there". The card closes itself on ok; otherwise it says why and stays up.
 *
 * `onSaved(res)`, `onCreated(res)` and `onRemoved(row)` are the page's, to look again and say what happened; `onLook()` is for a
 * write that failed in a way that does not say whether it went through (the page reads the people again, so what is on screen is true).
 */
export default function PersonCard({
  row, rows, positions, positionsFailed, canEdit, canSeePrivate, selfId, today, startSection,
  onSaved, onCreated, onRemoved, onLook, onClose,
}) {
  const uid = useId();
  const id = (k) => `${uid}-${k}`;
  const root = useRef(null);
  const { currency, moneyAlt, moneyForeign } = useCurrency();
  const text = useMoney();
  const creating = !row;
  const isSelf = Boolean(row) && row.id === selfId;
  const ro = !canEdit;

  // the form as the card opened: a save writes what differs from it, so a field somebody else changed meanwhile is not put back
  const [first] = useState(() => personForm(row, today));
  const { form, set, dirty } = useCardForm(first);
  const see = creating || canSeePrivate;                                      // someone adding a person is typing the details, not reading them
  const hidden = (k) => !see && PRIVATE_FIELDS.includes(k);                   // a field the directory hides from this viewer
  const off = (k) => ro || hidden(k);
  const type = (k) => (e) => set({ [k]: e.target.value });

  useEffect(() => { if (creating) focusFirst(root.current?.closest("form"), "[data-first]"); }, [creating]);

  const posOptions = useMemo(() => positionOptions(positions), [positions]);
  const deptOptions = useMemo(() => departmentOptions(first.department), [first.department]);
  const mgrOptions = useMemo(() => managerOptions(rows, row?.id), [rows, row?.id]);

  /* ── writes ─────────────────────────────────────────────────── */

  async function save() {
    if (!canEdit) return { ok: false, message: "You can look at this, but changing it is for people who can edit Employees." };
    const res = creating ? await createPerson(form) : await savePerson(row, first, form, { canSeePrivate: see });
    if (!res.ok) {
      if (res.ambiguous) onLook?.();
      return res;
    }
    if (creating) await onCreated(res);
    else await onSaved(res);
    return { ok: true };
  }

  async function remove() {
    if (!canEdit) return { ok: false, message: "You can look at this, but changing it is for people who can edit Employees." };
    const res = await removePerson(row);
    if (!res.ok) {
      if (res.ambiguous) onLook?.();
      return res;
    }
    await onRemoved(row);
    return { ok: true };
  }

  // Enter moves to the next field and Enter in the last one saves; Enter on an open dropdown picks, then moves on
  const flow = {
    onKeyDown: (e) => {
      const t = e.target;
      const picking = e.key === "Enter" && t.matches?.("button.ksel") && t.getAttribute("aria-expanded") === "true";
      enterAdvance(e, () => t.closest("form")?.requestSubmit());
      if (picking) requestAnimationFrame(() => requestAnimationFrame(() => { if (document.activeElement === t) advance(); }));
    },
  };

  /* ── Details ────────────────────────────────────────────────── */

  const renamed = !creating && clean(form.name) !== clean(first.name);
  const detailsMain = (
    <div className="em-flow" ref={root} {...flow}>
      <Field
        label="Full name *" htmlFor={id("name")} wide
        hint={renamed ? <span role="status">Payroll records and the production labour rate find a person by name. Renaming them separates their earlier records.</span> : undefined}
      >
        <input id={id("name")} data-first type="text" autoComplete="off" value={form.name} placeholder="Employee full name" disabled={ro} onChange={type("name")} />
      </Field>
      <Field label="Position *" htmlFor={id("pos")} hint={positionsFailed ? "The list of positions could not load. Reload the page." : undefined}>
        <Select
          id={id("pos")} label="Position" value={form.positionId} onChange={thenAdvance((v) => set({ positionId: v }))}
          options={posOptions} placeholder="Choose a position" searchPlaceholder="Search positions" disabled={ro}
        />
      </Field>
      <Field label="Department" htmlFor={id("dept")}>
        <Select
          id={id("dept")} label="Department" value={form.department} onChange={thenAdvance((v) => set({ department: v }))}
          options={deptOptions} placeholder="Not set" searchable={false} disabled={ro}
        />
      </Field>
      <Field
        label="Email *" htmlFor={id("email")}
        hint={creating ? "They sign in with this. A password-setup email is sent to it."
          : clean(form.email) !== clean(first.email) ? <span role="status">This does not change the address they sign in with.</span> : undefined}
      >
        <input id={id("email")} type="text" inputMode="email" autoComplete="off" value={form.email} placeholder="email@example.com" disabled={ro} onChange={type("email")} />
      </Field>
      <Field label="Phone" htmlFor={id("phone")}>
        <input id={id("phone")} type="text" autoComplete="off" value={form.phone} placeholder="+977-" disabled={off("phone")} onChange={type("phone")} />
      </Field>
      <Field label="Joined" htmlFor={id("join")}>
        <DatePicker id={id("join")} label="Joined" value={form.joinDate} onChange={thenAdvance((v) => set({ joinDate: v }))} disabled={off("joinDate")} placeholder="Not set" />
      </Field>
      <Field label="Reports to" htmlFor={id("mgr")}>
        <Select
          id={id("mgr")} label="Reports to" value={form.reportsTo} onChange={thenAdvance((v) => set({ reportsTo: v }))}
          options={mgrOptions} placeholder="No manager" searchPlaceholder="Search people" disabled={ro}
        />
      </Field>
      <Field label="Based in" labelId={id("loc")}>
        <Seg label="Based in" value={form.location} onChange={(v) => set({ location: v })} options={LOCATIONS} disabled={ro} />
      </Field>
      <Field
        label="Status" labelId={id("status")}
        hint={form.status === "Inactive" ? <span role="status">{isSelf ? "That's you: you would be signed out." : "They can't sign in while they are inactive."}</span> : undefined}
      >
        <Seg label="Status" value={form.status} onChange={(v) => set({ status: v })} options={STATUS} disabled={ro} />
      </Field>
      <Field label="Production worker" labelId={id("prod")} wide hint="Yes counts this person's pay in the labour cost of an order.">
        <Seg
          label="Production worker" value={form.isProductionWorker ? "yes" : "no"} onChange={(v) => set({ isProductionWorker: v === "yes" })}
          options={YESNO} disabled={ro}
        />
      </Field>
      <Field label="Address" htmlFor={id("addr")} wide>
        <input id={id("addr")} type="text" autoComplete="off" value={form.address} placeholder="City, District" disabled={off("address")} onChange={type("address")} />
      </Field>
      {!see && <p className="ec-note ec-wide">Phone, address and join date are hidden for your position.</p>}
    </div>
  );

  const joined = row?.joinDate ? fmtJoined(row.joinDate) : "";
  const manager = row?.reportsTo ? rows.find((e) => e.id === row.reportsTo) : null;
  const hours = row ? hoursOf(row) : null;
  const detailsSide = creating ? (
    <>
      <p className="ec-note ec-wide">
        Adding someone also creates their sign-in: a password-setup email goes to the address you enter, and they choose their own password.
      </p>
      <p className="ec-note ec-wide">
        <b>Access follows the position.</b> Every page and finance tab this person can open is set by the position, not per person.
      </p>
    </>
  ) : (
    <>
      <div className="em-id ec-wide">
        <Face row={row} size={52} />
        <span>
          <b>{personName(row)}</b>
          <small>{row.role || "No position"}</small>
        </span>
      </div>
      <KV
        rows={[
          ["Status", <Tag key="s" tone={isActive(row) ? "good" : "bad"}>{isActive(row) ? "Active" : "Inactive"}</Tag>],
          ["Based in", locationLabel(row.location)],
          ["Joined", !see ? "Hidden" : joined ? <>{joined} <small>· {fmtDateBS(row.joinDate)}</small></> : "—"],
          ["Hours", hours.source === "none" ? "Not set" : <>{hours.time}{hours.source === "builtin" ? <small> · built in</small> : null}</>],
          ["Reports to", manager ? personName(manager) : "—"],
        ]}
      />
      <p className="ec-note ec-wide">
        <b>Access follows the position.</b> Changing it changes every page and finance tab this person can open.
      </p>
    </>
  );

  /* ── Pay and bank ───────────────────────────────────────────── */

  const basic = Number(form.basicSalaryNPR) || 0;
  const payMain = (
    <div className="em-flow" {...flow}>
      {!see && <p className="ec-note ec-wide">Pay, PAN and bank details are hidden for your position.</p>}
      <Field label="Basic pay (monthly)" htmlFor={id("basic")} hint={basic > 0 ? `About ${moneyForeign(basic)}` : undefined}>
        <NumberInput id={id("basic")} unit="NPR" min={undefined} value={form.basicSalaryNPR} placeholder="0" disabled={off("basicSalaryNPR")} onChange={type("basicSalaryNPR")} />
      </Field>
      <Field label="PAN number" htmlFor={id("pan")}>
        <input id={id("pan")} type="text" autoComplete="off" value={form.panNumber} placeholder="9-digit PAN" disabled={off("panNumber")} onChange={type("panNumber")} />
      </Field>
      <Field label="Bank" htmlFor={id("bank")}>
        <input id={id("bank")} type="text" autoComplete="off" value={form.bankName} placeholder="e.g. Nabil Bank" disabled={off("bankName")} onChange={type("bankName")} />
      </Field>
      <Field label="Branch" htmlFor={id("branch")}>
        <input id={id("branch")} type="text" autoComplete="off" value={form.bankBranch} placeholder="e.g. Thamel" disabled={off("bankBranch")} onChange={type("bankBranch")} />
      </Field>
      <Field label="Account number" htmlFor={id("acct")} wide>
        <input id={id("acct")} type="text" autoComplete="off" value={form.bankAccount} placeholder="Account number" disabled={off("bankAccount")} onChange={type("bankAccount")} />
      </Field>
    </div>
  );
  const paySide = (
    <>
      <div className="ec-block ec-wide">
        <span className="ec-cap">Basic pay</span>
        {!see ? <div className="ec-fig em-none">Hidden for your position</div>
          : basic > 0 ? <div className="ec-fig">{text(basic)}<small>{currency !== "NPR" ? `₨ ${npr(basic)}` : moneyAlt(basic)}</small></div>
          : <div className="ec-fig em-none">None set</div>}
      </div>
      <p className="ec-note ec-wide">Salary slips and new payroll records start from this figure. Payroll itself is entered in Payroll.</p>
    </>
  );

  /* ── Hours ──────────────────────────────────────────────────── */

  const hoursMain = (
    <div className="em-flow" {...flow}>
      <Field label="Starts" htmlFor={id("start")}>
        <input id={id("start")} type="time" value={form.scheduleStart} disabled={ro} onChange={type("scheduleStart")} />
      </Field>
      <Field label="Ends" htmlFor={id("end")}>
        <input id={id("end")} type="time" value={form.scheduleEnd} disabled={ro} onChange={type("scheduleEnd")} />
      </Field>
      {Boolean(form.scheduleStart) !== Boolean(form.scheduleEnd) && (
        <p className="ec-note ec-wide em-warn" role="status">Give both a start and an end, or neither: with only one, Attendance ignores the hours.</p>
      )}
      <Field
        label="Working days" labelId={id("days")} wide
        hint={form.scheduleWorkingDays ? "A day left off is a day off." : "None chosen yet: every day counts as a working day."}
      >
        <DaysPicker label="Working days" value={form.scheduleWorkingDays} disabled={ro} onChange={(v) => set({ scheduleWorkingDays: v })} />
      </Field>
      <Field label="Days on other hours" labelId={id("exc")} wide hint="A day that starts or ends at a different time, e.g. Tuesday.">
        <Exceptions
          idBase={id("exc")} value={form.scheduleDayOverrides} days={form.scheduleWorkingDays} start={form.scheduleStart} end={form.scheduleEnd}
          disabled={ro} onChange={(v) => set({ scheduleDayOverrides: v })}
        />
      </Field>
    </div>
  );
  const hoursSide = (
    <>
      <div className="ec-block ec-wide">
        <span className="ec-cap">The week</span>
        <WeekGlance form={form} name={form.name} />
      </div>
      <RuleNote form={form} name={form.name} />
      {row?.scheduleNote ? <p className="ec-note ec-wide"><b>Note on file:</b> {row.scheduleNote}</p> : null}
    </>
  );

  const sections = [
    { id: "details", label: "Details", main: detailsMain, side: detailsSide },
    { id: "pay", label: "Pay and bank", main: payMain, side: paySide },
    { id: "hours", label: "Hours", main: hoursMain, side: hoursSide },
  ];

  const deleteNote = [
    isSelf ? "This is you: you would be signed out for good." : "",
    "Deleting also erases their attendance, clock-ins, chat messages, points and photo, and takes them off tasks, orders and payroll records. It can't be undone.",
    "Setting them Inactive keeps all of that; they just can't sign in.",
  ].filter(Boolean).join(" ");

  return (
    <EditCard
      className="em-card"
      title={creating ? "New employee" : personName(row)}
      subtitle={creating ? "They get a sign-in by email" : [row.role, row.department, locationLabel(row.location)].filter(Boolean).join(" · ")}
      canEdit={canEdit}
      creating={creating}
      initialSection={startSection || "details"}
      sections={sections}
      dirty={dirty}
      submitLabel={creating ? "Add employee" : "Save changes"}
      savingLabel={creating ? "Adding…" : "Saving…"}
      onSave={save}
      onDelete={creating ? undefined : remove}
      deleteName={creating ? undefined : personName(row)}
      deleteNote={deleteNote}
      onClose={onClose}
    />
  );
}
