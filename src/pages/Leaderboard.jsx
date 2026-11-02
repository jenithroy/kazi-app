/**
 * Leaderboard: who has put in the most hours this month, on the same frosted-glass frame as the other redone pages.
 *
 * It ranks everyone still Active by hours counted (lib/workHours.js): the time between clocking in and out that falls inside each
 * person's OWN hours that day, plus overtime approved before they clocked in. Time beyond their hours, or beyond an approval, counts
 * for nothing, so the board cannot be climbed by staying late unasked. Points are still on hold (2026-10-22: a task's priority is not
 * its value, and tasks were too easy to add and tick off), and this board does not use them: it is hours, which the clock-in records.
 *
 *   board  the top three on a podium and the rest under it, best first, with a month to look at (this one, or an earlier one)
 *   you    your place: where you stand, your hours, your overtime and the days you were counted
 *
 * The route is open to everyone signed in; the ranking is done by the database, which returns only what the board shows. A database
 * that does not have it yet (migration 0064) says so instead of showing an empty board. One screen on a laptop; on a phone the page
 * scrolls and the two tiles stack (MOBILE.md).
 */
import { useMemo, useState } from "react";
import { BentoGrid, BentoPage, EmptyNote, Tile } from "../components/bento/Bento";
import { Star } from "../components/bento/icons";
import { Icons } from "../components/ui";
import Board from "../components/leaderboard/Board";
import useWorkHours from "../hooks/useWorkHours";
import { useAuth } from "../context/AuthContext";
import { fmtMinutes, isoFromDate, monthOf, monthTitle, shiftMonth } from "../lib/attendance";
import "../components/leaderboard/leaderboard.css";
import "../components/leaderboard/board.css";

export default function Leaderboard() {
  const { profile } = useAuth();
  const me = profile?.personId || "";
  const current = useMemo(() => monthOf(isoFromDate(new Date())), []);
  const [month, setMonth] = useState(current);
  const board = useWorkHours({ from: month.start, to: month.end });
  const mine = board.rows.find((r) => r.personId === me) || null;
  const loading = board.status === "loading";

  let stage;
  if (board.status === "unavailable") {
    stage = <EmptyNote icon={<Icons.Trophy size={22} sw={1.5} />}>The leaderboard is not switched on in the database yet (it needs migration 0064).</EmptyNote>;
  } else if (board.status === "error") {
    stage = (
      <div className="kb-error" role="alert">
        <p>{board.error || "The leaderboard could not load."}</p>
        <button type="button" className="kb-btn kb-btn--ghost" onClick={board.reload}>Try again</button>
      </div>
    );
  } else if (board.rows.length === 0) {
    stage = <EmptyNote icon={<Icons.Trophy size={22} sw={1.5} />}>Nobody has clocked in during {monthTitle(month)} yet.</EmptyNote>;
  } else {
    stage = <Board rows={board.rows} meId={me} />;
  }

  return (
    <BentoPage className="lb-page">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Leaderboard</h1>
          <p className="kb-head-sub"><span>Hours worked inside each person's own hours, plus overtime approved before they clocked in</span></p>
        </div>
        <div className="kb-head-r">
          <div className="kb-head-act">
            <button type="button" className="kb-pillbtn" aria-label="Earlier month" onClick={() => setMonth(shiftMonth(month, -1))}>
              <Icons.ChevronLeft size={14} sw={2} aria-hidden="true" />
            </button>
            <span className="lbr-month" aria-live="polite">{monthTitle(month)}</span>
            <button type="button" className="kb-pillbtn" aria-label="Later month" disabled={month.start >= current.start} onClick={() => setMonth(shiftMonth(month, 1))}>
              <Icons.ChevronRight size={14} sw={2} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <BentoGrid layout="leaderboard">
        <Tile area="board" className="lb-board lb-board--real" icon={<Icons.Trophy size={14} sw={1.9} />} title="The team" note={monthTitle(month)} align="top" loading={loading}>
          {stage}
        </Tile>

        <Tile area="you" className="lb-you" icon={<Star size={14} sw={1.9} />} title="Your place" note={monthTitle(month)} align="center" loading={loading}>
          {mine ? (
            <>
              <div className="lbr-me"><span className="lbr-me-n">{mine.rank}</span><span className="lbr-me-of">of {board.rows.length}</span></div>
              <p className="lb-cap"><b>{fmtMinutes(mine.minutes)}</b> counted{mine.overtime > 0 ? <>, {fmtMinutes(mine.overtime)} of it overtime</> : null}</p>
              <p className="lb-cap">{mine.days} {mine.days === 1 ? "day" : "days"} counted</p>
            </>
          ) : (
            <p className="lb-cap">{board.status === "ready" ? `None of your hours are counted in ${monthTitle(month)} yet.` : "—"}</p>
          )}
        </Tile>
      </BentoGrid>
    </BentoPage>
  );
}
