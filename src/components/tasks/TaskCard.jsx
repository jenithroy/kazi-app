import { Avatar, Icons, cn, hueFromName } from "../ui";
import { dueInfo, normPriority } from "../../lib/tasks";
import PersonLink from "../profile/PersonLink";

/**
 * One task on the board: a tick to finish it, the title and what it is about, who it is
 * for and when it is due. Click it for the details; the three dots are for moving it or
 * deleting it.
 *
 * It is a plain article with three real buttons in it (tick, open, options), so a
 * keyboard and a screen reader get the same three things a mouse does. Dragging is for
 * a mouse only (touch screens have the options menu to move a card).
 *
 * The line with who it is for sits beside the "open" button, not inside it: the name is a
 * button of its own (it opens that person's profile), and a button cannot hold a button.
 * The whole line still opens the task for a mouse, apart from the name.
 */
export default function TaskCard({
  task, today, canTick, draggable, leaving, dragging,
  onOpen, onDone, onMenu, onDragStart, onDragEnd,
}) {
  const prio = normPriority(task.priority);
  const due = dueInfo(task.dueDate, today);
  const first = (task.assignee || "").trim().split(/\s+/)[0];

  const openOnKey = (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(task); }
  };

  return (
    <article
      className={cn("tk-card", leaving && "is-leaving", dragging && "is-dragging")}
      draggable={draggable || undefined}
      onDragStart={draggable ? (e) => { e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; onDragStart(task); } : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      data-task={task.id}
    >
      <button
        type="button"
        className="tk-tick"
        onClick={() => onDone(task)}
        disabled={!canTick}
        aria-label={`Mark done: ${task.title}`}
        title={canTick ? "Mark done" : "Only the person it is assigned to can finish this"}
      >
        <Icons.Check size={13} sw={2.4} />
      </button>

      <div className="tk-body">
        {/* No aria-label: its name is its own text (title, customer, note), which is what is on screen. */}
        <div className="tk-main" role="button" tabIndex={0} onClick={() => onOpen(task)} onKeyDown={openOnKey}>
          <span className="tk-title">{task.title}</span>
          {(prio === "high" || task.customer || task.category || task.orderRef) && (
            <span className="tk-meta">
              {prio === "high" && <span className="tk-chip tk-chip--high">High</span>}
              {task.customer && <span className="tk-chip">{task.customer}</span>}
              {task.category && <span className="tk-chip tk-chip--plain">{task.category}</span>}
              {task.orderRef && <span className="tk-ref">{task.orderRef}</span>}
            </span>
          )}
          {task.notes && <span className="tk-note" title={task.notes}>Update: {task.notes}</span>}
        </div>
        <span className="tk-foot" onClick={() => onOpen(task)}>
          {task.assignee ? (
            <PersonLink className="tk-who" personId={task.assignee_id || undefined} name={task.assignee}>
              <Avatar name={task.assignee} personId={task.assignee_id || undefined} hue={hueFromName(task.assignee)} size={20} />
              <span>{first}</span>
            </PersonLink>
          ) : (
            <span className="tk-who">Unassigned</span>
          )}
          {due && <span className={cn("tk-due", due.tone !== "plain" && `tk-due--${due.tone}`)}>{due.label}</span>}
        </span>
      </div>

      <button
        type="button"
        className="tk-ibtn"
        onClick={(e) => onMenu(task, e.currentTarget)}
        aria-label={`Options for: ${task.title}`}
        aria-haspopup="menu"
      >
        <Icons.More size={16} />
      </button>
    </article>
  );
}
