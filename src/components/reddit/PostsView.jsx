/**
 * Reddit Leads, Posts: the Reddit posts that look like somebody needing a manufacturer. Four short tiles count them (new, the last day's,
 * being followed up, customers); under them one table with a search and the Filters button (status, subreddit, how strong a match, a
 * website or an email saved, notes, the day it was posted), whose rows open that post's card (what they wrote, a link to read it on Reddit,
 * its status, the brand and website, notes, the email finder, and "Add as customer").
 *
 * A post is read-only apart from what the team writes on it (the database lets nothing else change), and is never deleted: "Not a fit" puts
 * one away. The spreadsheet download is what the table shows.
 */
import { useMemo, useRef, useState } from "react";
import { Icons } from "../ui";
import { BentoGrid, EmptyNote, Tile } from "../bento/Bento";
import DataTable, { TwoLine } from "../table/DataTable";
import { FindBar } from "../filters/FilterMenu";
import useFilters from "../filters/useFilters";
import LeadCard from "./LeadCard";
import { Kpi, ico } from "./Common";
import { kathmanduDate } from "../../utils/date";
import {
  NONE, STATUSES, downloadCsv, emailsByLead, leadStats, leadStatus, leadsCsv, matchTier, num, plural, searchLeads, statusCounts, statusMeta, timeAgo,
} from "../../lib/redditLeads";
import { addAsCustomer, linkCustomer, saveLead } from "../../lib/redditWrites";
import { fetchLeadEmails } from "../../lib/redditReads";

const has = (v) => Boolean(String(v ?? "").trim());
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : DAY.format(d); };
const dayPosted = (l) => (l.postedAt && !Number.isNaN(Date.parse(l.postedAt)) ? kathmanduDate(l.postedAt) : "");
const fmtShort = (iso) => { const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };

