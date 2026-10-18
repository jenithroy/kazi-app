import { useState } from "react";
import { cn } from "../ui";
import { fmtField } from "../../lib/calendar";
import { daysInVisit, isClosed, movedTo, stageIndex, stageVisits } from "../../lib/production";

const days = (n) => (n == null ? "" : n === 0 ? "same day" : `${n} day${n === 1 ? "" : "s"}`);

/** One line of what happened: the day, and who did it. */
function When({ date, by }) {
  return (
    <>
      <b>{date ? fmtField(date) : "Date not recorded"}</b>
      <span>{by || "who is not recorded"}</span>
    </>
  );
}

/**
 * What is known about one stage of an order, for the stage whose dot was pressed in the order card: when
 * the order came in, who moved it, when and by whom it moved on (or was sent back), and how long it stayed.
 * It is all read from the order's history, which records each move (the stage, the day, who): nothing else
 * about a stage is recorded, so that is all this says. "All moves" swaps it for the whole history.
 */
export default function StageHistory({ order, stage, today }) {
  const [all, setAll] = useState(false);
  const at = stageIndex(order.stage);
  const idx = stageIndex(stage);
  const visits = stageVisits(order.stageHistory, stage);
  const moves = order.stageHistory || [];
  const closed = isClosed(order);
  const hold = order.status === "On Hold";

  if (all) {
    return (
      <section className="pr-sh" aria-label="All moves">
        <header className="pr-sh-h">
          <h3 className="pr-sh-t">All moves</h3>
          <button type="button" className="pr-link" onClick={() => setAll(false)}>Back to {stage}</button>
        </header>
        <ul className="pr-sh-all">
          {moves.length === 0 && <li className="pr-sh-none">No moves are recorded for this order.</li>}
          {moves.map((m, i) => {
            const to = movedTo(m);
            return (
              <li key={`${m.date}-${m.stage}-${i}`}>
                <span className="pr-sh-d">{m.date ? fmtField(m.date) : "—"}</span>
                <span className="pr-sh-s">{to.back ? `Sent back to ${to.stage}` : to.stage}</span>
                <span className="pr-sh-b">{m.by}</span>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  const here = idx === at;
  // How long a stay lasted is known for one that ended, and for the one still going on at a working order.
  // For any other (a stage whose next move was never recorded; a finished order) counting up to today would be wrong.
  const stayOf = (v) => (v.left || (here && !closed) ? daysInVisit(v, today) : null);
  const spent = visits.reduce((sum, v) => sum + (stayOf(v) ?? 0), 0);
  let label;
  let tone;
  if (idx > at) { label = visits.length > 0 ? "Done earlier" : "Not reached yet"; tone = ""; }      // after a step back, the stages ahead were still done once
  else if (here && closed) { label = order.status === "Cancelled" ? "Stopped here" : "Finished here"; tone = order.status === "Cancelled" ? "bad" : "good"; }
  else if (here && hold) { label = "On hold here"; tone = "warn"; }
  else if (here) { label = "Here now"; tone = "good"; }
  else { label = "Done"; tone = ""; }

  return (
    <section className="pr-sh" aria-live="polite" aria-label={`${stage}: what happened there`}>
      <header className="pr-sh-h">
        <h3 className="pr-sh-t">{stage}</h3>
        <span className={cn("pr-tag", tone && `pr-tag--${tone}`)}>{label}</span>
        {visits.length > 0 && spent > 0 && <span className="pr-sh-days">{days(spent)} in all</span>}
        {moves.length > 0 && <button type="button" className="pr-link" onClick={() => setAll(true)}>All moves</button>}
      </header>

      {visits.length === 0 ? (
        <p className="pr-sh-none">
          {idx > at
            ? "Nothing has happened here yet."
            : here
              ? "The order is here, but no move into this stage is recorded."
              : "No record of when the order was here: it may have skipped this stage, or be older than the history."}
        </p>
      ) : (
        <div className="pr-sh-rows">
          {visits.map((v, i) => {
            const stay = stayOf(v);
            return (
              <dl key={`${v.date}-${i}`} className="pr-sh-visit">
                <div className="pr-sh-r">
                  <dt>{v.back ? "Sent back here" : i === 0 ? "Came in" : "Came back in"}</dt>
                  <dd><When date={v.date} by={v.by} /></dd>
                </div>
                {v.left && (
                  <div className="pr-sh-r">
                    <dt>{v.left.back ? `Sent back to ${v.left.to}` : `Moved on to ${v.left.to}`}</dt>
                    <dd><When date={v.left.date} by={v.left.by} /></dd>
                  </div>
                )}
                {v.left && stay != null && (
                  <div className="pr-sh-r is-note is-stay"><dt>Stayed</dt><dd><span>{days(stay)}</span></dd></div>
                )}
                {!v.left && here && !closed && (
                  <div className="pr-sh-r is-note">
                    <dt>Still here</dt>
                    <dd><span>{stay == null ? "no date to count from" : stay === 0 ? "less than a day so far" : `${days(stay)} so far`}</span></dd>
                  </div>
                )}
                {!v.left && !here && (
                  <div className="pr-sh-r is-note"><dt>Moved on</dt><dd><span>no later move is recorded</span></dd></div>
                )}
              </dl>
            );
          })}
        </div>
      )}
    </section>
  );
}
