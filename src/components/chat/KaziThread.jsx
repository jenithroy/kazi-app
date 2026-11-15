/**
 * Kazi's conversation: the right-hand pane when "Kazi" is chosen in the chat list (and the whole screen on a phone).
 *
 * Kazi is the assistant that looks things up in the business as the person asking (worker/lib/kazi.js; what it can look up is
 * worker/lib/kaziTools.js). It is drawn from the chat window's own parts (the header, the bubbles, the message box: chat.css) so it
 * reads as one more conversation; only what is Kazi's own is in kazi.css. For now it only reads: it cannot change anything, and says so.
 *
 * What a person sees while it works: the question appears at once, then a bubble with the lookup in words ("Checking the orders…"), then
 * the answer with what it looked at underneath. A Stop button ends the question: the server stops too (nothing more is asked or charged
 * for, and nothing is kept), and the question goes back into the box to be changed or sent again. Closing the window or leaving the page
 * does the same. If it fails, the reason is in words with Try again, and the question stays where it was. The answer is also spoken to a
 * screen reader as it arrives (the "working" bubble goes away at that moment, so it cannot carry the answer).
 *
 * The earlier conversation is read when the pane opens (lib/kazi.js fetchKaziHistory) and is put in FRONT of whatever was typed meanwhile,
 * never over it. A press on Send is guarded by a ref, not state: React flushes a click's state in a microtask, so two quick presses would
 * both pass a state guard and ask (and charge) twice.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icons } from "../ui";
import { askKazi, fetchKaziHistory, lookedAt, SUGGESTIONS } from "../../lib/kazi";
import { groupByDay } from "../../lib/chatFormat";
import "./kazi.css";

const SEND_LAST = 20;                         // how many earlier lines go along with a question (the Worker keeps the last 16)

const clock = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Kazi's face: the accent circle with the assistant mark. Used by its row in the list and by its pane. */
export function KaziAvatar({ size = 40 }) {
  return (
    <span className="kz-av" style={{ width: size, height: size }} aria-hidden="true">
      <Icons.Bot size={Math.round(size * 0.52)} sw={1.9} />
    </span>
  );
}

function Message({ m }) {
  const mine = m.role === "user";
  const about = mine ? [] : lookedAt(m.lookups);
  return (
    <div className={`kchat-msg${mine ? " kchat-msg--mine" : ""}`}>
      {!mine && <div className="kchat-msg-gutter"><KaziAvatar size={28} /></div>}
      <div className="kchat-msg-col">
        {!mine && <span className="kchat-msg-author">Kazi</span>}
        <div className="kchat-msg-line">
          <div className={`kchat-bubble${mine ? " kchat-bubble--mine" : ""}`}>
            <span className="kchat-bubble-text">{m.text}</span>
          </div>
        </div>
        <div className="kchat-msg-meta">
          <span>{clock(m.at)}</span>
          {about.length > 0 && <span className="kz-about">{`· Looked at ${about.join(", ")}`}</span>}
          {m.unsaved && <span className="kz-about">· Not saved</span>}
        </div>
      </div>
    </div>
  );
}