export default function PostsView({ leads, emails, loading, canEdit, canAddCustomer, today, now, settings, checking, onCheck, onPatchLead, onSavedEmails, notify, reload }) {
  const [query, setQuery] = useState("");
  const [card, setCard] = useState(null);                    // the open post's id
  const adding = useRef(new Set());                      // the posts a customer is being made for right now
  const downloading = useRef(false);                     // a second press in the same instant must not start a second read
  const [made, setMade] = useState({});                      // post id -> the customer made from it whose link to the post could not be saved

  const rows = leads || NONE;
  const byLead = useMemo(() => emailsByLead(emails || NONE), [emails]);
  const known = useMemo(() => new Map((emails || NONE).map((e) => [e.email, e])), [emails]);
  const stats = useMemo(() => leadStats(rows, now), [rows, now]);
  const counts = useMemo(() => statusCounts(rows), [rows]);
  const searched = useMemo(() => searchLeads(rows, query), [rows, query]);

  const filterDefs = useMemo(() => {
    const subs = new Set(rows.map((l) => l.subreddit).filter(Boolean));
    return [
      {
        id: "status", label: "Status", kind: "chips", test: (l, v) => leadStatus(l) === v,
        options: [{ value: "all", label: "All" }, ...STATUSES.map((s) => ({ value: s.id, label: s.label, tone: s.id === "new" && counts.new > 0 ? "warn" : undefined }))],
      },
      ...(subs.size > 1 ? [{ id: "sub", label: "Subreddit", kind: "select", of: (l) => l.subreddit, nameOf: (v) => `r/${v}`, any: "Any subreddit", none: "No subreddit" }] : []),
      {
        id: "match", label: "How strong a match", kind: "chips", test: (l, v) => matchTier(l.score).id === v,
        options: [{ value: "any", label: "Any" }, { value: "strong", label: "Strong" }, { value: "likely", label: "Likely" }, { value: "maybe", label: "Maybe" }],
      },
      { id: "posted", label: "Posted between", kind: "dates", get: dayPosted, show: fmtShort, pill: "Posted" },
      { id: "site", label: "Has a website", kind: "toggle", test: (l) => has(l.website) },
      { id: "mail", label: "Has an email saved", kind: "toggle", test: (l) => (byLead.get(l.id) || NONE).length > 0 },
      { id: "note", label: "Has a note", kind: "toggle", test: (l) => has(l.notes) },
    ];
  }, [rows, counts, byLead]);
  const tf = useFilters(filterDefs, searched);
  const list = tf.rows;
  const open = card ? rows.find((l) => l.id === card) || null : null;
  const narrowed = Boolean(query) || tf.count > 0;

  /**
   * The file's "Best email" column is made from a fresh read of the email list, not from what the page loaded minutes ago: it must not offer
   * an address a colleague has marked do-not-email since. If the fresh read fails nothing is downloaded, rather than a file that might be
   * out of date (the same rule as the email list's own download).
   */
  async function exportCsv() {
    if (list.length === 0 || downloading.current) return;
    downloading.current = true;
    try {
      let fresh;
      try { fresh = await fetchLeadEmails(); } catch { notify("bad", "Couldn't read the email list just now, so nothing was downloaded. Try again."); return; }
      const { text } = leadsCsv(list, fresh);
      downloadCsv(text, `reddit_posts_${today}.csv`);
    } finally {
      downloading.current = false;
    }
  }

  async function saveStatusEtc(lead, draft, base) {
    const res = await saveLead(lead, draft, base);
    if (res.ok) { if (res.row && res.row !== lead) onPatchLead(res.row); reload(); }
    return res;
  }

  async function addCustomer(lead) {
    // A card guards against a second press, but a card closed while this was on its way and opened again is a new card with a new guard: its
    // press would find no customer yet and make another. One at a time per post, whichever card asks.
    if (adding.current.has(lead.id)) return { ok: false, message: "Still adding this customer. Give it a moment." };
    adding.current.add(lead.id);
    try {
      return await makeCustomer(lead);
    } finally {
      adding.current.delete(lead.id);
    }
  }

  async function makeCustomer(lead) {
    const earlier = made[lead.id];                 // a customer was already made for this post: only the link is left to do
    const res = earlier ? await linkCustomer(lead, earlier) : await addAsCustomer(lead, byLead.get(lead.id) || NONE);
    if (res.ok) {
      setMade((m) => Object.fromEntries(Object.entries(m).filter(([id]) => id !== lead.id)));
      if (res.row) onPatchLead(res.row);
      notify("info", earlier || res.reused ? `Linked “${lead.brand || "the post"}” to the customer already made from it.` : `Created customer “${lead.brand}” in Kazi ERP.`);
      reload();
    } else if (res.partial) {
      if (res.customerId) setMade((m) => ({ ...m, [lead.id]: res.customerId }));
      reload();
    }
    return res;
  }

  const columns = useMemo(() => [
    {
      id: "post", label: "Post", grow: true, min: 220, max: 520, sort: (l) => l.title.toLowerCase(),
      render: (l, { dropped }) => (
        <TwoLine
          main={l.title}
          sub={[`r/${l.subreddit}`, dropped.has("posted") ? timeAgo(l.postedAt, now) : "", l.excerpt].filter(Boolean).join(" · ")}
        />
      ),
    },
    {
      id: "match", label: "Match", width: 92, drop: 3, sort: (l) => l.score,
      render: (l) => { const t = matchTier(l.score); return <span className={`kb-tag${t.tone ? ` kb-tag--${t.tone}` : ""}`} title={l.hits?.join(", ")}>{t.label}</span>; },
    },
    {
      id: "posted", label: "Posted", width: 122, align: "end", drop: 2, sort: (l) => Date.parse(l.postedAt) || 0,
      render: (l) => <span className="dt-stack"><span className="dt-num">{timeAgo(l.postedAt, now)}</span><small>{when(l.postedAt)}</small></span>,
    },
    {
      id: "status", label: "Status", width: 112, drop: 1,
      render: (l) => { const s = statusMeta(leadStatus(l)); return <span className={`kb-tag${s.tone ? ` kb-tag--${s.tone}` : ""}`}>{s.label}</span>; },
    },
    {
      id: "emails", label: "Emails", width: 84, align: "end", drop: 4, sort: (l) => (byLead.get(l.id) || NONE).length,
      render: (l) => { const n = (byLead.get(l.id) || NONE).length; return n ? <span className="dt-num">{n}</span> : <span className="dt-dim">—</span>; },
    },
  ], [byLead, now]);

  const neverChecked = !settings?.lastCheckedAt;

  return (
    <>
      <BentoGrid layout="rdl">
        <Kpi area="k1" title="New" icon={<Icons.Alert {...ico} />} tone={stats.fresh > 0 ? "amber" : "default"} loading={loading} value={num(stats.fresh)} sub={stats.fresh > 0 ? "not contacted yet" : "everyone has been looked at"} />
        <Kpi area="k2" title="Last 24 hours" icon={<Icons.Search {...ico} />} loading={loading} value={num(stats.lastDay)} sub={`${plural(stats.lastDay, "post")} that look like leads`} />
        <Kpi area="k3" title="Following up" icon={<Icons.Message {...ico} />} loading={loading} value={num(stats.following)} sub="contacted or replied" />
        <Kpi area="k4" title="Customers" icon={<Icons.Check {...ico} />} loading={loading} value={num(stats.customers)} sub="came from Reddit" />

        <Tile
          area="main" title="Posts" icon={<Icons.Users {...ico} />} align="top" className="rdl-pane"
          note={loading ? undefined : narrowed ? `${num(list.length)} of ${num(counts.all)}` : `${num(counts.all)} ${plural(counts.all, "post")}`}
        >
          <div className="rdl-tools fn-barrow">
            <FindBar filters={tf} value={query} onChange={setQuery} placeholder="Search posts" label="Search posts by title, text, subreddit, brand or notes" />
            <span className="rdl-tools-r">
              <button type="button" className="kb-btn kb-btn--ghost" onClick={exportCsv} disabled={list.length === 0}><Icons.Download size={13} sw={1.9} aria-hidden="true" /> Download CSV</button>
            </span>
          </div>

          {!loading && list.length === 0 ? (
            <div className="dt-empty">
              <EmptyNote icon={<Icons.Search size={22} sw={1.5} />}>
                {rows.length === 0
                  ? (neverChecked ? "The first check has not run yet. Press Check now to read the subreddits." : "No post has matched yet. Posts appear here as soon as one looks like somebody needing a manufacturer.")
                  : <>No posts match. <button type="button" className="rdl-linkbtn" onClick={() => { setQuery(""); tf.clear(); }}>Show them all</button></>}
              </EmptyNote>
              {rows.length === 0 && canEdit && (
                <div className="rdl-empty-act"><button type="button" className="kb-btn kb-btn--primary" onClick={onCheck} disabled={checking}><Icons.RefreshCw size={13} sw={2} className={checking ? "kspin" : ""} aria-hidden="true" /> {checking ? "Checking…" : "Check now"}</button></div>
              )}
            </div>
          ) : (
            <DataTable
              label="Reddit posts" rows={list} rowKey={(l) => l.id} columns={columns} defaultSort={null}
              onOpen={(l) => setCard(l.id)} rowLabel={(l) => `Open ${l.title}, ${statusMeta(leadStatus(l)).label}`}
              activeKey={card || undefined} loading={loading}
            />
          )}
        </Tile>
      </BentoGrid>

      {open && (
        <LeadCard
          key={open.id} lead={open} saved={byLead.get(open.id) || NONE} known={known}
          canEdit={canEdit} canAddCustomer={canAddCustomer} customerMade={Boolean(made[open.id])}
          onSave={(draft, base) => saveStatusEtc(open, draft, base)} onAddCustomer={() => addCustomer(open)} onSavedEmails={onSavedEmails}
          onClose={() => setCard((cur) => (cur === open.id ? null : cur))}
        />
      )}
    </>
  );
}
