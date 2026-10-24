/**
 * The content calendar, on the same frosted-glass bento frame as the Dashboard, Production and Budget: one screen, no page scroll.
 *
 *   left    the month, each day showing the work planned on it (drag work from one day to another, or from the inbox onto a day)
 *   right   the day that is chosen (what is planned, and a button to add to it) over the ideas inbox
 *
 * Work is a row of `content_calendar`: an idea in the inbox, or something planned for a day. A card (the shared EditCard) opens
 * from any row or chip; nothing in it is saved until Save. The page keeps what is chosen (the month, the day, the open card) and
 * connects the pieces; the rules are in lib/contentCalendar.js, the reads in hooks/useContentCalendar.js and the writes, each of
 * which checks the database really did it, in lib/contentWrites.js.
 *
 * Meta Ads, which used to share this page behind a switch, is its own page now (pages/MetaAds.jsx); the top bar's Marketing menu
 * has the two.
 *
 * A search and one Filters button (components/filters) narrow what the month, the day pane and the ideas inbox draw and count: by
 * type of work, and by "no time set", "has notes" and "has a picture". What they hide is said in the header ("3 not shown"), so a day
 * that looks free because of a filter is never taken for a free day. Cards, moves and drags still look at all the work.
 *
 * A drag (mouse only: there is no dragging on a touch screen) shows the move at once and saves it; if the save fails the page looks
 * again, which puts the work back where it really is, and says so. The same move is available from a keyboard or a phone: the card's
 * Day field, and the button on an idea that puts it on the chosen day.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { kathmanduDate } from "../utils/date";
import { monthName, toISO } from "../lib/calendar";
import useMedia from "../hooks/useMedia";
import useContentCalendar from "../hooks/useContentCalendar";
import { BentoGrid, BentoPage, Tile } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import { FindBar } from "../components/filters/FilterMenu";
import useFilters from "../components/filters/useFilters";
import MonthGrid from "../components/marketing/MonthGrid";
import DayPane from "../components/marketing/DayPane";
import IdeasPane from "../components/marketing/IdeasPane";
import ItemCard from "../components/marketing/ItemCard";
import {
  TYPES, blankDraft, comingUp, countInMonth, groupByDate, inboxOf, monthCells, monthOf, monthTitle, payloadOf, sameMonth, shiftMonth, toItem,
} from "../lib/contentCalendar";
import { createItem, removeItem, scheduleItem, unscheduleItem, updateItem } from "../lib/contentWrites";
import "../components/marketing/marketing.css";

const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
const has = (v) => Boolean(String(v ?? "").trim());

/**
 * What the Filters button offers (components/filters). The work has one thing to choose between, its type; the three switches are for
 * tidying a plan: what has no time yet, what carries notes, what has a picture to look at.
 */
const FILTERS = [
  { id: "type", label: "Type of work", kind: "chips", test: (i, v) => i.type === v, options: [{ value: "any", label: "Any" }, ...TYPES.map((t) => ({ value: t, label: t }))] },
  { id: "notime", label: "Planned with no time", kind: "toggle", text: "No time set", pill: "No time set", test: (i) => i.placed && !has(i.timeSlot) },
  { id: "notes", label: "Has notes", kind: "toggle", test: (i) => has(i.notes) },
  { id: "picture", label: "Has a picture", kind: "toggle", test: (i) => has(i.mediaUrl) },
];

/**
 * /marketing is the calendar. Meta Ads used to be the same page behind a switch (/marketing?tab=meta-ads); an address, bookmark or
 * notification that still says so goes to the page it became, with the rest of its query (the section and the dates) kept.
 */
export default function Marketing() {
  const [params] = useSearchParams();
  const tab = params.get("tab");
  if (tab === "meta-ads" || tab === "meta_ads") {
    const rest = new URLSearchParams(params);
    rest.delete("tab");
    const query = rest.toString();
    return <Navigate to={`/marketing/meta-ads${query ? `?${query}` : ""}`} replace />;
  }
  return <ContentCalendar />;
}

