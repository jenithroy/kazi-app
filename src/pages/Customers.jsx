/**
 * Customers — who owes what, who pays, and who is actually worth having.
 *
 * This page used to be a standalone address book: seven text fields, filled in
 * by hand, connected to nothing. Meanwhile every real customer was being typed
 * straight onto an order in Production, so the list stayed near-empty while the
 * money piled up somewhere the page could not see.
 *
 * Now it reads the whole chain — customer → orders → invoices → payments — and
 * answers the question that was actually being asked: which customers bring in
 * good money, which do not, and what is still owed.
 *
 * Two honesty rules run through the whole file, because the alternative is a
 * page that looks authoritative and is wrong:
 *
 *   - Margin is only shown where costs were actually entered. `order_costs` is
 *     filled in by hand in Finance → Order P&L, and where it is empty the
 *     margin is unknowable, not 100%. Those customers say "no cost data"
 *     rather than showing a fictional profit.
 *   - Payments migrated from the old overwrite-in-place `amountPaid` have no
 *     real date. They are flagged `isOpening` and rendered as "date unknown",
 *     never folded into how-fast-do-they-pay averages.
 */
import { useEffect, useMemo, useState } from "react";
import { deleteRow, fetchAll, insertRow, updateRow } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { useRegion } from "../context/RegionContext";
import { useCurrency } from "../context/CurrencyContext";
import { RegionSwitch, RegionSelect } from "../components/RegionSwitch";
import { countUntagged, filterByRegion } from "../utils/region";
import { sectionCanEdit } from "../utils/permissions";
import { Icons, KPI, Progress, SegBar, Pill } from "../components/ui";
import { GBP_RATE } from "../constants";

const EMPTY = {
  name: "", city: "", address: "",
  contactPerson: "", email: "", phone: "", notes: "", region: "",
};

/* Invoice money is stored in the invoice's own currency — total_npr holds
   pounds on a GBP invoice. Everything on this page is compared across
   customers, so it all gets normalised to rupees first. */
const toNPR = (amount, currency) =>
  Number(amount || 0) * (currency === "GBP" ? GBP_RATE : 1);

const DAY = 86400000;
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY);

