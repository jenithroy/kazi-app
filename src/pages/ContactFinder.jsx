/**
 * Contact Finder, on the same frosted-glass bento frame as Meta Ads and Reddit Leads: one screen, no page scroll. Marketing menu, at
 * /marketing/contact-finder (it was the Email Finder at /marketing/email-finder, which forwards here).
 *
 * What it is for: the team's list of business email addresses, with each company's social links, for email marketing, and finding more of them.
 * "Find emails" does it by itself on the places the person chose in "Sources" (UK tenders, Reddit posts, a typed list, eBay store names, a web
 * search): each company's own website is worked out from its name, read for its addresses and its social links, and the addresses worth writing to
 * are saved. It shows its work on this page, company by company, above the list. The websites can be found and read from the person's own computer
 * (the finder program in scripts/email-finder) instead of the server. An address saved from a Reddit post's card lands here too. Nobody is
 * emailed from here: the list is downloaded for the email tool.
 *
 * This file is the frame: the header (the count, Sources, and the "?"), the notices, the data the list reads (the addresses, and the Reddit posts
 * only to say which post an address came from), and the join between the run (lib/contactRun.js, which outlives this page) and the list. The list
 * draws and writes its own parts (components/emails/); every rule and sum is in lib/redditLeads.js, lib/sources.js and lib/autoFind.js, and every
 * write in lib/redditWrites.js (the Reddit Leads page shares them: it counts a post's addresses).
 *
 * No permission of its own: whoever has the Marketing section can see it, and edit (find, change, remove) with Edit on Marketing. What the
 * finders read and what they refuse is in worker/lib/contactFinder.js, worker/lib/tenders.js and scripts/email-finder/README.md.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { kathmanduDate } from "../utils/date";
import { Icons } from "../components/ui";
import { BentoPage } from "../components/bento/Bento";
import { LoadError, Notice } from "../components/reddit/Common";
import EmailsView from "../components/emails/EmailsView";
import ContactHelpDialog from "../components/emails/ContactHelpDialog";
import SourcesDialog from "../components/emails/SourcesDialog";
import useMetaLoad from "../hooks/useMetaLoad";
import useContactRun from "../hooks/useContactRun";
import useLocalFinder, { setLocalFinder } from "../hooks/useLocalFinder";
import useSources, { setSources } from "../hooks/useSources";
import { dismissRun, isBusy, saveLeft, startRun, stopRun } from "../lib/contactRun";
import { activeSources, redditTargets } from "../lib/sources";
import { fetchLeadEmails, fetchRedditLeads } from "../lib/redditReads";
import { NONE, plural, tableMissing, num } from "../lib/redditLeads";
import "../components/reddit/reddit.css";

/** The addresses ARE the page (without them it is an error); the Reddit posts may fail without taking it down (an address then just says where it came from by its web address). */
async function loadAll() {
  const [e, l] = await Promise.allSettled([fetchLeadEmails(), fetchRedditLeads()]);
  if (e.status === "rejected") throw e.reason;
  return { emails: e.value || NONE, leads: l.status === "fulfilled" ? l.value || NONE : NONE };
}
const EMPTY = { emails: NONE, leads: NONE };
const NO_PATCH = { emails: {}, gone: [], added: [] };
const LOOK_AGAIN_MS = 5 * 60 * 1000;
const NOT_SET_UP = "The email list isn't set up in the database yet (migration 0064). Ask whoever looks after the database to run it.";

