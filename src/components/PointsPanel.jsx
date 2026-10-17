import { useEffect, useState } from "react";
import { useMyPoints } from "../hooks/usePoints";
import { fetchMyHistory } from "../lib/points";
import { fmtPoints, levelFor } from "../constants/points";
import { relativeDay } from "../utils/date";
import "./points.css";

/**
 * "Points" in the profile card: how many, what level that makes you, where you stand
 * this week, and the last few things that earned them.
 *
 * Says nothing at all until the database has points (migration 0057), rather than
 * showing an error to everyone who opens their profile.
 */
export default function PointsPanel() {
  const { status, data } = useMyPoints();
  const [recent, setRecent] = useState([]);

  // the list follows the total: a task finished elsewhere changes it
  const total = data?.total;
  useEffect(() => {
    if (status !== "ready") return undefined;
    let live = true;
    fetchMyHistory(5).then((rows) => { if (live) setRecent(rows); }).catch(() => { if (live) setRecent([]); });
    return () => { live = false; };
  }, [status, total]);

  if (status === "unavailable") return null;

  const loading = status === "idle" || status === "loading";
  const level = levelFor(data?.total);
  const pct = Math.round(level.progress * 100);

  return (
    <section className="kprof-sec kpts" aria-label="Your points">
      <div className="kprof-sech">
        <h4 className="kprof-h">Points</h4>
        {data && <span className="kpts-week" title="Earned since Sunday">This week <b>+{fmtPoints(data.week)}</b></span>}
      </div>

      {loading && <span className="kprof-skel" aria-hidden="true" />}
      {status === "error" && <p className="kprof-note kprof-note--err" role="alert">Couldn't load your points.</p>}

      {data && (
        <>
          <div className="kpts-main">
            <div className="kpts-total"><b>{fmtPoints(data.total)}</b><span>points</span></div>
            <div className="kpts-level">
              <div className="kpts-level-row">
                <span className="kpts-level-name">{level.name}</span>
                <span className="kpts-level-next">{level.next ? `${fmtPoints(level.toNext)} to ${level.next}` : "Top level"}</span>
              </div>
              <div
                className="kpts-bar"
                role="progressbar"
                aria-label={level.next ? `Progress to ${level.next}` : "Top level reached"}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>

          <p className="kpts-rank">
            {data.rankWeek
              ? <>#{data.rankWeek} of {data.peopleWeek} this week</>
              : "No points yet this week"}
          </p>

          {recent.length > 0 ? (
            <ul className="kpts-list">
              {recent.map((r, i) => (
                <li key={`${r.awardedAt}-${i}`}>
                  <b className="kpts-plus">+{fmtPoints(r.points)}</b>
                  <span className="kpts-why" title={r.reason}>{r.reason}</span>
                  <span className="kpts-when">{relativeDay(r.awardedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="kprof-note">Finish a task that's assigned to you to earn points.</p>
          )}
        </>
      )}
    </section>
  );
}
