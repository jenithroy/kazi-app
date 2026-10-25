/**
 * The first section: the header block of the printed sheet. Who it is for, what it is called, its reference and collection, the
 * date, the category, the colour and the description in the left pane; the market, the sizes, the size the list is read for and the
 * extra header lines (Fit, Length...) in the right one.
 */
import { useId, useMemo, useState } from "react";
import { Field, Seg } from "../EditCard";
import Select from "../Select";
import Suggest from "../Suggest";
import DatePicker from "../DatePicker";
import CustomerPicker from "../CustomerPicker";
import { Icons, cn } from "../ui";
import { CATEGORIES, completeness, HEADER_LINE_HINTS, MARKETS, missingWords, seasonHints, SIZE_ORDER, sortSizes } from "../../lib/techpack";
import { droppedSizes } from "../../lib/techpackWrites";
import { cleanSize, leftOutRows, toggleSize } from "./editorModel";
import { Flow, LeftOut, useEditor } from "./editorContext";
import { focusBack } from "./Pictures";

const PRODUCT_TYPES = ["T-shirt", "Hoodie", "Jacket", "Trousers", "Shorts", "Dress"].map((label) => ({ label }));

/* ── Sizes ─────────────────────────────────────────────────────── */

function Sizes({ uid }) {
  const { pack, update, canEdit } = useEditor();
  const [extra, setExtra] = useState("");
  const [msg, setMsg] = useState("");
  const all = sortSizes([...SIZE_ORDER, ...pack.sizes]);

  function addExtra() {
    const size = cleanSize(extra);
    if (!size) return;
    if (pack.sizes.includes(size)) { setMsg(`${size} is already on the list.`); return; }
    update((p) => toggleSize(p, size));
    setExtra("");
    setMsg("");
  }

  return (
    <div className="tpe-sizes">
      <div className="tpe-chips" role="group" aria-labelledby={`${uid}-sizes`}>
        {all.map((s) => {
          const on = pack.sizes.includes(s);
          const last = on && pack.sizes.length === 1;
          return (
            <button
              key={s} type="button" className={cn("tpe-chip", on && "is-on")} aria-pressed={on}
              disabled={!canEdit || last} title={last ? "At least one size stays on" : undefined}
              onClick={() => update((p) => toggleSize(p, s))}
            >
              {s}
            </button>
          );
        })}
      </div>
      {canEdit && (
        <div className="tpe-add">
          <input
            type="text" value={extra} maxLength={8} placeholder="Another size, like 28" aria-label="Add another size" autoComplete="off" spellCheck={false}
            onChange={(e) => { setExtra(e.target.value); setMsg(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) { e.preventDefault(); addExtra(); } }}
          />
          <button type="button" className="ghost-button" onClick={addExtra} disabled={!extra.trim()}>Add</button>
        </div>
      )}
      {msg ? <small className="tpe-msg" role="status">{msg}</small> : null}
    </div>
  );
}

/* ── Header lines ──────────────────────────────────────────────── */

