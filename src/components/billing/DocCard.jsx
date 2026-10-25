/**
 * One document, new or opened: a VAT invoice, a challan or a quotation, typed into and corrected in the card in the middle of the screen.
 * The fields, their rules and what is written are the old Billing form's (components/billing/…, lib/billing.js, lib/billingWrites.js):
 *   - the client is picked from Customers (or added on the spot, if this position may add customers), and an invoice over NPR 50,000
 *     must carry the client's PAN;
 *   - the date decides the fiscal year, and the fiscal year decides which numbered series the document is in; saving a date that would
 *     renumber other documents asks first;
 *   - flipping an invoice to Paid books its balance as a payment; stock is deducted once, when an invoice is created.
 *
 * Typing goes straight through: Enter moves to the next field (and in a line's description or the address, Shift + Enter is a new line),
 * Enter on the last line's rate starts another line, Ctrl + Enter saves (and, for a new document, starts the next one).
 */
import { useEffect, useId, useRef, useState } from "react";
import EditCard, { Field, KV, NumberInput, Seg, Tag } from "../EditCard";
import Select from "../Select";
import CustomerPicker from "../CustomerPicker";
import CustomerLink from "../customer-link/CustomerLink";
import DateField from "../finance/DateField";
import ItemsEditor from "./ItemsEditor";
import FxDialog from "./FxDialog";
import useCardForm from "../finance/cards/useCardForm";
import { enterAdvance, focusAfter, focusFirst, thenAdvance } from "../finance/flow";
import { useCurrency } from "../../context/CurrencyContext";
import { COMMON_CURRENCIES, toNPR } from "../../utils/currency";
import { BANK_NAMES, DOC_TYPES, STATUS_BY_TYPE, fmtCurrency, fmtNPR } from "../../utils/billing.jsx";
import { fiscalYearDateRangeAD, fiscalYearForDate, isFiscalYearLabel } from "../../utils/fiscalYear";
import { REGIONS } from "../../utils/region";
import { creditDue, formFromDoc, hasPayments, newForm, numberOf, panMissing, planSave, statusTone, totalsOfForm, WORDS } from "../../lib/billing";
import { saveDoc } from "../../lib/billingWrites";

const PAYMENT = [["CASH", "Cash"], ["Bank", "Bank"], ["Credit", "Credit"]];
const PAN_MESSAGE = "PAN number is required for invoices exceeding NPR 50,000 (Nepal IRD regulation).";
const DISCOUNT = [["pct", "%"], ["amount", "Amount"]];

/** "INV-034: Acme Ltd": the card's title for a saved document. The client's name opens the customer's card (the document's own client, as saved). */
function titleOf(tab, doc, words) {
  const who = (doc.clientName || "").trim();
  if (!who) return `${numberOf(tab, doc)}: ${words.one}`;
  return <>{numberOf(tab, doc)}: <CustomerLink customerId={doc.customerId} name={who}>{who}</CustomerLink></>;
}