function ContentCalendar() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "marketing");
  const phone = useMedia("(max-width: 768px)");
  const { rows, status, stale, reload, put, patch, drop } = useContentCalendar();
  const ready = status === "ready";

  // "today" is the office's date, and moves on at midnight without a reload
  const [today, setToday] = useState(() => kathmanduDate());
  useEffect(() => {
    const id = setInterval(() => setToday(kathmanduDate()), 60000);
    return () => clearInterval(id);
  }, []);

  const [month, setMonth] = useState(() => monthOf(kathmanduDate()));
  const [date, setDate] = useState(() => kathmanduDate());     // the day the right-hand pane is about
  const [panel, setPanel] = useState(null);                    // null, { id } (saved work), or { draft } (new work); `k` tells two new cards apart
  const [notice, setNotice] = useState("");                    // what the last move or add could not do
  const [drag, setDrag] = useState(null);                      // { id, placed } while a mouse is dragging work
  const [over, setOver] = useState(null);                      // the day (or "inbox") the drag is over
  const [retrying, setRetrying] = useState(false);
  const cards = useRef(0);
  const erased = useRef(new Set());                        // work this person deleted here (its card closing is then no surprise)

  /* ── what is on screen ─────────────────────────────────── */

  // `items` is all the work (a card, a move or a drag looks for its work here); `shown` is what the search and the Filters button leave,
  // and it is what the month, the day and the inbox draw and count
  const items = useMemo(() => rows.map(toItem), [rows]);
  const [query, setQuery] = useState("");
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => [i.title, i.type, i.timeSlot, i.notes].some((v) => String(v || "").toLowerCase().includes(q))) : items;
  }, [items, query]);
  const tf = useFilters(FILTERS, searched);
  const shown = tf.rows;
  const narrowed = Boolean(query.trim()) || tf.count > 0;
  const byDate = useMemo(() => groupByDate(shown), [shown]);
  const ideas = useMemo(() => inboxOf(shown), [shown]);
  const cells = useMemo(() => monthCells(month), [month]);
  const dayList = byDate.get(date) || [];
  const upcoming = useMemo(() => (dayList.length ? [] : comingUp(shown, date)), [shown, date, dayList.length]);
  const planned = useMemo(() => countInMonth(shown, month.y, month.m), [shown, month]);
  const label = monthTitle(month);

  const openRow = panel?.id ? items.find((i) => i.id === panel.id) || null : null;
  // work that is no longer there closes its card; if somebody ELSE deleted it, say so (whatever was typed in the card goes with it)
  useEffect(() => {
    if (!(panel?.id && ready && !openRow)) return;
    if (!erased.current.has(panel.id)) setNotice("That work was deleted by somebody else, so its card was closed and what was typed in it is gone.");
    setPanel(null);
  }, [panel, ready, openRow]);

  /* ── moving around ─────────────────────────────────────── */

  const go = useCallback((iso) => {
    setDate(iso);
    setMonth((cur) => { const m = monthOf(iso); return sameMonth(cur, m) ? cur : m; });
  }, []);
  const stepMonth = (by) => {
    const m = shiftMonth(month, by);
    setMonth(m);
    setDate(sameMonth(monthOf(today), m) ? today : toISO(m.y, m.m, 1));
  };
  const goToday = () => { setMonth(monthOf(today)); setDate(today); };

  const openItem = useCallback((id) => setPanel({ id }), []);
  const openNew = (iso) => setPanel({ draft: blankDraft(iso), k: ++cards.current });
  const retry = async () => { setRetrying(true); try { await reload(); } finally { setRetrying(false); } };

  /* ── writes (lib/contentWrites.js checks each one) ───────── */

  async function save(payload, id) {
    const res = id ? await updateItem(id, payload) : await createItem(payload);
    if (res.ok) {
      if (res.row) put(res.row);
      // new work, or work moved to another day: show the day it landed on
      if (payload.scheduledDate && (!id || payload.scheduledDate !== openRow?.date)) go(payload.scheduledDate);
      setNotice("");
      reload();
    } else if (res.reload) reload();
    return res;
  }

  async function erase(id) {
    const res = await removeItem(id);
    if (res.ok) { erased.current.add(id); drop(id); setNotice(""); }
    if (res.reload) reload();
    return res;
  }

  async function quickAdd(title) {
    const res = await createItem(payloadOf({ ...blankDraft(""), title }));
    if (!res.ok) { setNotice(res.message); return false; }
    if (res.row) put(res.row);
    setNotice("");
    reload();
    return true;
  }

  // A move shows at once; if it did not save, the work is put back where it was (here, not by the look that follows, which fails too
  // when the connection is what failed) and the page says so, then looks again to be sure.
  async function relocate(id, write, shown) {
    const was = rows.find((r) => r.id === id);
    patch(id, shown);
    const res = await write();
    if (res.ok) { if (res.row) put(res.row); setNotice(""); reload(); return; }
    if (was) patch(id, { status: was.status, scheduledDate: was.scheduledDate });
    setNotice(res.message);
    reload();
  }

  const moveTo = (id, iso) => {
    const now = items.find((i) => i.id === id);
    if (!now || (now.placed && now.date === iso)) return;
    relocate(id, () => scheduleItem(id, iso), { status: "scheduled", scheduledDate: iso });
  };
  const moveToInbox = (id) => {
    const now = items.find((i) => i.id === id);
    if (!now?.placed) return;
    relocate(id, () => unscheduleItem(id), { status: "inbox", scheduledDate: null });
  };

  const dragStart = useCallback((id, placed) => setDrag({ id, placed }), []);
  const dragEnd = useCallback(() => { setDrag(null); setOver(null); }, []);
  const dropOnDay = (iso) => { if (drag) { setDate(iso); moveTo(drag.id, iso); } dragEnd(); };
  const dropOnInbox = () => { if (drag) moveToInbox(drag.id); dragEnd(); };

  /* ── the page ──────────────────────────────────────────── */

  // what the search and filters hide is said here, so a day that looks free because of a filter is never taken for a free day
  const hidden = items.length - shown.length;
  const sub = ready ? (
    <>
      <span>{planned} planned in {monthName(month.m)}</span>
      <span>{ideas.length} {plural(ideas.length, "idea")} waiting</span>
      {hidden > 0 && <span>{hidden} not shown</span>}
    </>
  ) : status === "error" ? null : <span>Loading…</span>;

  const nav = (
    <>
      <button type="button" className="mk-nav" aria-label="Previous month" onClick={() => stepMonth(-1)}><Icons.ChevronLeft size={16} sw={2} /></button>
      <button type="button" className="mk-nav" aria-label="Next month" onClick={() => stepMonth(1)}><Icons.ChevronRight size={16} sw={2} /></button>
      {(date !== today || !sameMonth(month, monthOf(today))) && <button type="button" className="mk-pill" onClick={goToday}>Today</button>}
    </>
  );

  return (
    <BentoPage className="mk-page">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Content calendar</h1>
          <p className="kb-head-sub">{sub}</p>
        </div>
        <div className="kb-head-r">
          {canEdit && (
            <button type="button" className="kb-btn kb-btn--primary mk-newbtn kb-head-act" onClick={() => openNew("")}>
              <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> New idea
            </button>
          )}
        </div>
      </header>

      {status !== "error" && (
        <div className="mk-bar fn-barrow">
          <FindBar filters={tf} value={query} onChange={setQuery} placeholder="Search work" label="Search the planned work and ideas by title, type, time or notes" />
        </div>
      )}

      {ready && stale && (
        <div className="mk-banner" role="status">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>Could not refresh just now. This is what was loaded last.</span>
          <button type="button" onClick={retry} disabled={retrying}>{retrying ? "Trying…" : "Try again"}</button>
        </div>
      )}
      {notice && (
        <div className="mk-banner is-bad" role="alert">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>Dismiss</button>
        </div>
      )}

      {status === "error" ? (
        <div className="kb-error" role="alert">
          <p>The calendar could not load. Check your connection and try again.</p>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={retry} disabled={retrying}>{retrying ? "Trying…" : "Try again"}</button>
        </div>
      ) : (
        <BentoGrid layout="cal">
          <Tile area="cal" title={label} note={nav} icon={<Icons.Calendar size={14} sw={1.9} />} align="top" className="mk-cal">
            <MonthGrid
              cells={cells} byDate={byDate} today={today} date={date} label={label} canEdit={canEdit} phone={phone}
              onGo={go} onOpen={openItem} onAdd={(iso) => { setDate(iso); openNew(iso); }}
              drag={canEdit ? drag : null} over={over} onDragStart={dragStart} onDragEnd={dragEnd} onOver={setOver} onDropDay={dropOnDay}
            />
            <ul className="mk-legend" aria-label="Types of work">
              {TYPES.map((t) => <li key={t} className={`mk-t-${t.toLowerCase()}`}><i aria-hidden="true" /><span>{t}</span></li>)}
            </ul>
          </Tile>

          <DayPane
            date={date} today={today} list={dayList} upcoming={upcoming} canEdit={canEdit} loading={!ready} narrowed={narrowed}
            onOpen={openItem} onAdd={openNew} drag={drag} onDragStart={dragStart} onDragEnd={dragEnd}
          />
          <IdeasPane
            ideas={ideas} date={date} canEdit={canEdit} loading={!ready} narrowed={narrowed}
            onOpen={openItem} onQuickAdd={quickAdd} onSchedule={(id) => moveTo(id, date)}
            drag={drag} over={over} onOver={setOver} onDropHere={dropOnInbox} onDragStart={dragStart} onDragEnd={dragEnd}
          />
        </BentoGrid>
      )}

      {panel && (!panel.id || openRow) && (
        <ItemCard
          key={panel.id || `new${panel.k}`}
          item={openRow}
          draft={panel.draft}
          canEdit={canEdit}
          // closes only the card it belongs to: a save that finishes after another card has been opened must not close that one
          onClose={() => setPanel((cur) => (cur === panel ? null : cur))}
          onSave={save}
          onDelete={openRow ? () => erase(openRow.id) : undefined}
        />
      )}
    </BentoPage>
  );
}
