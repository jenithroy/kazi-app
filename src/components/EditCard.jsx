/**
 * EditCard: the card in the middle of the screen that every "edit this" opens, the shape the task card
 * has (a glass card, the thing itself on the left, its numbers on a veiled pane on the right) made reusable.
 *
 *   <EditCard
 *     title="Cotton Terry" subtitle="#kazi1001 · Fabric"
 *     main={<>…fields…</>} side={<>…numbers…</>}
 *     onSave={async () => ({ ok: true })}        // or { ok: false, message }: the card stays open and says why
 *     onDelete={async () => ({ ok: true })}      // optional: adds Delete, which asks before it does anything
 *     onClose={…} />
 *
 * A card with several facets passes `sections` instead of `main` and `side`:
 *
 *   sections={[{ id: "details", label: "Details", main: …, side: … }, { id: "moves", label: "Movements", … }]}
 *
 * A switch at the top of the left pane chooses the section; a section without its own `side` uses the
 * card's `side`. The section chosen first is `initialSection`.
 *
 * Fields go in `ec-main` / `ec-side`, which are two-column grids: a `Field` takes one column, `wide` takes both.
 * On a phone the card is the usual bottom sheet. A card with only `main` and `side` shows them as two tabs, so
 * a form that fits on a desktop card still does not scroll on a phone; a card with sections shows the sections
 * as tabs and puts each one's `side` under its `main`.
 *
 * Where it leaves the page alone: nothing here writes anything. The card's owner does, in `onSave`/`onDelete`.
 * View-only (`canEdit={false}`): no Save, no Delete, and the owner disables its fields.
 */
import { useEffect, useId, useRef, useState } from "react";
import Modal from "./Modal";
import { cn } from "./ui";
import "./edit-card.css";

/* ── Pieces a card is made of ───────────────────────────────────── */

/** A label over a control. `htmlFor` ties it to the control; without it the label is plain text (a group's name). */
export function Field({ label, htmlFor, labelId, wide, hint, className, children }) {
  return (
    <div className={cn("ec-f", wide && "ec-wide", className)}>
      {label ? (htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="ec-lbl" id={labelId}>{label}</span>) : null}
      {children}
      {hint ? <small className="ec-hint">{hint}</small> : null}
    </div>
  );
}

/** A money or quantity input: numbers only, no spinner, with its unit inside the right edge. */
export function NumberInput({ unit, className, ...rest }) {
  return (
    <span className={cn("ec-amt", unit && "has-unit", className)}>
      <input type="number" inputMode="decimal" min="0" step="any" {...rest} />
      {unit ? <em>{unit}</em> : null}
    </span>
  );
}

/**
 * A short choice between a few things, shown as one pill split in parts (In | Out, Low | Medium | High).
 * It is a radio group to the keyboard: Tab stops once, on the chosen part, and the arrow keys change the choice.
 */
