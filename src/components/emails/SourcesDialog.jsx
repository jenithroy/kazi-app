/**
 * Sources: where "Find emails" looks, and how, in words the team can change without a developer. Each place to take companies from is a box with a
 * switch; the boxes that are on show what they need (a list to type, how far back to look). Under them, how the websites are read: whether a site's
 * robots.txt is respected, whether this computer does the work, and whether a person's own address is saved too.
 *
 * Kept in this browser (hooks/useSources.js), so each person has their own and nothing here needs a permission; running it does (Edit on Marketing).
 * A change applies to the next press of Find emails.
 */
import { useId, useState } from "react";
import Modal from "../Modal";
import { Field, Seg } from "../EditCard";
import { forgetTried } from "../../lib/contactRun";
import { MAX_COMPANIES } from "../../lib/autoFind";
import { MAX_SEARCHES, TRIED_DAYS, searchLines } from "../../lib/sources";
import { num, plural } from "../../lib/redditLeads";
import { useLocalStatus } from "../../hooks/useLocalFinder";

/** A switch with its name and a line about it. */
function Check({ id, checked, onChange, title, hint, disabled }) {
  return (
    <label className="rdl-find-local" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{title}{hint && <small>{hint}</small>}</span>
    </label>
  );
}

export default function SourcesDialog({ sources, local, redditCount, onSave, onClose }) {
  const id = useId();
  const [draft, setDraft] = useState(sources);
  const [here, setHere] = useState(local);                       // "Run on this computer"
  const [forgot, setForgot] = useState(false);
  const program = useLocalStatus(here);
  const set = (key, patch) => setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  const flag = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(sources) || here !== local;
  const searches = searchLines(draft.search.queries).length;

  function submit(e) {
    e.preventDefault();
    onSave(draft, here);
    onClose();
  }

  return (
    <Modal
      title="Sources" subtitle="Where Find emails looks, and how. Used from the next press on" size="lg" glass className="kmodal--reddit" onClose={onClose} onSubmit={submit}
      footer={(
        <>
          <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={!dirty}>Save</button>
        </>
      )}
    >
      <div className="rdl-src">
        <section className={`rdl-src-box${draft.tenders.on ? " is-on" : ""}`}>
          <Check
            id={`${id}-tenders`} checked={draft.tenders.on} onChange={(on) => set("tenders", { on })} title="UK tenders"
            hint="Companies that won public contracts about clothing, textiles and uniforms (Find a Tender, the government's own notices). Their websites are worked out from their names."
          />
          {draft.tenders.on && (
            <div className="rdl-src-fields">
              <Field label="Awarded in the last">
                <Seg value={String(draft.tenders.days)} onChange={(v) => set("tenders", { days: Number(v) })} label="How far back" options={[["7", "7 days"], ["14", "14 days"], ["30", "30 days"]]} />
              </Field>
              <Field label="Extra words (optional)" htmlFor={`${id}-words`} hint="Clothing and textile notices are always kept. Add other words to catch more, separated by commas.">
                <input id={`${id}-words`} type="text" autoComplete="off" spellCheck={false} placeholder="hoodies, scrubs, hi-vis" value={draft.tenders.words} onChange={(e) => set("tenders", { words: e.target.value })} />
              </Field>
            </div>
          )}
        </section>

        <section className={`rdl-src-box${draft.reddit.on ? " is-on" : ""}`}>
          <Check
            id={`${id}-reddit`} checked={draft.reddit.on} onChange={(on) => set("reddit", { on })} title="Reddit posts"
            hint={`The websites written on posts in Reddit Leads that have no address saved yet. Right now ${num(redditCount)} ${plural(redditCount, "post has", "posts have")} one.`}
          />
        </section>

        <section className={`rdl-src-box${draft.list.on ? " is-on" : ""}`}>
          <Check id={`${id}-list`} checked={draft.list.on} onChange={(on) => set("list", { on })} title="My list" hint="Companies or websites you type in, one on each line." />
          {draft.list.on && (
            <div className="rdl-src-fields">
              <Field label="Companies or websites" htmlFor={`${id}-list-text`} hint={`A website (brand.com), a company name (Hunter Apparel Solutions Ltd), or both on one line. Up to ${MAX_COMPANIES} in a run.`}>
                <textarea id={`${id}-list-text`} rows={5} spellCheck={false} value={draft.list.text} onChange={(e) => set("list", { text: e.target.value })} placeholder={"Sulis Silks, sulis.co.uk\nhunterapparelsolutions.com\nWM Sugden & Sons Ltd"} />
              </Field>
            </div>
          )}
        </section>

        <section className={`rdl-src-box${draft.ebay.on ? " is-on" : ""}`}>
          <Check
            id={`${id}-ebay`} checked={draft.ebay.on} onChange={(on) => set("ebay", { on })} title="eBay stores"
            hint="eBay's rules don't allow programs to read its pages, and it shows them a security check, so a store's own page is never opened. A store's name is looked up instead, as a company with a website of its own."
          />
          {draft.ebay.on && (
            <div className="rdl-src-fields">
              <Field label="Store links or names" htmlFor={`${id}-ebay-text`} hint="One on each line. The store's real company name finds its website best (Sulis Silks Ltd); a link gives only the short store name.">
                <textarea id={`${id}-ebay-text`} rows={4} spellCheck={false} value={draft.ebay.text} onChange={(e) => set("ebay", { text: e.target.value })} placeholder={"https://www.ebay.co.uk/str/sulissilks\nSulis Silks Ltd"} />
              </Field>
            </div>
          )}
        </section>

        <section className={`rdl-src-box${draft.search.on ? " is-on" : ""}`}>
          <Check
            id={`${id}-search`} checked={draft.search.on} onChange={(on) => set("search", { on })} title="Web search"
            hint="Finds the websites of businesses by searching Bing and DuckDuckGo in the browser on this computer, no key. Bing's rules ask programs not to use its search, so it is done slowly (one search every 8 seconds) and the program never tries to get past a check by itself. Needs the finder program running here (turn on Run on this computer)."
          />
          {draft.search.on && (
            <div className="rdl-src-fields">
              <Field label="What to search for" htmlFor={`${id}-search-text`} hint={`One search on each line, up to ${MAX_SEARCHES}. Directories, marketplaces, review sites and social networks are left out of the results. The searches are made a few seconds apart. ${searches ? `${searches} ${plural(searches, "search", "searches")} will be made.` : ""}`}>
                <textarea id={`${id}-search-text`} rows={3} spellCheck={false} value={draft.search.queries} onChange={(e) => set("search", { queries: e.target.value })} placeholder={"hoodie manufacturer UK\ncustom workwear supplier"} />
              </Field>
            </div>
          )}
        </section>

        <div className="rdl-src-how">
          <h3>How the websites are read</h3>
          <Check
            id={`${id}-robots`} checked={draft.robots} onChange={flag("robots")} title="Respect robots.txt"
            hint="A website can ask robots to keep out in a file called robots.txt. On, those sites are left alone. Off, they are read anyway (at most three pages each, one site at a time, under an honest name). eBay and the social networks' own pages are never opened either way."
          />
          <Check
            id={`${id}-here`} checked={here} onChange={setHere} title="Run on this computer"
            hint="The websites are found and read from this computer's own internet connection, and its browser reads any that show no address and does the searching (Bing, then DuckDuckGo), instead of the server doing it. Needs the finder program running here (the ? has the steps)."
          />
          {here && program.checked && (
            <p className={`rdl-find-msg${program.running ? " is-good" : ""}`} role="status">
              {program.running
                ? `The finder program is running on this computer (${program.browser || "a browser was found"})${program.search ? "." : ", but it is an older version that cannot search: close its window, update the folder and start it again."}`
                : "Can't reach the finder program on this computer. Either it isn't started (the ? has the steps; leave its window open), or this browser blocked the connection (if it asks whether this site may connect to apps on your computer, choose Allow). Until it answers, the server does the reading: it finds fewer addresses and can't use the Bing and DuckDuckGo searches."}
            </p>
          )}
          <Check
            id={`${id}-socials`} checked={draft.socials} onChange={flag("socials")} title="Look for Facebook and Instagram pages with a search"
            hint="For a company whose own website links none, the browser searches for its name and keeps the links to its Facebook and Instagram pages (the pages themselves are not opened). Search engines ask a person to prove they are one after a search or two, so this is slow and may ask you often. Needs Run on this computer."
          />
          <Check
            id={`${id}-window`} checked={draft.window} onChange={flag("window")} title="Let me answer a search engine's check"
            hint="If Bing or DuckDuckGo asks for a person to prove they are one, a window opens on this computer, once, for you to answer it. The program never tries to get past a check by itself. If nobody answers, it stops searching for the rest of that run."
          />
          <Check
            id={`${id}-people`} checked={draft.people} onChange={flag("people")} title="Also save a person's own address"
            hint="Off, only company addresses (sales@, info@, enquiries@) are saved by themselves; a named person's work address is left for you to choose. On, a named person's address on the company's own website is saved too."
          />
          <p className="rdl-src-forget">
            <button type="button" className="rdl-linkbtn" onClick={() => { forgetTried(); setForgot(true); }}>Look at the companies that gave nothing again</button>
            <small>{forgot ? "Done: the next run looks at them again." : `A company looked at with nothing found is left out for ${TRIED_DAYS} days.`}</small>
          </p>
        </div>
      </div>
    </Modal>
  );
}
