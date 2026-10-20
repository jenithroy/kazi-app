import { Icons } from "../ui";
import { Figure, Money, Sub, Tile } from "../bento/Bento";
import { plural } from "../../lib/budget";

const ico = { size: 14, sw: 1.8 };

/**
 * The four numbers a director reads before anything else: what is waiting and how much it asks for, how much of it is
 * urgent, how long the longest has waited, and what has been signed off. Each one is also a way into the list below
 * (it sets the list's filter, or opens the request it names). A tile is tinted only when it is asking for attention.
 */

/** Everything waiting for a decision, and the money it asks for. */
export function WaitingTile({ sum, loading, onOpen }) {
  const { count: n, total, none } = sum.waiting;
  return (
    <Tile
      area="wait" tone={n > 0 ? "amber" : "wash"} onOpen={onOpen} label="Show the requests that are waiting"
      icon={<Icons.Budget {...ico} />} title="Waiting" loading={loading} align="top" className="bd-kpi"
    >
      <Figure unit={plural(n, "request")}>{n}</Figure>
      <Sub>
        {n === 0 ? "Nothing waiting for sign-off"
          : total > 0 ? <><b><Money npr={total} compact /></b> in total{none ? <span className="kb-w-300"> · {none} with no amount</span> : ""}</>
          : "No amounts given"}
      </Sub>
    </Tile>
  );
}

/** The waiting requests marked High. */
export function UrgentTile({ sum, loading, onOpen }) {
  const { count: n, total } = sum.urgent;
  return (
    <Tile
      area="urg" tone={n > 0 ? "terra" : "default"} onOpen={onOpen} label="Show the urgent requests that are waiting"
      icon={<Icons.Alert {...ico} />} title="Urgent" loading={loading} align="top" className="bd-kpi"
    >
      <Figure>{n}</Figure>
      <Sub>{n === 0 ? "None marked High" : total > 0 ? <><b><Money npr={total} compact /></b> marked High</> : "marked High"}</Sub>
    </Tile>
  );
}

/** How long the request that has waited longest has been waiting; pressing it opens that request. */
export function LongestTile({ oldest, loading, onOpen }) {
  return (
    <Tile
      area="old" onOpen={oldest ? () => onOpen(oldest.row) : undefined} label={oldest ? `Open ${oldest.row.title}, the longest wait` : undefined}
      icon={<Icons.Clock {...ico} />} title="Longest wait" loading={loading} align="top" className="bd-kpi"
    >
      {oldest ? (
        <>
          <Figure unit={plural(oldest.days, "day")}>{oldest.days}</Figure>
          <Sub><b>{oldest.row.title || "Untitled"}</b></Sub>
        </>
      ) : (
        <>
          <Figure>—</Figure>
          <Sub>Nothing waiting</Sub>
        </>
      )}
    </Tile>
  );
}

/** What has been approved so far, and how many were turned down. */
export function ApprovedTile({ sum, loading, onOpen }) {
  const { count: n, total } = sum.approved;
  return (
    <Tile
      area="appr" onOpen={onOpen} label="Show the approved requests"
      icon={<Icons.Check {...ico} />} title={<>Approved<span className="kb-w-200"> so far</span></>} loading={loading} align="top" className="bd-kpi"
    >
      <Figure><Money npr={total} /></Figure>
      <Sub>
        {n === 0 && sum.rejected === 0 ? "Nothing decided yet"
          : <><b>{n}</b> approved{sum.rejected > 0 ? <> · <b>{sum.rejected}</b> rejected</> : ""}</>}
      </Sub>
    </Tile>
  );
}
