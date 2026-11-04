/**
 * "UK tenders", a tab of "Find emails": the UK government's public notices (Find a Tender, on gov.uk) read for the ones about clothing and textiles, and the
 * addresses they give saved to the team's list.
 *
 * It asks the Worker (lib/emailFinderApi.js), which reads the service's official open data, never its website's pages (worker/lib/tenders.js).
 * Two kinds of notice: "Awarded contracts" (who bought, and which companies won: the winners are the ones to write to) and "Open tenders"
 * (who is buying now, and by when: a buyer's address is published for questions about that one notice). Nothing is saved until "Save", and an
 * address already on the list is shown as such and never overwritten (it may be marked do-not-email).
 *
 * Which addresses start ticked: a winner's own (a company address or a named one). A buyer's never does: it is a public body's mailbox for
 * questions about a notice, not a list to write to. A Gmail-type address starts unticked too (often a person). Any can be ticked.
 *
 * What is honest to say: of the awards in a month roughly 1 in 60 to 90 is about clothing, and winners almost never give an email (they give a
 * phone number, sometimes a website). The winners are found automatically by the page's "Find emails" with the "UK tenders" source switched on
 * (lib/sources.js): it finds each company's own website from its name, reads it, and saves the addresses worth writing to. This tab is for looking at
 * the notices themselves, and for saving an address a notice gives. A winner is listed with a link to look them up by hand (a web search a person
 * opens themselves; nothing is searched from here).
 *
 * A tab of FindDialog.
 */
import { useId, useMemo, useRef, useState } from "react";
import { Icons } from "../ui";
import { Field, Seg, Tag } from "../EditCard";
import { kindLabel, num, plural } from "../../lib/redditLeads";
import { findTenders, saveEmails } from "../../lib/redditWrites";

const NO_KNOWN = new Map();                         // one shared empty map, so "nothing known" is the same value every render
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const day = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : DAY.format(d); };
const money = (v) => (v ? `${v.currency === "GBP" ? "£" : `${v.currency} `}${Math.round(v.amount).toLocaleString("en-GB")}` : "");
const ROLE = { buyer: "Buyer", supplier: "Winner" };
const lookUp = (name) => `https://www.google.com/search?q=${encodeURIComponent(`"${name}" website`)}`;

/** The addresses that start ticked: a winner's, unless it is Gmail-type, and not one already on the list. */
const startTicked = (notices, have) => notices.flatMap((n) => n.contacts).filter((c) => c.role === "supplier" && c.kind !== "free" && !have.has(c.email)).map((c) => c.email);

