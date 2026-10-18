/**
 * A journal entry, new or opened: what was debited, what was credited and how much. Typed straight through like the others (Enter
 * moves on, Ctrl + Enter saves and starts the next with the date still set); the right pane shows how it posts, as the two lines of
 * the entry, so a debit and a credit swapped round is seen before it is saved.
 *
 * The rules are the old form's: the two accounts must differ, and an entry against Advance Received or Advance Payable says whose
 * advance it is.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import EditCard, { Field, KV, NumberInput, Tag } from "../../EditCard";
import Select from "../../Select";
import DateField from "../DateField";
import { useFin } from "../FinanceContext";
import { useMoney } from "../parts";
import useCardForm from "./useCardForm";
import { addJournalEntry, emptyJournal, removeJournalEntry, updateJournalEntry } from "../../../lib/financeWrites";
import { isAdvanceEntry } from "../../../lib/finance";
import { kathmanduDate } from "../../../utils/date";
import { REGIONS } from "../../../utils/region";
import { enterAdvance, focusFirst, thenAdvance } from "../flow";

function fromEntry(e) {
  return {
    date: e.date || "", description: e.description || "", debitAccount: e.debitAccount, creditAccount: e.creditAccount,
    amountNPR: e.amountNPR == null ? "" : String(e.amountNPR), reference: e.reference || "", partyName: e.partyName || "", region: e.region || "",
  };
}

let lastEntry = { date: "", at: 0 };
const startDate = () => (lastEntry.date && Date.now() - lastEntry.at < 30 * 60 * 1000 ? lastEntry.date : kathmanduDate());

export default function JournalCard({ entry, onClose }) {
  const { profile, region, canEditTab, reload, accounts, show } = useFin();
  const money = useMoney();
  const uid = useId();
  const root = useRef(null);
  const mode = useRef("close");
  const creating = !entry;
  const editable = canEditTab("journal");
  const { form, set, reset, dirty } = useCardForm(() => (creating ? { ...emptyJournal(startDate()), region } : fromEntry(entry)));
  const [saved, setSaved] = useState("");

  useEffect(() => { focusFirst(root.current?.closest("form"), `#${CSS.escape(`${uid}-amt`)}`); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const typeOf = useMemo(() => new Map(accounts.map((a) => [a.name, a.type])), [accounts]);
  const options = useMemo(
    () => [...typeOf.keys()].map((name) => ({ value: name, label: name, hint: typeOf.get(name) })),
    [typeOf],
  );
  // an account an old entry names that is no longer in the chart is still choosable, so opening it does not change it
  const withCurrent = (current) => (current && !typeOf.has(current) ? [{ value: current, label: current }, ...options] : options);
  const advance = isAdvanceEntry(form);
  const amount = Number(form.amountNPR) || 0;
  const same = form.debitAccount === form.creditAccount;

  function problem() {
    if (!form.date) return "Pick the entry date.";
    if (!(amount > 0) && creating) return "Enter the amount.";
    if (same) return "Debit and Credit accounts must be different.";
    if (advance && !form.partyName.trim()) return "Enter the customer or supplier this advance belongs to.";
    if (creating && !form.description.trim()) return "Say what the entry is for.";
    return "";
  }

  async function save() {
    const again = mode.current === "again";
    mode.current = "close";
    const why = problem();
    if (why) return { ok: false, message: why };
    const res = creating
      ? await addJournalEntry({ form, profile, region, advance })
      : await updateJournalEntry(entry.id, form, advance);
    if (!res.ok) return res;
    if (!again) { await reload(); return { ok: true }; }
    // the next entry starts at once, so what is typed from here on is its own; the list catches up behind it
    lastEntry = { date: form.date, at: Date.now() };
    setSaved(`${form.debitAccount} / ${form.creditAccount}, ${money(amount)}`);
    reset({ ...emptyJournal(form.date), region });
    focusFirst(root.current?.closest("form"), `#${CSS.escape(`${uid}-amt`)}`);
    reload().catch(console.error);
    return { ok: true, keepOpen: true };
  }

  const submitNow = (m) => (e) => { mode.current = m; e.target.closest("form")?.requestSubmit(); };
  const flow = {
    onKeyDown: (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitNow(creating ? "again" : "close")(e); return; }
      enterAdvance(e, () => submitNow(creating ? "again" : "close")(e));
    },
  };

  const main = (
    <div className="fn-flow" ref={root} {...flow}>
      <DateField id={`${uid}-date`} role="journal-date" label="Date" value={form.date} onChange={thenAdvance((v) => set({ date: v }))} disabled={!editable} required />
      <Field label="Amount" htmlFor={`${uid}-amt`}>
        <NumberInput id={`${uid}-amt`} unit="NPR" value={form.amountNPR} placeholder="0" disabled={!editable} onChange={(e) => set({ amountNPR: e.target.value })} />
      </Field>
      <Field label="Debit (Dr)" htmlFor={`${uid}-dr`}>
        <Select id={`${uid}-dr`} label="Debit account" value={form.debitAccount} onChange={thenAdvance((v) => set({ debitAccount: v }))} options={withCurrent(form.debitAccount)} disabled={!editable} searchPlaceholder="Search accounts" />
      </Field>
      <Field label="Credit (Cr)" htmlFor={`${uid}-cr`}>
        <Select id={`${uid}-cr`} label="Credit account" value={form.creditAccount} onChange={thenAdvance((v) => set({ creditAccount: v }))} options={withCurrent(form.creditAccount)} disabled={!editable} searchPlaceholder="Search accounts" />
      </Field>
      {advance && (
        <Field label="Customer or supplier" htmlFor={`${uid}-party`} wide hint="Advances are kept for each customer or supplier, so say whose this is.">
          <input id={`${uid}-party`} type="text" value={form.partyName} placeholder="Who this advance belongs to" disabled={!editable} onChange={(e) => set({ partyName: e.target.value })} />
        </Field>
      )}
      <Field label="Description" htmlFor={`${uid}-desc`} wide>
        <input id={`${uid}-desc`} type="text" value={form.description} placeholder="What the entry is for" disabled={!editable} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label="Reference" htmlFor={`${uid}-ref`}>
        <input id={`${uid}-ref`} type="text" value={form.reference} placeholder="Invoice no., PO no. (optional)" disabled={!editable} onChange={(e) => set({ reference: e.target.value })} />
      </Field>
      <Field label="Region" htmlFor={`${uid}-reg`}>
        <Select
          id={`${uid}-reg`} label="Region" value={form.region || ""} onChange={thenAdvance((v) => set({ region: v }))} disabled={!editable} searchable={false}
          options={[...(creating ? [] : [{ value: "", label: "Not set" }]), ...REGIONS.map((r) => ({ value: r.id, label: r.label }))]}
        />
      </Field>
    </div>
  );

  const side = (
    <div className="fn-flow" {...flow}>
      <div className="ec-block ec-wide">
        <span className="ec-cap">How it posts</span>
        <div className="fn-tacc" role="group" aria-label="The two lines of the entry">
          <div><span className="fn-tacc-k">Dr</span><b>{form.debitAccount || "—"}</b><span className="fn-tacc-v">{money(amount)}</span></div>
          <div className="is-cr"><span className="fn-tacc-k">Cr</span><b>{form.creditAccount || "—"}</b><span className="fn-tacc-v">{money(amount)}</span></div>
        </div>
        {same && <p className="fn-err" role="alert">The debit and credit accounts must be different.</p>}
      </div>
      {saved && <p className="ec-strip ec-wide" role="status"><span><b>Posted</b><small>{saved}. The next one is ready.</small></span></p>}
      <KV rows={[
        ["Debit", <span key="d">{typeOf.get(form.debitAccount) ? <Tag>{typeOf.get(form.debitAccount)}</Tag> : "—"}</span>],
        ["Credit", <span key="c">{typeOf.get(form.creditAccount) ? <Tag>{typeOf.get(form.creditAccount)}</Tag> : "—"}</span>],
        ...(!creating ? [["Posted by", (entry.createdBy || "").trim() || "—"], ["On", show(entry.date)]] : []),
      ]} />
      <p className="ec-note ec-wide">Ctrl + Enter saves and starts the next one.</p>
    </div>
  );

  return (
    <EditCard
      title={creating ? "New journal entry" : (entry.description || "Journal entry")}
      subtitle={creating ? "Post an entry to the books" : `${show(entry.date)} · ${money(Number(entry.amountNPR) || 0)}`}
      main={main} side={side} canEdit={editable} creating={creating} dirty={dirty}
      onClose={onClose} onSave={save}
      onDelete={creating ? undefined : async () => { const r = await removeJournalEntry(entry.id); if (r.ok) await reload(); return r; }}
      deleteName={entry ? (entry.description || "this entry") : ""} deleteNote="It is taken out of the books. This can't be undone."
      submitLabel={creating ? "Post entry" : "Save changes"}
      footerExtra={creating && editable ? (
        <button type="submit" className="ghost-button" title="Ctrl + Enter" onClick={() => { mode.current = "again"; }}>Post and add another</button>
      ) : null}
    />
  );
}
