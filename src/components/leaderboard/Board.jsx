import { Avatar, cn, hueFromName } from "../ui";
import { Star } from "../bento/icons";
import PersonLink from "../profile/PersonLink";
import { fmtMinutes } from "../../lib/attendance";

/** Second, first and third, left to right: the winner is in the middle and stands tallest. */
const PODIUM = [2, 1, 3];

/**
 * The real board (the picture of it was the preview): the top three on a podium and everybody else under it, best first. `rows`
 * are lib/workHours.js's; `meId` is the person looking, whose place is marked. Hours are what the database credited: inside each
 * person's own hours, plus overtime approved before they clocked in (and that part is said under their hours).
 */
export default function Board({ rows, meId }) {
  const rest = rows.slice(3);
  return (
    <div className="lbr">
      <div className="lb-podium">
        {PODIUM.map((n) => {
          const r = rows[n - 1];
          return (
            <div key={n} className={`lb-step lb-step--${n}`}>
              {r ? (
                <>
                  {n === 1 && <Star className="lb-crown" size={18} sw={1.8} />}
                  <span className={cn("lbr-av", r.personId === meId && "is-me")}>
                    <Avatar name={r.name} personId={r.personId} hue={hueFromName(r.name)} size={n === 1 ? 58 : 48} />
                  </span>
                  <span className="lbr-who">
                    <b className="lbr-name"><PersonLink className="kpl--clip" personId={r.personId} name={r.name} /></b>
                    <span className="lbr-hrs">{fmtMinutes(r.minutes)}</span>
                    {r.overtime > 0 && <span className="lbr-ot">incl. {fmtMinutes(r.overtime)} overtime</span>}
                  </span>
                  <span className="lb-block" data-n={r.rank} />
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {rest.length > 0 && (
        <ol className="lbr-rows" start={4} aria-label="The rest of the team">
          {rest.map((r) => (
            <li key={r.personId} className={cn(r.personId === meId && "is-me")}>
              <span className="lbr-n">{r.rank}</span>
              <Avatar name={r.name} personId={r.personId} hue={hueFromName(r.name)} size={30} />
              <span className="lbr-who lbr-who--row">
                <b className="lbr-name"><PersonLink className="kpl--clip" personId={r.personId} name={r.name} /></b>
                {r.overtime > 0 && <span className="lbr-ot">incl. {fmtMinutes(r.overtime)} overtime</span>}
              </span>
              <span className="lbr-hrs">{fmtMinutes(r.minutes)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
