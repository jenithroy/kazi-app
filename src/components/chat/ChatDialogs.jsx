/**
 * Every dialog chat opens: starting a conversation, reshaping a group, the contact card, the photo and video viewer, and the one
 * confirmation that matters. All but the viewer are the app's glass dialog (ChatBits `Dialog` is components/Modal.jsx).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "../ui";
import FinanceConfirm from "../finance/ConfirmDialog";
import { Dialog, PersonAvatar, ThreadAvatar } from "./ChatBits";
import { fileSize, myId, personFor, threadTitle } from "../../lib/chatFormat";

/* ── people picker ────────────────────────────────────── */

function PeopleList({ people, selected, onToggle, multi }) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => `${p.name} ${p.role} ${p.department || ""}`.toLowerCase().includes(q));
  }, [people, query]);

  return (
    <>
      <label className="kchat-dlg-search">
        <input
          type="search"
          autoFocus
          placeholder="Search staff"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search staff"
        />
      </label>

      <div className="kchat-people">
        {visible.length === 0 ? (
          <p className="kchat-people-empty">Nobody matches that.</p>
        ) : (
          visible.map((person) => {
            const on = selected.includes(person.id);
            return (
              <button
                key={person.id}
                type="button"
                className={`kchat-person${on ? " kchat-person--on" : ""}`}
                onClick={() => onToggle(person.id)}
                aria-pressed={on}
              >
                <PersonAvatar personId={person.id} size={34} />
                <span className="kchat-person-body">
                  <span className="kchat-person-name">{person.name}</span>
                  <span className="kchat-person-role">{person.online ? person.status : person.role}</span>
                </span>
                {multi && <span className={`kchat-check${on ? " kchat-check--on" : ""}`}>{on && <Icons.Check size={11} sw={2.6} />}</span>}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

/* ── new conversation ─────────────────────────────────── */

export function NewChatDialog({ directory, canCreateGroup, onClose, onStartDm, onStartGroup }) {
  const [mode, setMode] = useState("dm");
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const me = myId();
  const others = useMemo(() => directory.filter((p) => p.id !== me), [directory, me]);

  // The database enforces this in `chat_create_group`; saying so up front
  // beats a raised exception after the click.
  const groupReady = name.trim().length > 0 && selected.length >= 2;

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onClose();
    } catch (err) {
      setError(err.message || "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id) =>
    setSelected((current) =>
      mode === "dm" ? [id] : current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );

  return (
    <Dialog
      title="New conversation"
      onClose={onClose}
      footer={(
        <>
          {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
          {mode === "group" && (
            <span className="kchat-dialog-hint">
              {selected.length < 2
                ? `Pick ${2 - selected.length} more ${selected.length === 1 ? "person" : "people"}`
                : `${selected.length + 1} members`}
            </span>
          )}
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="primary-button"
            disabled={busy || (mode === "dm" ? selected.length === 0 : !groupReady)}
            onClick={() =>
              run(() => (mode === "dm" ? onStartDm(selected[0]) : onStartGroup(name.trim(), selected)))
            }
          >
            {busy ? "Working…" : mode === "dm" ? "Open conversation" : "Create group"}
          </button>
        </>
      )}
    >
      {canCreateGroup && (
        <div className="kchat-dlg-tabs">
          <button type="button" className={mode === "dm" ? "is-on" : ""} aria-pressed={mode === "dm"} onClick={() => { setMode("dm"); setSelected([]); }}>
            Direct message
          </button>
          <button type="button" className={mode === "group" ? "is-on" : ""} aria-pressed={mode === "group"} onClick={() => { setMode("group"); setSelected([]); }}>
            New group
          </button>
        </div>
      )}

      {mode === "group" && (
        <label className="kchat-dlg-field">
          Group name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cutting floor, Sample room…" maxLength={60} />
        </label>
      )}

      <PeopleList people={others} selected={selected} onToggle={toggle} multi={mode === "group"} />
    </Dialog>
  );
}

/* ── group editor ─────────────────────────────────────── */

export function GroupDialog({ thread, directory, onClose, onSave }) {
  const me = myId();
  const [name, setName] = useState(thread.name || "");
  const [selected, setSelected] = useState(thread.memberIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const others = useMemo(() => directory.filter((p) => p.id !== me), [directory, me]);
  const ready = name.trim().length > 0 && selected.length >= 2;

  const removed = thread.memberIds.filter((id) => !selected.includes(id));

  return (
    <Dialog
      title="Group settings"
      onClose={onClose}
      footer={(
        <>
          {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
          <span className="kchat-dialog-hint">{selected.length + 1} members</span>
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="primary-button"
            disabled={busy || !ready}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onSave(thread.id, name.trim(), selected);
                onClose();
              } catch (err) {
                setError(err.message || "That did not save.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save group"}
          </button>
        </>
      )}
    >
      <label className="kchat-dlg-field">
        Group name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </label>

      <PeopleList
        people={others}
        selected={selected}
        multi
        onToggle={(id) =>
          setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
        }
      />

      {removed.length > 0 && (
        // Removal is a soft leave in the database: they keep the history they
        // already have. Saying so stops it reading as a delete.
        <p className="kchat-dialog-hint" style={{ marginTop: 10 }}>
          {removed.map((id) => personFor(id).name).join(", ")} will lose access to new messages. Their copy of the
          history stays with them.
        </p>
      )}
    </Dialog>
  );
}

/* ── contact card ─────────────────────────────────────── */

export function ContactDialog({ thread, onClose }) {
  const group = thread.kind === "group";
  const person = group ? null : personFor(thread.memberIds[0]);

  return (
    <Dialog title={group ? "Group members" : "Contact"} onClose={onClose}>
      <div className="kchat-contact-hd">
        <ThreadAvatar thread={thread} size={56} />
        <div>
          <h3>{threadTitle(thread)}</h3>
          <p>{group ? `${thread.memberIds.length + 1} members` : person.role}</p>
        </div>
      </div>

      {group ? (
        <div className="kchat-people">
          {[myId(), ...thread.memberIds].map((id) => {
            const member = personFor(id);
            return (
              <div key={id} className="kchat-person kchat-person--static">
                <PersonAvatar personId={id} size={34} />
                <span className="kchat-person-body">
                  <span className="kchat-person-name">
                    {member.name}
                    {id === thread.ownerId && <span className="kchat-owner">Owner</span>}
                  </span>
                  <span className="kchat-person-role">{member.online ? member.status : member.role}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        // Every field here is RLS-gated on `fs_employees`, so any of them can
        // legitimately be missing for the person reading this.
        <dl className="kchat-facts">
          {[
            ["Status", person.status],
            ["Department", person.department],
            ["Location", person.location],
            ["Email", person.email],
            ["Phone", person.phone],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
      )}
    </Dialog>
  );
}

/* ── photo and video viewer ───────────────────────────── */

/**
 * Full screen and dark on purpose (a photo reads best on black). Focus goes to its Close button, Escape and Tab stay inside it, and
 * focus goes back to what opened it.
 */
export function MediaViewer({ attachment, onClose }) {
  const { kind, url, name, size } = attachment;
  const root = useRef(null);
  const closeRef = useRef(null);
  const closing = useRef(onClose);
  closing.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); closing.current(); return; }
      if (e.key !== "Tab") return;
      const stops = [...root.current.querySelectorAll("a[href], button:not(:disabled), video[controls]")];
      if (!stops.length) return;
      const first = stops[0], last = stops[stops.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); opener?.focus?.({ preventScroll: true }); };
  }, []);

  return (
    <div ref={root} className="kchat-lightbox" role="dialog" aria-modal="true" aria-label={name || "Attachment"} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="kchat-lightbox-bar">
        <span className="kchat-lightbox-name">
          {name} <span>{fileSize(size)}</span>
        </span>
        <div>
          {url && (
            <a className="kchat-icon-btn kchat-icon-btn--light" href={url} download={name} title="Download" aria-label="Download">
              <Icons.Download size={16} />
            </a>
          )}
          <button ref={closeRef} type="button" className="kchat-icon-btn kchat-icon-btn--light" onClick={onClose} title="Close" aria-label="Close">
            <Icons.X size={16} />
          </button>
        </div>
      </div>

      <div className="kchat-lightbox-body" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {!url ? (
          <p className="kchat-lightbox-note">This file&rsquo;s link has expired. Refresh the page to fetch a new one.</p>
        ) : kind === "image" ? (
          <img src={url} alt={name} />
        ) : kind === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={url} controls autoPlay />
        ) : (
          <div className="kchat-lightbox-file">
            <Icons.File size={40} sw={1.2} />
            <p>{name}</p>
            <a className="kb-btn kb-btn--primary" href={url} download={name}>
              Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── confirmation ─────────────────────────────────────── */

/** The shared question dialog (finance/ConfirmDialog): it says why when the answer fails instead of closing as if it had worked. */
export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose }) {
  return (
    <FinanceConfirm title={title} confirmLabel={confirmLabel} danger onConfirm={onConfirm} onCancel={onClose}>
      <p>{body}</p>
    </FinanceConfirm>
  );
}
