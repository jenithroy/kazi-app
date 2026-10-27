import { useId, useMemo, useState } from "react";
import Modal from "../Modal";
import Select from "../Select";
import CustomerPicker from "../CustomerPicker";
import DualDateInput from "../DualDateInput";
import { Avatar, Icons, cn, hueFromName } from "../ui";
import { roundAmount } from "../../utils/format";
import { todayDate } from "../../utils/date";
import { adToBsParts } from "../../utils/fiscalYear";
import { sameName } from "../../utils/billingClients";
import { REGIONS } from "../../utils/region";
import { FABRIC_TYPES, STAGES, dueIn30, parseInvoiceDescription } from "../../lib/production";
import { brandName, completeness, missingWords, readPack } from "../../lib/techpack";
import TechPackLink from "../techpack/TechPackLink";
import PackPreview from "./PackPreview";

/** The dropdown's last choice: not a tech pack, a way to make one (the owner's rule: no tech pack yet = make it first, then the order). */
const NEW_PACK = "__new_pack__";

/** Whether a NEW order has to be made from a tech pack. Off for now (the owner, 2026-10-26: the tech packs are still being filled in); true asks for one again. */
const PACK_REQUIRED = false;

const VAT_RATE = 0.13;

export const emptyInvFields = (today) => ({
  clientAddress: "", clientPhone: "", clientPAN: "",
  dueDate: dueIn30(todayDate(), today), applyVAT: true, paymentTerms: "Net 30", paymentType: "CASH",
});

const emptyOrderForm = () => ({
  date: todayDate(),
  deliveryDate: "",
  customerName: "",
  customerId: "",
  styleName: "",
  fabricType: "Terry Cotton",
  colorway: "",
  quantity: "",
  pricePerPcNPR: "",
  invoiceRef: "",
  assignedTo: "",
  stage: "Order Received",
  status: "Active",
  notes: "",
  sampleId: "",
  sampleName: "",
  patternId: "",
  // Not entered on the form any more. They are carried through so that saving an
  // older order does not wipe the fabric figures it was created with.
  fabricGramsUsed: "",
  fabricCostPerPcNPR: "",
  region: "",
});

function formFromOrder(order) {
  return {
    date:          order.date || todayDate(),
    deliveryDate:  order.deliveryDate || "",
    customerName:  order.customerName || "",
    customerId:    order.customer_id || "",
    styleName:     order.styleName || "",
    fabricType:    order.fabricType || "Terry Cotton",
    colorway:      order.colorway || "",
    quantity:      order.quantity || "",
    pricePerPcNPR: order.pricePerPcNPR || "",
    invoiceRef:    order.invoiceRef || "",
    assignedTo:    order.assigned_to || "",
    stage:         order.stage || "Order Received",
    status:        order.status || "Active",
    notes:         order.notes || "",
    sampleId:            order.sampleId || "",
    sampleName:          order.sampleName || "",
    patternId:           order.patternId || "",
    fabricGramsUsed:     order.fabricGramsUsed || "",
    fabricCostPerPcNPR:  order.fabricCostPerPcNPR || "",
    region:              order.region || "",
  };
}

/* ── Building blocks ───────────────────────────────────────────
   Layout classes are the .kof-* set in styles.css. */

// Label above a control. `w` is how many of the 12 desktop columns it takes (3, 4,
// 6, 8, or 12 for a whole row); `half` lets a short field sit two-to-a-row on a
// phone, and is only for fields narrower than a full row.
function Field({ label, w = 12, half = false, required = false, hint, children }) {
  return (
    <label className={cn("kof-f", w < 12 && `kof-c${w}`, half && "kof-h")}>
      <span className="kof-l">
        {label}
        {required && <span className="kof-req" aria-hidden="true">*</span>}
      </span>
      {children}
      {hint && <span className="kfield-hint">{hint}</span>}
    </label>
  );
}

// The same, for a control that is not a native one (the dropdown is a button and a list, so the
// label points at it by id instead of wrapping it).
function Box({ label, w = 12, half = false, hint, htmlFor, children }) {
  return (
    <div className={cn("kof-f", w < 12 && `kof-c${w}`, half && "kof-h")}>
      <label className="kof-l" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <span className="kfield-hint">{hint}</span>}
    </div>
  );
}

