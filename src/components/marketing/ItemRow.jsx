/**
 * One piece of work as a row in a list (the day pane's and the ideas pane's): a small picture or a coloured dot, the title, a line
 * under it, and the type. The whole row is the button that opens its card; `trailing` is a second button beside it (the ideas
 * pane's "put it on the chosen day"). A row can be dragged by a mouse when `draggable`; the picture is a link somebody pasted, so
 * where it will not load the dot stands in for it.
 */
import { useState } from "react";
import { cn } from "../ui";
import { DRAG_TYPE, titleOf } from "../../lib/contentCalendar";

const firstLine = (s) => String(s || "").split(/\r?\n/).find((l) => l.trim())?.trim() || "";

function Thumb({ item }) {
  const [bad, setBad] = useState(false);
  if (!item.mediaUrl || bad) return <i className={cn("mk-dot", `mk-t-${item.type.toLowerCase()}`)} aria-hidden="true" />;
  return <img className="mk-thumb" src={item.mediaUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}

/** `when`: a short date to lead the second line with (a list that spans days); the row's own time and notes follow it. */
export default function ItemRow({ item, when, onOpen, trailing, draggable, dragging, onDragStart, onDragEnd }) {
  const line = [when, item.timeSlot, firstLine(item.notes)].filter(Boolean).join(" · ");
  return (
    <li
      className={cn("mk-item", dragging && "is-dragging")}
      draggable={draggable || undefined}
      onDragStart={draggable ? (e) => { e.dataTransfer.setData(DRAG_TYPE, item.id); e.dataTransfer.effectAllowed = "move"; onDragStart?.(item.id, item.placed); } : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      <button type="button" className="mk-row" onClick={() => onOpen(item.id)}>
        <Thumb item={item} />
        <span className="mk-row-t">
          <b>{titleOf(item)}</b>
          {line && <span>{line}</span>}
        </span>
        <span className={cn("mk-tag", `mk-t-${item.type.toLowerCase()}`)}>{item.type}</span>
      </button>
      {trailing}
    </li>
  );
}
