/**
 * Reddit Leads, Posts: the Reddit posts that look like somebody needing a manufacturer. Two short tiles count them (the last day's, the
 * last week's); under them one table with a search and the Filters button (subreddit, how strong a match, the day it was posted). A row is a
 * link: pressing it opens that post on Reddit in a new tab, where the team replies. There is no card to open and nothing to write on a post
 * from here: the status, brand, website, notes and "Add as customer" went with the card on 2026-11-14, and so did the Status column, the
 * "Following up" and "Customers" tiles and the status / website / email / note filters (what was saved on a post before stays in the
 * database and in the spreadsheet).
 *
 * The spreadsheet download is what the table shows.
 */
import { useMemo, useRef, useState } from "react";
import { Icons } from "../ui";
import { BentoGrid, EmptyNote, Tile } from "../bento/Bento";
import DataTable, { TwoLine } from "../table/DataTable";
import { FindBar } from "../filters/FilterMenu";
import useFilters from "../filters/useFilters";
import { Kpi, ico } from "./Common";
import { kathmanduDate } from "../../utils/date";
import { NONE, downloadCsv, emailsByLead, leadStats, leadsCsv, matchTier, num, plural, searchLeads, timeAgo } from "../../lib/redditLeads";
import { fetchLeadEmails } from "../../lib/redditReads";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : DAY.format(d); };
const dayPosted = (l) => (l.postedAt && !Number.isNaN(Date.parse(l.postedAt)) ? kathmanduDate(l.postedAt) : "");
const fmtShort = (iso) => { const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };

export default function PostsView({ leads, emails, loading, canEdit, today, now, settings, checking, onCheck, notify }) {
  const [query, setQuery] = useState("");
  const downloading = useRef(false);                     // a second press in the same instant must not start a second read

  const rows = leads || NONE;
  const byLead = useMemo(() => emailsByLead(emails || NONE), [emails]);
  const stats = useMemo(() => leadStats(rows, now), [rows, now]);
  const searched = useMemo(() => searchLeads(rows, query), [rows, query]);

  const filterDefs = useMemo(() => {
    const subs = new Set(rows.map((l) => l.subreddit).filter(Boolean));
    return [
      ...(subs.size > 1 ? [{ id: "sub", label: "Subreddit", kind: "select", of: (l) => l.subreddit, nameOf: (v) => `r/${v}`, any: "Any subreddit", none: "No subreddit" }] : []),
      {
        id: "match", label: "How strong a match", kind: "chips", test: (l, v) => matchTier(l.score).id === v,
        options: [{ value: "any", label: "Any" }, { value: "strong", label: "Strong" }, { value: "likely", label: "Likely" }, { value: "maybe", label: "Maybe" }],
      },
      { id: "posted", label: "Posted between", kind: "dates", get: dayPosted, show: fmtShort, pill: "Posted" },
    ];
  }, [rows]);
  const tf = useFilters(filterDefs, searched);
  const list = tf.rows;
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
      id: "emails", label: "Emails", width: 84, align: "end", drop: 4, sort: (l) => (byLead.get(l.id) || NONE).length,
      render: (l) => { const n = (byLead.get(l.id) || NONE).length; return n ? <span className="dt-num">{n}</span> : <span className="dt-dim">—</span>; },
    },
  ], [byLead, now]);

  const neverChecked = !settings?.lastCheckedAt;

  return (
    <BentoGrid layout="rdlp">
      <Kpi area="k1" title="Last 24 hours" icon={<Icons.Search {...ico} />} loading={loading} value={num(stats.lastDay)} sub={`${plural(stats.lastDay, "post")} that look like leads`} />
      <Kpi area="k2" title="Last 7 days" icon={<Icons.Calendar {...ico} />} loading={loading} value={num(stats.lastWeek)} sub={`${plural(stats.lastWeek, "post")} that look like leads`} />

      <Tile
        area="main" title="Posts" icon={<Icons.Users {...ico} />} align="top" className="rdl-pane"
        note={loading ? undefined : narrowed ? `${num(list.length)} of ${num(rows.length)}` : `${num(rows.length)} ${plural(rows.length, "post")}`}
      >
        <div className="rdl-tools fn-barrow">
          <FindBar filters={tf} value={query} onChange={setQuery} placeholder="Search posts" label="Search posts by title, text or subreddit" />
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
            rowHref={(l) => l.url} rowLabel={(l) => `Read ${l.title} on Reddit`} loading={loading}
          />
        )}
      </Tile>
    </BentoGrid>
  );
}
