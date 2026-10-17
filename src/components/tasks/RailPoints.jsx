import { useEffect, useState } from "react";
import { Figure, Meter, Sub } from "../bento/Bento";
import { Star } from "../bento/icons";
import { Avatar, hueFromName } from "../ui";
import { useAuth } from "../../context/AuthContext";
import { useMyPoints } from "../../hooks/usePoints";
import { fetchLeaderboard } from "../../lib/points";
import { fmtPoints, levelFor } from "../../constants/points";

/**
 * Two tiles for the Tasks page's rail: how many points I have and where that puts me, and
 * who is ahead this week. Both draw nothing at all until the database has points
 * (migration 0057), so the page looks complete either way.
 */

export function PointsTile() {
  const { status, data } = useMyPoints();
  if (status === "unavailable" || status === "idle") return null;
  const level = data ? levelFor(data.total) : null;

  return (
    <section className="kb-tile" aria-label="Your points">
      <div className="kb-hd">
        <span className="kb-chip" aria-hidden="true"><Star size={14} sw={1.9} /></span>
        <h2 className="kb-ttl">Your points</h2>
        {data && <span className="kb-note">{data.week ? `+${fmtPoints(data.week)} this week` : "none this week"}</span>}
      </div>
      {status === "loading" && <span className="kb-skel kb-skel--lg" aria-hidden="true" />}
      {status === "error" && <p className="tk-empty">Couldn't load your points.</p>}
      {data && (
        <div className="tk-pt-main">
          <Figure unit="pts">{fmtPoints(data.total)}</Figure>
          <Meter pct={level.progress * 100} />
          <div className="tk-pt-row">
            <b>{level.name}</b>
            <span>{level.next ? `${fmtPoints(level.toNext)} to ${level.next}` : "Top level"}</span>
          </div>
          <Sub>{data.rankWeek ? `#${data.rankWeek} of ${data.peopleWeek} this week` : "Finish a task to get on this week's board"}</Sub>
        </div>
      )}
    </section>
  );
}

export function LeaderboardTile() {
  const { profile } = useAuth();
  const { status, data } = useMyPoints();
  const [rows, setRows] = useState(null);   // null = loading
  const total = data?.total;

  useEffect(() => {
    if (status !== "ready") return undefined;
    let live = true;
    fetchLeaderboard("week", 6).then((r) => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [status, total]);

  if (status === "unavailable" || status === "idle") return null;

  return (
    <section className="kb-tile" aria-label="This week's leaders">
      <div className="kb-hd">
        <span className="kb-chip" aria-hidden="true"><Star size={14} sw={1.9} /></span>
        <h2 className="kb-ttl">This week</h2>
        <span className="kb-note">Sun–Sat</span>
      </div>
      {rows === null && <span className="kb-skel" aria-hidden="true" />}
      {rows && rows.length === 0 && <p className="tk-empty">No points yet this week. Finish a task to be first on the board.</p>}
      {rows && rows.length > 0 && (
        <ol className="tk-lb">
          {rows.map((r) => (
            <li key={r.personId} className={r.personId === profile?.personId ? "is-me" : undefined}>
              <span className="n">{r.rank}</span>
              <Avatar name={r.name} personId={r.personId} hue={hueFromName(r.name)} size={22} />
              <span className="w">{r.name}{r.personId === profile?.personId ? " (you)" : ""}</span>
              <span className="p">{fmtPoints(r.points)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
