/**
 * The email finder: type a brand's website, read its public contact pages, and save the addresses worth keeping to the team's list.
 *
 * It asks the Worker (lib/redditApi.js), which reads at most the home page and two contact or about pages of that one site, obeys its
 * robots.txt, and answers with the addresses the site shows, what kind each is, and its social links. Nothing is searched on Google,
 * Facebook or Instagram. Nothing is saved until "Save", and an address already on the list is shown as such and never overwritten (it
 * may be marked do-not-email).
 *
 * Which addresses start ticked: those on the brand's own domain (a company address or a named one). A Gmail-type address starts unticked
 * (it is often a person, and a person's own address needs more care than a company's), and can be ticked.
 *
 * Lives in a card (a lead's, which is portalled to the page's top level: the card's `ghost-button`, `--ink-*` colours) and in a dialog.
 */
import { useId, useMemo, useRef, useState } from "react";
import { Icons } from "../ui";
import { Tag } from "../EditCard";
import { brandFromSite, domainOf, kindLabel, normalizeWebsite, plural } from "../../lib/redditLeads";
import { findEmails, saveEmails } from "../../lib/redditWrites";

const NO_KNOWN = new Map();                         // one shared empty map, so "nothing known" is the same value every render
const SOCIAL = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", pinterest: "Pinterest", linkedin: "LinkedIn" };

export default function EmailFinder({ initialUrl = "", brand = "", leadId = null, known, canEdit, onSaved, autoFocus = false }) {
  const id = useId();
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState(null);              // the finder's answer for the address it read
  const [pick, setPick] = useState(() => new Set());     // the addresses ticked
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState(null);            // what the last save did: { saved, duplicates, failed }
  const run = useRef(false);                             // a second press in the same instant must not start a second read

  const have = known || NO_KNOWN;
  const fresh = useMemo(() => (found?.emails || []).filter((e) => !have.has(e.email)), [found, have]);

  async function find() {
    if (run.current) return;
    const site = normalizeWebsite(url);
    if (!site) { setError(site === "" ? "Type the website's address first." : "That doesn't look like a website address."); return; }
    run.current = true;
    setBusy(true); setError(""); setReport(null); setFound(null);
    const res = await findEmails(site);
    run.current = false;
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setUrl(site);
    setFound(res.res);
    // only an address on the brand's own domain starts ticked: one from another domain on its page ("site by a studio", a cookie vendor) or a
    // free mailbox is for a person to decide on
    setPick(new Set((res.res.emails || []).filter((e) => e.ownDomain && e.kind !== "free" && !have.has(e.email)).map((e) => e.email)));
  }

  const toggle = (email) => setPick((p) => { const n = new Set(p); if (n.has(email)) n.delete(email); else n.add(email); return n; });
  const chosen = fresh.filter((e) => pick.has(e.email));

  async function save() {
    if (saving || chosen.length === 0) return;
    setSaving(true);
    const out = await saveEmails(chosen, { brand: brand || brandFromSite(found.site), website: found.site, leadId, socials: found.socials });
    setSaving(false);
    setReport(out);
    if (out.saved.length) { onSaved?.(out.saved); setPick((p) => { const n = new Set(p); out.saved.forEach((r) => n.delete(r.email)); return n; }); }
  }

  const socials = Object.entries(found?.socials || {});
  return (
    <div className="rdl-find">
      <div className="ec-f">
        <label htmlFor={`${id}-url`}>Brand's website</label>
        <div className="rdl-find-row">
          <input
            id={`${id}-url`} type="text" inputMode="url" autoComplete="off" spellCheck={false} placeholder="brand.com" value={url} autoFocus={autoFocus}
            onChange={(e) => { setUrl(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); find(); } }} disabled={!canEdit}
          />
          <button type="button" className="ghost-button" onClick={find} disabled={busy || !canEdit}>
            <Icons.Search size={13} sw={2} aria-hidden="true" /> {busy ? "Reading…" : "Find emails"}
          </button>
        </div>
        <small className="ec-hint">Reads the home page and up to two contact pages of this one site. Nothing is searched on Google or social networks.</small>
      </div>

      <div className="rdl-find-out" aria-live="polite">
        {error && <p className="rdl-find-msg is-bad" role="alert">{error}</p>}
        {busy && <p className="rdl-find-msg">Reading {domainOf(normalizeWebsite(url) || url) || "the site"}…</p>}

        {found && !busy && (
          <>
            <p className="rdl-find-head">
              <b>{domainOf(found.site) || found.host}</b>
              <span>{found.ok ? `${found.pages.length} ${plural(found.pages.length, "page")} read` : "not read"}</span>
            </p>
            {!found.ok && <p className="rdl-find-msg is-bad">{found.message}</p>}
            {found.ok && found.emails.length === 0 && <p className="rdl-find-msg">{found.message || "No public email address found."}</p>}
            {found.robotsBlocked && found.ok && <p className="rdl-find-msg">Some pages were skipped because the site asks robots not to read them.</p>}

            {found.emails.length > 0 && (
              <ul className="rdl-find-list" aria-label="Addresses found">
                {found.emails.map((e) => {
                  const on = have.has(e.email);
                  const flagged = on && have.get(e.email)?.doNotEmail;
                  return (
                    <li key={e.email} className={on ? "is-have" : undefined}>
                      <label>
                        <input type="checkbox" checked={!on && pick.has(e.email)} disabled={on || !canEdit} onChange={() => toggle(e.email)} />
                        <span className="rdl-find-mail">
                          <b title={e.email}>{e.email}</b>
                          <small>
                            {kindLabel(e.kind)}{e.ownDomain ? " · on the brand's own domain" : ""}
                            {e.source ? <> · <a href={e.source} target="_blank" rel="noreferrer noopener">where found</a></> : null}
                          </small>
                        </span>
                      </label>
                      {on && <Tag tone={flagged ? "bad" : "good"}>{flagged ? "Do not email" : "On the list"}</Tag>}
                      {!on && e.kind === "free" && <Tag>Gmail-type</Tag>}
                      {!on && e.kind !== "free" && !e.ownDomain && <Tag tone="warn">Other domain</Tag>}
                    </li>
                  );
                })}
              </ul>
            )}

            {socials.length > 0 && (
              <p className="rdl-find-soc">
                <span>Also on</span>
                {socials.map(([net, link]) => <a key={net} href={link} target="_blank" rel="noreferrer noopener">{SOCIAL[net] || net}</a>)}
              </p>
            )}

            {fresh.length > 0 && (
              <div className="rdl-find-save">
                <button type="button" className="primary-button" onClick={save} disabled={saving || chosen.length === 0 || !canEdit}>
                  {saving ? "Saving…" : chosen.length === 0 ? "Tick an address to save" : `Save ${chosen.length} to the email list`}
                </button>
              </div>
            )}
          </>
        )}

        {report && (
          <p className={`rdl-find-msg${report.failed.length ? " is-bad" : " is-good"}`} role="status">
            {report.saved.length > 0 && `Saved ${report.saved.length} ${plural(report.saved.length, "address", "addresses")} to the email list. `}
            {report.duplicates.length > 0 && `${report.duplicates.length} ${plural(report.duplicates.length, "was", "were")} already on it. `}
            {report.failed.length > 0 && `${report.failed.length} could not be saved: ${report.failed[0].message}`}
          </p>
        )}
      </div>
    </div>
  );
}
