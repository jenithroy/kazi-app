/**
 * Leaderboard: a PREVIEW of the board that is coming, on the same frosted-glass frame as the other redone pages.
 *
 * It does nothing and shows nobody. Points are on hold (2026-10-22: a task's priority is not its value, and tasks
 * were too easy to add and tick off), so what staff see is the shape of the board with the names left out: a
 * podium and a few rows drawn as grey placeholders, a glass card saying "Coming soon" over them, and an empty
 * "Your place" beside it. No names, no numbers and no rules are shown on purpose: nothing has been decided
 * about what earns points, and the extra pay that will follow the points has not been announced.
 *
 * It reads no data, so there is nothing to load, fail or gate: the route is open to everyone signed in, the
 * same as Roles & Duties. The preview is `aria-hidden` and `inert` (it is a picture, not content), and the
 * words that matter ("Coming soon", "Nothing is being counted yet") are real text. When the real board is built
 * it replaces the preview in the `board` tile and the ring in the `you` tile; the helpers it will use are in
 * constants/points.js, lib/points.js, hooks/usePoints.js and components/PointsPanel.jsx.
 *
 * One screen on a laptop; on a phone the page scrolls and the two tiles stack (MOBILE.md).
 */
import { BentoGrid, BentoPage, Tile } from "../components/bento/Bento";
import { Star } from "../components/bento/icons";
import { Icons } from "../components/ui";
import "../components/leaderboard/leaderboard.css";

/** A head and shoulders, standing in for someone's picture. */
function Person() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="9" r="3.6" />
      <path d="M5 20c.7-3.6 3.5-5.6 7-5.6s6.3 2 7 5.6" />
    </svg>
  );
}

/** Second, first and third, left to right: the winner is in the middle and stands tallest. */
const PODIUM = [2, 1, 3];
const ROWS = [4, 5, 6, 7, 8];

/**
 * The picture. The rank numbers are drawn by the stylesheet from `data-n`, not written as text, so nothing in it
 * reads as content to a screen reader or a contrast checker.
 */
function Sketch() {
  return (
    <div className="lb-preview" aria-hidden="true" inert="">
      <div className="lb-podium">
        {PODIUM.map((n) => (
          <div key={n} className={`lb-step lb-step--${n}`}>
            {n === 1 && <Star className="lb-crown" size={18} sw={1.8} />}
            <span className="lb-av lb-av--lg"><Person /></span>
            <span className="lb-bar lb-bar--name" />
            <span className="lb-bar lb-bar--pts" />
            <span className="lb-block" data-n={n} />
          </div>
        ))}
      </div>
      <ol className="lb-rows">
        {ROWS.map((n) => (
          <li key={n}>
            <span className="lb-n" data-n={n} />
            <span className="lb-av"><Person /></span>
            <span className="lb-bar lb-bar--name" />
            <span className="lb-bar lb-bar--pts" />
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Leaderboard() {
  return (
    <BentoPage className="lb-page">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Leaderboard</h1>
          <p className="kb-head-sub"><span>A first look at what&apos;s coming</span></p>
        </div>
      </header>

      <BentoGrid layout="leaderboard">
        <Tile area="board" className="lb-board" icon={<Icons.Trophy size={14} sw={1.9} />} title="The team" note="Preview" align="top">
          <div className="lb-stage">
            <Sketch />
            <div className="lb-veil">
              <div className="lb-card">
                <span className="lb-card-chip" aria-hidden="true"><Icons.Trophy size={20} sw={1.7} /></span>
                <h3>Coming soon</h3>
                <p>Nothing is being counted yet.</p>
              </div>
            </div>
          </div>
        </Tile>

        <Tile area="you" className="lb-you" icon={<Star size={14} sw={1.9} />} title="Your place" note="Preview" align="center">
          <div className="lb-ring" aria-hidden="true">
            <svg viewBox="0 0 100 100"><circle className="lb-ring-track" cx="50" cy="50" r="43" /></svg>
            <span className="lb-ring-mid" />
          </div>
          <p className="lb-cap">Nothing is being counted yet.</p>
        </Tile>
      </BentoGrid>
    </BentoPage>
  );
}
