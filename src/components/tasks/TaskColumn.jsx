import { useEffect, useRef, useState } from "react";
import { Icons, cn } from "../ui";
import TaskCard from "./TaskCard";
import { TONE_DOT } from "./tones";

/**
 * One section of the board: a glass pane with its name, how many tasks it holds, and a
 * list of cards that scrolls inside it. Press + to add a task in one line (type, Enter;
 * the box stays open for the next one). With edit rights the pane takes dropped cards,
 * and the dots open its settings.
 *
 * On a phone only the section picked in the tab strip is shown (`active`).
 */
export default function TaskColumn({
  col, tasks, today, canEdit, canTick, active, draggingId, leavingId,
  onQuickAdd, onOpen, onDone, onMenu, onSection, onDragStart, onDragEnd, onDropTask,
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef(null);

  useEffect(() => { if (adding) input.current?.focus(); }, [adding]);

  async function submit(e) {
    e.preventDefault();
    const text = title.trim();
    if (!text) return;
    setTitle("");
    const ok = await onQuickAdd(col, text);
    if (ok === false) setTitle(text);   // nothing was saved: keep what was typed
    input.current?.focus();
  }

  const droppable = canEdit && draggingId;

  return (
    <section
      className={cn("kb-tile", "tk-col", active && "is-active", over && "is-over")}
      style={{ "--dot": TONE_DOT[col.tone] || TONE_DOT.neutral }}
      data-section={col.id}
      onDragOver={droppable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (!over) setOver(true); } : undefined}
      onDragLeave={droppable ? (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); } : undefined}
      onDrop={droppable ? (e) => { e.preventDefault(); setOver(false); onDropTask(col); } : undefined}
    >
      <header className="tk-col-hd">
        <span className="tk-dot" aria-hidden="true" />
        <h2 className="tk-col-name" title={col.label}>{col.label}</h2>
        <span className="tk-count" aria-label={`${tasks.length} tasks`}>{tasks.length}</span>
        {canEdit && (
          <>
            <button type="button" className="tk-ibtn" onClick={() => setAdding((v) => !v)} aria-expanded={adding} aria-label={`Add a task to ${col.label}`} title="Add a task">
              <Icons.Plus size={16} sw={2} />
            </button>
            <button type="button" className="tk-ibtn" onClick={() => onSection(col)} aria-label={`Settings for ${col.label}`} title="Section settings">
              <Icons.More size={16} />
            </button>
          </>
        )}
      </header>

      <div className="tk-col-body">
        {adding && canEdit && (
          <form className="tk-add" onSubmit={submit}>
            <input
              ref={input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setAdding(false); setTitle(""); } }}
              placeholder="Task title, then Enter"
              aria-label={`New task in ${col.label}`}
              maxLength={200}
            />
          </form>
        )}

        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            today={today}
            canTick={canTick(task)}
            draggable={canEdit}
            leaving={leavingId === task.id}
            dragging={draggingId === task.id}
            onOpen={onOpen}
            onDone={onDone}
            onMenu={onMenu}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}

        {tasks.length === 0 && !adding && (
          <p className="tk-empty">{canEdit ? "Nothing here. Press + to add a task, or drag one in." : "Nothing here."}</p>
        )}
      </div>
    </section>
  );
}