// A date in the form's calendar. The stored value is always an A.D. "YYYY-MM-DD"
// string (or "" when unset); `mode` only decides how it is shown and entered, and the
// chip under the field flips it for every date in the form at once (Billing does the
// same). B.S. entry is DualDateInput's Year/Month/Day dropdowns, except while blank:
// those have to show some date and would look chosen when nothing is, so a blank one
// is a button that starts from today (Finance's dates follow the same rule).
function DateField({ label, w, half, required, value, onChange, mode, onModeChange }) {
  const blankBs = mode === "bs" && !adToBsParts(value);
  return (
    // Three dropdowns need more than half a phone's width, so B.S. takes the whole row.
    <Field label={label} w={w} half={half && mode !== "bs"} required={required}>
      <div className="kof-date">
        {blankBs ? (
          <div className="kof-date-blank">
            <button type="button" className="kof-pick" onClick={() => onChange(todayDate())}>
              Pick date <Icons.Calendar size={16} />
            </button>
            <button type="button" className="kof-chip" title="Click to switch calendar" onClick={() => onModeChange("ad")}>
              <span aria-hidden="true">⇄</span> A.D.
            </button>
          </div>
        ) : (
          <DualDateInput className="kof-dd" value={value} onChange={onChange} required={required}
            mode={mode} onModeChange={onModeChange} />
        )}
      </div>
    </Field>
  );
}

// An on/off row where the whole row is the button.
export function Switch({ checked, onChange, label, hint }) {
  return (
    <button type="button" role="switch" aria-checked={checked}
      className={cn("kof-switch", checked && "is-on")}
      onClick={() => onChange(!checked)}>
      <span className="kof-switch-txt">
        <span className="kof-switch-l">{label}</span>
        {hint && <span className="kof-switch-h">{hint}</span>}
      </span>
      <span className="kof-track" aria-hidden="true"><span className="kof-knob" /></span>
    </button>
  );
}

// Offers to copy the latest invoice into a blank order. It changes wording once
// Apply is pressed: on a phone the fields it fills can be below the fold, and a
// button that appears to do nothing gets pressed twice.
function SuggestionBanner({ invoice, onApply, onDismiss }) {
  const [applied, setApplied] = useState(false);
  const item = invoice.items?.[0];
  const facts = [
    invoice.invoiceNumber && `Latest invoice ${invoice.invoiceNumber}`,
    invoice.clientName,
    (item?.description || "").split("\n")[0],
    item?.qty ? `${Number(item.qty).toLocaleString()} pcs` : "",
    item?.rate ? `NPR ${roundAmount(item.rate).toLocaleString()}/pc` : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="kof-sugg" role="region" aria-label="Smart recommendation">
      <span className="kof-sugg-ico" aria-hidden="true">
        {applied ? <Icons.Check size={18} /> : <Icons.Billing size={18} />}
      </span>
      <div className="kof-sugg-txt" aria-live="polite">
        <strong>{applied ? "Recommendation applied" : "Smart recommendation"}</strong>
        <span>{applied ? "Check the details below before saving." : facts}</span>
      </div>
      <div className="kof-sugg-act">
        {!applied && (
          <button type="button" className="kof-btn kof-btn--solid"
            onClick={() => { onApply(); setApplied(true); }}>
            Apply
          </button>
        )}
        <button type="button" className="kof-btn" onClick={onDismiss}>{applied ? "Done" : "Dismiss"}</button>
      </div>
    </div>
  );
}

export function InvoiceTotals({ quantity, price, applyVAT }) {
  if (!(Number(quantity) > 0 && Number(price) > 0)) return null;
  const sub = Number(quantity) * Number(price);
  const vat = applyVAT ? sub * VAT_RATE : 0;
  return (
    <dl className="kof-tot">
      <div><dt>Subtotal</dt><dd>NPR {roundAmount(sub).toLocaleString()}</dd></div>
      {applyVAT && <div><dt>VAT 13%</dt><dd>NPR {roundAmount(vat).toLocaleString()}</dd></div>}
      <div className="kof-tot-total"><dt>Total</dt><dd>NPR {roundAmount(sub + vat).toLocaleString()}</dd></div>
    </dl>
  );
}