export default function ContactFinderPage() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "marketing");

  // the office's date and the clock, which move on without a reload
  const [today, setToday] = useState(() => kathmanduDate());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => { setToday(kathmanduDate()); setNow(Date.now()); }, 60000);
    return () => clearInterval(id);
  }, []);

  const core = useMetaLoad(loadAll, "", "", "Contact Finder");
  const { reload } = core;
  const { emails: readEmails, leads } = core.data || EMPTY;
  const loading = core.status === "loading";

  // What a save just changed, shown at once until the next read says the same. A fresh read replaces all of it.
  const [patches, setPatches] = useState(NO_PATCH);
  useEffect(() => { setPatches(NO_PATCH); }, [core.data]);
  const emails = useMemo(() => {
    const kept = readEmails.filter((e) => !patches.gone.includes(e.id)).map((e) => patches.emails[e.id] || e);
    const have = new Set(kept.map((e) => e.id));
    return [...patches.added.filter((e) => !have.has(e.id) && !patches.gone.includes(e.id)), ...kept];
  }, [readEmails, patches]);
  const onPatchEmail = useCallback((row) => setPatches((p) => ({ ...p, emails: { ...p.emails, [row.id]: row } })), []);
  const onDropEmail = useCallback((id) => setPatches((p) => ({ ...p, gone: [...p.gone, id] })), []);
  const addRows = useCallback((rows) => setPatches((p) => ({ ...p, added: [...rows, ...p.added] })), []);
  const onSavedEmails = useCallback((rows) => { addRows(rows); reload(); }, [addRows, reload]);

  // The run (lib/contactRun.js) outlives this page: what it has saved is shown here as it arrives, and the list is read afresh when it ends.
  const run = useContactRun();
  const busy = run.phase === "collecting" || run.phase === "running";
  const told = useRef(0);
  useEffect(() => {
    const n = run.saved.length;
    if (n < told.current) told.current = 0;                // a new run began
    if (n > told.current) { addRows(run.saved.slice(told.current)); told.current = n; }
  }, [run.saved, addRows]);
  const was = useRef(run.phase);
  useEffect(() => {
    const before = was.current;
    was.current = run.phase;
    if (run.phase === "done" && (before === "collecting" || before === "running")) reload();
  }, [run.phase, reload]);

  // look again every few minutes and when the tab is come back to, so an address a colleague saved shows without a reload
  const lastLook = useRef(Date.now());
  useEffect(() => { if (core.status === "ready") lastLook.current = Date.now(); }, [core.data, core.status]);
  useEffect(() => {
    const again = () => { if (document.visibilityState === "visible" && Date.now() - lastLook.current > 60000) { lastLook.current = Date.now(); reload(); } };
    const timer = setInterval(again, LOOK_AGAIN_MS);
    document.addEventListener("visibilitychange", again);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", again); };
  }, [reload]);

  const [notice, setNotice] = useState(null);                  // { tone, text }
  const notify = useCallback((tone, text) => setNotice(text ? { tone, text } : null), []);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sources] = useSources();
  const [local] = useLocalFinder();
  const redditCount = useMemo(() => redditTargets(leads, emails).length, [leads, emails]);

  function find() {
    if (isBusy()) return;
    if (activeSources(sources).length === 0) {
      notify("warn", "No source has anything to look at. Open Sources, switch one on (and type the list, if it needs one), then press Find emails.");
      setSourcesOpen(true);
      return;
    }
    notify("info", "");
    startRun({ config: sources, local, emails, leads });
  }

  const missing = core.status === "error" && tableMissing(core.error);
  return (
    <BentoPage className="rdl-page">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Contact Finder</h1>
          <p className="kb-head-sub">{loading ? <span>Loading…</span> : <span>{num(emails.length)} {plural(emails.length, "address", "addresses")} on the list</span>}</p>
        </div>
        <div className="kb-head-r">
          {/* two buttons in one wrapper: the phone header kit gives them a row of their own, in equal parts (bento.css) */}
          <div className="kb-head-act">
            <button type="button" className="kb-pillbtn" onClick={() => setSourcesOpen(true)}>
              <Icons.Settings size={13} sw={1.9} aria-hidden="true" /> Sources
            </button>
            <button type="button" className="kb-btn kb-btn--primary rdl-check" onClick={find} disabled={!canEdit || busy}>
              <Icons.Search size={13} sw={2} aria-hidden="true" /> {busy ? "Finding…" : "Find emails"}
            </button>
          </div>
          {/* the "?": a button of its own (not in the wrapper above), so the phone header kit puts it at the top right, beside the title */}
          <button type="button" className="kb-pillbtn kb-head-act rdl-help-btn" onClick={() => setHelpOpen(true)} aria-label="How this page works" aria-haspopup="dialog" title="How this page works">?</button>
        </div>
      </header>

      {!canEdit && <Notice tone="info">You can see the Contact Finder but not change it. Ask an admin for Edit on Marketing (Admin Panel → Roles).</Notice>}
      {core.stale && <Notice tone="warn" action={{ label: core.refreshing ? "Trying…" : "Try again", onClick: reload, disabled: core.refreshing }}>Could not refresh just now. This is what was loaded last.</Notice>}
      {notice && (
        <Notice tone={notice.tone === "bad" ? "bad" : notice.tone === "warn" ? "warn" : "info"} role={notice.tone === "info" ? "status" : "alert"} action={{ label: "Dismiss", onClick: () => setNotice(null) }}>{notice.text}</Notice>
      )}

      {core.status === "error"
        ? (missing
          ? <div className="kb-error" role="alert"><p>{NOT_SET_UP}</p></div>
          : <LoadError what="The email list" onRetry={reload} busy={core.refreshing} />)
        : <EmailsView
          emails={emails} leads={leads} loading={loading} canEdit={canEdit} today={today} now={now}
          run={run} onStopRun={stopRun} onDismissRun={dismissRun} onSaveLeft={saveLeft}
          onPatchEmail={onPatchEmail} onDropEmail={onDropEmail} onSavedEmails={onSavedEmails} notify={notify} reload={reload}
        />}

      {helpOpen && <ContactHelpDialog onClose={() => setHelpOpen(false)} />}
      {sourcesOpen && (
        <SourcesDialog
          sources={sources} local={local} redditCount={redditCount}
          onSave={(next, here) => { setSources(next); setLocalFinder(here); }} onClose={() => setSourcesOpen(false)}
        />
      )}
    </BentoPage>
  );
}
