/**
 * One Reddit post, opened from the table (the shared EditCard): what was posted, a link to read it all on Reddit, its status, who the brand is
 * and where its website is, and the team's notes. On the right (a second tab on a phone) the email finder for that brand's website and the
 * addresses already saved for this post.
 *
 * What is saved with the card's Save is the status, brand, website and notes, read back. Finding and saving addresses is its own button in
 * the finder and does not wait for Save. "Add as customer" needs the Customers section (a position that can only see Customers cannot make
 * one: the card then says whom to ask) and a brand name; it cannot be pressed twice into two customers, and if the customer is made but
 * the post cannot be linked to them the card says so and its button then only tries the link again.
 */
import { useId, useRef, useState } from "react";
import EditCard, { Field, Seg, Tag } from "../EditCard";
import { Icons } from "../ui";
import EmailFinder from "./EmailFinder";
import { STATUSES, kindLabel, kindOf, leadStatus, matchTier, normalizeWebsite, statusMeta, timeAgo } from "../../lib/redditLeads";

export default function LeadCard({ lead, saved = [], known, canEdit, canAddCustomer, customerMade = false, onSave, onAddCustomer, onSavedEmails, onClose }) {
  const id = useId();
  const startStatus = leadStatus(lead);
  // What the card showed when it was opened. A change is a difference from THIS, not from the latest row: the page looks again every few
  // minutes, and a colleague's change that arrives under an open card must not be written back over as if it were this person's.
  const base = useRef({ status: startStatus, brand: lead.brand || "", website: lead.website || "", notes: lead.notes || "" });
  const [status, setStatus] = useState(startStatus);
  const [brand, setBrand] = useState(lead.brand || "");
  const [website, setWebsite] = useState(lead.website || "");
  const [notes, setNotes] = useState(lead.notes || "");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState("");
  const once = useRef(false);                          // a second press in the same instant must not get past the first (state would not have changed yet)

  const isCustomer = Boolean(lead.customerId) || startStatus === "customer";
  const dirty = status !== base.current.status || brand !== base.current.brand || website !== base.current.website || notes !== base.current.notes;
  const tier = matchTier(lead.score);

  async function save() {
    // only a website that was changed has to be a good address: one that came from the post and was never touched is saved (or left) as it is
    const changed = website !== base.current.website;
    const site = changed ? normalizeWebsite(website) : website;
    if (site === null) return { ok: false, message: "That doesn't look like a website address. Use something like brand.com." };
    return onSave({ status, brand, website: site, notes }, base.current);
  }

  async function add() {
    if (once.current) return;
    once.current = true;
    setAdding(true);
    setMsg("");
    try {
      if (dirty) { setMsg("Save your changes first, then add the customer."); return; }
      const res = await onAddCustomer();
      if (res.ok) onClose();
      else setMsg(res.message);
    } finally {
      once.current = false;
      setAdding(false);
    }
  }

  const main = (
    <>
      {msg && <p className="ec-wide rdl-cardmsg" role="alert">{msg}</p>}
      <Field label="What they posted" wide>
        <p className="rdl-post">{lead.excerpt || "Only a title: no text."}</p>
        <div className="rdl-act">
          <a className="ghost-button" href={lead.url} target="_blank" rel="noreferrer noopener"><Icons.Send size={13} sw={2} aria-hidden="true" /> Read it on Reddit</a>
          <span className="rdl-hits">
            <Tag tone={tier.tone || undefined}>{tier.label} match</Tag>
            {lead.hits?.slice(0, 4).map((h) => <Tag key={h}>{h}</Tag>)}
          </span>
        </div>
      </Field>
      <Field label="Status" wide>
        <Seg value={status} onChange={setStatus} options={STATUSES.map((s) => [s.id, s.label])} label="Post status" disabled={!canEdit} />
      </Field>
      <Field label="Brand name" htmlFor={`${id}-brand`}>
        <input id={`${id}-brand`} value={brand} maxLength={120} onChange={(e) => setBrand(e.target.value)} placeholder="Who are they?" disabled={!canEdit} />
      </Field>
      <Field label="Website" htmlFor={`${id}-site`}>
        <input id={`${id}-site`} type="text" inputMode="url" autoComplete="off" spellCheck={false} value={website} maxLength={300} onChange={(e) => setWebsite(e.target.value)} placeholder="brand.com" disabled={!canEdit} />
      </Field>
      <Field label="Notes" htmlFor={`${id}-notes`} wide>
        <textarea id={`${id}-notes`} value={notes} maxLength={2000} rows={3} onChange={(e) => setNotes(e.target.value)} placeholder="Who spoke to them, what was said, what comes next" disabled={!canEdit} />
      </Field>
      <Field
        label="Customer" wide
        hint={isCustomer ? undefined : customerMade ? "A customer was already created from this post. This only links the post to them; it makes no new customer."
          : canAddCustomer ? "Creates a customer from the brand name and the best address saved here, and marks this post as a customer." : "Adding a customer needs the Customers section. Ask someone who has it."}
      >
        {isCustomer ? (
          <span className="rdl-selfstart"><Tag tone="good">Customer ✓</Tag></span>
        ) : canAddCustomer && canEdit ? (
          <div className="rdl-act">
            <button type="button" className="ghost-button" onClick={add} disabled={adding || (!customerMade && !brand.trim())}>
              <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> {adding ? (customerMade ? "Linking…" : "Adding…") : customerMade ? "Link to the customer made" : "Add as customer"}
            </button>
            {!customerMade && !brand.trim() && <span className="rdl-dim">Type a brand name first.</span>}
          </div>
        ) : <span className="rdl-line rdl-dim">Not a customer yet</span>}
      </Field>
    </>
  );

  const side = (
    <div className="ec-wide rdl-side">
      <p className="rdl-sidehead">Find their email</p>
      <EmailFinder initialUrl={normalizeWebsite(website) || ""} brand={brand} leadId={lead.id} known={known} canEdit={canEdit} onSaved={onSavedEmails} />
      <p className="rdl-sidehead">Saved for this post</p>
      {saved.length === 0 ? <p className="rdl-line rdl-dim">No address saved yet.</p> : (
        <ul className="rdl-saved">
          {saved.map((e) => (
            <li key={e.id}>
              <b title={e.email}>{e.email}</b>
              <span>{kindLabel(kindOf(e))}</span>
              {e.doNotEmail && <Tag tone="bad">Do not email</Tag>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <EditCard
      title={lead.title}
      subtitle={`r/${lead.subreddit} · ${timeAgo(lead.postedAt)} · ${statusMeta(startStatus).label}`}
      main={main} side={side} mainLabel="Post" sideLabel="Emails"
      canEdit={canEdit} dirty={dirty} className="kmodal--reddit"
      onSave={save} onClose={onClose}
    />
  );
}
