/**
 * The dialog a record is sent to Chat from. Opened by ShareProvider (never rendered by a page).
 *
 *   what      the file that will go (a PDF of the record, or the record's own file), made the moment the dialog opens so it can say what
 *             it is and how big, and so Send is instant; a copy as of now
 *   to        any people and any group chats you are in, searchable, several at once (the same rows as Chat's "New conversation")
 *   message   what you want to say with it, optional
 *
 * Sending is one message per conversation with the file attached (lib/share/send.js). A person is sent to through the conversation you
 * have with them, which is started if there is none. One that fails does not stop the rest, and the answer says which went and which
 * did not, with "Try again" for the ones that did not. Everybody in a conversation can open what is sent in it, whatever their role.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../Modal";
import { Icons } from "../ui";
import { PersonAvatar, ThreadAvatar } from "../chat/ChatBits";
import { loadAdapter } from "../../lib/share/records";
import { MAX_TARGETS, friendly, loadTargets, sendToTargets } from "../../lib/share/send";
import { sizeLabel } from "../../lib/share/helpers";
import { personFor, threadTitle } from "../../lib/chatFormat";
import "./share.css";

const MAX_BYTES = 50 * 1024 * 1024;               // the chat bucket's own ceiling

const keyOf = (t) => `${t.kind === "group" ? "g" : "p"}:${t.id}`;
const targetOf = (key) => ({ kind: key[0] === "g" ? "group" : "person", id: key.slice(2) });

const typeLabel = (file) => (file.type === "application/pdf" ? "PDF" : file.type.startsWith("image/") ? "Picture" : (file.name.split(".").pop() || "File").toUpperCase());

function Row({ on, onToggle, avatar, name, line }) {
  return (
    <button type="button" className={`kchat-person${on ? " kchat-person--on" : ""}`} aria-pressed={on} onClick={onToggle}>
      {avatar}
      <span className="kchat-person-body">
        <span className="kchat-person-name">{name}</span>
        <span className="kchat-person-role">{line}</span>
      </span>
      <span className={`kchat-check${on ? " kchat-check--on" : ""}`} aria-hidden="true">{on && <Icons.Check size={11} sw={2.6} />}</span>
    </button>
  );
}

export default function ShareDialog({ job, me, profile, onClose }) {
  const navigate = useNavigate();
  const [adapter, setAdapter] = useState(null);
  const [file, setFile] = useState({ status: "loading" });          // loading | ready | error
  const [pool, setPool] = useState({ status: "loading" });          // loading | ready | error
  const [picked, setPicked] = useState(() => new Set());            // "g:<thread id>" | "p:<person id>"
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState("pick");                       // pick | sending | done
  const [results, setResults] = useState([]);
  const alive = useRef(true);
  const doneRef = useRef(null);
  const sending = phase === "sending";

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  /* the file */
  const make = useCallback(async () => {
    setFile({ status: "loading" });
    try {
      const a = await loadAdapter(job.type);
      if (alive.current) setAdapter(a);
      const made = await a.build(job.record, { profile });
      if (!alive.current) return;
      if (made.size > MAX_BYTES) throw new Error(`The file is ${Math.round(made.size / 1024 / 1024)} MB. The limit is 50 MB.`);
      setFile({ status: "ready", file: made });
    } catch (err) {
      console.error("[share] could not make the file:", err);
      if (alive.current) setFile({ status: "error", error: friendly(err) || "The file could not be made." });
    }
  }, [job, profile]);
  useEffect(() => { make(); }, [make]);

  /* who it can go to */
  const loadPool = useCallback(async () => {
    setPool({ status: "loading" });
    try {
      const got = await loadTargets(me);
      if (alive.current) setPool({ status: "ready", ...got });
    } catch (err) {
      console.error("[share] could not read who it can go to:", err);
      if (alive.current) setPool({ status: "error", error: friendly(err) });
    }
  }, [me]);
  useEffect(() => { loadPool(); }, [loadPool]);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => (pool.status === "ready" ? pool.groups.filter((g) => !q || threadTitle(g).toLowerCase().includes(q)) : []), [pool, q]);
  const people = useMemo(() => (pool.status === "ready" ? pool.people.filter((p) => !q || `${p.name} ${p.role} ${p.department || ""}`.toLowerCase().includes(q)) : []), [pool, q]);

  const toggle = (key) => setPicked((now) => {
    const next = new Set(now);
    if (next.has(key)) next.delete(key);
    else if (next.size < MAX_TARGETS) next.add(key);
    return next;
  });

  const nameOf = useCallback((t) => (t.kind === "group"
    ? threadTitle(pool.status === "ready" ? pool.groups.find((g) => g.id === t.id) : null) || "A group"
    : personFor(t.id).name), [pool]);

  const ready = file.status === "ready" && pool.status === "ready";
  const canSend = ready && picked.size > 0 && phase === "pick";

  async function send() {
    if (!canSend) return;
    setPhase("sending");
    const answer = await sendToTargets({ me, targets: [...picked].map(targetOf), text: text.trim(), file: file.file, dmByPerson: pool.dmByPerson });
    if (!alive.current) return;
    setResults(answer);
    setPhase("done");
  }

  // the answer is on screen: the cursor goes to the button that finishes
  useEffect(() => { if (phase === "done") doneRef.current?.focus({ preventScroll: true }); }, [phase]);

  const sent = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  function openChat() {
    onClose();
    if (sent.length === 1 && sent[0].target.kind === "person") navigate(`/messenger?with=${encodeURIComponent(sent[0].target.id)}`);
    else if (sent.length === 1) navigate(`/messenger?thread=${encodeURIComponent(sent[0].threadId)}`);
    else navigate("/messenger");
  }

  function again() {
    setPicked(new Set(failed.map((r) => keyOf(r.target))));
    setResults([]);
    setPhase("pick");
  }

  const meta = adapter ? adapter.describe(job.record) : null;
  const heading = phase === "done"
    ? (failed.length === 0 ? "Sent." : sent.length === 0 ? "It did not send." : `Sent to ${sent.length} of ${results.length}.`)
    : "";

  const footer = phase === "done" ? (
    <>
      {failed.length > 0 && <button type="button" className="ghost-button" onClick={again}>Try again for the rest</button>}
      {sent.length > 0 && <button type="button" className="ghost-button" onClick={openChat}>Open Chat</button>}
      <button type="button" ref={doneRef} className="primary-button" onClick={onClose}>Done</button>
    </>
  ) : (
    <>
      <button type="button" className="ghost-button" onClick={onClose} disabled={sending}>Cancel</button>
      <button type="button" className="primary-button" onClick={send} disabled={!canSend}>
        {sending ? "Sending…" : picked.size > 1 ? `Send to ${picked.size}` : "Send"}
      </button>
    </>
  );

  return (
    <Modal
      title="Send to chat"
      subtitle={meta ? `${adapter.label}: ${meta.title}` : undefined}
      size="md"
      glass
      onClose={sending ? undefined : onClose}
      footer={footer}
    >
      <div className={`ksh-file${file.status === "error" ? " ksh-file--err" : ""}`} role="group" aria-label="What is being sent">
        <span className="ksh-file-ico" aria-hidden="true"><Icons.File size={18} sw={1.7} /></span>
        <div className="ksh-file-body">
          <p className="ksh-file-name">{file.status === "ready" ? file.file.name : adapter ? adapter.label : "Getting the file ready"}</p>
          <p className="ksh-file-meta">
            {file.status === "loading" && <><span className="ksh-spin" aria-hidden="true" />Getting the file ready…</>}
            {file.status === "ready" && `${typeLabel(file.file)} · ${sizeLabel(file.file.size)} · a copy as of now, it will not update`}
            {file.status === "error" && file.error}
          </p>
        </div>
        {file.status === "error" && <button type="button" className="ghost-button ksh-retry" onClick={make}>Try again</button>}
      </div>

      {phase === "done" ? (
        <>
          <p className="ksh-lead">{heading}</p>
          <ul className="ksh-done" aria-label="What happened">
            {results.map((r) => (
              <li key={keyOf(r.target)} className={r.ok ? "" : "is-bad"}>
                <span className="ksh-done-ico" aria-hidden="true">{r.ok ? <Icons.Check size={12} sw={2.6} /> : <Icons.X size={12} sw={2.6} />}</span>
                <span>{nameOf(r.target)}{!r.ok && <span className="ksh-done-why">{r.error}</span>}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h3 className="ksh-h">To <b>{picked.size > 0 ? `${picked.size} chosen${picked.size >= MAX_TARGETS ? " (the most at once)" : ""}` : "choose who"}</b></h3>
          <label className="kchat-dlg-search">
            <input type="search" placeholder="Search people and groups" aria-label="Search people and groups" value={query} onChange={(e) => setQuery(e.target.value)} disabled={sending} />
          </label>

          {pool.status === "loading" && <p className="kchat-people-empty" role="status"><span className="ksh-spin" aria-hidden="true" />Loading who you can send to…</p>}
          {pool.status === "error" && (
            <p className="kchat-people-empty" role="alert">{pool.error || "Could not load the staff list."} <button type="button" className="ghost-button" onClick={loadPool}>Try again</button></p>
          )}
          {pool.status === "ready" && (
            <div className="kchat-people ksh-list" role="group" aria-label="Who to send it to">
              {groups.length > 0 && <p className="ksh-sub">Group chats</p>}
              {groups.map((g) => (
                <Row
                  key={g.id} on={picked.has(`g:${g.id}`)} onToggle={() => toggle(`g:${g.id}`)}
                  avatar={<ThreadAvatar thread={g} size={34} />} name={threadTitle(g)} line={`Group · ${g.memberIds.length + 1} members`}
                />
              ))}
              {people.length > 0 && <p className="ksh-sub">People</p>}
              {people.map((p) => (
                <Row
                  key={p.id} on={picked.has(`p:${p.id}`)} onToggle={() => toggle(`p:${p.id}`)}
                  avatar={<PersonAvatar personId={p.id} size={34} />} name={p.name} line={p.online ? p.status : p.role}
                />
              ))}
              {groups.length === 0 && people.length === 0 && <p className="kchat-people-empty">Nobody matches that.</p>}
            </div>
          )}

          <label className="ksh-msg">
            Message (optional)
            <textarea
              className="ksh-text" value={text} maxLength={2000} placeholder="Add a note for them…" disabled={sending}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); send(); } }}
            />
          </label>
        </>
      )}
      <p className="ksh-sr" role="status" aria-live="polite">{phase === "done" ? heading : sending ? "Sending" : ""}</p>
    </Modal>
  );
}
