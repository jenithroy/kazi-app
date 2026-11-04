/**
 * Reddit Leads, on the same frosted-glass bento frame as Meta Ads and the Calendar: one screen, no page scroll. Marketing menu, at
 * /marketing/reddit-leads.
 *
 * What it is for: people on Reddit who say they are looking for a clothing manufacturer (or private label, or a first production run) are
 * leads. A check reads the subreddits on the team's list (every 30 minutes on the server, or "Check now"), keeps the posts that score as
 * somebody needing a maker, and adds them here. The team replies to them on Reddit, and, for the email marketing, can find a brand's public
 * contact address on its own website from the post's card. Those addresses go on the team's email list, which is the Contact Finder's page
 * (pages/ContactFinder.jsx): this page only counts a post's addresses. Nobody is emailed from here.
 *
 * (It used to hold the email list in a second tab, `?view=emails`; that address still works and forwards to the Contact Finder.)
 *
 * This file is the frame: the header (how the last check went, Settings, Check now), the notices, and the data the posts need (the posts, the
 * addresses saved for them, the settings). The posts view draws and writes its own parts (components/reddit/); every rule and sum is in
 * lib/redditLeads.js, every write in lib/redditWrites.js.
 *
 * No permission of its own: whoever has the Marketing section can see it, and edit (statuses, notes, the settings) with Edit
 * on Marketing. The server side, and what it does and does not touch, is worker/lib/redditLeads.js. Posts come from Arctic Shift, a free
 * archive of Reddit, which has no promise of uptime: the header says when the last check worked.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { kathmanduDate } from "../utils/date";
import { BentoPage } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import { LoadError, Notice } from "../components/reddit/Common";
import PostsView from "../components/reddit/PostsView";
import SettingsDialog from "../components/reddit/SettingsDialog";
import HelpDialog from "../components/reddit/HelpDialog";
import useMetaLoad from "../hooks/useMetaLoad";
import { fetchLeadEmails, fetchRedditLeads, fetchRedditSettings } from "../lib/redditReads";
import { NONE, NOT_SET_UP, checkLine, plural, tableMissing, timeAgo } from "../lib/redditLeads";
import { checkNow, saveSettings } from "../lib/redditWrites";
import "../components/reddit/reddit.css";

/**
 * The posts, the addresses saved for them and the settings. The posts ARE the page (without them it is an error); the other two may fail without
 * taking the page down, and what could not be read is said (`emailsLost`, `settingsLost`), because "No address saved" is not what an unread list means.
 */
async function loadAll() {
  const [l, e, s] = await Promise.allSettled([fetchRedditLeads(), fetchLeadEmails(), fetchRedditSettings()]);
  if (l.status === "rejected") throw l.reason;
  return {
    leads: l.value || NONE,
    emails: e.status === "fulfilled" ? e.value || NONE : NONE,
    settings: s.status === "fulfilled" ? s.value : null,
    emailsLost: e.status === "rejected",
    settingsLost: s.status === "rejected",
  };
}
const EMPTY = { leads: NONE, emails: NONE, settings: null, emailsLost: false, settingsLost: false };
const NO_PATCH = { leads: {}, added: [] };
const LOOK_AGAIN_MS = 5 * 60 * 1000;

/** The old `?view=emails` address now belongs to the Contact Finder. */
export default function RedditLeads() {
  const [params] = useSearchParams();
  if (params.get("view") === "emails") return <Navigate to="/marketing/contact-finder" replace />;
  return <RedditLeadsPage />;
}