function HeaderLines({ uid }) {
  const { pack, update, canEdit } = useEditor();
  const lines = pack.headerLines;
  const used = new Set(lines.map((l) => l.label.trim().toLowerCase()));
  const hints = HEADER_LINE_HINTS.filter((h) => !used.has(h.toLowerCase())).map((label) => ({ label }));
  const set = (i, patch) => update((p) => ({ ...p, headerLines: p.headerLines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }));
  const add = () => {
    update((p) => ({ ...p, headerLines: [...p.headerLines, { label: "", value: "" }] }));
    focusBack(document.getElementById(`${uid}-hl`), ".tpe-hl:nth-last-child(2) input");
  };
  const remove = (i) => {
    update((p) => ({ ...p, headerLines: p.headerLines.filter((_, k) => k !== i) }));
    focusBack(document.getElementById(`${uid}-hl`), ".tpe-hl-add");
  };

  return (
    <div id={`${uid}-hl`} className="tpe-hls" role="group" aria-labelledby={`${uid}-hl-label`}>
      {lines.map((l, i) => (
        <div className="tpe-hl" key={i}>
          <Suggest value={l.label} onChange={(v) => set(i, { label: v })} options={hints} placeholder="Fit" label={`Header line ${i + 1}: label`} disabled={!canEdit} passEnter />
          <input type="text" value={l.value} maxLength={80} placeholder="Fitted" aria-label={`Header line ${i + 1}: ${l.label || "value"}`} disabled={!canEdit} autoComplete="off" onChange={(e) => set(i, { value: e.target.value })} />
          {canEdit && (
            <button type="button" className="tpe-iconbtn" onClick={() => remove(i)} aria-label={`Remove header line ${i + 1}${l.label ? `, ${l.label}` : ""}`} title="Remove">
              <Icons.X size={15} sw={2} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <button type="button" className="ghost-button tpe-hl-add" onClick={add}>
          <Icons.Plus size={14} sw={2} aria-hidden="true" /> Add a line
        </button>
      )}
    </div>
  );
}

/* ── The section ───────────────────────────────────────────────── */

export function SheetMain() {
  const {
    pack, set, update, canEdit, customers, customersState, reloadLists, canCreateCustomer, addCustomer, typedCustomer, setTypedCustomer, today,
  } = useEditor();
  const uid = useId();
  const ro = !canEdit;
  const type = (key) => (e) => set({ [key]: e.target.value });
  const seasons = useMemo(() => seasonHints(today).map((label) => ({ label })), [today]);
  const nameOf = (p) => (customers.find((c) => c.id === p.customerId)?.name || (p.customerId ? "" : typedCustomer));

  // Picking a customer fills the Brand with their name while the Brand is empty or still the previous customer's name.
  function pickCustomer({ id, name }) {
    update((p) => {
      const was = nameOf(p).trim();
      const follows = !p.brand.trim() || (was && p.brand.trim() === was);
      return { ...p, customerId: id || "", brand: follows ? name || "" : p.brand };
    });
    setTypedCustomer(id ? "" : name || "");
  }

  const after = pack.legacy ? completeness({ ...pack, legacy: false }) : null;

  return (
    <Flow>
      {pack.legacy && (
        <p className="ec-note ec-wide tpe-legacy">
          <b>Made on the old sheet.</b> This tech pack was made before the technical sheet existed. Fill in the sections; it moves onto the sheet once it has everything.
          {after && !after.ok ? ` It still needs ${missingWords(after)}. Until then it stays an old-format tech pack and can still be used on an order.` : " Saving it now moves it onto the sheet."}
        </p>
      )}
      {!canEdit && <p className="ec-note ec-wide"><b>View only.</b> Changing tech packs is for people who can edit Inventory.</p>}

      <Field label="Customer" htmlFor={`${uid}-customer`} hint="Who it is for. Their page lists it.">
        <CustomerPicker
          glass id={`${uid}-customer`} customers={customers} valueId={pack.customerId} valueName={typedCustomer} required={false}
          canCreate={canCreateCustomer} disabled={ro || customersState === "loading"} onChange={pickCustomer} onCustomerCreated={addCustomer}
        />
        {customersState === "error" && (
          <small className="tpe-msg" role="alert">The customer list could not be read. <button type="button" className="tpe-link" onClick={reloadLists}>Try again</button></small>
        )}
        {customersState === "loading" && <small className="ec-hint" role="status">Reading the customer list…</small>}
        {!pack.customerId && typedCustomer ? <small className="ec-hint">“{typedCustomer}” is not a customer yet. Ask someone who can add customers to add them, then pick them here.</small> : null}
      </Field>

      <Field label="Brand" htmlFor={`${uid}-brand`} hint="The label on the garment. Printed at the top of the sheet.">
        <input id={`${uid}-brand`} value={pack.brand} onChange={type("brand")} maxLength={80} placeholder="Cavalls Studio" disabled={ro} autoComplete="off" />
      </Field>
      <Field label="Name" htmlFor={`${uid}-name`} wide hint="Needed to save.">
        <input id={`${uid}-name`} value={pack.name} onChange={type("name")} maxLength={120} placeholder="Military cropped jacket" disabled={ro} aria-required="true" autoComplete="off" />
      </Field>

      <Field label="Reference" htmlFor={`${uid}-ref`} hint="Their reference or ours.">
        <input id={`${uid}-ref`} value={pack.styleNo} onChange={type("styleNo")} maxLength={40} placeholder="#KAZI001" disabled={ro} autoComplete="off" spellCheck={false} />
      </Field>

      <Field label="Collection" htmlFor={`${uid}-season`}>
        <Suggest id={`${uid}-season`} value={pack.season} onChange={(v) => set({ season: v })} options={seasons} placeholder="SS27" disabled={ro} passEnter />
      </Field>
      <Field label="Date" htmlFor={`${uid}-date`}>
        <DatePicker id={`${uid}-date`} label="Date" value={pack.specDate} onChange={(v) => set({ specDate: v })} disabled={ro} />
      </Field>

      <Field label="Category" htmlFor={`${uid}-category`}>
        <Select id={`${uid}-category`} label="Category" value={pack.category} onChange={(v) => set({ category: v })} options={CATEGORIES.map((c) => ({ value: c, label: c }))} placeholder="Choose a category" disabled={ro} />
      </Field>
      <Field label="Product type" htmlFor={`${uid}-ptype`}>
        <Suggest id={`${uid}-ptype`} value={pack.productType} onChange={(v) => set({ productType: v })} options={PRODUCT_TYPES} placeholder="Jacket" disabled={ro} passEnter />
      </Field>

      <Field label="Colour(s)" htmlFor={`${uid}-colour`} hint="Separate several with commas.">
        <input id={`${uid}-colour`} value={pack.colour} onChange={type("colour")} maxLength={120} placeholder="Black" disabled={ro} autoComplete="off" />
      </Field>
      <Field label="Designer" htmlFor={`${uid}-designer`} hint="Optional.">
        <input id={`${uid}-designer`} value={pack.designerName} onChange={type("designerName")} maxLength={80} disabled={ro} autoComplete="off" />
      </Field>

      <Field label="Market" labelId={`${uid}-market`} hint="Which side of the business it is for.">
        <Seg label="Market" value={pack.market} onChange={(v) => set({ market: v })} options={MARKETS.map((m) => [m, m])} disabled={ro} />
      </Field>
    </Flow>
  );
}

export function SheetSide() {
  const { pack, set, canEdit, keepSizes } = useEditor();
  const uid = useId();
  const dropped = droppedSizes(pack, keepSizes);
  return (
    <Flow>
      <Field label="Sizes" labelId={`${uid}-sizes`} wide hint="Press a size to put it on or off. At least one stays on.">
        <Sizes uid={uid} />
        {dropped.length > 0 && (
          <p className="ec-note tpe-warn" role="status">
            <b>Numbers for {dropped.join(", ")} will be dropped when you press Save,</b> because {dropped.length === 1 ? "that size is" : "those sizes are"} off the list. Put {dropped.length === 1 ? "it" : "them"} back to keep them.
          </p>
        )}
      </Field>

      <Field label="Reference size" htmlFor={`${uid}-refsize`} wide hint="The size the measurement list on the sheet is read for.">
        <Select
          id={`${uid}-refsize`} label="Reference size" value={pack.refSize} onChange={(v) => set({ refSize: v })} disabled={!canEdit}
          options={pack.sizes.map((s) => ({ value: s, label: s }))} placeholder="Choose the sizes first"
        />
      </Field>

      <Field label="Header lines" labelId={`${uid}-hl-label`} wide hint="Printed in the header block, like Fit: Fitted.">
        <HeaderLines uid={uid} />
        <LeftOut noun="header line" places={leftOutRows(pack).headerLines} rule="A value needs a label to sit under, like Fit." />
      </Field>

      <Field label="Description" htmlFor={`${uid}-desc`} wide hint="One or two lines about the garment.">
        <textarea id={`${uid}-desc`} rows={2} data-flow value={pack.description} onChange={(e) => set({ description: e.target.value })} maxLength={300} placeholder="Relaxed long-sleeve top in a very fine fabric, with a front graphic." disabled={!canEdit} />
      </Field>
    </Flow>
  );
}