export function Seg({ value, onChange, options, label, disabled, className }) {
  const stop = options.some(([id]) => id === value) ? value : options[0]?.[0];      // the one part Tab reaches

  function onKeyDown(e) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step || disabled) return;
    const at = options.findIndex(([id]) => id === value);
    const to = (at + step + options.length) % options.length;
    e.preventDefault();
    onChange(options[to][0]);
    // focus follows the choice at once (a key pressed straight after must find it already there)
    e.currentTarget.querySelectorAll('[role="radio"]')[to]?.focus();
  }

  return (
    <div className={cn("kregion-seg ec-seg", className)} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          tabIndex={stop === id ? 0 : -1}
          className={cn("kregion-seg-btn", value === id && "is-on")}
          disabled={disabled}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Label and value pairs, one to a line. `rows`: [[label, value, tone?]]; tone is "good" | "bad" | "warn". */
export function KV({ rows }) {
  return (
    <dl className="ec-kv ec-wide">
      {rows.map(([k, v, tone]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd className={tone ? `ec-${tone}` : undefined}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A small pill saying how things stand. `tone`: good | warn | bad | info | (none: plain). */
export function Tag({ tone, children }) {
  return <span className={cn("ec-tag", tone && `ec-tag--${tone}`)}>{children}</span>;
}

/* ── The card ───────────────────────────────────────────────────── */

export default function EditCard({
  title, subtitle, onClose, onSave, onDelete, deleteName, deleteNote,
  canEdit = true, creating = false,
  sections, initialSection, main, side, mainLabel = "Details", sideLabel = "Numbers",
  submitLabel = "Save changes", savingLabel = "Saving…",
  footerExtra, className, dirty = false, closeLabel,
}) {
  const uid = useId();
  const sectioned = Array.isArray(sections) && sections.length > 0;
  const [tab, setTab] = useState(initialSection || (sectioned ? sections[0].id : "main"));   // phone, no sections: "main" | "side"
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const keepRef = useRef(null);

  const section = sectioned ? sections.find((s) => s.id === tab) || sections[0] : null;
  const mainNode = section ? section.main : main;
  const sideNode = section ? (section.side ?? side) : side;
  const hasSide = sideNode != null && sideNode !== false;
  const busy = saving || deleting;

  // asked to delete (or to throw away what was typed): the safe answer takes the focus
  useEffect(() => { if (confirming || discarding) keepRef.current?.focus({ preventScroll: true }); }, [confirming, discarding]);

  // Cancel, the X, Escape and a click outside all come here: a card the owner says has unsaved typing asks first
  // Where the cursor was, so "keep it" puts it back there rather than nowhere. A footer button is not the same element once the footer has
  // been drawn again (it is replaced by the question and then by a new one), so a footer button is remembered by its `data-ec` name.
  const returnTo = useRef(null);
  const remember = () => {
    const el = document.activeElement;
    const mark = el?.closest?.("[data-ec]")?.dataset.ec || (!el || el === document.body ? "close" : "");
    returnTo.current = { el, mark, root: el?.closest?.(".kmodal") || null };
  };
  const ask = () => {
    if (dirty && canEdit && !busy) { remember(); setDiscarding(true); setError(""); }
    else onClose();
  };
  const back = () => {
    setDiscarding(false);
    setConfirming(false);
    setError("");
    requestAnimationFrame(() => {
      const { el, mark, root } = returnTo.current || {};
      const target = !mark && el?.isConnected ? el : (root && root.isConnected ? root : document).querySelector(`[data-ec="${mark || "close"}"]`);
      target?.focus?.({ preventScroll: true });
    });
  };

  async function submit(e) {
    e.preventDefault();
    if (!canEdit || busy || !onSave) return;
    setSaving(true);
    setError("");
    let res;
    try { res = await onSave(); } catch (err) { res = { ok: false, message: err?.message }; }
    if (res && res.ok === false) {
      if (res.section && sectioned) setTab(res.section);
      setError(res.message || "Couldn't save. Try again.");
      setSaving(false);
      return;
    }
    // `keepOpen`: saved, and the owner wants the card left up (a data-entry card's "Save and add another")
    if (res && res.keepOpen) { setSaving(false); return; }
    onClose();
  }

  async function remove() {
    if (busy || !onDelete) return;
    setDeleting(true);
    setError("");
    let res;
    try { res = await onDelete(); } catch (err) { res = { ok: false, message: err?.message }; }
    if (res && res.ok === false) {
      setError(res.message || "Couldn't delete. Try again.");
      setDeleting(false);
      return;
    }
    onClose();
  }

  // A phone shows one half at a time. A field that is wrong in the half that is hidden cannot be focused, so the browser would stop the save
  // and say nothing at all: bring that half up and show what is wrong there. (On a wide screen both halves are on show and the browser takes
  // the person to the field itself.) Several fields can be wrong at once; only the first one is followed.
  const followingInvalid = useRef(false);
  const showInvalid = (e) => {
    const el = e.target;
    if (sectioned || followingInvalid.current || el.getClientRects?.().length) return;
    const half = el.closest?.(".ec-pane")?.classList.contains("ec-side") ? "side" : "main";
    if (half === tab) return;
    followingInvalid.current = true;
    setTab(half);
    requestAnimationFrame(() => {
      followingInvalid.current = false;
      if (!el.isConnected) return;
      el.focus?.({ preventScroll: true });
      el.reportValidity?.();
    });
  };

  // Escape backs out of "delete?" first; only a second one closes the card (Modal ignores a key someone handled)
  const stepBack = (e) => {
    if (e.key === "Escape" && ((confirming && !deleting) || discarding)) { e.preventDefault(); back(); }
  };

  const footer = discarding ? (
    <div className="ec-ft" onKeyDown={stepBack}>
      <p className="ec-confirm" role="alert"><b>Throw away what you typed?</b> Nothing has been saved.</p>
      <button type="button" ref={keepRef} className="ghost-button" onClick={back}>Keep editing</button>
      <button type="button" className="primary-button ec-btn-danger" onClick={onClose}>Discard</button>
    </div>
  ) : confirming ? (
    <div className="ec-ft" onKeyDown={stepBack}>
      <p className="ec-confirm" role="alert"><b>Delete “{deleteName}”?</b> {deleteNote || "This can't be undone."}</p>
      {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
      <button type="button" ref={keepRef} className="ghost-button" onClick={back} disabled={deleting}>Keep it</button>
      <button type="button" className="primary-button ec-btn-danger" onClick={remove} disabled={deleting}>{deleting ? "Deleting…" : "Yes, delete"}</button>
    </div>
  ) : (
    <div className="ec-ft">
      {onDelete && canEdit && !creating && (
        <button type="button" data-ec="delete" className="ghost-button ec-ft-l ec-danger" onClick={() => { remember(); setConfirming(true); }} disabled={saving}>Delete</button>
      )}
      {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
      {footerExtra}
      <button type="button" data-ec="close" className="ghost-button" onClick={ask} disabled={saving}>{closeLabel || (canEdit ? "Cancel" : "Close")}</button>
      {canEdit && onSave && (
        <button type="submit" className="primary-button" disabled={saving}>{saving ? savingLabel : submitLabel}</button>
      )}
    </div>
  );

  const tabId = (id) => `${uid}-tab-${id}`;
  const paneId = `${uid}-pane`;

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      size="card"
      className={cn("kmodal--ec", className)}
      glass
      onClose={busy ? undefined : ask}
      onSubmit={submit}
      footer={footer}
    >
      {/* phones, two panes: the same two halves as two tabs, so the sheet needs no scrolling */}
      {!sectioned && hasSide && (
        <div className="ec-tabs kregion-seg" role="tablist" aria-label="Card sections">
          {[["main", mainLabel], ["side", sideLabel]].map(([id, text]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={tabId(id)}
              aria-selected={tab === id}
              aria-controls={`${paneId}-${id}`}
              className={cn("kregion-seg-btn", tab === id && "is-on")}
              onClick={() => setTab(id)}
            >
              {text}
            </button>
          ))}
        </div>
      )}

      <div className={cn("ec", !hasSide && "ec--solo", sectioned && "ec--sections")} onInvalidCapture={showInvalid}>
        <div
          className={cn("ec-pane ec-main", !sectioned && hasSide && tab === "side" && "is-off")}
          id={`${paneId}-main`}
          role={sectioned ? "tabpanel" : undefined}
          aria-labelledby={sectioned ? tabId(section.id) : undefined}
        >
          {sectioned && (
            <div className="ec-sections ec-wide">
              <div className="kregion-seg" role="tablist" aria-label="Sections">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    id={tabId(s.id)}
                    aria-selected={section.id === s.id}
                    aria-controls={`${paneId}-main`}
                    className={cn("kregion-seg-btn", section.id === s.id && "is-on")}
                    onClick={() => setTab(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mainNode}
        </div>
        {hasSide && (
          <div className={cn("ec-pane ec-side", !sectioned && tab !== "side" && "is-off")} id={`${paneId}-side`}>
            {sideNode}
          </div>
        )}
      </div>
    </Modal>
  );
}
