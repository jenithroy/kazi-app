/**
 * CustomerPicker — choose an existing customer, or create one inline.
 *
 * Orders used to carry a free-typed `customerName` and nothing else, so
 * "RetailCorp UK", "Retailcorp uk" and "Retail Corp" were three different
 * buyers as far as any report was concerned, and the Customers page never
 * learned about any of them. This picks from `customers` instead and writes
 * `customerId` alongside the name, which is what makes per-customer revenue
 * and margin answerable at all.
 *
 * The name is still written to the order. It is the denormalised display copy
 * every card, invoice and PDF already reads, and keeping it means nothing
 * downstream had to change to adopt this.
 *
 * Orders created before this existed have a name and no id. Those stay
 * selectable and keep their name — see the "unlinked" option below — so that
 * editing an old order's delivery date cannot silently blank its customer.
 *
 * `suggestions` are clients who exist only as a typed name on a Billing document
 * (see utils/billingClients.js). They are listed after the real customers, and
 * picking one files them under Customers on the spot so the order links to a real
 * row — the same thing "Add new customer" does, with their details already filled
 * in. Someone who may not add customers still gets the name on the order, unlinked.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { insertRow } from "../lib/db";
import { useRegion } from "../context/RegionContext";

const NEW = "__new__";
const UNLINKED = "__unlinked__";
const FROM_BILLING = "__billing__:";

export default function CustomerPicker({
  customers,
  suggestions = [],         // [{ key, name, phone, address }] — see utils/billingClients.js
  valueId,
  valueName,
  onChange,
  onCustomerCreated,
  canCreate = true,
  required = true,
  disabled = false,
  autoFocus = false,
  id,                       // lets the caller's <label htmlFor> name whichever control is showing
  className,                // e.g. "kfin-select" — Production relies on a plain <select> picked up
                             // by its form's descendant selector, so this stays optional.
}) {
  const { region } = useRegion();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", contactPerson: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);     // filing a Billing client under Customers
  const [pickError, setPickError] = useState("");
  const nameRef = useRef(null);

  useEffect(() => { if (creating) nameRef.current?.focus(); }, [creating]);

  const sorted = useMemo(
    () => [...customers].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [customers],
  );

  // An order whose saved name matches no row we can see. Either it predates
  // the picker, or it belongs to the other region and is filtered out of
  // `customers` — both need the name to survive an edit.
  const unlinked = !valueId && (valueName || "").trim();

  // Typing a name that already exists is the one way to still create a
  // duplicate, so say so before the button does it.
  const clash = useMemo(() => {
    const n = draft.name.trim().toLowerCase();
    if (!n) return null;
    return sorted.find(c => (c.name || "").trim().toLowerCase() === n) || null;
  }, [draft.name, sorted]);

  function handleSelect(e) {
    const v = e.target.value;
    if (v === NEW) { setDraft(d => ({ ...d, name: "" })); setError(""); setCreating(true); return; }
    if (v === UNLINKED) return;              // already the current value
    setPickError("");
    if (!v) { onChange({ id: "", name: "" }); return; }
    if (v.startsWith(FROM_BILLING)) {
      const client = suggestions.find(s => FROM_BILLING + s.key === v);
      if (client) pickBillingClient(client);
      return;
    }
    const picked = sorted.find(c => c.id === v);
    if (picked) onChange({ id: picked.id, name: picked.name });
  }

  async function pickBillingClient(client) {
    // No right to add customers: the order still takes the name, unlinked, exactly
    // as an order from before this picker existed does.
    if (!canCreate) { onChange({ id: "", name: client.name }); return; }
    setPicking(true);
    try {
      const created = await insertRow("customers", {
        name: client.name,
        contactPerson: "", email: "",
        phone: client.phone,
        city: "", address: client.address, notes: "",
        region,
      });
      onCustomerCreated?.(created);
      onChange({ id: created.id, name: created.name });
    } catch (err) {
      console.error("Failed to add a Billing client to Customers:", err);
      setPickError(`Could not add ${client.name} to Customers. Check your connection and try again.`);
    } finally {
      setPicking(false);
    }
  }

  async function createCustomer() {
    const name = draft.name.trim();
    if (!name) return;
    if (clash) { onChange({ id: clash.id, name: clash.name }); closeDraft(); return; }
    setSaving(true);
    setError("");
    try {
      // Filed on the side being worked in, matching how the Customers page
      // treats a new client.
      const created = await insertRow("customers", {
        name,
        contactPerson: draft.contactPerson.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        city: "", address: "", notes: "",
        region,
      });
      onCustomerCreated?.(created);
      onChange({ id: created.id, name: created.name });
      closeDraft();
    } catch (err) {
      console.error("Failed to create customer:", err);
      setError("Could not save — you may not have permission to add customers.");
    } finally {
      setSaving(false);
    }
  }

  function closeDraft() {
    setCreating(false);
    setDraft({ name: "", contactPerson: "", email: "", phone: "" });
    setError("");
  }

  // The picker lives inside the order <form>, so on any of its four fields Enter
  // must create the customer rather than submit a half-filled order, and Escape
  // must back out of this panel rather than close the whole dialog.
  function draftKeys(e) {
    if (e.key === "Enter") { e.preventDefault(); createCustomer(); }
    if (e.key === "Escape") { e.preventDefault(); closeDraft(); }
  }

  if (creating) {
    // autoComplete is off throughout: these describe the customer, and a browser
    // that fills them from the signed-in person's own saved details would put
    // the wrong name, email and phone on the customer.
    return (
      <div className="kcp-new" role="group" aria-label="New customer">
        <p className="kcp-new-title">New customer</p>
        <input
          ref={nameRef} id={id} type="text" value={draft.name} placeholder="Customer name *"
          aria-label="Customer name" autoComplete="off"
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          onKeyDown={draftKeys}
        />
        <div className="kcp-new-row">
          <input type="text" value={draft.contactPerson} placeholder="Contact person"
            aria-label="Contact person" autoComplete="off"
            onChange={e => setDraft(d => ({ ...d, contactPerson: e.target.value }))}
            onKeyDown={draftKeys} />
          <input type="email" value={draft.email} placeholder="Email"
            aria-label="Email" autoComplete="off"
            onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
            onKeyDown={draftKeys} />
          <input type="tel" value={draft.phone} placeholder="Phone"
            aria-label="Phone" autoComplete="off"
            onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
            onKeyDown={draftKeys} />
        </div>
        {clash && (
          <p className="kcp-note">
            <strong>{clash.name}</strong> already exists — saving will use it instead of adding a second.
          </p>
        )}
        {error && <p className="kcp-err" role="alert">{error}</p>}
        <div className="kcp-new-ft">
          <p className="kcp-hint">Saved to Customers — you can fill in the rest there later.</p>
          <div className="kcp-new-actions">
            <button type="button" className="ghost-button" onClick={closeDraft} disabled={saving}>Cancel</button>
            <button type="button" className="primary-button" onClick={createCustomer} disabled={saving || !draft.name.trim()}>
              {saving ? "Saving…" : clash ? "Use existing" : "Add customer"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <select
        id={id}
        className={className}
        aria-label={id ? undefined : "Customer"}
        value={valueId || (unlinked ? UNLINKED : "")}
        onChange={handleSelect}
        required={required}
        disabled={disabled || picking}
        autoFocus={autoFocus}
      >
        <option value="">Select customer…</option>
        {unlinked && <option value={UNLINKED}>{valueName} (not linked)</option>}
        {sorted.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        {suggestions.length > 0 && (
          <optgroup label="In Billing, not yet in Customers">
            {suggestions.map(s => <option key={s.key} value={FROM_BILLING + s.key}>{s.name}</option>)}
          </optgroup>
        )}
        {/* Creating a customer writes to the customers table, which is gated
            separately from production — offering it to someone the database will
            refuse would just be a confusing failure. They can still pick. */}
        {canCreate && <option value={NEW}>+ Add new customer…</option>}
      </select>
      {picking && <p className="kcp-status" role="status">Adding to Customers…</p>}
      {pickError && <p className="kcp-err" role="alert">{pickError}</p>}
    </>
  );
}
