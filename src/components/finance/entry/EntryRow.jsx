/**
 * The row of empty fields at the top of a table: type a record straight into the table, press Enter, and it is on the list.
 *
 * It is drawn by DataTable (its `entry` prop) between the head and the rows, so it stays put while the rows scroll, and it takes
 * the table's own column tracks, so each field sits under the head it belongs to. `cells` says what goes in each column (by the
 * column's id); a column with nothing in it is left empty. The button that saves sits in the last cell on show (or the cell
 * `saveAt` names). A word about what went wrong is a bubble under the box it is about; what went right is the button turning into a tick.
 *
 * Everything here is markup. What a row writes and when it may is in the tab's own entry (ExpenseEntry …) and in useEntry.
 */
import { useId, useLayoutEffect, useState } from "react";
import { Icons, cn } from "../../ui";
import "./entry.css";

/** The page is laid out as a phone's from here down (a single column that scrolls as one): a row of fields would scroll away with it. */
const PHONE = "(max-width: 768px)";

/**
 * Does the table at this width still show every column the row needs? (A narrow table drops columns; a row missing a field must not
 * be drawn. Nor is one drawn on a phone, whatever columns are left.)
 */
export const fits = (ctx, ids) => {
  if (typeof window !== "undefined" && window.matchMedia?.(PHONE).matches) return false;
  return ids.every((id) => ctx.visible.some((c) => c.id === id));
};

function SaveButton({ busy, waiting, saved, onClick, label }) {
  return (
    <button
      type="button" className={cn("fe-save", busy && "is-busy", waiting && "is-wait", saved && "is-done")} onClick={onClick}
      aria-disabled={busy || waiting || undefined} title={`${label} (Enter)`} aria-label={label}
    >
      {saved ? <Icons.Check size={15} sw={2.4} aria-hidden="true" /> : busy ? <span className="fe-spin" aria-hidden="true" /> : <Icons.Plus size={15} sw={2.2} aria-hidden="true" />}
    </button>
  );
}

export default function EntryRow({ ctx, label, cells, saveAt, saveLabel, busy, waiting, saved, problem, onSubmit, onKeyDown, rowRef, onFull, idOf }) {
  const { visible } = ctx;
  const home = saveAt && visible.some((c) => c.id === saveAt) ? saveAt : visible[visible.length - 1]?.id;
  const first = visible[0]?.id;
  const msgId = useId();

  // The complaint is drawn under the box it is about (the amount, a long way to the right), not at the row's left edge; one that is about
  // no box in particular (the database said no) goes under the button. The box is told too, for a screen reader: it is invalid, and the
  // bubble is its description (the boxes that take `invalid` as a prop say so themselves; a dropdown or a paperclip is told here).
  // A box that is already saying what is wrong with itself (the date, with the reason it is not one) keeps its own bubble: two would be
  // drawn over each other.
  const [about, setAbout] = useState(null);
  const [own, setOwn] = useState(false);
  useLayoutEffect(() => {
    if (!problem) { setAbout(null); setOwn(false); return undefined; }
    const box = problem.field && idOf ? rowRef.current?.querySelector(`#${CSS.escape(idOf(problem.field))}`) : null;
    setAbout(box?.closest("[data-col]")?.getAttribute("data-col") || null);
    const saying = Boolean(box?.hasAttribute("data-said"));
    setOwn(saying);
    if (!box || saying) return undefined;
    const marked = box.getAttribute("aria-invalid") !== "true";
    box.setAttribute("aria-describedby", msgId);
    if (marked) box.setAttribute("aria-invalid", "true");
    return () => { box.removeAttribute("aria-describedby"); if (marked) box.removeAttribute("aria-invalid"); };
  }, [problem, idOf, rowRef, msgId]);
  const under = problem && !own ? (about && visible.some((c) => c.id === about) ? about : home) : null;

  return (
    <div
      ref={rowRef} className={cn("dt-entry fe-row", busy && "is-busy", problem && "is-bad")} role="row" aria-label={label} aria-busy={busy || undefined}
      data-flow-root="" data-no-shortcuts="" onKeyDown={onKeyDown}
    >
      {visible.map((c) => {
        const toRight = c.align === "end" || c.id === home;           // a bubble under a box at the right grows leftward, so it stays inside the pane
        return (
          <div key={c.id} role="cell" className={cn("dt-cell fe-cell", c.align === "end" && "fe-end", c.id === under && "has-msg")} data-col={c.id}>
            {cells[c.id] ?? null}
            {c.id === home ? <SaveButton busy={busy} waiting={waiting} saved={Boolean(saved)} onClick={onSubmit} label={saveLabel} /> : null}
            {c.id === first ? <span className="fn-sr" role="status">{saved ? `Saved. ${saved.label}` : ""}</span> : null}
            {c.id === under ? (
              <div id={msgId} className={cn("fe-msg", toRight && "fe-msg--end")} role="alert">
                <Icons.Alert size={14} sw={1.9} aria-hidden="true" />
                <span>{problem.message}</span>
                {problem.full && onFull ? <button type="button" className="fe-msg-act" onClick={onFull}>Open the full form</button> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
