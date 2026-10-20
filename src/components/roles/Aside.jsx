/**
 * The two tiles beside the open role: what everyone on the Nepal team is asked to do, and how the roles sit together. Neither
 * depends on which role is open. Each scrolls inside itself when the window is short.
 */
import { Tile } from "../bento/Bento";
import { Icons } from "../ui";
import { ORG_TIERS, SHARED_DUTIES } from "../../lib/roles";
import { Duty } from "./parts";

export function SharedTile({ loading }) {
  return (
    <Tile area="shared" icon={<Icons.Employees size={14} sw={1.8} />} title="Everyone on the Nepal team" note={`${SHARED_DUTIES.length} duties`} loading={loading} align="top" className="rl-aside">
      <ol className="rl-sd" tabIndex={0} aria-label="What everyone on the Nepal team is asked to do">
        {SHARED_DUTIES.map((d) => <Duty key={d.what} d={d} />)}
      </ol>
    </Tile>
  );
}

export function OrgTile({ loading }) {
  return (
    <Tile area="org" icon={<Icons.Directors size={14} sw={1.8} />} title="How the roles sit together" loading={loading} align="top" className="rl-aside">
      <ul className="rl-org" tabIndex={0} aria-label="How the roles sit together">
        {ORG_TIERS.map(({ tier, desc }) => (
          <li key={tier}>
            <i aria-hidden="true" />
            <span><b>{tier}</b><span>{desc}</span></span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}
