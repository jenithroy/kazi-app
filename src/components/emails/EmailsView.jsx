/**
 * The Contact Finder's list: the team's email addresses, for email marketing. Four short tiles count it (addresses, on the brand's own domain,
 * marked do-not-email, added this week); under them one table with a search and the Filters button (type, own domain, do-not-email, social
 * links, the day found), whose rows open that address's card. the page's "Find emails" (in the header, with Sources) runs the finder on the sources the person chose (lib/contactRun.js) and
 * the table's panel above it (RunPanel) shows it working, company by company; "Add by hand" opens one website or the tender notices to look at
 * yourself (FindDialog); "Download CSV" saves the list for an email tool. Where an address came from is said in its row (a Reddit post, a tender
 * notice, or the website it was read from), and the brand's social links, which its own website gave, in the Social column.
 *
 * What the download leaves out, said every time it is made: an address marked do-not-email (always), and a Gmail-type address unless the
 * switch beside the button includes them (such an address is often a person, not a company). Each row of the file says where the address
 * was found and when, so the team can show where it came from.
 */
import { useMemo, useRef, useState } from "react";
import { Icons, cn } from "../ui";
import { BentoGrid, EmptyNote, Tile } from "../bento/Bento";
import DataTable, { TwoLine } from "../table/DataTable";
import { FindBar } from "../filters/FilterMenu";
import useFilters from "../filters/useFilters";
import EmailCard from "./EmailCard";
import FindDialog from "./FindDialog";
import RunPanel, { SocialChips } from "./RunPanel";
import { Kpi, ico } from "../reddit/Common";
import { kathmanduDate } from "../../utils/date";
import { NONE, domainOf, downloadCsv, emailStats, emailsCsv, kindLabel, kindOf, num, plural, searchEmails, socialLinks, timeAgo } from "../../lib/redditLeads";
import { fetchLeadEmails } from "../../lib/redditReads";
import { removeEmail, updateEmail } from "../../lib/redditWrites";

const fmtShort = (iso) => { const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
/** Where an address came from, in a word, for a row that is not from a Reddit post: "Find a Tender", or the website it was read from. */
const sourceName = (url) => { const host = domainOf(url); return host === "find-tender.service.gov.uk" ? "Find a Tender" : host; };
const dayFound = (e) => (e.foundAt && !Number.isNaN(Date.parse(e.foundAt)) ? kathmanduDate(e.foundAt) : "");
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dayText = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : DAY.format(d); };

