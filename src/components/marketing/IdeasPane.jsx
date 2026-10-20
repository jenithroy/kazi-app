/**
 * The ideas inbox: work with no day yet. A box on top takes a title and Enter adds it (the cursor stays in the box, so several
 * ideas can go in one after another); each row opens its card, can be dragged onto a day by a mouse, and has a button that puts it
 * on the day chosen on the calendar (the way to do it from a keyboard or a phone, where there is no dragging). Work dragged back
 * onto this pane goes back to the inbox.
 */
import { useRef, useState } from "react";
import { Icons, cn } from "../ui";
import { EmptyNote, Tile } from "../bento/Bento";
import ItemRow from "./ItemRow";
import { dayShort, titleOf } from "../../lib/contentCalendar";

export default function IdeasPane({
  ideas, date, canEdit, loading, onOpen, onQuickAdd, onSchedule,
  drag, over, onOver, onDropHere, onDragStart, onDragEnd,
}) {
  const [text, setText] = useState("");
  const box = useRef(null);
  const busy = useRef(false);
  const dropping = Boolean(drag?.placed);                    // only work that is on a day can be dropped back here

  async function add() {
    const title = text.trim();
    if (!title || busy.current) { box.current?.focus(); return; }
    busy.current = true;
    try {
      if (await onQuickAdd(title)) setText("");
    } finally {
      busy.current = false;
      box.current?.focus({ preventScroll: true });
    }
  }

  return (
    <Tile
      area="ideas" title="Ideas" note={`${ideas.length} waiting`} icon={<Icons.Pin size={14} sw={1.9} />}
      align="top" loading={loading} className="mk-pane" label="Ideas inbox"
    >
      <div
        className={cn("mk-pane-body", "mk-ideas", dropping && over === "inbox" && "is-over")}
        onDragOver={(e) => { if (!dropping) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== "inbox") onOver("inbox"); }}
        onDragLeave={(e) => { if (dropping && !e.currentTarget.contains(e.relatedTarget)) onOver(null); }}
        onDrop={(e) => { if (!dropping) return; e.preventDefault(); onDropHere(); }}
      >
        {canEdit && (
          <form className="mk-quick" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input
              ref={box} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an idea, then Enter"
              aria-label="New idea" maxLength={200} enterKeyHint="done" autoComplete="off"
            />
            <button type="submit" className="mk-quick-go" aria-label="Add idea" title="Add idea"><Icons.Plus size={15} sw={2.2} aria-hidden="true" /></button>
          </form>
        )}

        {ideas.length > 0 ? (
          <ul className="mk-list" aria-label="Ideas waiting for a day">
            {ideas.map((it) => (
              <ItemRow
                key={it.id} item={it} onOpen={onOpen} draggable={canEdit} dragging={drag?.id === it.id}
                onDragStart={onDragStart} onDragEnd={onDragEnd}
                trailing={canEdit && (
                  <button
                    type="button" className="mk-sched" onClick={() => onSchedule(it.id)}
                    aria-label={`Put “${titleOf(it)}” on ${dayShort(date)}`} title={`Put on ${dayShort(date)}`}
                  >
                    <Icons.Calendar size={14} sw={1.9} aria-hidden="true" />
                  </button>
                )}
              />
            ))}
          </ul>
        ) : (
          <EmptyNote icon={<Icons.Pin size={20} sw={1.5} />}>{canEdit ? "No ideas waiting. Type one above." : "No ideas waiting."}</EmptyNote>
        )}
      </div>
    </Tile>
  );
}
