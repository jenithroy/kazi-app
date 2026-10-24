import { useEffect, useId, useMemo, useState } from "react";
import EditCard, { Field, KV, Tag } from "../EditCard";
import Select from "../Select";
import ShareButton from "../share/ShareButton";
import { fetchAll } from "../../lib/db";
import { useCurrency } from "../../context/CurrencyContext";
import { REGIONS, normaliseRegion, regionLabel } from "../../utils/region";
import { toNPR } from "../../utils/currency";
import { customerForm, customerPayload, fmtDay } from "../../lib/sales";
import "./sales.css";

const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

const REGION_OPTIONS = [{ value: "", label: "Not set" }, ...REGIONS.map((r) => ({ value: r.id, label: r.label }))];

/** An invoice's tag: how it stands, in the card's four colours. */
function invoiceTone(i, owed, today) {
  if (i.status === "Cancelled" || i.status === "Draft") return undefined;
  if (i.status === "Paid") return "good";
  return owed > 0.5 && i.dueDate && i.dueDate < today ? "bad" : "warn";
}

/* ── What is behind the numbers (the card's read-only sections) ──── */

function Invoices({ c, fmt, today }) {
  if (c.invoices.length === 0) return <p className="ec-hist-empty ec-wide">No invoices raised.</p>;
  return (
    <div className="ec-block ec-wide">
      <ul className="ec-hist sl-hist sl-hist--inv" tabIndex={0} aria-label="Invoices, newest first">
        {c.invoices.map((i) => {
          const total = toNPR(i.totalNPR, i.currency);
          const owed = Math.max(0, total - toNPR(i.amountPaid, i.currency));
          const due = i.status !== "Cancelled" && owed > 0.5;
          return (
            <li key={i.id}>
              <span className="ec-hist-t"><b>{i.invoiceNumber || "—"}</b><span>{fmtDay(i.date)}</span></span>
              <span className="ec-hist-q">{fmt(total)}<small>total</small></span>
              <span className={`ec-hist-q${due ? " ec-bad" : ""}`}>{due ? fmt(owed) : "—"}<small>owed</small></span>
              <Tag tone={invoiceTone(i, owed, today)}>{i.status || "—"}</Tag>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Payments({ c, fmt }) {
  if (c.payments.length === 0) return <p className="ec-hist-empty ec-wide">Nothing received yet.</p>;
  return (
    <>
      <div className="ec-block ec-wide">
        <ul className="ec-hist sl-hist sl-hist--pay" tabIndex={0} aria-label="Payments received, newest first">
          {c.payments.map((p) => (
            <li key={p.id}>
              <span className="ec-hist-t">
                <b>{p.isOpening ? <em className="sl-undated">Date not recorded</em> : fmtDay(p.paidOn)}</b>
                <span>
                  {p.invoiceNumber || "—"}
                  {p.method && !p.isOpening ? ` · ${p.method}` : ""}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
              </span>
              <span className="ec-hist-q ec-good">{fmt(toNPR(p.amount, p.invoiceCurrency))}</span>
            </li>
          ))}
        </ul>
      </div>
      {c.payments.some((p) => p.isOpening) && (
        <p className="ec-note ec-wide">
          Payments marked “date not recorded” were carried over from before payment history was kept.
          Their amounts are right; their dates were never stored.
        </p>
      )}
    </>
  );
}

function Orders({ c, fmt }) {
  if (c.orders.length === 0) return <p className="ec-hist-empty ec-wide">No orders yet.</p>;
  return (
    <>
      <div className="ec-block ec-wide">
        <ul className="ec-hist sl-hist sl-hist--ord" tabIndex={0} aria-label="Orders, newest first">
          {c.orders.map((o) => (
            <li key={o.id}>
              <span className="ec-hist-t"><b>{o.orderId || "—"}</b><span>{o.styleName || "—"}</span></span>
              <span className="ec-hist-q">{Number(o.quantity || 0).toLocaleString()}<small>pcs</small></span>
              <span className="ec-hist-q">{Number(o.totalValueNPR || 0) > 0 ? fmt(Number(o.totalValueNPR)) : "—"}<small>value</small></span>
              <span className="sl-ord-stage">{o.stage || "—"}</span>
            </li>
          ))}
        </ul>
      </div>
      {!c.hasCosts && (
        <p className="ec-note ec-wide">
          No costs recorded against these orders, so profit cannot be worked out for this customer.
          Costs are entered in Finance → Order P&amp;L.
        </p>
      )}
    </>
  );
}

/**
 * One customer, in the card in the middle of the screen (EditCard): who they are on the left (the details form, and
 * what is behind the numbers: invoices, payments, orders), what they owe and have paid on the right, always in view.
 * With edit rights the same card saves the details, merges a duplicate into another customer and deletes. A new
 * customer is this card opened straight into the form.
 *
 * `onSave(payload, id)` resolves to `{ ok, message }`; `onDelete(customer)` too. The card closes itself on ok and
 * keeps the message on screen otherwise. Merging is a small dialog of its own (`onAskMerge`).
 *
 * `seesMoney` / `seesOrders` (both on unless said otherwise): whether this position may read invoices and payments (Billing),
 * and orders. A position that may not would see noughts, so the card leaves those sections and the numbers out (the orders and the
 * margin only go with `seesOrders`: a count of nought pieces is not the same as not being able to see them). `canMerge` and
 * `canDelete` (on unless said otherwise) are for the page to say whether this position may be offered those two: a merge moves
 * orders, invoices and payments (which takes the right to edit each of them) and a delete leaves them unlinked (which the card can
 * only count when it can see them all). Sales passes none of these, so its card is as it was.
 */
export default function CustomerCard({
  customer, startSection, canEdit, region, today, onClose, onSave, onAskMerge, onDelete,
  seesMoney = true, seesOrders = true, canMerge = true, canDelete = true,
}) {
  const { fmt } = useCurrency();
  const uid = useId();
  const id = (k) => `${uid}-${k}`;
  const adding = !customer;
  const ro = !canEdit;
  const [form, setForm] = useState(() => customerForm(customer, region));
  const [campaigns, setCampaigns] = useState([]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Optional: most customers have no campaign, and that is the honest default (there is no ad-click tracking, only what staff happen to know).
  useEffect(() => {
    let alive = true;
    fetchAll("meta_campaigns", { orderBy: "name", orderDir: "asc" }).then((r) => { if (alive) setCampaigns(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const campaignOptions = useMemo(
    () => [{ value: "", label: "Not set" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))],
    [campaigns],
  );

  async function save() {
    if (!form.name.trim()) return { ok: false, message: "Give the customer a name.", section: "details" };
    return onSave(customerPayload(form), customer?.id || null);
  }

  const detailsMain = (
    <>
      <Field label="Customer name *" htmlFor={id("name")} wide>
        <input id={id("name")} value={form.name} onChange={set("name")} placeholder="e.g. Next plc" disabled={ro} />
      </Field>
      <Field label="City" htmlFor={id("city")}>
        <input id={id("city")} value={form.city} onChange={set("city")} placeholder="London" disabled={ro} />
      </Field>
      <Field label="Contact person" htmlFor={id("contact")}>
        <input id={id("contact")} value={form.contactPerson} onChange={set("contactPerson")} placeholder="Jane Smith" disabled={ro} />
      </Field>
      <Field label="Email" htmlFor={id("email")}>
        {/* not type="email": the card is a form, so the browser would refuse to save an old value like "a@x.com, b@x.com" with a bubble of its own */}
        <input id={id("email")} type="text" inputMode="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="jane@example.com" disabled={ro} />
      </Field>
      <Field label="Phone" htmlFor={id("phone")}>
        <input id={id("phone")} value={form.phone} onChange={set("phone")} placeholder="+44 20 7946 0958" disabled={ro} />
      </Field>
      <Field label="Region" htmlFor={id("region")} hint="Untagged customers show under both UK and Nepal.">
        <Select
          id={id("region")}
          label="Region"
          value={normaliseRegion(form.region)}
          onChange={(v) => setForm((f) => ({ ...f, region: v }))}
          options={REGION_OPTIONS}
          placeholder="Not set"
          disabled={ro}
        />
      </Field>
      <Field label="Source campaign" htmlFor={id("campaign")} hint="Only if you know they came from a specific ad.">
        <Select
          id={id("campaign")}
          label="Source campaign"
          value={form.sourceCampaignId || ""}
          onChange={(v) => setForm((f) => ({ ...f, sourceCampaignId: v }))}
          options={campaignOptions}
          placeholder="Not set"
          searchPlaceholder="Search campaigns"
          disabled={ro}
        />
      </Field>
      <Field label="Address" htmlFor={id("address")} wide>
        <input id={id("address")} value={form.address} onChange={set("address")} placeholder="123 High Street, London, W1A 1AA" disabled={ro} />
      </Field>
      <Field label="Notes" htmlFor={id("notes")} wide>
        <textarea id={id("notes")} rows={3} value={form.notes} onChange={set("notes")} placeholder="Any additional notes…" disabled={ro} />
      </Field>
    </>
  );

  /* a new customer: just the form */
  if (adding) {
    return (
      <EditCard
        className="sl-card"
        title="New customer"
        subtitle="They also appear here on their own when an order is raised for them."
        creating
        canEdit
        main={detailsMain}
        submitLabel="Add customer"
        savingLabel="Adding…"
        onSave={save}
        onClose={onClose}
      />
    );
  }

  const c = customer;
  // what Send hands to Chat: the saved details (the fields of the form, so never the money or orders below) and the name the Source campaign field shows
  const sourceCampaignName = c.sourceCampaignId ? campaigns.find((x) => String(x.id) === String(c.sourceCampaignId))?.name || "" : "";
  const owed = c.outstandingNPR;
  const late = c.overdueNPR;
  const numbers = (
    <>
      <div className="ec-block ec-wide">
        <span className="ec-cap">Still owed</span>
        <div className={`ec-fig${late > 0.5 ? " ec-bad" : ""}`}>{fmt(owed > 0.5 ? owed : 0)}</div>
        <span>
          {late > 0.5 ? <Tag tone="bad">{fmt(late)} overdue</Tag> : owed > 0.5 ? <Tag tone="warn">None overdue</Tag> : <Tag tone="good">Paid up</Tag>}
        </span>
      </div>
      <KV rows={[
        ["Invoiced", fmt(c.invoicedNPR)],
        ["Collected", `${fmt(c.collectedNPR)} · ${Math.round(c.collectedPct)}%`, c.collectedNPR > 0.5 ? "good" : undefined],
        ...(seesOrders ? [["Margin", c.marginPct == null ? "no cost data" : `${c.marginPct.toFixed(1)}%`, c.marginPct == null ? undefined : c.marginPct >= 0 ? "good" : "bad"]] : []),
        ["Last paid", c.lastPaidOn ? fmtDay(c.lastPaidOn) : "—"],
        ["Pays in about", c.avgDaysToPay != null ? `${c.avgDaysToPay} ${plural(c.avgDaysToPay, "day")}` : "—"],
        ...(seesOrders ? [["Orders", `${c.orders.length} · ${c.units.toLocaleString()} ${plural(c.units, "piece")}`]] : []),
      ]} />
    </>
  );

  const count = (n) => <span className="sl-count">{n}</span>;
  const sections = [
    { id: "details", label: "Details", main: detailsMain },
    ...(seesMoney ? [
      { id: "invoices", label: <>Invoices {count(c.invoices.length)}</>, main: <Invoices c={c} fmt={fmt} today={today} /> },
      { id: "payments", label: <>Payments {count(c.payments.length)}</>, main: <Payments c={c} fmt={fmt} /> },
    ] : []),
    ...(seesOrders ? [{ id: "orders", label: <>Orders {count(c.orders.length)}</>, main: <Orders c={c} fmt={fmt} /> }] : []),
  ];
  // open where asked, else where the money is: invoices, else orders, else the details
  const first = sections.some((s) => s.id === startSection) ? startSection
    : seesMoney && c.invoices.length ? "invoices" : seesOrders && c.orders.length ? "orders" : "details";
  const ownRegion = normaliseRegion(c.region);
  const deleteNote = !seesMoney || !seesOrders
    ? "Any orders, invoices and payments they have stay, but unlinked from them."
    : c.orders.length || c.invoices.length
      ? `They have ${c.orders.length} ${plural(c.orders.length, "order")} and ${c.invoices.length} ${plural(c.invoices.length, "invoice")}. Those stay, but unlinked, so they drop out of every total on this page. Merge instead if this is a duplicate.`
      : "They have no orders or invoices.";
  // a card with only the details has nothing to switch between, and no numbers to put beside them
  const sectioned = sections.length > 1;

  return (
    <EditCard
      className="sl-card"
      title={c.name}
      subtitle={[c.city, ownRegion ? regionLabel(ownRegion) : ""].filter(Boolean).join(" · ") || undefined}
      canEdit={canEdit}
      {...(sectioned ? { initialSection: first, sections } : { main: detailsMain })}
      side={seesMoney ? numbers : undefined}
      onSave={save}
      onDelete={canDelete ? () => onDelete(c) : undefined}
      deleteName={c.name}
      deleteNote={deleteNote}
      submitLabel="Save customer"
      footerExtra={(
        <>
          <ShareButton type="customer" record={{ ...customerForm(c), sourceCampaignName }} compact title="Send this customer to someone in Chat" />
          {canEdit && canMerge && seesMoney && seesOrders ? <button type="button" className="ghost-button" onClick={() => onAskMerge(c)}>Merge into…</button> : null}
        </>
      )}
      onClose={onClose}
    />
  );
}