function RedditLeadsPage() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "marketing");
  const canAddCustomer = sectionCanEdit(profile, "customers");

  // the office's date and the clock, which move on without a reload
  const [today, setToday] = useState(() => kathmanduDate());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => { setToday(kathmanduDate()); setNow(Date.now()); }, 60000);
    return () => clearInterval(id);
  }, []);

  const [tick, setTick] = useState(0);                         // goes up after a check, so everything is read again
  const core = useMetaLoad(loadAll, `${tick}`, "", "Reddit Leads");
  const { reload } = core;
  const { leads: readLeads, emails: readEmails, settings, emailsLost, settingsLost } = core.data || EMPTY;
  const loading = core.status === "loading";

  // What a save just changed, shown at once until the next read says the same. A fresh read replaces all of it.
  const [patches, setPatches] = useState(NO_PATCH);
  useEffect(() => { setPatches(NO_PATCH); }, [core.data]);
  const leads = useMemo(() => readLeads.map((l) => patches.leads[l.id] || l), [readLeads, patches.leads]);
  const emails = useMemo(() => {
    const have = new Set(readEmails.map((e) => e.id));
    return [...patches.added.filter((e) => !have.has(e.id)), ...readEmails];
  }, [readEmails, patches]);
  const onPatchLead = useCallback((row) => setPatches((p) => ({ ...p, leads: { ...p.leads, [row.id]: row } })), []);
  const onSavedEmails = useCallback((rows) => { setPatches((p) => ({ ...p, added: [...rows, ...p.added] })); reload(); }, [reload]);

  // look again every few minutes and when the tab is come back to, so a check that ran on the server shows without a reload
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
  const [checking, setChecking] = useState(false);
  const checkOnce = useRef(false);                             // a second press in the same instant must not start a second check
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  async function check() {
    if (checkOnce.current) return;
    checkOnce.current = true;
    setChecking(true);
    setNotice(null);
    const res = await checkNow();
    checkOnce.current = false;
    setChecking(false);
    if (!res.ok) { setNotice({ tone: "bad", text: res.message }); return; }
    const r = res.res;
    if (r.throttled) { setNotice({ tone: "info", text: "It was checked a moment ago. Give it a minute before checking again." }); return; }
    const said = r.subreddits === 0 ? "There are no subreddits on the list to read."
      : `Read ${r.subreddits} ${plural(r.subreddits, "subreddit")}: ${r.fetched} ${plural(r.fetched, "post")} looked at, ${r.saved} new ${plural(r.saved, "lead")} added.`;
    const lost = r.errors?.length ? ` Could not finish: ${r.errors.join("; ")}.` : "";
    const more = r.notes?.length ? ` ${r.notes.join("; ")}.` : "";
    setNotice({ tone: !r.ok ? "bad" : r.errors?.length || r.notes?.length ? "warn" : "info", text: said + lost + more });
    setTick((t) => t + 1);
  }

  async function saveWhatToLookFor(draft, base) {
    const res = await saveSettings(draft, base);
    if (res.ok) { setNotice({ tone: "info", text: "Saved. It applies from the next check." }); reload(); }
    return res;
  }

  const props = { leads, emails, loading, canEdit, canAddCustomer, today, now, settings, checking, onCheck: check, onPatchLead, onSavedEmails, notify, reload };
  const missing = core.status === "error" && tableMissing(core.error);
  const subs = settings?.subreddits?.length || 0;

  return (
    <BentoPage className="rdl-page">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Reddit Leads</h1>
          <p className="kb-head-sub">
            {loading ? <span>Loading…</span> : (
              <>
                <span>{settingsLost ? "Couldn't read the settings" : subs ? `${subs} ${plural(subs, "subreddit")}` : "No subreddits set"}</span>
                <span title={settings?.lastCheckedAt ? new Date(settings.lastCheckedAt).toLocaleString() : undefined}>{checking ? "Checking…" : settingsLost ? "" : checkLine(settings, now)}</span>
              </>
            )}
          </p>
        </div>
        <div className="kb-head-r">
          {/* two buttons in one wrapper: the phone header kit gives them a row of their own, in equal parts (bento.css) */}
          <div className="kb-head-act">
            <button type="button" className="kb-pillbtn" onClick={() => setSettingsOpen(true)} disabled={!settings}>
              <Icons.Settings size={13} sw={1.9} aria-hidden="true" /> What to look for
            </button>
            <button type="button" className="kb-btn kb-btn--primary rdl-check" onClick={check} disabled={checking || !canEdit}>
              <Icons.RefreshCw size={13} sw={2} className={checking ? "kspin" : ""} aria-hidden="true" /> {checking ? "Checking…" : "Check now"}
            </button>
          </div>
          {/* the "?": a button of its own (not in the wrapper above), so the phone header kit puts it at the top right, beside the title */}
          <button type="button" className="kb-pillbtn kb-head-act rdl-help-btn" onClick={() => setHelpOpen(true)} aria-label="How this page works" aria-haspopup="dialog" title="How this page works">?</button>
        </div>
      </header>

      {!canEdit && <Notice tone="info">You can see Reddit Leads but not change it. Ask an admin for Edit on Marketing (Admin Panel → Roles).</Notice>}
      {settings?.lastStatus === "failed" && (
        <Notice tone="bad" role="alert">The last check could not read Reddit{settings.lastError ? ` (${settings.lastError})` : ""}. It tries again every 30 minutes. The posts below are from earlier checks.</Notice>
      )}
      {settings?.lastStatus === "partial" && settings.lastError && (
        <Notice tone="warn">The last check could not read everything: {settings.lastError}</Notice>
      )}
      {settings?.lastCheckedAt && settings.lastStatus !== "failed" && now - Date.parse(settings.lastCheckedAt) > 3 * 3600 * 1000 && (
        <Notice tone="warn">The last check was {timeAgo(settings.lastCheckedAt, now)}. It should run every 30 minutes, so the server's schedule may not be running. Ask whoever looks after the website, or press Check now.</Notice>
      )}
      {emailsLost && <Notice tone="warn" action={{ label: "Try again", onClick: reload }}>The email list could not be read just now.</Notice>}
      {core.stale && <Notice tone="warn" action={{ label: core.refreshing ? "Trying…" : "Try again", onClick: reload, disabled: core.refreshing }}>Could not refresh just now. This is what was loaded last.</Notice>}
      {notice && (
        <Notice tone={notice.tone === "bad" ? "bad" : notice.tone === "warn" ? "warn" : "info"} role={notice.tone === "info" ? "status" : "alert"} action={{ label: "Dismiss", onClick: () => setNotice(null) }}>{notice.text}</Notice>
      )}

      {core.status === "error"
        ? (missing
          ? <div className="kb-error" role="alert"><p>{NOT_SET_UP}</p></div>
          : <LoadError what="Reddit Leads" onRetry={reload} busy={core.refreshing} />)
        : <PostsView {...props} />}

      {settingsOpen && settings && <SettingsDialog settings={settings} canEdit={canEdit} onSave={saveWhatToLookFor} onClose={() => setSettingsOpen(false)} />}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </BentoPage>
  );
}
