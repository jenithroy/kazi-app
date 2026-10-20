/**
 * Small pieces of the Roles & Duties page: a person on a role's card, and one duty (drawn in the role's card and, shorter, in the
 * "Everyone on the Nepal team" tile).
 */
import { Link } from "react-router-dom";
import { Avatar, Icons, cn, hueFromName } from "../ui";
import { SECTION_LABEL, SECTION_PATH } from "../../lib/roles";
import { TOURS, tourHref } from "../../lib/tours";

/** One person holding a role: their face, name and email, their working hours, and a mark when it is you. */
export function Member({ m, isYou }) {
  const hours = m.scheduleStart && m.scheduleEnd ? `${m.scheduleStart}–${m.scheduleEnd}` : null;
  return (
    <li className={cn("rl-mem", isYou && "is-you")}>
      <Avatar name={m.name} personId={m.id} hue={hueFromName(m.name)} size={36} />
      <span className="rl-mem-t">
        <b>{m.name}{isYou && <em className="rl-you">You</em>}</b>
        <small>{m.email}</small>
      </span>
      {hours && <span className="rl-mem-h" title="Working hours">{hours}</span>}
    </li>
  );
}

/**
 * One duty: what to log, how often, why it matters, and where to do it (the page, and a "Show me" walk-through when there is one).
 * A tile too low to hold the explanation leaves it out (roles.css decides, from the tile's height).
 */
export function Duty({ d }) {
  const path = SECTION_PATH[d.section];
  const tour = d.tour && TOURS[d.tour] ? d.tour : null;
  return (
    <li className="rl-duty">
      <div className="rl-duty-h">
        <span className="rl-duty-t">{d.what}</span>
        <span className="rl-cad">{d.cadence}</span>
      </div>
      {d.detail && <p className="rl-duty-d">{d.detail}</p>}
      {(path || tour) && (
        <div className="rl-duty-l">
          {path && <Link to={path}>{SECTION_LABEL[d.section]} <Icons.ArrowRight size={12} sw={2} aria-hidden="true" /></Link>}
          {tour && (
            <Link className="rl-show" to={tourHref(tour)} aria-label={`Show me how: ${d.what}`}>
              <Icons.MapPin size={12} sw={2} aria-hidden="true" /> Show me
            </Link>
          )}
        </div>
      )}
    </li>
  );
}
