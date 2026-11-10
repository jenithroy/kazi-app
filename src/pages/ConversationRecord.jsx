import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import { Btn, Card, Icons, Pill, cn } from "../components/ui";
import { fetchCounts, fetchEvents, fetchSettings, fetchThread } from "../lib/commRecordReads";
import {
  PAGE_SIZE, ago, channelLabel, clock, consentWords, counterpartyName, dayLabel, groupByDay,
  mirrorState, sides, tableMissing, textOf, visibleChannels,
} from "../lib/commRecord";
import "./conversationRecord.css";

/**
 * Conversation Record: every work conversation the ERP has kept as text, newest first (the table comm_events, migrations 0068 and 0069).
 *
 * Read only, and meant to stay so: the rows are written by the database's own copy triggers and by the Worker, and nothing can edit or
 * delete one from the app (a person's messages are erased, on request, by an administrator). What is in the record today is the Instagram
 * lead chats; team chat joins when the staff papers are signed, and WhatsApp, calls and cameras as they are built (COMMS_AI_PLAN.md).
 *
 * Gated on the `comms_record` permission, which only the top tier has until the Admin Panel gives it to another position; the database
 * applies the same permission to every read here, so a position without it gets nothing even from this page's address.
 *
 * The rules and wording are in lib/commRecord.js, the reads in lib/commRecordReads.js; this file is the page.
 */

const num = (n) => Number(n || 0).toLocaleString("en-GB");

const DIRECTION = {
  in: { label: "Received", tone: "blue" },
  out: { label: "Sent", tone: "mint" },
  internal: { label: "Team", tone: "neutral" },
};

const explain = (e) => (tableMissing(e)
  ? "The conversation record isn't set up in the database yet (migrations 0068 and 0069). Ask whoever looks after the database to run them."
  : `Could not load the record. ${e?.message || ""}`.trim());

/** What a conversation is called at the top of its window. */
const threadTitle = (row) => (row.direction === "internal" ? row.detail?.thread_name || "Team chat" : counterpartyName(row));

