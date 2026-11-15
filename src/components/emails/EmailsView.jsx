/**
 * The Contact Finder's list: the team's email addresses, for email marketing. Four short tiles count it (addresses, on the brand's own domain,
 * marked do-not-email, added this week); under them one table with a search and the Filters button (type, own domain, do-not-email, social
 * links, the day found). A row is a link to the page the address was found on (a new tab); in the row, a button copies the address, a pencil
 * opens its card (note, do-not-email, remove), and the Contacted tick, shared by the whole team, says "we have already written to this one".
 * The page's "Find emails" (in the header, with Sources) runs the finder on the sources the person chose (lib/contactRun.js) and
 * the table's panel above it (RunPanel) shows it working, company by company; "Add by hand" opens one website or the tender notices to look at
 * yourself (FindDialog); "Download CSV" saves the list for an email tool. Where an address came from is said in its row (a Reddit post, a tender
 * notice, or the website it was read from), and the brand's social links, which its own website gave, in the Social column.
 *
 * What the download leaves out, said every time it is made: an address marked do-not-email (always), and a Gmail-type address unless the
 * switch beside the button includes them (such an address is often a person, not a company). Each row of the file says where the address
 * was found and when, so the team can show where it came from.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { markContacted, removeEmail, updateEmail } from "../../lib/redditWrites";

/** Copy text to the clipboard: the modern way where the page may use it, else the old way (a page not served over https, an old browser). */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* the old way, below */ }
  const back = document.activeElement;
  try {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
    document.body.appendChild(box);
    box.select();
    const done = document.execCommand("copy");
    box.remove();
    return done;
  } catch {
    return false;
  } finally {
    back?.focus?.({ preventScroll: true });             // the old way moves the cursor into a box: put it back where it was
  }
}
/** A web address a browser may open, or "" (never a javascript: or data: link, whatever was saved). */
const webUrl = (u) => { try { const x = new URL(String(u || "")); return x.protocol === "http:" || x.protocol === "https:" ? x.href : ""; } catch { return ""; } };
const shortDay = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };

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
  const [copied, setCopied] = useState(null);                // the id of the address just copied: its button shows a tick for a moment
  const copyTimer = useRef(0);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const rows = emails || NONE;
  // The latest rows, for a tick whose save ends after another change; and the addresses whose tick is being saved (a second press waits for it).
  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; });
  const ticking = useRef(new Set());
  // Before migration 0072 is applied the list has no Contacted field at all: the ticks are then shown but cannot be pressed (and say why).
  const hasTick = rows.length === 0 || rows.some((e) => "contactedAt" in e);
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

  const copy = useCallback(async (e) => {
    if (!(await copyText(e.email))) { notify("bad", `Couldn't copy. Select ${e.email} and copy it by hand.`); return; }
    clearTimeout(copyTimer.current);
    setCopied(e.id);
    copyTimer.current = setTimeout(() => setCopied(null), 1600);
  }, [notify]);

  /** Tick or untick "contacted". Shown at once; the saved row replaces it, and if the save fails the old state comes back with the reason. */
  const tick = useCallback(async (e) => {
    if (ticking.current.has(e.id)) return;
    const latest = rowsRef.current.find((x) => x.id === e.id) || e;
    const was = latest.contactedAt || null;
    const want = !was;
    ticking.current.add(e.id);
    onPatchEmail({ ...latest, contactedAt: want ? new Date().toISOString() : null });
    try {
      const res = await markContacted(latest, want);
      if (res.ok) { if (res.row) onPatchEmail(res.row); return; }
      if (res.gone) onDropEmail(e.id);
      else onPatchEmail({ ...(rowsRef.current.find((x) => x.id === e.id) || latest), contactedAt: was });
      notify("bad", res.message);
    } finally {
      ticking.current.delete(e.id);
    }
  }, [onPatchEmail, onDropEmail, notify]);

  /** The page an address was found on; else the Reddit post that led to it; else the brand's own website. "" when none is known. */
  const sourceHref = useCallback((e) => webUrl(e.sourceUrl) || webUrl(leadById.get(e.leadId)?.url) || webUrl(e.website), [leadById]);

  const columns = useMemo(() => {
    /** The Contacted tick: a checkbox. In its own column it shows the day beside the box; in front of the address (`lead`, a phone's list) it is the box alone. */
    const tickButton = (e, lead) => {
      const on = Boolean(e.contactedAt);
      const why = !hasTick ? "The database needs its update for this tick first (migration 0072). Ask whoever looks after the website."
        : !canEdit ? "You can look but not change this (Marketing is view-only for you)."
        : on ? `Contacted ${dayText(e.contactedAt)}. Press to undo.` : "Press when you have written to this address.";
      return (
        <button
          type="button" role="checkbox" aria-checked={on} disabled={!canEdit || !hasTick} onClick={() => tick(e)}
          className={cn("rdl-tick dt-act", lead && "rdl-tick--lead", on && "is-on")} aria-label={`Contacted: ${e.email}`} title={why}
        >
          <span className="rdl-tick-box" aria-hidden="true">{on && <Icons.Check size={13} sw={2.6} />}</span>
          {on && !lead && <span className="rdl-tick-t">{shortDay(e.contactedAt)}</span>}
        </button>
      );
    };

    return [
    {
      id: "email", label: "Address", grow: true, min: 220, max: 460, sort: (e) => e.email,
      render: (e, { dropped }) => {
        // a phone's list has no Contacted column: the tick comes in front of the address and the day goes on the quiet line
        const tickHere = dropped.has("done");
        const about = [
          tickHere && e.contactedAt ? `Contacted ${shortDay(e.contactedAt)}` : "",
          e.brand || domainOf(e.website), dropped.has("kind") ? kindLabel(kindOf(e)) : "",
        ].filter(Boolean).join(" · ");
        const gotIt = copied === e.id;
        return (
          <span className="rdl-addr">
            {tickHere && tickButton(e, true)}
            <TwoLine
              main={e.email}
              sub={e.doNotEmail ? <><span className="kb-tag kb-tag--bad rdl-dne">Do not email</span>{about ? ` ${about}` : ""}</> : about}
            />
            <button
              type="button" className={cn("rdl-iconbtn dt-act", gotIt && "is-done")} onClick={() => copy(e)}
              aria-label={`Copy ${e.email}`} title={gotIt ? "Copied" : "Copy the address"}
            >
              {gotIt ? <Icons.Check size={14} sw={2.2} aria-hidden="true" /> : <Icons.Copy size={14} sw={1.8} aria-hidden="true" />}
            </button>
            <button
              type="button" className="rdl-iconbtn dt-act" onClick={() => setCard(e.id)}
              aria-label={`Open the card of ${e.email}`} title="Note, do not email, remove"
            >
              <Icons.Edit size={14} sw={1.8} aria-hidden="true" />
            </button>
          </span>
        );
      },
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
        // the row itself leads to the page the address was read on; the post that led to it has its own link, here
        if (l) {
          return (
            <span className="dt-two-t">
              <a className="rdl-from dt-act" href={l.url} target="_blank" rel="noopener noreferrer" title="Open the Reddit post">{l.title}</a>
              <span>r/{l.subreddit}</span>
            </span>
          );
        }
        const from = sourceName(e.sourceUrl);
        return <span className={from ? undefined : "dt-dim"}>{from || "Added by hand"}</span>;
      },
    },
    {
      // Press it when somebody has written to this address; press again to undo. Sorted, the ones not yet written to come first (then the oldest tick).
      // A phone's list has no room for a column: the address cell carries the tick (`dropCompact`).
      id: "done", label: "Contacted", width: 100, dropCompact: true, sort: (e) => (e.contactedAt ? Date.parse(e.contactedAt) || 0 : -1),
      render: (e) => tickButton(e, false),
    },
    ];
  }, [leadById, now, copied, canEdit, hasTick, copy, tick]);

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
              rowHref={sourceHref}
              rowLabel={(e) => (webUrl(e.sourceUrl) ? `Open the page ${e.email} was found on` : webUrl(leadById.get(e.leadId)?.url) ? `Open the Reddit post ${e.email} came from` : `Open the website of ${e.email}`)}
              activeKey={card || undefined} loading={loading}
            />
          )}
          <span className="rdl-sr" role="status" aria-live="polite">{copied ? `Copied ${rows.find((e) => e.id === copied)?.email || "the address"}` : ""}</span>
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