export default function EmailsView({ emails, leads, loading, canEdit, today, now, run, onStopRun, onDismissRun, onSaveLeft, onPatchEmail, onDropEmail, onSavedEmails, notify, reload }) {
  const [query, setQuery] = useState("");
  const [card, setCard] = useState(null);                    // the open address's id
  const [adding, setAdding] = useState(false);               // the Add by hand dialog, open
  const [includeFree, setIncludeFree] = useState(false);

  const rows = emails || NONE;
  const stats = useMemo(() => emailStats(rows, now), [rows, now]);
  const known = useMemo(() => new Map(rows.map((e) => [e.email, e])), [rows]);
  const leadById = useMemo(() => new Map((leads || NONE).map((l) => [l.id, l])), [leads]);
  const searched = useMemo(() => searchEmails(rows, query), [rows, query]);

  const filterDefs = useMemo(() => [
    {
      id: "kind", label: "Type", kind: "chips", test: (e, v) => kindOf(e) === v,
      options: [{ value: "any", label: "All" }, { value: "role", label: "Company address" }, { value: "named", label: "Named" }, { value: "free", label: "Gmail-type" }],
    },
    {
      id: "may", label: "Can we email it?", kind: "chips", test: (e, v) => (v === "no") === Boolean(e.doNotEmail),
      options: [{ value: "any", label: "Any" }, { value: "yes", label: "Yes" }, { value: "no", label: "Do not email" }],
    },
    { id: "own", label: "On the brand's own domain", kind: "toggle", test: (e) => Boolean(e.sameDomain) },
    { id: "soc", label: "Has social links", kind: "toggle", test: (e) => Object.keys(e.socials || {}).length > 0 },
    { id: "found", label: "Found between", kind: "dates", get: dayFound, show: fmtShort, pill: "Found" },
  ], []);
  const tf = useFilters(filterDefs, searched);
  const list = tf.rows;
  const open = card ? rows.find((e) => e.id === card) || null : null;
  const narrowed = Boolean(query) || tf.count > 0;

  const downloading = useRef(false);                     // a second press in the same instant must not start a second read

  /**
   * The file is made from a fresh read of the list, not from what the page loaded minutes ago: an address a colleague marked do-not-email in
   * the meantime must not be in it. It holds the addresses that are on screen now (so a narrowed list downloads as narrowed); if the fresh
   * read fails nothing is downloaded, rather than a file that might be out of date.
   */
  async function download() {
    if (downloading.current) return;
    downloading.current = true;
    try {
      let fresh;
      try { fresh = await fetchLeadEmails(); } catch { notify("bad", "Couldn't read the list just now, so nothing was downloaded. Try again."); return; }
      const shown = new Set(list.map((e) => e.id));
      const out = emailsCsv(fresh.filter((e) => shown.has(e.id)), leads || NONE, { includeFree });
      if (out.count === 0) { notify("warn", "Nothing to download: every address shown is left out (do-not-email, or Gmail-type with the switch off)."); return; }
      downloadCsv(out.text, `email_list_${today}.csv`);
      const left = [out.skippedFlagged ? `${out.skippedFlagged} marked do-not-email` : "", out.skippedFree ? `${out.skippedFree} Gmail-type` : ""].filter(Boolean);
      notify("info", `Downloaded ${out.count} ${plural(out.count, "address", "addresses")}${left.length ? `. Left out: ${left.join(" and ")}.` : "."}`);
    } finally {
      downloading.current = false;
    }
  }

  async function saveCard(email, draft, base) {
    const res = await updateEmail(email, draft, base);
    if (res.ok) { if (res.row && res.row !== email) onPatchEmail(res.row); reload(); }
    return res;
  }

  async function remove(email) {
    const res = await removeEmail(email);
    if (res.ok) { onDropEmail(email.id); reload(); }
    return res;
  }

  const columns = useMemo(() => [
    {
      id: "email", label: "Address", grow: true, min: 220, max: 460, sort: (e) => e.email,
      render: (e, { dropped }) => (
        <TwoLine main={e.email} sub={[e.brand || domainOf(e.website), dropped.has("kind") ? kindLabel(kindOf(e)) : ""].filter(Boolean).join(" · ")} />
      ),
    },
    {
      id: "kind", label: "Type", width: 150, drop: 2, sort: (e) => kindOf(e),
      render: (e) => <span className={cn("kb-tag", kindOf(e) === "free" && "kb-tag--warn")}>{kindLabel(kindOf(e))}</span>,
    },
    {
      id: "found", label: "Found", width: 120, align: "end", drop: 3, sort: (e) => Date.parse(e.foundAt) || 0,
      render: (e) => <span className="dt-stack"><span className="dt-num">{timeAgo(e.foundAt, now)}</span><small>{dayText(e.foundAt)}</small></span>,
    },
    {
      id: "soc", label: "Social", width: 150, drop: 5,
      render: (e) => (socialLinks(e).length ? <SocialChips socials={e.socials} className="rdl-soc dt-act" /> : <span className="dt-dim">—</span>),
    },
    {
      id: "from", label: "From", width: 200, drop: 4,
      render: (e) => {
        const l = leadById.get(e.leadId);
        if (l) return <span className="dt-two-t"><b title={l.title}>{l.title}</b><span>r/{l.subreddit}</span></span>;
        const from = sourceName(e.sourceUrl);
        return <span className={from ? undefined : "dt-dim"}>{from || "Added by hand"}</span>;
      },
    },
    {
      id: "may", label: "Email it?", width: 112, drop: 1,
      render: (e) => (e.doNotEmail ? <span className="kb-tag kb-tag--bad">Do not email</span> : <span className="dt-dim">Yes</span>),
    },
  ], [leadById, now]);

  return (
    <>
      <BentoGrid layout="rdl">
        <Kpi area="k1" title="Addresses" icon={<Icons.Send {...ico} />} loading={loading} value={num(stats.total)} sub="on the list" />
        <Kpi area="k2" title="Own domain" icon={<Icons.Check {...ico} />} loading={loading} value={num(stats.own)} sub="on the brand's own site" />
        <Kpi area="k3" title="Do not email" icon={<Icons.Alert {...ico} />} tone={stats.flagged > 0 ? "amber" : "default"} loading={loading} value={num(stats.flagged)} sub="never in the download" />
        <Kpi area="k4" title="This week" icon={<Icons.Plus {...ico} />} loading={loading} value={num(stats.week)} sub="found in the last 7 days" />

        <Tile
          area="main" title="Email list" icon={<Icons.Send {...ico} />} align="top" className="rdl-pane"
          note={loading ? undefined : narrowed ? `${num(list.length)} of ${num(rows.length)}` : `${num(rows.length)} ${plural(rows.length, "address", "addresses")}`}
        >
          <div className="rdl-tools fn-barrow">
            <FindBar filters={tf} value={query} onChange={setQuery} placeholder="Search addresses" label="Search addresses by email, brand, website or note" />
            <span className="rdl-tools-r">
              <button type="button" className="kb-btn kb-btn--ghost" onClick={() => setAdding(true)} disabled={!canEdit}><Icons.Plus size={13} sw={1.9} aria-hidden="true" /> Add by hand</button>
              <button
                type="button" className={cn("kb-btn kb-btn--ghost rdl-toggle", includeFree && "is-on")} aria-pressed={includeFree} onClick={() => setIncludeFree((v) => !v)}
                title="Gmail-type addresses are often a person, not a company"
              >
                {includeFree ? "Gmail-type: included" : "Gmail-type: left out"}
              </button>
              <button type="button" className="kb-btn kb-btn--ghost" onClick={download} disabled={list.length === 0}><Icons.Download size={13} sw={1.9} aria-hidden="true" /> Download CSV</button>
            </span>
          </div>

          <RunPanel run={run} canEdit={canEdit} onStop={onStopRun} onDismiss={onDismissRun} onSaveLeft={onSaveLeft} />

          {!loading && list.length === 0 ? (
            <div className="dt-empty">
              <EmptyNote icon={<Icons.Send size={22} sw={1.5} />}>
                {rows.length === 0
                  ? "No address saved yet. Press Find emails at the top (Sources chooses where it looks)."
                  : <>No addresses match. <button type="button" className="rdl-linkbtn" onClick={() => { setQuery(""); tf.clear(); }}>Show them all</button></>}
              </EmptyNote>
            </div>
          ) : (
            <DataTable
              label="Email list" rows={list} rowKey={(e) => e.id} columns={columns} defaultSort={null}
              onOpen={(e) => setCard(e.id)} rowLabel={(e) => `Open ${e.email}${e.doNotEmail ? ", do not email" : ""}`}
              activeKey={card || undefined} loading={loading}
            />
          )}
        </Tile>
      </BentoGrid>

      {open && (
        <EmailCard
          key={open.id} email={open} lead={leadById.get(open.leadId) || null} canEdit={canEdit}
          onSave={(draft, base) => saveCard(open, draft, base)} onRemove={() => remove(open)}
          onClose={() => setCard((cur) => (cur === open.id ? null : cur))}
        />
      )}
      {adding && <FindDialog known={known} canEdit={canEdit} onSaved={onSavedEmails} onClose={() => setAdding(false)} />}
    </>
  );
}
