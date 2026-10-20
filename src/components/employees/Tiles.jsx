import { Icons } from "../ui";
import { Figure, Money, Sub, Tile } from "../bento/Bento";
import { plural } from "../../lib/employees";

const ico = { size: 14, sw: 1.8 };

/**
 * The four numbers behind the people list: how many are on the team, what their basic pay comes to, who has no working hours
 * (the attendance rules then judge them by a default), and how many are tagged as production workers (the labour cost of an
 * order counts only their pay, or everyone's while nobody is tagged). Each one is also a way into the list below: it sets the
 * list's filter, or goes to Payroll. None is tinted: none of them is an alarm, they are what the other pages are working from.
 */

/** Everyone who is active, and how they split between the two sides of the business. */
export function PeopleTile({ sum, loading, onOpen }) {
  return (
    <Tile
      area="ppl" onOpen={onOpen} label="Show the people who are active"
      icon={<Icons.Employees {...ico} />} title="On the team" loading={loading} align="top" className="em-kpi"
    >
      <Figure unit={plural(sum.active, "person", "people")}>{sum.active}</Figure>
      <Sub>
        <b>{sum.nepal}</b> Nepal · <b>{sum.uk}</b> UK
        {sum.inactive > 0 ? <span className="kb-w-300"> · {sum.inactive} inactive</span> : ""}
      </Sub>
    </Tile>
  );
}

/** What the active team's basic pay comes to in a month. Opens Payroll for anyone who may see it; hidden from those who may not. */
export function PayTile({ sum, loading, to, hidden }) {
  return (
    <Tile
      area="pay" to={to} can={hidden ? () => false : undefined} label="Open payroll"
      icon={<Icons.Wallet {...ico} />} title="Basic pay" loading={loading} align="top" className="em-kpi"
    >
      <Figure><Money npr={sum.basic} compact={sum.basic >= 1e7} /></Figure>
      <Sub>{sum.withPay === 0 ? "None set on anyone" : <>a month · <b>{sum.withPay}</b> of {sum.active} set</>}</Sub>
    </Tile>
  );
}

/** Active people with no working hours: the ones the lateness rules have to guess for. */
export function HoursTile({ sum, loading, onOpen }) {
  const n = sum.noHours;
  return (
    <Tile
      area="hrs" onOpen={n > 0 ? onOpen : undefined} label="Show the people with no working hours"
      icon={<Icons.Clock {...ico} />} title="No working hours" loading={loading} align="top" className="em-kpi"
    >
      <Figure unit={n === 0 ? undefined : plural(n, "person", "people")}>{n}</Figure>
      <Sub>{n === 0 ? "Everyone has hours set" : "Marked late from 10:00"}</Sub>
    </Tile>
  );
}

/** Production workers: the people whose pay makes up the labour cost of an order (everyone tagged counts, whatever their status). */
export function CrewTile({ sum, loading, onOpen }) {
  const n = sum.prod;
  return (
    <Tile
      area="crew" onOpen={n > 0 ? onOpen : undefined} label="Show the production workers"
      icon={<Icons.Production {...ico} />} title={<>Production<span className="kb-w-200"> workers</span></>} loading={loading} align="top" className="em-kpi"
    >
      <Figure>{n}</Figure>
      <Sub>
        {n === 0 ? <>None tagged<span className="kb-w-300"> · labour uses all pay</span></>
          : <>Labour cost uses their pay{sum.prodInactive > 0 ? <span className="kb-w-300"> · {sum.prodInactive} inactive</span> : ""}</>}
      </Sub>
    </Tile>
  );
}