function fmtDay(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function hueOf(name) {
  let h = 0;
  for (const c of name || "") h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function initialsOf(name) {
  return (name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

/* ── Per-customer roll-up ────────────────────────────────────────────────
   One pass over each collection, bucketed by customer id, rather than a
   filter per customer per collection — this runs on every render that
   touches the region switch or the search box. */
function rollUp({ customers, orders, invoices, payments, orderCosts }) {
  const byId = new Map(customers.map(c => [c.id, {
    ...c,
    orders: [], invoices: [], payments: [],
    units: 0, orderValueNPR: 0,
    invoicedNPR: 0, collectedNPR: 0, outstandingNPR: 0, overdueNPR: 0,
    costNPR: 0, costedRevenueNPR: 0, hasCosts: false,
    lastPaidOn: null, payDays: [],
  }]));

  for (const o of orders) {
    const c = byId.get(o.customer_id);
    if (!c) continue;
    c.orders.push(o);
    c.units += Number(o.quantity || 0);
    c.orderValueNPR += Number(o.totalValueNPR || 0);

    // Costs are keyed by the human order ref (ORD-051), not the uuid — see
    // migration 0025.
    const cost = orderCosts[o.orderId] || orderCosts[o.id];
    if (cost) {
      const total = Number(cost.material || 0) + Number(cost.labour || 0)
                  + Number(cost.overhead || 0) + Number(cost.shipping || 0);
      if (total > 0) {
        c.hasCosts = true;
        c.costNPR += total;
        c.costedRevenueNPR += Number(o.totalValueNPR || 0);
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const i of invoices) {
    const c = byId.get(i.customerId);
    if (!c) continue;
    c.invoices.push(i);
    // A cancelled invoice is not revenue and not a debt.
    if (i.status === "Cancelled") continue;
    const total = toNPR(i.totalNPR, i.currency);
    const paid  = toNPR(i.amountPaid, i.currency);
    c.invoicedNPR += total;
    const owed = Math.max(0, total - paid);
    c.outstandingNPR += owed;
    if (owed > 0.5 && i.dueDate && i.dueDate < today) c.overdueNPR += owed;
  }

  const invById = new Map(invoices.map(i => [i.id, i]));

  for (const p of payments) {
    const c = byId.get(p.customerId);
    if (!c) continue;
    c.payments.push(p);
    c.collectedNPR += Number(p.amountNPR || 0);
    if (p.isOpening) continue;               // no real date to learn from
    if (!c.lastPaidOn || p.paidOn > c.lastPaidOn) c.lastPaidOn = p.paidOn;
    const inv = invById.get(p.invoiceId);
    if (inv?.date && p.paidOn >= inv.date) c.payDays.push(daysBetween(inv.date, p.paidOn));
  }

  return [...byId.values()].map(c => {
    c.payments.sort((a, b) => (b.paidOn || "").localeCompare(a.paidOn || ""));
    c.invoices.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    c.orders.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    c.marginNPR = c.hasCosts ? c.costedRevenueNPR - c.costNPR : null;
    c.marginPct = c.hasCosts && c.costedRevenueNPR > 0
      ? (c.marginNPR / c.costedRevenueNPR) * 100 : null;
    c.collectedPct = c.invoicedNPR > 0
      ? Math.min(100, (c.collectedNPR / c.invoicedNPR) * 100) : 0;
    c.avgDaysToPay = c.payDays.length
      ? Math.round(c.payDays.reduce((s, d) => s + d, 0) / c.payDays.length) : null;
    c.isActive = c.orders.length > 0 || c.invoices.length > 0;
    return c;
  });
}

/* ── Customer add / edit form ─────────────────────────────────────────── */
const inp = {
  border: "1px solid var(--line-strong)", borderRadius: 7, padding: "7px 10px",
  fontSize: 13, fontFamily: "var(--font)", outline: "none", width: "100%",
  background: "var(--bg)",
};
const lbl = {
  display: "flex", flexDirection: "column", gap: 4,
  fontSize: 12, fontWeight: 600, color: "var(--ink-3)",
};

function CustomerForm({ initial, onSave, onCancel }) {
  const { region } = useRegion();
  // A new client is filed where you are standing; an existing one keeps
  // whatever it was saved as, including "not set".
  const [form, setForm] = useState(initial || { ...EMPTY, region });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="krsp-2" style={{ gap: 10 }}>
        <label style={lbl}>Customer name *
          <input style={inp} value={form.name} onChange={set("name")} placeholder="e.g. Next plc" autoFocus /></label>
        <label style={lbl}>City
          <input style={inp} value={form.city} onChange={set("city")} placeholder="London" /></label>
        <label style={lbl}>Contact person
          <input style={inp} value={form.contactPerson} onChange={set("contactPerson")} placeholder="Jane Smith" /></label>
        <label style={lbl}>Email
          <input style={inp} type="email" value={form.email} onChange={set("email")} placeholder="jane@example.com" /></label>
        <label style={lbl}>Phone
          <input style={inp} value={form.phone} onChange={set("phone")} placeholder="+44 20 7946 0958" /></label>
        <label style={lbl}>Region
          <RegionSelect style={inp} value={form.region} onChange={v => setForm(f => ({ ...f, region: v }))} /></label>
      </div>
      <label style={lbl}>Address
        <input style={inp} value={form.address} onChange={set("address")} placeholder="123 High Street, London, W1A 1AA" /></label>
      <label style={lbl}>Notes
        <textarea style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} rows={2} value={form.notes} onChange={set("notes")} placeholder="Any additional notes…" /></label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
        <button className="ghost-button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" onClick={() => form.name.trim() && onSave(form)}
          style={{ opacity: form.name.trim() ? 1 : .5 }}>Save customer</button>
      </div>
    </div>
  );
}

/* ── Merge ───────────────────────────────────────────────────────────────
   The backfill created one customer per distinct spelling, because guessing
   that "F.L.Y Clothing" and "FLY CLOTHING" are the same buyer is not the
   database's call to make. This is how a human makes it. */
function MergeDialog({ source, customers, onCancel, onMerge }) {
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const options = customers.filter(c => c.id !== source.id)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const target = options.find(c => c.id === targetId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)", lineHeight: 1.6 }}>
        Move every order, invoice and payment from <strong>{source.name}</strong> onto
        another customer, then delete <strong>{source.name}</strong>. Use this for
        duplicates — the same buyer typed two different ways.
      </p>
      <label style={lbl}>Merge into
        <select style={inp} value={targetId} onChange={e => setTargetId(e.target.value)}>
          <option value="">Select the customer to keep…</option>
          {options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {target && (
        <div style={{ fontSize: 12, color: "var(--ink-3)", background: "var(--bg-3)", padding: "10px 12px", borderRadius: 8, lineHeight: 1.6 }}>
          {source.orders.length} order{source.orders.length !== 1 ? "s" : ""},{" "}
          {source.invoices.length} invoice{source.invoices.length !== 1 ? "s" : ""} and{" "}
          {source.payments.length} payment{source.payments.length !== 1 ? "s" : ""} move
          to <strong>{target.name}</strong>. This cannot be undone.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="ghost-button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="primary-button" disabled={!targetId || busy}
          style={{ opacity: targetId && !busy ? 1 : .5 }}
          onClick={async () => { setBusy(true); await onMerge(source, targetId); setBusy(false); }}>
          {busy ? "Merging…" : "Merge"}
        </button>
      </div>
    </div>
  );
}

/* ── Expanded detail: the history behind one customer's numbers ───────── */
function CustomerDetail({ c, fmt }) {
  const cell = { padding: "7px 10px", fontSize: 12.5 };
  const head = { ...cell, fontSize: 10.5, fontWeight: 700, color: "var(--ink-4)",
    textTransform: "uppercase", letterSpacing: ".05em" };

  return (
    <div className="kcust-detail">
      <div className="kcust-detail-grid">

        {/* Payments — the whole reason this rebuild happened */}
        <section>
          <h4 className="kcust-h4">Payments received</h4>
          {c.payments.length === 0 ? (
            <p className="kcust-none">Nothing received yet.</p>
          ) : (
            <div className="kcust-mini">
              {c.payments.map(p => (
                <div key={p.id} className="kcust-mini-row">
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {p.isOpening
                        ? <span style={{ color: "var(--ink-4)" }}>Date not recorded</span>
                        : fmtDay(p.paidOn)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
                      {p.invoiceNumber || "—"}
                      {p.method && !p.isOpening ? ` · ${p.method}` : ""}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </div>
                  </div>
                  <strong className="mono">{fmt(Number(p.amountNPR || 0))}</strong>
                </div>
              ))}
            </div>
          )}
          {c.payments.some(p => p.isOpening) && (
            <p className="kcust-note">
              Payments marked “date not recorded” were carried over from before
              payment history was kept. Their amounts are right; their dates were
              never stored.
            </p>
          )}
        </section>

        {/* Invoices */}
        <section>
          <h4 className="kcust-h4">Invoices</h4>
          {c.invoices.length === 0 ? (
            <p className="kcust-none">No invoices raised.</p>
          ) : (
            <table className="kcust-tbl-mini">
              <thead><tr>
                <th style={head}>Invoice</th><th style={head}>Date</th>
                <th style={{ ...head, textAlign: "right" }}>Total</th>
                <th style={{ ...head, textAlign: "right" }}>Owed</th>
                <th style={head}>Status</th>
              </tr></thead>
              <tbody>
                {c.invoices.map(i => {
                  const total = toNPR(i.totalNPR, i.currency);
                  const owed  = Math.max(0, total - toNPR(i.amountPaid, i.currency));
                  return (
                    <tr key={i.id}>
                      <td style={cell}>{i.invoiceNumber || "—"}</td>
                      <td style={cell}>{fmtDay(i.date)}</td>
                      <td style={{ ...cell, textAlign: "right" }} className="mono">{fmt(total)}</td>
                      <td style={{ ...cell, textAlign: "right", color: owed > 0.5 ? "var(--terra)" : "var(--ink-5)" }} className="mono">
                        {owed > 0.5 ? fmt(owed) : "—"}
                      </td>
                      <td style={cell}>
                        <Pill tone={i.status === "Paid" ? "mint" : i.status === "Cancelled" ? "neutral" : "terra"}>
                          {i.status || "—"}
                        </Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Orders */}
        <section>
          <h4 className="kcust-h4">Orders</h4>
          {c.orders.length === 0 ? (
            <p className="kcust-none">No orders yet.</p>
          ) : (
            <table className="kcust-tbl-mini">
              <thead><tr>
                <th style={head}>Order</th><th style={head}>Style</th>
                <th style={{ ...head, textAlign: "right" }}>Qty</th>
                <th style={{ ...head, textAlign: "right" }}>Value</th>
                <th style={head}>Stage</th>
              </tr></thead>
              <tbody>
                {c.orders.map(o => (
                  <tr key={o.id}>
                    <td style={cell}>{o.orderId || "—"}</td>
                    <td style={cell}>{o.styleName || "—"}</td>
                    <td style={{ ...cell, textAlign: "right" }} className="mono">{Number(o.quantity || 0).toLocaleString()}</td>
                    <td style={{ ...cell, textAlign: "right" }} className="mono">{fmt(Number(o.totalValueNPR || 0))}</td>
                    <td style={cell}>{o.stage || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!c.hasCosts && c.orders.length > 0 && (
            <p className="kcust-note">
              No costs recorded against these orders, so profit cannot be worked
              out for this customer. Costs are entered in Finance → Order P&amp;L.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/* ── One row in the list ─────────────────────────────────────────────── */
function CustomerRow({ c, fmt, expanded, onToggle, canEdit, onEdit, onDelete, onMerge }) {
  const hue = hueOf(c.name);
  const owed = c.outstandingNPR;

  return (
    <>
      <div className={`kcust-row2${expanded ? " is-open" : ""}`} onClick={onToggle} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}>

        <div className="kcust-av" style={{ background: `oklch(88% .06 ${hue})`, color: `oklch(35% .12 ${hue})` }}>
          {initialsOf(c.name)}
        </div>

        <div className="kcust-name">
          <div className="kcust-name-t">
            {c.name}
            {!c.isActive && <span className="kcust-tag">no activity</span>}
          </div>
          <div className="kcust-name-s">
            {c.orders.length} order{c.orders.length !== 1 ? "s" : ""}
            {c.units > 0 ? ` · ${c.units.toLocaleString()} pcs` : ""}
            {c.city ? ` · ${c.city}` : ""}
          </div>
        </div>

        <div className="kcust-num">
          <span className="kcust-num-l">Invoiced</span>
          <strong className="mono">{fmt(c.invoicedNPR)}</strong>
        </div>

        <div className="kcust-bar">
          <div className="kcust-bar-h">
            <span className="mono" style={{ color: "var(--mint-deep)", fontWeight: 700 }}>{fmt(c.collectedNPR)}</span>
            <span className="kcust-bar-p">{Math.round(c.collectedPct)}%</span>
          </div>
          <Progress pct={c.collectedPct} />
          <div className="kcust-bar-f">collected</div>
        </div>

        <div className="kcust-num">
          <span className="kcust-num-l">Outstanding</span>
          <strong className="mono" style={{ color: owed > 0.5 ? "var(--terra)" : "var(--ink-5)" }}>
            {owed > 0.5 ? fmt(owed) : "—"}
          </strong>
          {c.overdueNPR > 0.5 && <span className="kcust-overdue">{fmt(c.overdueNPR)} overdue</span>}
        </div>

        <div className="kcust-num">
          <span className="kcust-num-l">Margin</span>
          {c.marginPct == null
            ? <span className="kcust-unknown" title="No costs entered against this customer's orders">no cost data</span>
            : <strong className="mono" style={{ color: c.marginPct >= 0 ? "var(--mint-deep)" : "var(--terra)" }}>
                {c.marginPct.toFixed(1)}%
              </strong>}
        </div>

        <div className="kcust-num">
          <span className="kcust-num-l">Last paid</span>
          <strong style={{ fontSize: 12.5, fontWeight: 600 }}>{fmtDay(c.lastPaidOn)}</strong>
          {c.avgDaysToPay != null && <span className="kcust-sub">~{c.avgDaysToPay}d to pay</span>}
        </div>

        <div className="kcust-acts" onClick={e => e.stopPropagation()}>
          {canEdit && (
            <>
              <button onClick={() => onEdit(c)} title="Edit"><Icons.Settings size={14} /></button>
              <button onClick={() => onMerge(c)} title="Merge into another customer">⇄</button>
              <button onClick={() => onDelete(c)} title="Delete"><Icons.X size={14} /></button>
            </>
          )}
          <span className={`kcust-chev${expanded ? " is-open" : ""}`}>›</span>
        </div>
      </div>

      {expanded && <CustomerDetail c={c} fmt={fmt} />}
    </>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */
const SORTS = {
  invoiced:    { label: "Revenue",     get: c => c.invoicedNPR },
  collected:   { label: "Collected",   get: c => c.collectedNPR },
  outstanding: { label: "Owed",        get: c => c.outstandingNPR },
  margin:      { label: "Margin",      get: c => c.marginPct ?? -Infinity },
  recent:      { label: "Last paid",   get: c => c.lastPaidOn || "" },
  name:        { label: "Name",        get: c => (c.name || "").toLowerCase() },
};

function Customers() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "customers");
  const { region } = useRegion();
  const { fmt, currency, toggle } = useCurrency();

  const [raw, setRaw] = useState({ customers: [], orders: [], invoices: [], payments: [], orderCosts: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [merging, setMerging] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("invoiced");
  const [onlyOwing, setOnlyOwing] = useState(false);

  async function load() {
    try {
      const [customers, orders, invoices, payments, orderCosts] = await Promise.all([
        fetchAll("customers", { orderBy: "name", orderDir: "asc" }),
        fetchAll("orders"),
        fetchAll("invoices"),
        fetchAll("payments"),
        fetchAll("order_costs"),
      ]);
      setRaw({ customers, orders, invoices, payments, orderCosts });
      setLoadError("");
    } catch (err) {
      console.error("Customers: failed to load:", err);
      setLoadError("Could not load customer data. Check your connection and refresh.");
    }
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  /* Region scoping: a customer belongs to one arm of the business, and their
     orders, invoices and payments follow them rather than being filtered
     separately — otherwise an untagged invoice would vanish from a customer
     who is visible, and the totals would silently stop adding up. */
  const rows = useMemo(() => {
    const customers = filterByRegion(raw.customers, region);
    const costs = {};
    raw.orderCosts.forEach(c => { if (c.orderId) costs[c.orderId] = c; });
    return rollUp({
      customers,
      orders: raw.orders,
      invoices: raw.invoices,
      payments: raw.payments,
      orderCosts: costs,
    });
  }, [raw, region]);

  const totals = useMemo(() => {
    const t = rows.reduce((a, c) => ({
      invoiced:    a.invoiced    + c.invoicedNPR,
      collected:   a.collected   + c.collectedNPR,
      outstanding: a.outstanding + c.outstandingNPR,
      overdue:     a.overdue     + c.overdueNPR,
      pipeline:    a.pipeline    + c.orderValueNPR,
    }), { invoiced: 0, collected: 0, outstanding: 0, overdue: 0, pipeline: 0 });
    t.collectRate = t.invoiced > 0 ? (t.collected / t.invoiced) * 100 : 0;
    t.withCosts = rows.filter(c => c.hasCosts).length;
    t.active = rows.filter(c => c.isActive).length;
    return t;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) list = list.filter(c =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.contactPerson || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q));
    if (onlyOwing) list = list.filter(c => c.outstandingNPR > 0.5);
    const get = SORTS[sortKey].get;
    return [...list].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (typeof av === "string") return sortKey === "name" ? av.localeCompare(bv) : bv.localeCompare(av);
      return bv - av;
    });
  }, [rows, query, sortKey, onlyOwing]);

  const topFive = useMemo(
    () => [...rows].filter(c => c.invoicedNPR > 0)
      .sort((a, b) => b.invoicedNPR - a.invoicedNPR).slice(0, 5),
    [rows]);

  async function handleSave(form) {
    try {
      if (editing) await updateRow("customers", editing.id, form);
      else await insertRow("customers", form);
      setShowForm(false); setEditing(null);
      await load();
    } catch (err) {
      console.error("Failed to save customer:", err);
      alert("Could not save — you may not have permission to edit customers.");
    }
  }

  async function handleDelete(c) {
    const warn = c.orders.length || c.invoices.length
      ? `${c.name} has ${c.orders.length} order(s) and ${c.invoices.length} invoice(s). `
        + `Deleting the customer leaves those records in place but unlinked — `
        + `they will drop out of every total on this page. Merge instead if this `
        + `is a duplicate.\n\nDelete anyway?`
      : `Delete ${c.name}?`;
    if (!window.confirm(warn)) return;
    try {
      await deleteRow("customers", c.id);
      await load();
    } catch {
      alert("Could not delete — you may not have permission to edit customers.");
    }
  }

  /* Repoint the losing customer's records, then remove them. Done row by row
     from the client because that is the only write path the app has; the
     orders/invoices/payments FKs make the result consistent either way. */
  async function handleMerge(source, targetId) {
    try {
      await Promise.all([
        ...source.orders.map(o   => updateRow("orders",   o.id, { customer_id: targetId })),
        ...source.invoices.map(i => updateRow("invoices", i.id, { customerId: targetId })),
        ...source.payments.map(p => updateRow("payments", p.id, { customerId: targetId })),
      ]);
      await deleteRow("customers", source.id);
      setMerging(null);
      setExpanded(null);
      await load();
    } catch (err) {
      console.error("Merge failed:", err);
      alert("Merge failed partway. Reload and check the customer before retrying.");
    }
  }

  const modal = (title, body, onClose, width = 580) => (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(10,28,20,.4)", backdropFilter: "blur(3px)", zIndex: 50 }} onClick={onClose} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 51, background: "#fff", borderRadius: 14, padding: 28, width: `min(${width}px, 94vw)`, maxHeight: "88vh", overflowY: "auto", boxShadow: "var(--shadow-pop)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--ink-4)" }}>×</button>
        </div>
        {body}
      </div>
    </>
  );

  return (
    <div className="kscr fade-in" style={{ padding: "4px 0 0" }}>

      <div className="kph" style={{ padding: "8px 0 20px" }}>
        <div>
          <h2>Customers</h2>
          <p>
            {rows.length} client{rows.length !== 1 ? "s" : ""}
            {totals.active !== rows.length && ` · ${totals.active} with activity`}
          </p>
        </div>
        <div className="kph-a" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button className="ghost-button" onClick={toggle} title="Switch display currency">
            {currency === "NPR" ? "₨ NPR" : "£ GBP"}
          </button>
          <RegionSwitch untagged={countUntagged(raw.customers)} />
          {canEdit && (
            <button className="primary-button" style={{ display: "flex", alignItems: "center", gap: 6 }}
              onClick={() => { setEditing(null); setShowForm(true); }}>
              <Icons.Plus size={13} sw={2.2} /> Add customer
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="kcust-err">{loadError}</div>
      )}

      {/* ── Overall ── */}
      <div className="kkpi-row krsp-4" style={{ gap: 12, marginBottom: 16 }}>
        <KPI label="Invoiced" value={fmt(totals.invoiced)}
          deltaLabel={`${totals.pipeline > 0 ? fmt(totals.pipeline) + " in orders" : "—"}`} />
        <KPI label="Collected" value={fmt(totals.collected)}
          deltaLabel={`${totals.collectRate.toFixed(0)}% of invoiced`} />
        <KPI label="Outstanding" value={fmt(totals.outstanding)} accent="var(--terra)"
          deltaLabel={totals.overdue > 0.5 ? `${fmt(totals.overdue)} overdue` : "nothing overdue"} />
        <KPI label="Profitability" value={totals.withCosts > 0 ? `${totals.withCosts}/${totals.active}` : "—"}
          deltaLabel={totals.withCosts > 0 ? "customers with cost data" : "no order costs entered yet"} />
      </div>

      {/* Collection split — a single glance at how much of what we billed
          has actually turned into money. */}
      {totals.invoiced > 0 && (
        <div className="kcust-split">
          <div className="kcust-split-h">
            <span>Collection</span>
            <span className="mono">{totals.collectRate.toFixed(1)}% collected</span>
          </div>
          <SegBar height={10} segments={[
            { label: "Collected", v: totals.collected, color: "var(--mint-deep)" },
            { label: "Outstanding", v: Math.max(0, totals.outstanding - totals.overdue), color: "var(--amber)" },
            { label: "Overdue", v: totals.overdue, color: "var(--terra)" },
          ]} />
          <div className="kcust-legend">
            <span><i style={{ background: "var(--mint-deep)" }} />Collected {fmt(totals.collected)}</span>
            <span><i style={{ background: "var(--amber)" }} />Outstanding {fmt(Math.max(0, totals.outstanding - totals.overdue))}</span>
            <span><i style={{ background: "var(--terra)" }} />Overdue {fmt(totals.overdue)}</span>
          </div>
        </div>
      )}

      {/* Top customers by revenue */}
      {topFive.length > 0 && (
        <div className="kcust-top">
          <h4 className="kcust-h4">Biggest customers by revenue</h4>
          {topFive.map(c => {
            const pct = (c.invoicedNPR / topFive[0].invoicedNPR) * 100;
            return (
              <div key={c.id} className="kcust-top-row">
                <span className="kcust-top-n" title={c.name}>{c.name}</span>
                <div className="kcust-top-t">
                  <span style={{ width: `${pct}%`, background: `oklch(70% .11 ${hueOf(c.name)})` }} />
                </div>
                <span className="mono kcust-top-v">{fmt(c.invoicedNPR)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Controls ── */}
      <div className="kcust-controls">
        <input className="kcust-search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search customers…" />
        <label className="kcust-check">
          <input type="checkbox" checked={onlyOwing} onChange={e => setOnlyOwing(e.target.checked)} />
          Only those who owe
        </label>
        <div className="kcust-sorts">
          {Object.entries(SORTS).map(([k, s]) => (
            <button key={k} className={`kcust-sort${sortKey === k ? " is-on" : ""}`}
              onClick={() => setSortKey(k)}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* ── List ── */}
      <div className="kcust-tbl">
        {loading ? (
          <p style={{ padding: "32px 16px", color: "var(--ink-4)" }}>Loading…</p>
        ) : visible.length === 0 ? (
          <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--ink-4)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏢</div>
            <div style={{ fontWeight: 600 }}>
              {rows.length === 0 ? "No customers yet" : "Nothing matches that"}
            </div>
            {rows.length === 0 && (
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Customers appear here automatically when an order is raised for them.
              </div>
            )}
          </div>
        ) : (
          visible.map(c => (
            <CustomerRow key={c.id} c={c} fmt={fmt} canEdit={canEdit}
              expanded={expanded === c.id}
              onToggle={() => setExpanded(x => x === c.id ? null : c.id)}
              onEdit={x => { setEditing(x); setShowForm(true); }}
              onDelete={handleDelete}
              onMerge={x => setMerging(x)} />
          ))
        )}
      </div>

      {showForm && modal(
        editing ? "Edit customer" : "New customer",
        <CustomerForm initial={editing || undefined} onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }} />,
        () => { setShowForm(false); setEditing(null); })}

      {merging && modal(
        `Merge ${merging.name}`,
        <MergeDialog source={merging} customers={rows}
          onCancel={() => setMerging(null)} onMerge={handleMerge} />,
        () => setMerging(null), 460)}
    </div>
  );
}

export default Customers;
