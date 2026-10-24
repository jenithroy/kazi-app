import { useMemo, useState } from "react";
import Modal from "../Modal";
import { Avatar, hueFromName } from "../ui";
import { fmtDay } from "../../lib/tasks";
import PersonLink from "../profile/PersonLink";
import "./tasks.css";

const PAGE = 60;

/**
 * Everything this person cleared away on this device, or that finished more than a week
 * ago. The Archive is a personal view, not a place in the database: someone else's looks
 * different. Nothing here is lost: a task can be reopened and goes back to the section it
 * came from. People who can edit Tasks can also delete for good, one at a time or the whole
 * lot, which removes the task for everyone.
 *
 * A task finished before completion dates were kept has no date to show, so it says so
 * rather than guessing one.
 */
export default function ArchiveDialog({ tasks, canEdit, canReopen, onReopen, onDelete, onDeleteAll, onClose }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => [t.title, t.assignee, t.customer, t.orderRef].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [tasks, query]);

  return (
    <Modal
      title="Archive"
      subtitle={`${tasks.length} finished ${tasks.length === 1 ? "task" : "tasks"} put away on this device. Reopen one to bring it back.`}
      size="lg"
      glass
      onClose={onClose}
      footer={(
        <>
          {canEdit && tasks.length > 0 && (
            <button type="button" className="ghost-button tk-ft-l tk-danger" onClick={onDeleteAll}>Delete all {tasks.length}…</button>
          )}
          <button type="button" className="primary-button" onClick={onClose}>Done</button>
        </>
      )}
    >
      <div className="tk-form">
        <label className="tk-f tk-full">
          <span className="tk-sr">Search the archive</span>
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="Search by title, person, customer or order" />
        </label>
      </div>

      {found.length === 0 ? (
        <p className="tk-hint tk-gap-t">{tasks.length === 0 ? "Nothing is archived." : "Nothing matches that."}</p>
      ) : (
        <div className="tk-gap-s">
          {found.slice(0, shown).map((t) => (
            <div className="tk-arow" key={t.id}>
              {t.assignee && (
                <PersonLink decor personId={t.assignee_id || undefined} name={t.assignee}>
                  <Avatar name={t.assignee} personId={t.assignee_id || undefined} hue={hueFromName(t.assignee)} size={26} />
                </PersonLink>
              )}
              <div className="tk-arow-t">
                <b title={t.title}>{t.title}</b>
                <span>
                  {t.assignee ? <PersonLink personId={t.assignee_id || undefined} name={t.assignee} /> : "Unassigned"}
                  {t.customer ? ` · ${t.customer}` : ""}
                  {" · "}
                  {t.completedAt ? `finished ${fmtDay(t.completedAt, true)}` : "finish date not recorded"}
                </span>
              </div>
              {canReopen(t) && <button type="button" className="ghost-button" onClick={() => onReopen(t)}>Reopen</button>}
              {canEdit && <button type="button" className="ghost-button tk-danger" onClick={() => onDelete(t)} aria-label={`Delete: ${t.title}`}>Delete</button>}
            </div>
          ))}
          {found.length > shown && (
            <button type="button" className="ghost-button tk-gap-m" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, found.length - shown)} more
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