export default function DocCard({ tab, doc, allOfKind, customers, inventoryItems, canEdit, canAddCustomers, profile, region, api, onClose }) {
  const meta = DOC_TYPES[tab];
  const words = WORDS[tab];
  const uid = useId();
  const root = useRef(null);
  const mode = useRef("close");
  const creating = !doc;
  const editable = canEdit && (creating || doc.status !== "Cancelled");
  const { currencies, currencyName } = useCurrency();

  const { form, set, reset, dirty } = useCardForm(() => (doc ? formFromDoc(tab, doc) : { ...newForm(tab), region }));
  const [panError, setPanError] = useState("");
  const [saved, setSaved] = useState("");
  const [savedWarning, setSavedWarning] = useState("");
  const [actionError, setActionError] = useState("");        // what went wrong with one of the card's own buttons (a page banner would be behind the card)
  const [fx, setFx] = useState(null);                         // the line whose rate is being converted
  // What the document was when this card was opened. Saving from a form that no longer matches it (the status or what has been paid changed
  // meanwhile, here or by someone else) would write the old values back over the new ones, so that save is refused.
  const opened = useRef(doc ? { status: doc.status, amountPaid: Number(doc.amountPaid || 0), updatedAt: doc.updatedAt || "" } : null);
  const regionTouched = useRef(false);
  // The client is the first thing to fill in (the modal itself only knows how to focus a text box, and the first one here is the PAN)
  useEffect(() => { focusFirst(root.current?.closest("form"), `#${CSS.escape(`${uid}-client`)}`); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // A new document is in the region on screen until the person chooses one themselves (the region can change from another tab while the card is open)
  useEffect(() => {
    if (!creating || regionTouched.current || !region || form.region === region) return;
    if (dirty) set({ region }); else reset({ ...form, region });
  }, [region]);   // eslint-disable-line react-hooks/exhaustive-deps
  const totals = totalsOfForm(form);
  const money = (n) => fmtCurrency(n, form.currency);
  const invoice = tab === "invoice";

  const isOtherBank = form.bankName === "other" || (form.bankName && !BANK_NAMES.includes(form.bankName));
  const statusOptions = STATUS_BY_TYPE[tab].includes(form.status) || !form.status ? STATUS_BY_TYPE[tab] : [form.status, ...STATUS_BY_TYPE[tab]];
  const currencyOptions = [...COMMON_CURRENCIES.filter((c) => currencies.includes(c)), ...currencies.filter((c) => !COMMON_CURRENCIES.includes(c))];
  if (form.currency && !currencyOptions.includes(form.currency)) currencyOptions.unshift(form.currency);

  // the fiscal year this date puts the document in, and whether that moves an existing one out of the year it is filed in
  const fy = form.fiscalYear || "—";
  const fyRange = form.fiscalYear ? fiscalYearDateRangeAD(form.fiscalYear) : null;
  const filedIn = doc ? String(doc.fiscalYear || "").trim() : "";
  const moving = !!doc && isFiscalYearLabel(filedIn) && !!form.fiscalYear && filedIn !== form.fiscalYear && tab !== "quotation";

  async function save() {
    const again = mode.current === "again";
    mode.current = "close";
    setSavedWarning("");
    if (doc && opened.current) {
      const now = { status: doc.status, amountPaid: Number(doc.amountPaid || 0), updatedAt: doc.updatedAt || "" };
      if (now.status !== opened.current.status || now.amountPaid !== opened.current.amountPaid || now.updatedAt !== opened.current.updatedAt) {
        return {
          ok: false,
          message: `This ${words.one.replace(/^VAT /, "")} was changed after you opened it (it is now ${now.status}${invoice ? `, ${fmtNPR(toNPR(now.amountPaid, doc.currency))} paid` : ""}). Close it and open it again to see the latest, then make your change.`,
        };
      }
    }
    // The picker's `required` select is unmounted while its inline "add new customer" panel is open, so the browser cannot enforce this
    // at exactly the moment a half-finished client is on screen.
    if (!(form.clientName || "").trim()) return { ok: false, message: "Pick a client, or finish adding the new one, before saving." };
    if (panMissing(tab, form)) { setPanError(PAN_MESSAGE); return { ok: false, message: PAN_MESSAGE }; }
    setPanError("");
    const plan = planSave({ tab, form, editingId: doc?.id || null, allOfKind });
    if (plan.affected.length) {
      const shown = plan.affected.slice(0, 8);
      const yes = await api.ask({
        title: "Renumber other documents?", confirmLabel: "Save and renumber",
        body: (
          <>
            <p>Saving this document will renumber {plan.affected.length} existing {words.many} so the numbers keep following the dates:</p>
            <ul className="fn-changes">
              {shown.map((c) => <li key={c.id}><span>{c.from || "—"}</span> <i aria-hidden="true">→</i> <b>{c.to}</b></li>)}
            </ul>
            {plan.affected.length > 8 && <p className="ec-note">…and {plan.affected.length - 8} more.</p>}
            <p>Copies already printed or sent will still show the old numbers.</p>
          </>
        ),
      });
      if (!yes) return { ok: false, message: "Not saved: the numbers were left as they are." };
    }
    const res = await saveDoc({ tab, form, editingId: doc?.id || null, plan, profile, region });
    if (!res.ok) return res;
    if (res.warning && !again) api.notify(res.warning, "warn");
    if (!again) { await api.reload(); return { ok: true }; }
    // the next document starts at once, on the same date and in the same currency; the list catches up behind it
    setSaved(`${res.number} · ${money(totals.total)}`);
    if (res.warning) setSavedWarning(res.warning);          // the card stays open, so this is said here and not in a banner behind it
    reset({ ...newForm(tab), date: form.date, fiscalYear: fiscalYearForDate(form.date) || form.fiscalYear, currency: form.currency, region: form.region || region });
    setPanError("");
    focusFirst(root.current?.closest("form"), `#${CSS.escape(`${uid}-client`)}`);
    api.reload().catch(console.error);
    return { ok: true, keepOpen: true };
  }

  // `mode` is read by save() the moment the form submits, which is synchronous: if the browser refuses the submit (a value it will not take) or the
  // key came from somewhere that does not submit, save() never ran, so "add another" must not stay armed for the next, ordinary Create.
  const requestSave = (form, kind) => { mode.current = kind; form?.requestSubmit(); mode.current = "close"; };
  const submitNow = (e) => requestSave(e.target.closest("form"), creating ? "again" : "close");
  const flow = { onKeyDown: (e) => enterAdvance(e, () => submitNow(e)) };
  // what one of the card's own buttons did: a failure is said in the card
  const act = async (promise) => { setActionError(""); const res = await promise; if (res && res.ok === false && res.message) setActionError(res.message); };
  // after a client is chosen (or added on the spot, which removes the panel the cursor was in) the cursor goes on to the next field
  const afterClient = () => requestAnimationFrame(() => {
    const form = root.current?.closest("form");
    const button = form?.querySelector(`#${CSS.escape(`${uid}-client`)}`);
    const here = document.activeElement;
    if (button && (!here || here === document.body || !form.contains(here))) button.focus({ preventScroll: true });
    const el = document.activeElement;
    if (el && el !== document.body && el.closest("form")) focusAfter(el, el.closest("form"));
  });

  const main = (
    <div className="fn-flow" ref={root} {...flow}>
      <Field label="Client / company" htmlFor={`${uid}-client`} className="fn-s4">
        <CustomerPicker
          glass id={`${uid}-client`} customers={customers} valueId={form.customerId} valueName={form.clientName}
          canCreate={canAddCustomers} disabled={!editable}
          onChange={({ id, name }) => {
            set((f) => {
              const picked = customers.find((c) => c.id === id);
              return {
                customerId: id || "", clientName: name,
                clientAddress: f.clientAddress || picked?.address || f.clientAddress,
                clientPhone: f.clientPhone || picked?.phone || f.clientPhone,
              };
            });
            afterClient();
          }}
          onCustomerCreated={api.addCustomer}
        />
      </Field>
      <DateField
        id={`${uid}-date`} label="Date" value={form.date} required disabled={!editable} className="fn-s2"
        onChange={thenAdvance((v) => set((f) => ({ date: v, fiscalYear: fiscalYearForDate(v) || f.fiscalYear })))}
      />

      <Field label="Client PAN" htmlFor={`${uid}-pan`} className="fn-s2">
        <input
          id={`${uid}-pan`} type="text" value={form.clientPAN || ""} placeholder="9-digit PAN (needed over NPR 50,000)" disabled={!editable}
          aria-invalid={panError ? "true" : undefined} onChange={(e) => { set({ clientPAN: e.target.value }); if (panError) setPanError(""); }}
        />
        {panError && <small className="fn-err" role="alert">{panError}</small>}
      </Field>
      <Field label="Client phone" htmlFor={`${uid}-phone`} className="fn-s2">
        <input id={`${uid}-phone`} type="text" value={form.clientPhone || ""} placeholder="+977 …" disabled={!editable} onChange={(e) => set({ clientPhone: e.target.value })} />
      </Field>
      <Field label="Currency" htmlFor={`${uid}-cur`} className="fn-s2">
        <Select
          id={`${uid}-cur`} label="Currency" value={form.currency || "NPR"} disabled={!editable} searchPlaceholder="Search currencies"
          options={currencyOptions.map((c) => ({ value: c, label: `${c} — ${currencyName(c)}` }))}
          onChange={thenAdvance((v) => set({ currency: v }))}
        />
      </Field>

      <Field label="Client address" htmlFor={`${uid}-addr`} className="fn-s4">
        <textarea
          id={`${uid}-addr`} rows={2} data-enter="next" value={form.clientAddress || ""} disabled={!editable}
          placeholder="Street, Ward No., City (Enter to move on · Shift+Enter for a new line)" onChange={(e) => set({ clientAddress: e.target.value })}
        />
      </Field>
      <Field label="Status" htmlFor={`${uid}-status`} className="fn-s2">
        <Select
          id={`${uid}-status`} label="Status" value={form.status} disabled={!editable} searchable={false}
          options={statusOptions.map((s) => ({ value: s, label: s }))} onChange={thenAdvance((v) => set({ status: v }))}
        />
      </Field>

      {invoice && (
        <>
          <DateField
            id={`${uid}-due`} label="Due date" value={form.dueDate} disabled={!editable} className="fn-s2"
            onChange={thenAdvance((v) => set({ dueDate: v }))}
          />
          <Field label="Payment terms" htmlFor={`${uid}-terms`} className="fn-s2">
            <input id={`${uid}-terms`} type="text" value={form.paymentTerms || ""} placeholder="Net 30" disabled={!editable} onChange={(e) => set({ paymentTerms: e.target.value })} />
          </Field>
        </>
      )}
      {tab === "quotation" && (
        <DateField
          id={`${uid}-valid`} label="Valid until" value={form.validUntil} disabled={!editable} className="fn-s2"
          onChange={thenAdvance((v) => set({ validUntil: v }))}
        />
      )}
      {tab === "challan" && (
        <>
          <Field label="Vehicle no." htmlFor={`${uid}-veh`} className="fn-s2">
            <input id={`${uid}-veh`} type="text" value={form.vehicleNo || ""} placeholder="BA 1 KA 1234" disabled={!editable} onChange={(e) => set({ vehicleNo: e.target.value })} />
          </Field>
          <Field label="Driver name" htmlFor={`${uid}-drv`} className="fn-s2">
            <input id={`${uid}-drv`} type="text" value={form.driverName || ""} placeholder="Full name" disabled={!editable} onChange={(e) => set({ driverName: e.target.value })} />
          </Field>
        </>
      )}
      <Field label="Region" htmlFor={`${uid}-reg`} className="fn-s2">
        <Select
          id={`${uid}-reg`} label="Region" value={form.region || ""} disabled={!editable} searchable={false}
          options={[...(creating ? [] : [{ value: "", label: "Not set" }]), ...REGIONS.map((r) => ({ value: r.id, label: r.label }))]}
          onChange={thenAdvance((v) => { regionTouched.current = true; set({ region: v }); })}
        />
      </Field>
      {tab === "challan" && (
        <>
          <Field label="Route: from" htmlFor={`${uid}-from`} className="fn-s3">
            <input id={`${uid}-from`} type="text" value={form.routeFrom || ""} placeholder="Departure location" disabled={!editable} onChange={(e) => set({ routeFrom: e.target.value })} />
          </Field>
          <Field label="Route: to" htmlFor={`${uid}-to`} className="fn-s3">
            <input id={`${uid}-to`} type="text" value={form.routeTo || ""} placeholder="Destination" disabled={!editable} onChange={(e) => set({ routeTo: e.target.value })} />
          </Field>
        </>
      )}
      {invoice && (
        <>
          <Field label="Payment type" labelId={`${uid}-ptype`} className="fn-s2">
            <Seg label="Payment type" value={form.paymentType || "CASH"} options={PAYMENT} disabled={!editable} onChange={(v) => set({ paymentType: v })} />
          </Field>
          {form.paymentType === "Bank" && (
            <Field label="Bank" htmlFor={`${uid}-bank`} className="fn-s2">
              <Select
                id={`${uid}-bank`} label="Bank" value={isOtherBank ? "other" : (form.bankName || "Nabil Bank")} disabled={!editable} searchable={false}
                options={[...BANK_NAMES.map((b) => ({ value: b, label: b })), { value: "other", label: "Another bank" }]} onChange={thenAdvance((v) => set({ bankName: v }))}
              />
            </Field>
          )}
          {form.paymentType === "Bank" && isOtherBank && (
            <Field label="Bank's name" htmlFor={`${uid}-bankx`} className="fn-s2">
              <input
                id={`${uid}-bankx`} type="text" value={form.bankName === "other" ? "" : form.bankName} placeholder="Type the bank's name" disabled={!editable}
                onChange={(e) => set({ bankName: e.target.value === "" ? "other" : e.target.value })}
              />
            </Field>
          )}
        </>
      )}

      <ItemsEditor
        tab={tab} items={form.items} currency={form.currency || "NPR"} disabled={!editable} inventoryItems={inventoryItems}
        onChange={(items) => set({ items })} onConvert={setFx}
      />

      {tab === "quotation" && (
        <Field label="Terms & conditions" htmlFor={`${uid}-tc`} wide>
          <textarea id={`${uid}-tc`} rows={4} value={form.terms || ""} disabled={!editable} onChange={(e) => set({ terms: e.target.value })} />
        </Field>
      )}
      <Field label="Notes / bank details / remarks" htmlFor={`${uid}-note`} wide>
        <textarea id={`${uid}-note`} rows={3} value={form.note || ""} disabled={!editable} placeholder={"Bank: \nAccount No.: \nBranch:"} onChange={(e) => set({ note: e.target.value })} />
      </Field>
    </div>
  );

  // an existing document: how it stands, and what can be done to it without editing it
  const due = doc ? creditDue(doc) : 0;
  const paid = doc ? toNPR(doc.amountPaid, doc.currency) : 0;
  const actionsHold = dirty ? "Save your changes first" : undefined;

  const side = (
    <div className="fn-flow" {...flow}>
      <div className="ec-block ec-wide">
        <span className="ec-cap">{creating ? `Number · ${tab === "quotation" ? "one run for all years" : `fiscal year ${fy}`}` : words.one.replace(/^./, (c) => c.toUpperCase())}</span>
        <div className="fn-eid">{creating ? "Given when saved" : numberOf(tab, doc)}</div>
        {!creating && <div className="bl-stat"><Tag tone={statusTone(doc.status)}>{doc.status}</Tag></div>}
      </div>
      {saved && <p className="ec-strip ec-wide" role="status"><span><b>Saved</b><small>{saved}. The next one is ready.</small></span></p>}
      {savedWarning && <p className="ec-strip is-warn ec-wide" role="alert"><span><b>{savedWarning}</b></span></p>}
      <div className="ec-block ec-wide">
        <span className="ec-cap">Grand total</span>
        <div className="ec-fig">{money(totals.total)}</div>
      </div>
      <KV rows={[
        ["Subtotal", money(totals.subtotal)],
        ...(totals.discountAmt > 0 ? [[(form.discountMode || "pct") === "pct" ? `Discount (${form.discountPct}%)` : "Discount", `− ${money(totals.discountAmt)}`, "bad"], ["Taxable amount", money(totals.taxableAmt)]] : []),
        ...(invoice && form.applyVAT ? [["VAT (13%)", money(totals.vatAmt)]] : []),
      ]} />
      {invoice && (
        <label className="fn-check ec-wide">
          <input type="checkbox" checked={Boolean(form.applyVAT)} disabled={!editable} onChange={(e) => set({ applyVAT: e.target.checked })} />
          <span>Apply VAT @ 13% (Nepal IRD)</span>
        </label>
      )}
      <Field label="Discount" labelId={`${uid}-disc`} wide>
        <div className="bl-disc">
          <Seg label="Discount as" value={form.discountMode || "pct"} options={DISCOUNT} disabled={!editable} onChange={(v) => set({ discountMode: v })} />
          {(form.discountMode || "pct") === "pct" ? (
            <NumberInput aria-label="Discount, percent" unit="%" min="0" max="100" value={form.discountPct || 0} disabled={!editable} onChange={(e) => set({ discountPct: e.target.value })} />
          ) : (
            <NumberInput aria-label="Discount, amount" unit={form.currency || "NPR"} min="0" value={form.discountFlatAmt || 0} disabled={!editable} onChange={(e) => set({ discountFlatAmt: e.target.value })} />
          )}
        </div>
      </Field>

      {(tab === "invoice" || tab === "challan") && (
        <div className="ec-block ec-wide">
          <span className="ec-cap">Fiscal year (B.S.)</span>
          <div className="bl-fy">FY {fy}</div>
          {moving ? (
            <p className="ec-strip is-warn" role="status"><span><b>Moves to another year</b><small>This date is in FY {form.fiscalYear}, but {numberOf(tab, doc) || "the document"} is filed in FY {filedIn}. Saving moves it into FY {form.fiscalYear} and gives it a new number there.</small></span></p>
          ) : (
            <small className="ec-hint">{fyRange ? `Shrawan 1 – Asar end · ${fyRange.startAD} to ${fyRange.endAD} A.D.` : "Set from the date."}</small>
          )}
        </div>
      )}

      {doc && (
        <div className="ec-block ec-wide bl-acts-side">
          {invoice && (
            <KV rows={[
              ["Paid so far", fmtNPR(paid), paid > 0 ? "good" : undefined],
              ["Credit due", doc.status === "Cancelled" ? "—" : due > 0.005 ? fmtNPR(due) : "Settled", due > 0.005 ? "bad" : "good"],
            ]} />
          )}
          {actionError && <p className="ec-strip is-warn" role="alert"><span><b>{actionError}</b></span></p>}
          <div className="bl-acts-btns">
            {/* the copy shows what is saved, not what is typed here, so it waits for the save like the other buttons */}
            <button type="button" className="ghost-button" disabled={dirty} title={actionsHold} onClick={() => api.view(doc)}>View and print</button>
            {editable && invoice && hasPayments(doc) && (
              <button type="button" className="ghost-button" disabled={dirty} title={actionsHold} onClick={() => api.pay(doc)}>
                {due > 0.005 ? ((doc.amountPaid || 0) > 0 ? "Add payment" : "Record payment") : "Payments"}
              </button>
            )}
            {editable && tab === "challan" && !["Delivered", "Cancelled"].includes(doc.status) && (
              <button type="button" className="ghost-button" disabled={dirty} title={actionsHold} onClick={() => act(api.setStatus(doc, "Delivered"))}>Mark delivered</button>
            )}
            {editable && tab === "quotation" && !["Accepted", "Rejected", "Cancelled"].includes(doc.status) && (
              <button type="button" className="ghost-button" disabled={dirty} title={actionsHold} onClick={() => act(api.setStatus(doc, "Accepted"))}>Mark accepted</button>
            )}
            {editable && tab === "quotation" && !doc.relatedInvoice && !["Cancelled", "Rejected"].includes(doc.status) && (
              <button type="button" className="ghost-button" disabled={dirty || !!api.convertingId} title={actionsHold} onClick={() => act(api.convert(doc))}>
                {api.convertingId === doc.id ? "Making the invoice…" : "Make a VAT invoice"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <EditCard
        title={creating ? `New ${words.one}` : titleOf(tab, doc, words)}
        subtitle={creating ? (tab === "quotation" ? "Numbered by its date, one run across all years" : `Numbered by its date, ${meta.prefix}-001 onwards each fiscal year`) : `${doc.status} · ${fmtCurrency(Number(doc.totalNPR) || 0, doc.currency)}`}
        className="fn-pc bl-dc"
        main={main} side={side} canEdit={editable} creating={creating} dirty={dirty}
        onClose={onClose} onSave={editable ? save : undefined}
        submitLabel={creating ? `Create ${words.one}` : "Save changes"} savingLabel="Saving…" closeLabel="Close"
        footerExtra={(
          <>
            {doc && canEdit && doc.status !== "Cancelled" && (
              <button type="button" className="ghost-button ec-ft-l ec-danger" onClick={() => act(api.cancel(doc, dirty))}>Cancel this {words.one.replace(/^VAT /, "")}</button>
            )}
            {/* not a submit button: when Enter or a browser's own rule submits the form it must be Create that is pressed, never this one */}
            {creating && editable && (
              <button type="button" className="ghost-button" title="Ctrl + Enter" onClick={(e) => requestSave(e.currentTarget.closest("form"), "again")}>Save and add another</button>
            )}
          </>
        )}
      />
      {fx !== null && <FxDialog onApply={(value) => set((f) => ({ items: f.items.map((it, k) => (k === fx ? { ...it, rate: value } : it)) }))} onClose={() => setFx(null)} />}
    </>
  );
}
