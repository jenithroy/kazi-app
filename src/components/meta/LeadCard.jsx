/**
 * One lead, opened from the Leads table (the shared EditCard): who they are and how to reach them (a WhatsApp link and a call link
 * for a phone number), which campaign and ad they came from, when, their status, and what they answered on the form. With edit rights
 * the status can be changed (saved with the card, read back) and the lead can be added as a customer.
 *
 * "Add as customer" asks the page to do it (lib/metaWrites.js `convertLead`) and shows what came back here, on the card: a lead that is
 * already a customer has no button, and when the customer was created but the lead could not be linked to them the card says so.
 */
import { useRef, useState } from "react";
import EditCard, { Field, Seg, Tag } from "../EditCard";
import { Icons } from "../ui";
import { LEAD_STATUSES, leadStatusMeta, leadWhen, phoneLinks, whatsappUrl } from "../../lib/metaCalc";

const WHEN = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const nice = (k) => String(k).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
// An email is a link only when it is plainly one address: what a stranger typed into a form must not be able to add a Bcc or a body to the message that opens
const PLAIN_EMAIL = /^[^\s@?&,;:<>"%]+@[^\s@?&,;:<>"%]+\.[^\s@?&,;:<>"%]+$/;

export default function LeadCard({ lead, canEdit, customerMade = false, onSave, onConvert, onClose }) {
  const startStatus = leadStatusMeta(lead.status).id;
  const [status, setStatus] = useState(startStatus);
  const [adding, setAdding] = useState(false);
  const once = useRef(false);                  // a second press in the same instant must not get past the first (state would not have changed yet)
  const [msg, setMsg] = useState("");
  const isCustomer = Boolean(lead.customerId) || startStatus === "converted";
  const { wa, tel } = phoneLinks(lead.phoneNumber);
  const answers = Object.entries(lead.rawData || {});
  const received = new Date(leadWhen(lead));

  async function add() {
    if (once.current) return;
    once.current = true;
    setAdding(true);
    setMsg("");
    try {
      const res = await onConvert();
      if (res.ok) onClose();
      else setMsg(res.message);
    } finally {
      once.current = false;
      setAdding(false);
    }
  }

  const main = (
    <>
      {msg && <p className="ec-wide ma-cardmsg" role="alert">{msg}</p>}
      <Field label="Phone" wide>
        {lead.phoneNumber ? (
          <div className="ma-act">
            <b className="ma-line">{lead.phoneNumber}</b>
            {wa && <a className="ghost-button" href={whatsappUrl(lead)} target="_blank" rel="noreferrer">WhatsApp</a>}
            {tel && <a className="ghost-button" href={`tel:${tel}`}>Call</a>}
          </div>
        ) : <span className="ma-line ma-dim">No phone number</span>}
      </Field>
      <Field label="Email">
        {lead.email
          ? PLAIN_EMAIL.test(lead.email.trim()) ? <a className="ma-line" href={`mailto:${lead.email.trim()}`}>{lead.email}</a> : <span className="ma-line">{lead.email}</span>
          : <span className="ma-line ma-dim">—</span>}
      </Field>
      <Field label="City"><span className="ma-line">{lead.city || "—"}</span></Field>
      <Field label="Status" wide>
        <Seg value={status} onChange={setStatus} options={LEAD_STATUSES.map((s) => [s.id, s.label])} label="Lead status" disabled={!canEdit} />
      </Field>
      <Field label="Customer" wide hint={isCustomer ? undefined : customerMade ? "A customer was already created from this lead. This only links the lead to them; it makes no new customer." : "Creates a customer from this lead's details and marks the lead converted."}>
        {isCustomer ? (
          <span className="ma-selfstart"><Tag tone="good">Customer ✓</Tag></span>
        ) : canEdit ? (
          <div className="ma-act"><button type="button" className="ghost-button" onClick={add} disabled={adding}><Icons.Plus size={13} sw={2.2} aria-hidden="true" /> {adding ? (customerMade ? "Linking…" : "Adding…") : customerMade ? "Link to the customer made" : "Add as customer"}</button></div>
        ) : <span className="ma-line ma-dim">Not a customer yet</span>}
      </Field>
    </>
  );

  const side = (
    <>
      <p className="ec-wide ma-sidehead">Form answers</p>
      {answers.length === 0 ? (
        <p className="ec-wide ma-line ma-dim">No custom questions on this form.</p>
      ) : (
        <dl className="ec-kv ec-wide">
          {answers.map(([k, v]) => (
            <div key={k}><dt>{nice(k)}</dt><dd>{typeof v === "object" ? JSON.stringify(v) : String(v || "—")}</dd></div>
          ))}
        </dl>
      )}
    </>
  );

  return (
    <EditCard
      title={lead.fullName || "Unnamed lead"}
      subtitle={`${lead.campaignName || "Meta campaign"}${lead.adName ? ` · ${lead.adName}` : ""}${Number.isNaN(received.getTime()) ? "" : ` · ${WHEN.format(received)}`}`}
      main={main} side={side} mainLabel="Contact" sideLabel="Answers"
      canEdit={canEdit} dirty={status !== startStatus} className="kmodal--meta"
      onSave={() => onSave(status)} onClose={onClose}
    />
  );
}
