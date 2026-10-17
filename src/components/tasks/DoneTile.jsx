import { useState } from "react";
import { Archive, Undo } from "../bento/icons";
import { Avatar, Icons, cn, hueFromName } from "../ui";
import { relativeDay } from "../../utils/date";

/**
 * The finished tasks of the last week, in the rail. A task ticked off lands here, a week
 * later it moves to the Archive by itself, and "Clear" sends the lot there at once, with
 * an Undo for a few seconds. Points are not affected by any of it: they were paid when the
 * task was finished.
 *
 * Dropping a card on this tile finishes it, for people who prefer dragging to ticking.
 */
export default function DoneTile({
  tasks, archivedCount, canClear, canReopen, canFinishDrop, draggingId,
  undo, onUndo, onClear, onReopen, onOpenArchive, onOpen, onDropTask,
}) {
  const [over, setOver] = useState(false);
  const droppable = canFinishDrop && draggingId;

  return (
    <section
      className={cn("kb-tile", "tk-rt--grow", over && "tk-rt--over")}
      aria-label="Done"
      onDragOver={droppable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (!over) setOver(true); } : undefined}
      onDragLeave={droppable ? (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); } : undefined}
      onDrop={droppable ? (e) => { e.preventDefault(); setOver(false); onDropTask(); } : undefined}
    >
      <div className="kb-hd">
        <span className="kb-chip" aria-hidden="true"><Icons.Check size={14} sw={2.2} /></span>
        <h2 className="kb-ttl">Done</h2>
        <span className="kb-note">{tasks.length ? `${tasks.length} this week` : "last 7 days"}</span>
        {canClear && tasks.length > 0 && (
          <button type="button" className="tk-rt-act" onClick={onClear} title="Move all of these to the Archive">Clear</button>
        )}
      </div>

      {undo && (
        <div className="tk-undo" role="status">
          <span>Cleared {undo.count} {undo.count === 1 ? "task" : "tasks"}</span>
          <button type="button" onClick={onUndo}>Undo</button>
        </div>
      )}

      <div className="tk-scroll">
        {tasks.length === 0 ? (
          <p className="tk-empty">{droppable ? "Drop it here to finish it." : "Nothing finished this week yet."}</p>
        ) : (
          tasks.map((t) => (
            <div className="tk-drow" key={t.id}>
              <div className="tk-drow-t">
                <b title={t.title}>{t.title}</b>
                <span>
                  {t.assignee ? t.assignee.split(/\s+/)[0] : "Unassigned"}
                  {t.completedAt ? ` · ${relativeDay(t.completedAt)}` : ""}
                </span>
              </div>
              {t.assignee && <Avatar name={t.assignee} personId={t.assignee_id || undefined} hue={hueFromName(t.assignee)} size={22} />}
              {canReopen(t) && (
                <button type="button" className="tk-ibtn" onClick={() => onReopen(t)} aria-label={`Reopen: ${t.title}`} title="Reopen">
                  <Undo size={15} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <button type="button" className="tk-rt-act tk-rt-foot" onClick={onOpenArchive}>
        <Archive size={14} /> Archive{archivedCount ? ` (${archivedCount})` : ""}
      </button>
    </section>
  );
}
