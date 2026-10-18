import { Icons } from "../ui";
import { EmptyNote, RowList, Tile } from "../bento/Bento";
import { DayRow } from "./DayRows";

/**
 * The latest days of the month on screen, newest first, as many as fit. Pressing one opens it in
 * the "Today" tile, the same as pressing it on the calendar.
 */
export default function RecentTile({ days, today, date, onPick, loading }) {
  const past = days.filter((d) => d.iso <= today).reverse().slice(0, 20);
  return (
    <Tile area="recent" icon={<Icons.Calendar size={14} sw={1.8} />} title="Recent days" loading={loading} align="top" className="at-recent">
      {past.length === 0 ? (
        <EmptyNote icon={<Icons.Calendar size={22} sw={1.5} />}>Nothing to show for this month yet.</EmptyNote>
      ) : (
        <RowList className="kb-fill">
          {past.map((d) => <DayRow key={d.iso} day={d} today={today} onPick={onPick} active={d.iso === date} />)}
        </RowList>
      )}
    </Tile>
  );
}
