/**
 * One address on the email list, opened from the table (the shared EditCard): its brand, website and note, and whether the team may email
 * it. "Do not email" is how somebody who asked to be left alone is remembered: such an address is never in the spreadsheet download.
 * The address itself cannot be edited (a typo is a new address: remove this one and find it again). Removing asks first.
 */
import { useId, useRef, useState } from "react";
import EditCard, { Field, Seg, Tag } from "../EditCard";
import { kindLabel, kindOf, normalizeWebsite, timeAgo } from "../../lib/redditLeads";

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const SOCIAL = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", pinterest: "Pinterest", linkedin: "LinkedIn" };

export default function EmailCard({ email, lead, canEdit, onSave, onRemove, onClose }) {
  const id = useId();
  // What the card showed when it was opened: a change is a difference from THIS, not from the latest row (see LeadCard)
  const base = useRef({ brand: email.brand || "", website: email.website || "", note: email.note || "", doNotEmail: Boolean(email.doNotEmail) });
  const [brand, setBrand] = useState(email.brand || "");
  const [website, setWebsite] = useState(email.website || "");
  const [note, setNote] = useState(email.note || "");
  const [mayEmail, setMayEmail] = useState(email.doNotEmail ? "no" : "yes");
  const dirty = brand !== base.current.brand || website !== base.current.website || note !== base.current.note || (mayEmail === "no") !== base.current.doNotEmail;
  const found = new Date(email.foundAt);
  const socials = Object.entries(email.socials || {}).filter(([, v]) => typeof v === "string" && /^https?:\/\//.test(v));

  async function save() {
    const changed = website !== base.current.website;
    const site = changed ? normalizeWebsite(website) : website;
    if (site === null) return { ok: false, message: "That doesn't look like a website address. Use something like brand.com." };
    return onSave({ brand, website: site, note, doNotEmail: mayEmail === "no" }, base.current);
  }

  const main = (
    <>
      <Field label="Can we email this address?" wide hint={mayEmail === "no" ? "Left out of every download. Use this for anyone who asked to be left alone." : undefined}>
        <Seg value={mayEmail} onChange={setMayEmail} options={[["yes", "Yes"], ["no", "Do not email"]]} label="Can we email this address" disabled={!canEdit} />
      </Field>
      <Field label="Brand name" htmlFor={`${id}-brand`}>
        <input id={`${id}-brand`} value={brand} maxLength={120} onChange={(e) => setBrand(e.target.value)} placeholder="Who are they?" disabled={!canEdit} />
      </Field>
      <Field label="Website" htmlFor={`${id}-site`}>
        <input id={`${id}-site`} type="text" inputMode="url" autoComplete="off" spellCheck={false} value={website} maxLength={300} onChange={(e) => setWebsite(e.target.value)} placeholder="brand.com" disabled={!canEdit} />
      </Field>
      <Field label="Note" htmlFor={`${id}-note`} wide>
        <textarea id={`${id}-note`} value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering about this address" disabled={!canEdit} />
      </Field>
    </>
  );

  const side = (
    <div className="ec-wide rdl-side">
      <dl className="ec-kv">
        <div><dt>Type</dt><dd>{kindLabel(kindOf(email))}</dd></div>
        <div><dt>On the brand's own domain</dt><dd>{email.sameDomain ? "Yes" : "No"}</dd></div>
        <div><dt>Found</dt><dd>{Number.isNaN(found.getTime()) ? "—" : WHEN.format(found)} <small>{timeAgo(email.foundAt)}</small></dd></div>
        <div><dt>Where</dt><dd>{email.sourceUrl ? <a href={email.sourceUrl} target="_blank" rel="noreferrer noopener">The page it was on</a> : "Added by hand"}</dd></div>
        <div><dt>From the Reddit post</dt><dd>{lead ? <a href={lead.url} target="_blank" rel="noreferrer noopener">r/{lead.subreddit}</a> : "—"}</dd></div>
      </dl>
      {email.doNotEmail && (
        <p className="rdl-line">
          <Tag tone="bad">Do not email</Tag> <span className="rdl-dim">It stays on the list on purpose, so nobody offers it again. To remove it, first change it to “Yes” and save.</span>
        </p>
      )}
      {socials.length > 0 && (
        <p className="rdl-find-soc">
          <span>Also on</span>
          {socials.map(([net, link]) => <a key={net} href={link} target="_blank" rel="noreferrer noopener">{SOCIAL[net] || net}</a>)}
        </p>
      )}
    </div>
  );

  return (
    <EditCard
      title={email.email} subtitle={`${kindLabel(kindOf(email))}${email.brand ? ` · ${email.brand}` : ""}`}
      main={main} side={side} mainLabel="Address" sideLabel="Where from"
      canEdit={canEdit} dirty={dirty} className="kmodal--reddit"
      onSave={save} onDelete={canEdit && !email.doNotEmail ? onRemove : undefined} deleteName={email.email} deleteNote="It leaves the list. Nothing else is touched."
      onClose={onClose}
    />
  );
}
