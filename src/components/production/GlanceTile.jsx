import { Icons } from "../ui";
import { Money, Tile } from "../bento/Bento";

/**
 * The four numbers a manager asks first: how many orders are open, how many pieces that is, how
 * many are due this week and what they are worth. The number under "Due this week" is a button
 * that shows exactly those orders in the list.
 *
 * Each figure is a name (dt) and a value (dd); the stylesheet draws the value above its name.
 */
export default function GlanceTile({ stats, onQuick, loading }) {
  return (
    <Tile
      area="glance"
      icon={<Icons.Pulse size={14} sw={1.8} />}
      title="At a glance"
      note={stats.urgent > 0 ? `${stats.urgent} urgent` : undefined}
      loading={loading}
      align="top"
      className="pr-glance"
    >
      <dl className="pr-figs">
        <div className="pr-fig">
          <dt><span className="f">Open orders</span><span className="s">Open</span></dt>
          <dd>{stats.open.toLocaleString()}</dd>
        </div>
        <div className="pr-fig">
          <dt>Pieces</dt>
          <dd>{stats.units.toLocaleString()}</dd>
        </div>
        <div className="pr-fig">
          <dt><span className="f">Due this week</span><span className="s">Due soon</span></dt>
          <dd>
            {stats.dueWeek > 0 ? (
              <button type="button" className="pr-fig-btn" onClick={() => onQuick("week")} aria-label={`${stats.dueWeek} due this week. Show them in the list`}>
                {stats.dueWeek.toLocaleString()}
              </button>
            ) : 0}
          </dd>
        </div>
        <div className="pr-fig">
          <dt><span className="f">Open value</span><span className="s">Value</span></dt>
          <dd><Money npr={stats.value} compact /></dd>
        </div>
      </dl>
    </Tile>
  );
}