export const PAYMENT_TERMS = ["Net 15", "Net 30", "Net 45", "Net 60", "Due on Receipt"].map((t) => ({ value: t, label: t }));
export const PAYMENT_TYPES = [{ value: "CASH", label: "Cash" }, { value: "Bank", label: "Bank" }, { value: "Credit", label: "Credit" }];

/**
 * The invoice or challan an order belongs to, picked from the ones that exist: a
 * typed reference can point at nothing. Newest first, cancelled ones left out.
 * Invoice and challan numbers restart every fiscal year, so a number that turns up
 * more than once is shown with its year. A reference an older order already carries
 * that matches nothing listed (typed by hand before this was a picker) stays as its
 * own option, so opening and saving that order cannot blank it.
 * When `customer` is given, the list narrows to that customer's own documents —
 * by customerId for invoices, or by name for challans, which have no such column
 * at all. A value already on the order that falls outside that narrowed list is
 * never dropped silently: it is shown as "not found" (doesn't exist anywhere) or
 * "different customer" (exists, just not theirs), so a mismatch is something the
 * person sees and can decide about, not something that quietly vanishes.
 */
function documentOptions({ value, invoices, challans, locked, customer }) {
  const newestFirst = (a, b) => (b.date || "").localeCompare(a.date || "");
  const usable = (d) => !/^cancel/i.test(d.status || "");
  const prep = (rows, numberField) => rows
    .filter(usable)
    .map((d) => ({ ...d, number: d[numberField] }))
    .filter((d) => d.number)
    .sort(newestFirst);
  const allInv = prep(invoices, "invoiceNumber");
  const allCh = prep(challans, "challanNumber");

  const belongsToCustomer = (d) => !customer || d.customerId === customer.id || sameName(d.clientName, customer.name);
  const inv = customer ? allInv.filter(belongsToCustomer) : allInv;
  const ch = customer ? allCh.filter(belongsToCustomer) : allCh;

  const count = {};
  [...inv, ...ch].forEach((d) => { count[d.number] = (count[d.number] || 0) + 1; });
  const label = (d) => [
    count[d.number] > 1 && d.fiscalYear ? `${d.number} (FY ${d.fiscalYear})` : d.number,
    d.clientName,
    Number(d.totalNPR) > 0 ? `NPR ${roundAmount(d.totalNPR).toLocaleString()}` : null,
  ].filter(Boolean).join(" · ");

  const selectedDoc = value ? [...allInv, ...allCh].find((d) => d.number === value) : null;
  const missing = value && !selectedDoc;
  const elsewhere = value && selectedDoc && !count[value];
  return [
    { value: "", label: locked ? "New invoice, numbered when you save" : "None" },
    ...(missing && !locked ? [{ value, label: `${value} (not found)` }] : []),
    ...(elsewhere && !locked ? [{ value, label: `${value} · ${selectedDoc.clientName} (different customer)` }] : []),
    ...inv.map((d) => ({ value: d.number, label: label(d), hint: "Invoice" })),
    ...ch.map((d) => ({ value: d.number, label: label(d), hint: "Challan" })),
  ];
}

/**
 * The new / edit order form, in a glass dialog. It keeps its own draft; pressing the button hands the
 * draft to the page (`onSave`), which writes it and resolves to `{ ok, message }`. The dialog closes
 * only when that worked, and says why when it did not.
 */