export default function KaziThread({ onBack }) {
  const [items, setItems] = useState([]);              // { id, role, text, at, lookups, unsaved, local }
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [said, setSaid] = useState("");
  const [draft, setDraft] = useState("");

  const scrollerRef = useRef(null);
  const inputRef = useRef(null);
  const busy = useRef(false);
  const abort = useRef(null);
  const stopped = useRef(false);                       // Stop was pressed (as against the window being closed)
  const live = useRef(items);
  live.current = items;

  useEffect(() => {
    let current = true;
    fetchKaziHistory()
      .then((rows) => {
        if (!current) return;
        // In FRONT of whatever has been typed since the pane opened, never replacing it. A saved line that is as new as the first thing
        // typed here is that very conversation, so it is left out rather than drawn twice.
        setItems((cur) => {
          const since = Math.min(Infinity, ...cur.filter((m) => m.local).map((m) => m.at));
          const have = new Set(cur.map((m) => m.id));
          return [...rows.filter((r) => !have.has(r.id) && r.at < since - 1000), ...cur];
        });
      })
      .catch((err) => { if (current) setLoadError(err.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; stopped.current = false; abort.current?.abort(); };
  }, []);

  // A desktop opens with the cursor in the box; a phone does not (the keyboard would cover the conversation).
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 769px)").matches) inputRef.current?.focus();
  }, []);

  // Always land at the newest line: this is a question-and-answer, not a feed somebody is reading back through.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, pending, error, note, loading]);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    stopped.current = false;
    const controller = new AbortController();
    abort.current = controller;
    setError("");
    setNote("");
    setPending(true);
    setStatus("Thinking…");
    try {
      const history = live.current.slice(-SEND_LAST).map((m) => ({ role: m.role, content: m.text }));
      const answer = await askKazi(history, { onStatus: setStatus, signal: controller.signal });
      setItems((cur) => [...cur, { id: `a${Date.now()}`, role: "assistant", text: answer.text, at: Date.now(), lookups: answer.lookups, unsaved: !answer.saved, local: true }]);
      setSaid(`Kazi says: ${answer.text}`);
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError(err.message || "Kazi could not answer that.");
      } else if (stopped.current) {
        // Stop: the question goes back into the box (the server has stopped too and kept nothing), so nothing is left hanging.
        const last = live.current[live.current.length - 1];
        if (last?.role === "user" && last.local) {
          setItems((cur) => cur.slice(0, -1));
          setDraft((d) => d || last.text);
        }
        setNote("Stopped. Your question is back in the box.");
      }
    } finally {
      busy.current = false;
      abort.current = null;
      stopped.current = false;
      setPending(false);
      setStatus("");
      if (window.matchMedia("(min-width: 769px)").matches) requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, []);

  const send = useCallback((raw) => {
    const text = String(raw ?? "").trim();
    if (!text || busy.current) return;
    setDraft("");
    setSaid("");
    live.current = [...live.current, { id: `u${Date.now()}`, role: "user", text, at: Date.now(), local: true }];     // so run() already sees it
    setItems(live.current);
    run();
  }, [run]);

  const stop = () => {
    stopped.current = true;
    abort.current?.abort();
  };

  const days = useMemo(() => groupByDay(items), [items]);
  const rows = Math.min(5, Math.max(1, draft.split("\n").length));

  return (
    <section className="kb-tile kchat-thread kz-thread" style={{ gridArea: "thread" }} aria-label="Conversation with Kazi">
      <header className="kchat-thread-hd">
        <button type="button" className="kchat-back" onClick={onBack} aria-label="Back to conversations">
          <Icons.ChevronLeft size={18} />
        </button>
        <div className="kchat-thread-id">
          <KaziAvatar size={38} />
          <span>
            <span className="kchat-thread-name">Kazi</span>
            <span className="kchat-thread-status">Reads your business data as you. Can’t change anything yet.</span>
          </span>
        </div>
      </header>

      {loadError && (
        <div className="fn-banner fn-banner--bad" role="alert">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>{loadError}</span>
          <button type="button" onClick={() => setLoadError("")} aria-label="Dismiss"><Icons.X size={14} sw={2} aria-hidden="true" /></button>
        </div>
      )}

      <div className="kchat-scroll" ref={scrollerRef}>
        {loading && items.length === 0 ? (
          <div className="kchat-empty" role="status"><span className="kchat-spin" /><p>One moment.</p></div>
        ) : items.length === 0 && !pending ? (
          <div className="kchat-empty">
            <KaziAvatar size={52} />
            <h3>Hi, I’m Kazi</h3>
            <p>Ask me about orders, stock, what customers owe, who is in and tasks. I look it up as you, so I only see what your role allows. For now I can read, not change.</p>
            {note && <p className="kz-note">{note}</p>}
            <div className="kz-chips">
              {SUGGESTIONS.map((q) => (
                <button key={q} type="button" className="kz-chip" onClick={() => send(q)}>{q}</button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {days.map((day) => (
              <section key={day.key} className="kchat-day">
                <div className="kchat-day-mark"><span>{day.label}</span></div>
                {day.items.map((m) => <Message key={m.id} m={m} />)}
              </section>
            ))}

            {pending && (
              <div className="kchat-msg" role="status" aria-live="polite">
                <div className="kchat-msg-gutter"><KaziAvatar size={28} /></div>
                <div className="kchat-msg-col">
                  <div className="kchat-msg-line">
                    <div className="kchat-bubble kz-working">
                      <span className="kz-dots" aria-hidden="true"><i /><i /><i /></span>
                      <span>{status || "Thinking…"}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {note && !pending && <p className="kz-note kz-note--line">{note}</p>}

            {error && !pending && (
              <div className="kz-error" role="alert">
                <Icons.Alert size={15} sw={1.9} aria-hidden="true" />
                <span>{error}</span>
                <button type="button" className="kz-retry" onClick={run}>Try again</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* The answer, for a screen reader: the working bubble above is gone by the time it arrives. */}
      <div className="kz-sr" role="status" aria-live="polite">{said}</div>

      <form className="kchat-composer" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
        <div className="kchat-composer-row">
          <textarea
            ref={inputRef}
            className="kchat-input"
            rows={rows}
            value={draft}
            aria-label="Message Kazi"
            placeholder="Ask Kazi…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(draft);
              }
            }}
          />
          {/* Two buttons with their own keys, not one that changes its type: React would reuse the one element, and the browser decides what a
              click DOES (submit the form or not) after the handlers have run. Stop puts the question back in the box, which re-enables a
              "Send" button, so a reused element turned that same click into a second Send. */}
          {pending ? (
            <button key="stop" type="button" className="kchat-send" onClick={(e) => { e.preventDefault(); stop(); }} title="Stop" aria-label="Stop waiting for Kazi">
              <Icons.X size={15} />
            </button>
          ) : (
            <button key="send" type="submit" className="kchat-send" disabled={!draft.trim()} title="Send (Enter)" aria-label="Send">
              <Icons.Send size={15} />
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