export default function ConversationRecord() {
  const [channel, setChannel] = useState(null);       // null = everything
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");           // what was typed, once it has stopped changing
  const [events, setEvents] = useState([]);
  const [counts, setCounts] = useState(null);
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [thread, setThread] = useState(null);        // the row whose conversation is open
  const asked = useRef(0);                              // a reply to an old question is thrown away

  useEffect(() => {
    const id = setTimeout(() => setSearch(typed.trim()), 350);
    return () => clearTimeout(id);
  }, [typed]);

  const loadOverview = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([fetchCounts(), fetchSettings()]);
      setCounts(c);
      setSettings(s);
    } catch (e) {
      setError(explain(e));
    }
  }, []);

  const loadFirst = useCallback(async () => {
    const id = ++asked.current;
    setLoading(true);
    setError("");
    try {
      const rows = await fetchEvents({ channel, search });
      if (id !== asked.current) return;
      setEvents(rows);
      setDone(rows.length < PAGE_SIZE);
    } catch (e) {
      if (id === asked.current) setError(explain(e));
    } finally {
      if (id === asked.current) setLoading(false);
    }
  }, [channel, search]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadFirst(); }, [loadFirst]);

  async function showMore() {
    const id = asked.current;
    setLoadingMore(true);
    try {
      const rows = await fetchEvents({ channel, search, offset: events.length });
      if (id !== asked.current) return;
      setEvents((cur) => [...cur, ...rows]);
      setDone(rows.length < PAGE_SIZE);
    } catch (e) {
      if (id === asked.current) setError(explain(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;
  const { shown, hidden } = visibleChannels(counts, settings);
  const days = groupByDay(events);
  const filtered = !!channel || !!search;

  return (
    <div className="kcr">
      <PageHeader
        title="Conversation Record"
        description="Every work conversation the ERP has kept as text: who, when and through which door. Read only. Nothing here can be edited or deleted."
        action={(
          <Btn kind="ghost" size="sm" icon={<Icons.Clock size={14} />} onClick={() => { loadOverview(); loadFirst(); }}>
            Refresh
          </Btn>
        )}
      />

      {error && <div className="kcr-error" role="alert">{error}</div>}

      <div className="kcr-tiles" role="group" aria-label="Show a single channel">
        <button type="button" className={cn("kcr-tile", !channel && "is-picked")} aria-pressed={!channel} onClick={() => setChannel(null)}>
          <span className="kcr-tile-label">Everything</span>
          <span className="kcr-tile-n">{total == null ? "…" : num(total)}</span>
          <span className="kcr-tile-state">recorded so far</span>
        </button>
        {shown.map((c) => {
          const st = mirrorState(c.key, settings);
          const note = settings.find((s) => s.channel === c.key)?.note;
          return (
            <button
              key={c.key} type="button" title={note || undefined}
              className={cn("kcr-tile", channel === c.key && "is-picked")} aria-pressed={channel === c.key}
              onClick={() => setChannel(channel === c.key ? null : c.key)}
            >
              <span className="kcr-tile-label">{c.label}</span>
              <span className="kcr-tile-n">{counts ? num(counts[c.key]) : "…"}</span>
              <span className={cn("kcr-tile-state", st.on ? "is-live" : "is-off")}>{st.text}</span>
            </button>
          );
        })}
      </div>
      {hidden.length > 0 && (
        <p className="kcr-soon">Not connected yet: {hidden.map((c) => c.label).join(", ")}.</p>
      )}

      <div className="kcr-bar">
        <label className="kcr-search">
          <Icons.Search size={14} aria-hidden="true" />
          <input
            type="search" value={typed} onChange={(e) => setTyped(e.target.value)}
            placeholder="Search the words in messages…" aria-label="Search the words in messages"
          />
        </label>
        <p className="kcr-now">
          {loading ? "Loading…" : `${events.length}${done ? "" : "+"} ${events.length === 1 ? "message" : "messages"}${channel ? ` in ${channelLabel(channel)}` : ""}${search ? ` matching “${search}”` : ""}`}
        </p>
      </div>

      <Card title="Conversations" sub="Newest first. Open one to read the whole conversation.">
        {loading ? (
          <div className="kcr-empty">Loading the record…</div>
        ) : days.length === 0 ? (
          <div className="kcr-empty">
            {filtered ? "Nothing matches that." : "Nothing has been recorded yet."}
            {filtered && <> <button type="button" className="kcr-link" onClick={() => { setChannel(null); setTyped(""); }}>Clear the filters</button></>}
          </div>
        ) : (
          <>
            {days.map((g) => (
              <div key={g.key} className="kcr-day">
                <div className="kcr-day-h">{dayLabel(g.key)}</div>
                <ul className="kcr-events">
                  {g.items.map((e) => <EventRow key={e.id} e={e} onOpen={setThread} />)}
                </ul>
              </div>
            ))}
            {!done && (
              <div className="kcr-more">
                <Btn kind="ghost" size="sm" onClick={showMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Show older messages"}
                </Btn>
              </div>
            )}
          </>
        )}
      </Card>

      <p className="kcr-foot">
        Times are Kathmandu. The record only grows: a message is never edited or deleted here, and a person's messages are erased, when
        they ask, by an administrator. Messages marked “No consent recorded” were kept without telling the people involved, so they should
        stay out of the assistant and of any training until the privacy notice and the staff papers are in place.
      </p>

      {thread && <ThreadWindow row={thread} onClose={() => setThread(null)} />}
    </div>
  );
}

/* ── One message in the list ───────────────────────────── */
function EventRow({ e, onOpen }) {
  const who = sides(e);
  const body = textOf(e);
  const dir = DIRECTION[e.direction] || DIRECTION.internal;
  const consent = consentWords(e.consent);
  const when = ago(e.occurred_at);
  const canOpen = !!e.thread_ref;
  const inner = (
    <>
      <span className="kcr-dir"><Pill tone={dir.tone}>{dir.label}</Pill></span>
      <span className="kcr-body">
        <span className="kcr-line">
          <strong>{who.from}</strong> <span className="kcr-verb">to</span> <strong>{who.to}</strong>
        </span>
        <span className={cn("kcr-text", body.quiet && "is-quiet")}>
          {body.media && !body.quiet && <span className="kcr-tag">{body.media}</span>}
          {body.text}
        </span>
        <span className="kcr-meta">
          <span>{channelLabel(e.channel)}</span>
          {e.language && <span>{e.language}</span>}
          <span className={cn(consent.warn && "kcr-warn")}>{consent.text}</span>
        </span>
      </span>
      <span className="kcr-when">
        <span className="kcr-clock" title={new Date(e.occurred_at).toLocaleString("en-GB", { timeZone: "Asia/Kathmandu" })}>{clock(e.occurred_at)}</span>
        {when && <span className="kcr-ago">{when}</span>}
      </span>
    </>
  );
  return (
    <li className="kcr-item">
      {canOpen
        ? <button type="button" className="kcr-event" onClick={() => onOpen(e)} aria-label={`Open the conversation: ${who.from} to ${who.to}`}>{inner}</button>
        : <div className="kcr-event">{inner}</div>}
    </li>
  );
}

/* ── A whole conversation, oldest first ────────────────── */
function ThreadWindow({ row, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetchThread(row.thread_ref)
      .then((r) => { if (live) setRows(r); })
      .catch((e) => { if (live) setError(explain(e)); });
    return () => { live = false; };
  }, [row.thread_ref]);

  // oldest first, in runs of one day (groupByDay keeps the order it is given)
  const days = groupByDay(rows || []);
  return (
    <Modal title={threadTitle(row)} subtitle={channelLabel(row.channel)} onClose={onClose} size="lg" glass>
      {error ? <div className="kcr-error" role="alert">{error}</div>
        : !rows ? <div className="kcr-empty">Loading the conversation…</div>
        : rows.length === 0 ? <div className="kcr-empty">Nothing in this conversation.</div>
        : (
          <div className="kcr-thread">
            {days.map((g) => (
              <div key={g.key} className="kcr-day">
                <div className="kcr-day-h">{dayLabel(g.key)}</div>
                {g.items.map((m) => {
                  const body = textOf(m);
                  const who = sides(m);
                  const mine = m.direction === "out";
                  return (
                    <div key={m.id} className={cn("kcr-msg", mine ? "kcr-msg--out" : m.direction === "in" ? "kcr-msg--in" : "kcr-msg--team")}>
                      <div className="kcr-bubble">
                        {m.direction !== "in" && <span className="kcr-msg-who">{who.from}</span>}
                        <span className={cn("kcr-msg-text", body.quiet && "is-quiet")}>
                          {body.media && !body.quiet && <span className="kcr-tag">{body.media}</span>}
                          {body.text}
                        </span>
                        <span className="kcr-msg-time">{clock(m.occurred_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
    </Modal>
  );
}