export default function OrderFormDialog({
  order, today, samples, fabrics, employees, customers, billingClients, invoices, challans, latestInvoice,
  patterns = [], packLink = false, canCreatePack = false, onCreatePack, onEditPack,
  canCreateCustomer, dateMode, onDateMode, onCustomerCreated, onSave, onClose,
}) {
  const uid = useId();
  const fid = (name) => `${uid}-${name}`;
  const editing = Boolean(order);
  const [form, setForm] = useState(() => (order ? formFromOrder(order) : emptyOrderForm()));
  const [issueInvoice, setIssueInvoice] = useState(false);
  const [invFields, setInvFields] = useState(() => emptyInvFields(today));
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setError(""); };

  const sampleOptions = useMemo(() => [
    { value: "", label: "None" },
    ...samples.map((s) => ({ value: s.id, label: s.name, hint: s.product_type || undefined })),
  ], [samples]);
  const peopleOptions = useMemo(() => [
    { value: "", label: "Nobody yet" },
    ...employees.map((em) => ({ value: em.id, label: em.name, icon: <Avatar name={em.name} personId={em.id} hue={hueFromName(em.name)} size={22} /> })),
  ], [employees]);
  const stageOptions = useMemo(() => STAGES.map((s) => ({ value: s, label: s })), []);
  const regionOptions = useMemo(() => [{ value: "", label: "Not set" }, ...REGIONS.map((r) => ({ value: r.id, label: r.label }))], []);
  const docOptions = useMemo(() => documentOptions({
    value: form.invoiceRef, invoices, challans, locked: issueInvoice && !editing,
    customer: form.customerId ? { id: form.customerId, name: form.customerName } : null,
  }), [form.invoiceRef, form.customerId, form.customerName, invoices, challans, issueInvoice, editing]);

  /* ── the tech pack ─────────────────────────────────────────────
     A new order is made FROM a tech pack when it has one (it has to, while PACK_REQUIRED is on).
     The list is the packs that can be used (a finished new-format pack, or any older one);
     one that still lacks something is shown but cannot be chosen, and says so. With a customer picked the list narrows to their packs
     and the ones nobody has filed under a customer (the older packs have none), so another customer's pack is never one slip away. */
  const packRows = useMemo(() => patterns.map((row) => {
    const pack = readPack(row);
    return { row, pack, c: completeness(pack) };
  }), [patterns]);
  const packOptions = useMemo(() => {
    const mine = form.customerId;
    const madeBefore = editing && !order?.patternId;
    const shown = packRows
      .filter(({ row, pack }) => row.id === form.patternId || !mine || !pack.customerId || pack.customerId === mine)
      .sort((a, b) => (Number(b.pack.customerId === mine && Boolean(mine)) - Number(a.pack.customerId === mine && Boolean(mine))) || a.pack.name.localeCompare(b.pack.name));
    const who = (pack) => brandName(pack, customers.find((c) => String(c.id) === pack.customerId));
    return [
      // "none" is a choice for an older order that has no pack, and for every order while a pack is not required
      ...(madeBefore || !PACK_REQUIRED ? [{ value: "", label: madeBefore ? "None (made before tech packs)" : "No tech pack" }] : []),
      ...shown.map(({ row, pack, c }) => ({
        value: row.id,
        label: [pack.styleNo, pack.name || "Untitled tech pack"].filter(Boolean).join(" · "),
        hint: c.ok ? who(pack) || (pack.legacy ? "Old format" : "") : "Not finished",
        disabled: !c.ok && row.id !== form.patternId,
      })),
      ...(canCreatePack ? [{ value: NEW_PACK, label: "+ Create a new tech pack…" }] : []),
    ];
  }, [packRows, form.customerId, form.patternId, customers, editing, order, canCreatePack]);
  const pickedPack = packRows.find(({ row }) => row.id === form.patternId) || null;
  const pickedBrand = pickedPack ? brandName(pickedPack.pack, customers.find((c) => String(c.id) === pickedPack.pack.customerId)) : "";

  function selectPack(row) {
    if (!row) { set({ patternId: "" }); return; }
    const pack = readPack(row);
    const customer = pack.customerId ? customers.find((c) => String(c.id) === pack.customerId) : null;
    const colours = pack.colour.split(/[,/&]|\sand\s/i).map((s) => s.trim()).filter(Boolean);
    const fabric = pack.materials.find((m) => m.kind === "fabric" && m.name.trim())?.name.trim();
    // what the tech pack knows fills the form; what it does not know is left as it was
    setForm((f) => ({
      ...f,
      patternId: row.id,
      styleName: pack.name || f.styleName,
      ...(customer ? { customerId: customer.id, customerName: customer.name } : {}),
      fabricType: fabric || f.fabricType,
      colorway: colours.length === 1 ? colours[0] : f.colorway,
    }));
    setError("");
  }
  function choosePack(v) {
    if (v === NEW_PACK) { onCreatePack?.(form.customerId, selectPack); return; }
    selectPack(v ? patterns.find((p) => p.id === v) || null : null);
  }
  // another customer is picked: a tech pack that belongs to somebody else does not stay chosen
  function chooseCustomer({ id, name }) {
    setForm((f) => {
      const cur = patterns.find((p) => p.id === f.patternId);
      const clash = Boolean(cur?.customerId && id && String(cur.customerId) !== String(id));
      return { ...f, customerId: id, customerName: name, patternId: clash ? "" : f.patternId };
    });
    setError("");
  }

  function selectSample(sampleId) {
    const sample = samples.find((s) => s.id === sampleId);
    setForm((f) => ({
      ...f,
      sampleId: sampleId || "",
      sampleName: sample?.name || "",
      fabricType: f.fabricType || sample?.fabric_used || f.fabricType,
      colorway: f.colorway || sample?.color || f.colorway,
    }));
  }

  function applySuggestion() {
    if (!latestInvoice) return;
    const firstItem = latestInvoice.items?.[0] || {};
    const parsed = parseInvoiceDescription(firstItem.description || "");

    // The invoice carries only the client's typed name. Link the order to the customer
    // of that name when there is one, so it does not come out as "(not linked)" while
    // the same customer sits in the list.
    const customer = customers.find((c) => sameName(c.name, latestInvoice.clientName));

    setForm((f) => ({
      ...f,
      customerId: customer?.id || "",
      customerName: customer?.name || latestInvoice.clientName || "",
      styleName: parsed.styleName,
      fabricType: parsed.fabricType,
      colorway: parsed.colorway,
      quantity: firstItem.qty || "",
      pricePerPcNPR: firstItem.rate || "",
      invoiceRef: latestInvoice.invoiceNumber || "",
      notes: latestInvoice.note || "",
    }));

    if (latestInvoice.clientAddress || latestInvoice.clientPhone || latestInvoice.clientPAN) {
      setIssueInvoice(true);
      setInvFields((f) => ({
        ...f,
        clientAddress: latestInvoice.clientAddress || "",
        clientPhone: latestInvoice.clientPhone || "",
        clientPAN: latestInvoice.clientPAN || "",
        dueDate: latestInvoice.dueDate || dueIn30(todayDate(), today),
        applyVAT: latestInvoice.applyVAT ?? true,
        paymentTerms: latestInvoice.paymentTerms || "Net 30",
      }));
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    // While PACK_REQUIRED is on, a new order is made from a tech pack (an older order that has none may be saved as it is).
    if (PACK_REQUIRED && packLink && !editing && !form.patternId) {
      setError(canCreatePack ? "Pick a tech pack for this order, or choose “Create a new tech pack” in the list and make it first." : "Pick a tech pack for this order. If it has none yet, someone who can edit tech packs has to make it first.");
      return;
    }
    if (packLink && pickedPack && !pickedPack.c.ok) {
      setError(`That tech pack is not finished: it still needs ${missingWords(pickedPack.c)}. Finish it in Inventory first.`);
      return;
    }
    // The picker's `required` select is unmounted while its inline "add new
    // customer" panel is open, so the browser cannot enforce this for us at
    // exactly the moment a half-finished customer is on screen.
    if (!(form.customerName || "").trim()) {
      setError("Pick a customer, or finish adding the new one, before saving the order.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await onSave({ form, issueInvoice, invFields, editing: order });
    if (res?.ok) { onClose(true); return; }
    setError(res?.message || "Failed to save the order. Check your connection and try again.");
    setSaving(false);
  }

  return (
    <Modal
      size="lg"
      className="pr-dlg"
      glass
      title={editing ? `Edit order · ${order.orderId}` : "New production order"}
      onClose={saving ? undefined : () => onClose(false)}
      onSubmit={submit}
      footer={(
        <>
          {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
          <button type="button" className="ghost-button" onClick={() => onClose(false)} disabled={saving}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : issueInvoice ? "Create order + invoice" : "Create order"}
          </button>
        </>
      )}
    >
      {latestInvoice && !dismissed && !editing && (
        <SuggestionBanner invoice={latestInvoice} onApply={applySuggestion} onDismiss={() => setDismissed(true)} />
      )}

      <div className="kof">
        {packLink && (
          <>
            <h3 className="kof-sec">Tech pack</h3>
            <Box
              label={<>Tech pack{PACK_REQUIRED && !editing && <span className="kof-req" aria-hidden="true">*</span>}</>} htmlFor={fid("pack")}
              hint={
                patterns.length === 0
                  ? (PACK_REQUIRED ? "There are no tech packs yet. Make the first one from the list." : "There are no tech packs yet. You can skip this for now.")
                  : editing && !order?.patternId
                    ? "This order was made before tech packs. You can link one."
                    : PACK_REQUIRED
                      ? "Every order starts from a tech pack. Pick the customer's, or make a new one first."
                      : "Optional for now. Pick the customer's tech pack, or make a new one from the list."
              }
            >
              <Select
                id={fid("pack")} label="Tech pack" value={form.patternId} onChange={choosePack} options={packOptions}
                placeholder="Pick the tech pack" searchPlaceholder="Find a tech pack"
              />
            </Box>
            <PackPreview picked={pickedPack} brand={pickedBrand} />
            {pickedPack && (
              <p className="kof-packnote" role={pickedPack.c.ok ? undefined : "status"}>
                {pickedPack.c.ok
                  ? (pickedPack.pack.legacy ? "Old-format tech pack." : "Tech pack ready.")
                  : <>Not finished yet: it still needs {missingWords(pickedPack.c)}.{" "}
                    {canCreatePack && onEditPack && (
                      <><button type="button" className="tpl" onClick={() => onEditPack(pickedPack.row.id, selectPack)}>Finish it</button>{" · "}</>
                    )}</>}{" "}
                <TechPackLink patternId={pickedPack.row.id}>View its sheet</TechPackLink>
              </p>
            )}
          </>
        )}
        <h3 className="kof-sec">Customer &amp; dates</h3>
        <div className="kof-f">
          <label className="kof-l" htmlFor={fid("customer")}>
            Customer<span className="kof-req" aria-hidden="true">*</span>
          </label>
          <CustomerPicker
            id={fid("customer")}
            customers={customers}
            suggestions={billingClients}
            valueId={form.customerId}
            valueName={form.customerName}
            onChange={chooseCustomer}
            onCustomerCreated={onCustomerCreated}
            canCreate={canCreateCustomer}
          />
        </div>
        <DateField label="Order date" w={6} half required
          value={form.date} onChange={(v) => set({ date: v })}
          mode={dateMode} onModeChange={onDateMode} />
        <DateField label="Delivery date" w={6} half
          value={form.deliveryDate} onChange={(v) => set({ deliveryDate: v })}
          mode={dateMode} onModeChange={onDateMode} />

        <h3 className="kof-sec">Garment</h3>
        <Field label="Style / item name" w={6} required>
          <input type="text" value={form.styleName} required placeholder="e.g. Men's Hoodie"
            onChange={(e) => set({ styleName: e.target.value })} />
        </Field>
        <Box label="Sample" w={6} htmlFor={fid("sample")}>
          <Select id={fid("sample")} label="Sample" value={form.sampleId} onChange={selectSample} options={sampleOptions} placeholder="None" searchPlaceholder="Find a sample" />
        </Box>
        <Field label="Fabric type" w={6} half>
          <input type="text" list={fid("fabrics")} value={form.fabricType} placeholder="e.g. Terry Cotton"
            onChange={(e) => set({ fabricType: e.target.value })} />
          <datalist id={fid("fabrics")}>
            {fabrics.map((f) => <option key={f.id} value={f.name} />)}
            {FABRIC_TYPES.map((t) => <option key={t} value={t} />)}
          </datalist>
        </Field>
        <Field label="Colorway" w={6} half>
          <input type="text" value={form.colorway} placeholder="e.g. Black, Navy, Olive"
            onChange={(e) => set({ colorway: e.target.value })} />
        </Field>

        <h3 className="kof-sec">Quantity &amp; price</h3>
        <Field label="Quantity (pcs)" w={6} half required>
          <input type="number" min="1" inputMode="numeric" value={form.quantity} required placeholder="0"
            onChange={(e) => set({ quantity: e.target.value })} />
        </Field>
        <Field label="Price per piece (NPR)" w={6} half>
          <input type="number" min="0" step="any" inputMode="decimal" value={form.pricePerPcNPR} placeholder="0"
            onChange={(e) => set({ pricePerPcNPR: e.target.value })} />
        </Field>

        <h3 className="kof-sec">Assignment &amp; notes</h3>
        <Box label="Assigned to" w={4} htmlFor={fid("who")}>
          <Select id={fid("who")} label="Assigned to" value={form.assignedTo} onChange={(v) => set({ assignedTo: v })} options={peopleOptions} placeholder="Nobody yet" searchPlaceholder="Find a person" />
        </Box>
        <Box label="Initial stage" w={4} htmlFor={fid("stage")}>
          <Select id={fid("stage")} label="Initial stage" value={form.stage} onChange={(v) => set({ stage: v })} options={stageOptions} placeholder="Choose a stage" />
        </Box>
        <Box label="Region" w={4} htmlFor={fid("region")} hint="Which arm of the business this order belongs to.">
          <Select id={fid("region")} label="Region" value={form.region} onChange={(v) => set({ region: v })} options={regionOptions} placeholder="Not set" />
        </Box>
        <Box
          label="Invoice / challan" w={6} htmlFor={fid("doc")}
          hint={
            invoices.length + challans.length === 0
              ? "No invoices or challans yet. Create them in Billing."
              : form.customerId
                ? `Showing ${form.customerName}'s documents.`
                : "Pick a customer above to narrow this to their documents."
          }
        >
          <Select
            id={fid("doc")} label="Invoice or challan"
            value={issueInvoice && !editing ? "" : form.invoiceRef} onChange={(v) => set({ invoiceRef: v })}
            options={docOptions} placeholder="None" searchPlaceholder="Find a document"
            disabled={issueInvoice && !editing}
          />
        </Box>
        <Field label="Notes" w={6}>
          <input type="text" value={form.notes} placeholder="Optional notes"
            onChange={(e) => set({ notes: e.target.value })} />
        </Field>

        {/* ── Issue invoice with this order (new orders only) ── */}
        {!editing && (
          <>
            <h3 className="kof-sec"><Icons.Billing size={13} /> Invoice</h3>
            <Switch
              checked={issueInvoice}
              onChange={setIssueInvoice}
              label="Issue invoice with this order"
              hint="Optional. Creates the invoice at the same time as the order."
            />
          </>
        )}

        {issueInvoice && !editing && (
          <div className="kof kof-inv">
            <Field label="Client address">
              <input type="text" autoComplete="off" placeholder="Street, City, Country"
                value={invFields.clientAddress}
                onChange={(e) => setInvFields((f) => ({ ...f, clientAddress: e.target.value }))} />
            </Field>
            <Field label="Client phone" w={6} half>
              <input type="tel" autoComplete="off" placeholder="+977 ..."
                value={invFields.clientPhone}
                onChange={(e) => setInvFields((f) => ({ ...f, clientPhone: e.target.value }))} />
            </Field>
            <Field label="PAN / tax no." w={6} half>
              <input type="text" autoComplete="off" placeholder="VAT / PAN number"
                value={invFields.clientPAN}
                onChange={(e) => setInvFields((f) => ({ ...f, clientPAN: e.target.value }))} />
            </Field>
            <DateField label="Due date" w={6} half
              value={invFields.dueDate} onChange={(v) => setInvFields((f) => ({ ...f, dueDate: v }))}
              mode={dateMode} onModeChange={onDateMode} />
            <Box label="Payment terms" w={3} half htmlFor={fid("terms")}>
              <Select id={fid("terms")} label="Payment terms" value={invFields.paymentTerms} onChange={(v) => setInvFields((f) => ({ ...f, paymentTerms: v }))} options={PAYMENT_TERMS} />
            </Box>
            <Box label="Payment type" w={3} half htmlFor={fid("ptype")}>
              <Select id={fid("ptype")} label="Payment type" value={invFields.paymentType} onChange={(v) => setInvFields((f) => ({ ...f, paymentType: v }))} options={PAYMENT_TYPES} />
            </Box>
            <div className="kof-vat">
              <Switch
                checked={invFields.applyVAT}
                onChange={(v) => setInvFields((f) => ({ ...f, applyVAT: v }))}
                label="Apply VAT (13%)"
              />
              <InvoiceTotals quantity={form.quantity} price={form.pricePerPcNPR} applyVAT={invFields.applyVAT} />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
