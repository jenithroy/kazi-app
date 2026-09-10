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
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { insertRow } from "../lib/db";
import { useRegion } from "../context/RegionContext";

const NEW = "__new__";
const UNLINKED = "__unlinked__";

export default function CustomerPicker({
  customers,
  valueId,
  valueName,
  onChange,
  onCustomerCreated,
  canCreate = true,
  required = true,
  disabled = false,
  autoFocus = false,
}) {
  const { region } = useRegion();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", contactPerson: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
    if (!v) { onChange({ id: "", name: "" }); return; }
    const picked = sorted.find(c => c.id === v);
    if (picked) onChange({ id: picked.id, name: picked.name });
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

  if (creating) {
    return (
      <div className="kcp-new">
        <input
          ref={nameRef} type="text" value={draft.name} placeholder="Customer name *"
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          onKeyDown={e => {
            // The picker lives inside the order <form>; Enter here must create
            // the customer, not submit a half-filled order.
            if (e.key === "Enter") { e.preventDefault(); createCustomer(); }
            if (e.key === "Escape") { e.preventDefault(); closeDraft(); }
          }}
        />
        <div className="kcp-new-row">
          <input type="text" value={draft.contactPerson} placeholder="Contact person"
            onChange={e => setDraft(d => ({ ...d, contactPerson: e.target.value }))} />
          <input type="email" value={draft.email} placeholder="Email"
            onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
          <input type="text" value={draft.phone} placeholder="Phone"
            onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} />
        </div>
        {clash && (
          <p className="kcp-note">
            <strong>{clash.name}</strong> already exists — saving will use it instead of adding a second.
          </p>
        )}
        {error && <p className="kcp-err">{error}</p>}
        <div className="kcp-new-actions">
          <button type="button" className="ghost-button" onClick={closeDraft} disabled={saving}>Cancel</button>
          <button type="button" className="primary-button" onClick={createCustomer} disabled={saving || !draft.name.trim()}>
            {saving ? "Saving…" : clash ? "Use existing" : "Add customer"}
          </button>
        </div>
        <p className="kcp-hint">Saved to Customers — you can fill in the rest there later.</p>
      </div>
    );
  }

  return (
    <select
      value={valueId || (unlinked ? UNLINKED : "")}
      onChange={handleSelect}
      required={required}
      disabled={disabled}
      autoFocus={autoFocus}
    >
      <option value="">Select customer…</option>
      {unlinked && <option value={UNLINKED}>{valueName} (not linked)</option>}
      {sorted.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      {/* Creating a customer writes to the customers table, which is gated
          separately from production — offering it to someone the database will
          refuse would just be a confusing failure. They can still pick. */}
      {canCreate && <option value={NEW}>➕ Add new customer…</option>}
    </select>
  );
}