export default function TenderFinder({ known, canEdit, onSaved }) {
  const id = useId();
  const [stage, setStage] = useState("award");           // "award" (who won) or "tender" (open now)
  const [days, setDays] = useState(30);
  const [words, setWords] = useState("");                // empty: the usual words (the Worker's list)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState(null);              // the search's answer
  const [pick, setPick] = useState(() => new Set());     // the addresses ticked
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState(null);            // what the last save did: { saved, duplicates, failed }
  const run = useRef(false);                             // a second press in the same instant must not start a second search

  const have = known || NO_KNOWN;
  const notices = found?.notices || [];

  async function search() {
    if (run.current) return;
    run.current = true;
    setBusy(true); setError(""); setReport(null); setFound(null);
    const res = await findTenders({ stage, days, words });
    run.current = false;
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setFound(res.res);
    setPick(new Set(startTicked(res.res.notices, have)));
  }

  const toggle = (email) => setPick((p) => { const n = new Set(p); if (n.has(email)) n.delete(email); else n.add(email); return n; });

  /** What would be saved: each ticked address once (the first notice that gives it), not one already on the list. */
  const chosen = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const n of notices) {
      for (const c of n.contacts) {
        if (!pick.has(c.email) || seen.has(c.email) || have.has(c.email)) continue;
        seen.add(c.email);
        out.push({
          email: c.email, kind: c.kind, ownDomain: c.ownDomain, source: n.url, brand: c.party, website: c.website,
          note: `Find a Tender: ${c.role === "supplier" ? "won" : "buyer on"} "${n.title}"`,
        });
      }
    }
    return out;
  }, [notices, pick, have]);

  async function save() {
    if (saving || chosen.length === 0) return;
    setSaving(true);
    const out = await saveEmails(chosen, { leadId: null, socials: {} });
    setSaving(false);
    setReport(out);
    if (out.saved.length) { onSaved?.(out.saved); setPick((p) => { const n = new Set(p); out.saved.forEach((r) => n.delete(r.email)); return n; }); }
  }

  const anyBuyer = notices.some((n) => n.contacts.some((c) => c.role === "buyer"));
  return (
    <div className="rdl-find rdl-tn">
      <div className="rdl-tn-form">
        <Field label="Looking for">
          <Seg value={stage} onChange={setStage} label="Which notices" disabled={!canEdit || busy} options={[["award", "Awarded contracts"], ["tender", "Open tenders"]]} />
        </Field>
        <Field label="Published in the last">
          <Seg value={String(days)} onChange={(v) => setDays(Number(v))} label="How far back" disabled={!canEdit || busy} options={[["7", "7 days"], ["14", "14 days"], ["30", "30 days"]]} />
        </Field>
      </div>

      <Field
        label="Words to look for (optional)" htmlFor={`${id}-words`}
        hint="Notices about clothing and textiles are always kept, and so are ones that mention uniform, workwear, clothing, garment, textile, scrubs or hi-vis. Add other words to catch more, separated by commas."
      >
        <div className="rdl-find-row">
          <input
            id={`${id}-words`} type="text" autoComplete="off" spellCheck={false} placeholder="hoodies, t-shirts, scrubs" value={words} disabled={!canEdit}
            onChange={(e) => setWords(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
          />
          <button type="button" className="ghost-button" onClick={search} disabled={busy || !canEdit}>
            <Icons.Search size={13} sw={2} aria-hidden="true" /> {busy ? "Reading…" : "Search"}
          </button>
        </div>
      </Field>
      <small className="ec-hint">Reads the notices the government publishes for anyone to use. Nothing is searched on Google or social networks.</small>

      <div className="rdl-find-out" aria-live="polite">
        {error && <p className="rdl-find-msg is-bad" role="alert">{error}</p>}
        {busy && <p className="rdl-find-msg">Reading the notices… this can take 10 seconds or so.</p>}

        {found && !busy && (
          <>
            <p className="rdl-find-head">
              <b>{num(found.matched)} {plural(found.matched, "notice")} about clothing or textiles</b>
              <span>{num(found.scanned)} read · {day(found.from)} to {day(found.to)}</span>
            </p>
            {found.capped && <p className="rdl-find-msg">There were more notices than could be read in one go. Choose a shorter period to see the rest.</p>}
            {notices.length === 0 && <p className="rdl-find-msg">{found.message || "Nothing found."}</p>}
            {found.matched > notices.length && <p className="rdl-find-msg">Showing the newest {notices.length} of {num(found.matched)}.</p>}

            {notices.length > 0 && (
              <ul className="rdl-tn-list" aria-label="Notices found">
                {notices.map((n) => (
                  <li key={n.id} className="rdl-tn-notice">
                    <p className="rdl-tn-title">
                      <b>{n.title || "A notice with no title"}</b>
                      {n.url && <a href={n.url} target="_blank" rel="noreferrer noopener">Read the notice</a>}
                    </p>
                    <p className="rdl-tn-meta">
                      {[n.buyer, n.stage === "tender" ? (n.deadline ? `closes ${day(n.deadline)}` : "") : (n.date ? `awarded ${day(n.date)}` : ""), money(n.value), n.cpv?.description].filter(Boolean).join(" · ")}
                    </p>

                    {n.contacts.length > 0 && (
                      <ul className="rdl-find-list" aria-label={`Addresses on ${n.title || "this notice"}`}>
                        {n.contacts.map((c) => {
                          const on = have.has(c.email);
                          const flagged = on && have.get(c.email)?.doNotEmail;
                          return (
                            <li key={c.email} className={on ? "is-have" : undefined}>
                              <label>
                                <input type="checkbox" checked={!on && pick.has(c.email)} disabled={on || !canEdit} onChange={() => toggle(c.email)} />
                                <span className="rdl-find-mail">
                                  <b title={c.email}>{c.email}</b>
                                  <small>
                                    {ROLE[c.role]}{c.party ? `: ${c.party}` : ""} · {kindLabel(c.kind)}{c.person ? ` · ${c.person}` : ""}
                                    {c.website ? <> · <a href={c.website} target="_blank" rel="noreferrer noopener">website</a></> : null}
                                  </small>
                                </span>
                              </label>
                              {on && <Tag tone={flagged ? "bad" : "good"}>{flagged ? "Do not email" : "On the list"}</Tag>}
                              {!on && c.kind === "free" && <Tag>Gmail-type</Tag>}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {n.withoutEmail.length > 0 && (
                      <ul className="rdl-tn-won" aria-label="Winners that gave no email">
                        {n.withoutEmail.map((w) => (
                          <li key={w.name}>
                            <b>{w.name}</b>
                            <span>won, but gave no email{w.phone ? ` · ${w.phone}` : ""}</span>
                            {w.website
                              ? <a href={w.website} target="_blank" rel="noreferrer noopener">their website</a>
                              : <a href={lookUp(w.name)} target="_blank" rel="noreferrer noopener" title="Opens a web search in a new tab">Look them up</a>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {anyBuyer && <p className="rdl-find-msg">A buyer's address is published so that suppliers can ask about that notice. Use it for that, not as a mailing list: it is not ticked for you.</p>}

            {notices.some((n) => n.contacts.length > 0) && (
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
