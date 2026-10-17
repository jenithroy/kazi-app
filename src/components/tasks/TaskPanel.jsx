import { useMemo, useState } from "react";
import Modal from "../Modal";
import { RegionSelect } from "../RegionSwitch";
import { TASK_CATEGORIES } from "../../constants";
import { fmtPoints, taskPoints } from "../../constants/points";
import { fmtDay, isDone, normPriority } from "../../lib/tasks";
import "./tasks.css";

/**
 * A task's details, in a drawer from the right (a bottom sheet on a phone): making a new
 * one, changing an existing one, or, for someone who may only finish their own tasks,
 * reading it and ticking it off.
 *
 * The person is chosen, not typed: a task assigned to a person is what earns them points
 * and shows their picture. An older task that only carries a typed name keeps it until
 * someone picks a person.
 *
 * `onSave(patch)` resolves to `{ ok, message }`; the drawer closes only when it worked.
 */

const PRIORITIES = [["high", "High"], ["med", "Medium"], ["low", "Low"]];

function formFor(task, { personId, sectionId, region }) {
  if (!task) {
    return {
      title: "", description: "", notes: "", assignee: personId || "", priority: "med", dueDate: "",
      sectionId: sectionId || "", customer: "", category: "", orderRef: "", region: region || "",
    };
  }
  return {
    title: task.title || "",
    description: task.description || "",
    notes: task.notes || "",
    assignee: personId || (task.assignee ? `name:${task.assignee}` : ""),
    priority: normPriority(task.priority),
    dueDate: task.dueDate || "",
    sectionId: sectionId || "",
    customer: task.customer || "",
    category: task.category || "",
    orderRef: task.orderRef || "",
    region: task.region || "",
  };
}

export default function TaskPanel({
  mode, task, personId, sectionId, columns, people, customers, canEdit, canTick, today, region,
  onSave, onDelete, onDone, onReopen, onClose,
}) {
  const creating = mode === "create";
  const done = !creating && isDone(task);
  const [form, setForm] = useState(() => formFor(creating ? null : task, { personId, sectionId, region }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setError(""); };
  const editable = canEdit;

  // A typed name from before people could be chosen, kept as an option so it is not lost.
  const typed = form.assignee.startsWith("name:") ? form.assignee.slice(5) : "";
  const person = useMemo(() => people.find((p) => p.id === form.assignee) || null, [people, form.assignee]);

  const worth = person ? taskPoints({ priority: form.priority, dueDate: form.dueDate }, today) : null;

  async function submit(e) {
    e.preventDefault();
    if (!editable || saving) return;
    if (!form.title.trim()) { setError("Give the task a title."); return; }
    setSaving(true);
    setError("");
    const res = await onSave({
      title: form.title.trim(),
      description: form.description,
      notes: form.notes,
      priority: form.priority,
      dueDate: form.dueDate || null,
      sectionId: form.sectionId || null,
      customer: form.customer,
      category: form.category,
      orderRef: form.orderRef.trim(),
      region: form.region || null,
      assignee_id: person ? person.id : null,
      assignee: person ? person.name : typed,
    });
    if (res?.ok) { onClose(); return; }
    setError(res?.message || "Couldn't save. Try again.");
    setSaving(false);
  }

  const subtitle = creating
    ? "Fill in what you know. Only the title is needed."
    : [task.createdBy && `Added by ${task.createdBy}`, task.createdAt && fmtDay(task.createdAt, true)].filter(Boolean).join(" · ")
      || undefined;

  const footer = (
    <>
      {!creating && editable && (
        <button type="button" className="ghost-button tk-ft-l tk-danger" onClick={() => onDelete(task)}>Delete</button>
      )}
      {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
      {!creating && canTick && !done && <button type="button" className="ghost-button" onClick={() => onDone(task)}>Mark done</button>}
      {!creating && canTick && done && <button type="button" className="ghost-button" onClick={() => onReopen(task)}>Reopen</button>}
      <button type="button" className="ghost-button" onClick={onClose}>{editable ? "Cancel" : "Close"}</button>
      {editable && (
        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? "Saving…" : creating ? "Create task" : "Save changes"}
        </button>
      )}
    </>
  );

  return (
    <Modal
      title={creating ? "New task" : "Task"}
      subtitle={subtitle}
      size="drawer"
      glass
      onClose={onClose}
      onSubmit={submit}
      footer={footer}
    >
      <div className="tk-form">
        <label className="tk-f tk-full">Title
          <input value={form.title} onChange={set("title")} placeholder="What needs doing?" maxLength={200} disabled={!editable} required />
        </label>

        <label className="tk-f tk-full">Assigned to
          <select value={form.assignee} onChange={set("assignee")} disabled={!editable}>
            <option value="">Nobody yet</option>
            {typed && <option value={form.assignee}>{typed} (not in the directory)</option>}
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        <div className="tk-f">
          Priority
          <div className="kregion-seg" role="radiogroup" aria-label="Priority">
            {PRIORITIES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={form.priority === id}
                className={`kregion-seg-btn${form.priority === id ? " is-on" : ""}`}
                disabled={!editable}
                onClick={() => { setForm((f) => ({ ...f, priority: id })); setError(""); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="tk-f">Due date
          <input type="date" value={form.dueDate} onChange={set("dueDate")} disabled={!editable} />
        </label>

        {worth && !done && (
          <p className="tk-hint tk-full">
            Finishing it earns <b>{fmtPoints(worth.total)} points</b>
            {worth.bonus ? <> ({fmtPoints(worth.base)}, plus {fmtPoints(worth.bonus)} for finishing by the due date)</> : null}.
          </p>
        )}

        <label className="tk-f tk-full">Details
          <textarea value={form.description} onChange={set("description")} rows={3} placeholder="Anything the person needs to know" disabled={!editable} />
        </label>
        <label className="tk-f tk-full">Progress update
          <textarea value={form.notes} onChange={set("notes")} rows={2} placeholder="Where it has got to" disabled={!editable} />
        </label>

        <label className="tk-f">Section
          <select value={form.sectionId} onChange={set("sectionId")} disabled={!editable}>
            {columns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="tk-f">Category
          <select value={form.category} onChange={set("category")} disabled={!editable}>
            <option value="">None</option>
            {TASK_CATEGORIES.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
          </select>
        </label>

        <label className="tk-f">Customer
          <select value={form.customer} onChange={set("customer")} disabled={!editable}>
            <option value="">None</option>
            {form.customer && !customers.some((c) => c.name === form.customer) && <option value={form.customer}>{form.customer}</option>}
            {customers.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </label>
        <label className="tk-f">Order reference
          <input value={form.orderRef} onChange={set("orderRef")} placeholder="e.g. KZ-2418" maxLength={60} disabled={!editable} />
        </label>

        <label className="tk-f tk-full">Region
          <RegionSelect value={form.region} onChange={(v) => setForm((f) => ({ ...f, region: v }))} disabled={!editable} />
        </label>

        {!editable && <p className="tk-hint tk-full">You can read this task{canTick ? " and mark it done" : ""}. Changing it is for people who can edit Tasks.</p>}
      </div>
    </Modal>
  );
}
