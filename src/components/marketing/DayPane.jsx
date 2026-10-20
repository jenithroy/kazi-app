/**
 * The day chosen on the calendar: what is planned that day, one row each (a row opens its card), and a button that starts
 * something new for it. A day with nothing on it lists what is coming up instead of sitting empty, so the pane is useful on every
 * day. This is also where a keyboard or a screen reader finds the work a day box only shows as chips.
 */
import { Icons } from "../ui";
import { EmptyNote, Tile } from "../bento/Bento";
import ItemRow from "./ItemRow";
import { dayShort } from "../../lib/contentCalendar";

export default function DayPane({ date, today, list, upcoming, canEdit, loading, onOpen, onAdd, drag, onDragStart, onDragEnd }) {
  const title = `${date === today ? "Today, " : ""}${dayShort(date)}`;
  const rowProps = { onOpen, draggable: canEdit, onDragStart, onDragEnd };

  return (
    <Tile
      area="day" title={title} note={list.length ? `${list.length} planned` : "nothing planned"}
      icon={<Icons.Calendar size={14} sw={1.9} />} align="top" loading={loading} className="mk-pane" label={`Planned for ${title}`}
    >
      <div className="mk-pane-body">
        {list.length > 0 ? (
          <ul className="mk-list" aria-label={`Planned for ${title}`}>
            {list.map((it) => <ItemRow key={it.id} item={it} dragging={drag?.id === it.id} {...rowProps} />)}
          </ul>
        ) : upcoming.length > 0 ? (
          <>
            <p className="mk-hint">Nothing is planned for this day. Coming up:</p>
            <ul className="mk-list" aria-label="Coming up">
              {upcoming.map((it) => <ItemRow key={it.id} item={it} when={dayShort(it.date)} dragging={drag?.id === it.id} {...rowProps} />)}
            </ul>
          </>
        ) : (
          <EmptyNote icon={<Icons.Calendar size={20} sw={1.5} />}>Nothing is planned yet.</EmptyNote>
        )}
      </div>
      {canEdit && (
        <button type="button" className="kb-btn kb-btn--ghost kb-act mk-add" onClick={() => onAdd(date)}>
          <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> Add to {dayShort(date)}
        </button>
      )}
    </Tile>
  );
}
