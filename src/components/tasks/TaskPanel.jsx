import { useId, useMemo, useState } from "react";
import Modal from "../Modal";
import Select from "../Select";
import DatePicker from "../DatePicker";
import { Avatar, cn, hueFromName } from "../ui";
import { Star } from "../bento/icons";
import { REGIONS } from "../../utils/region";
import { TASK_CATEGORIES } from "../../constants";
import { fmtPoints, taskPoints } from "../../constants/points";
import { fmtDay, isDone, normPriority } from "../../lib/tasks";
import { TONE_DOT } from "./tones";
import "./tasks.css";

/**
 * A task's details, in a card in the middle of the screen like the profile card: what the
 * task is on the left (title, details, progress), and who, when and where on the right.
 * Making a new one, changing an existing one, or, for someone who may only finish their own
 * tasks, reading it and ticking it off.
 *
 * It never scrolls: it is wide enough to hold every field at once. On a phone, where there
 * is not that much width, the same two halves become two tabs inside the sheet, so it still
 * does not scroll.
 *
 * The person is chosen, not typed: a task assigned to a person is what earns them points
 * and shows their picture. An older task that only carries a typed name keeps it until
 * someone picks a person.
 *
 * `onSave(patch)` resolves to `{ ok, message }`; the card closes only when it worked.
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
  const uid = useId();
  const fid = (name) => `${uid}-${name}`;
  const creating = mode === "create";
  const done = !creating && isDone(task);
  const [form, setForm] = useState(() => formFor(creating ? null : task, { personId, sectionId, region }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("task");          // on a phone: "task" | "who"
  const patch = (key) => (value) => { setForm((f) => ({ ...f, [key]: value })); setError(""); };
  const set = (key) => (e) => patch(key)(e.target.value);
  const editable = canEdit;

  // A typed name from before people could be chosen, kept as an option so it is not lost.
  const typed = form.assignee.startsWith("name:") ? form.assignee.slice(5) : "";
  const person = useMemo(() => people.find((p) => p.id === form.assignee) || null, [people, form.assignee]);

  const worth = person ? taskPoints({ priority: form.priority, dueDate: form.dueDate }, today) : null;

  const peopleOptions = useMemo(() => [
    { value: "", label: "Nobody yet" },
    ...(typed ? [{ value: form.assignee, label: `${typed} (not in the directory)` }] : []),
    ...people.map((p) => ({
      value: p.id, label: p.name,
      icon: <Avatar name={p.name} personId={p.id} hue={hueFromName(p.name)} size={22} />,
    })),
  ], [people, typed, form.assignee]);
  const sectionOptions = useMemo(() => columns.map((c) => ({ value: c.id, label: c.label, dot: TONE_DOT[c.tone] || TONE_DOT.neutral })), [columns]);
  const categoryOptions = useMemo(() => [{ value: "", label: "None" }, ...TASK_CATEGORIES.map((c) => ({ value: c.label, label: c.label }))], []);
  const customerOptions = useMemo(() => [
    { value: "", label: "None" },
    ...(form.customer && !customers.some((c) => c.name === form.customer) ? [{ value: form.customer, label: form.customer }] : []),
    ...customers.map((c) => ({ value: c.name, label: c.name })),
  ], [customers, form.customer]);
  const regionOptions = useMemo(() => [{ value: "", label: "Not set" }, ...REGIONS.map((r) => ({ value: r.id, label: r.label }))], []);

  async function submit(e) {
    e.preventDefault();
    if (!editable || saving) return;
    if (!form.title.trim()) { setTab("task"); setError("Give the task a title."); return; }
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
      size="card"
      className="kmodal--task"
      glass
      onClose={onClose}
      onSubmit={submit}
      footer={footer}
    >
      {/* phones only: the two halves as tabs, so the sheet needs no scrolling */}
      <div className="tk-ed-tabs kregion-seg" role="tablist" aria-label="Task sections">
        {[["task", "The task"], ["who", "Who and when"]].map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={fid(`tab-${id}`)}
            aria-selected={tab === id}
            aria-controls={fid(`pane-${id}`)}
            className={cn("kregion-seg-btn", tab === id && "is-on")}
            onClick={() => setTab(id)}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="tk-ed">
        <div className={cn("tk-ed-pane tk-ed-main", tab !== "task" && "is-off")} id={fid("pane-task")} role="tabpanel" aria-labelledby={fid("tab-task")}>
          <div className="tk-f">
            <label htmlFor={fid("title")}>Title</label>
            <input id={fid("title")} value={form.title} onChange={set("title")} placeholder="What needs doing?" maxLength={200} disabled={!editable} required />
          </div>
          <div className="tk-f tk-grow">
            <label htmlFor={fid("details")}>Details</label>
            <textarea id={fid("details")} value={form.description} onChange={set("description")} placeholder="Anything the person needs to know" disabled={!editable} />
          </div>
          <div className="tk-f tk-grow">
            <label htmlFor={fid("notes")}>Progress update</label>
            <textarea id={fid("notes")} value={form.notes} onChange={set("notes")} placeholder="Where it has got to" disabled={!editable} />
          </div>

          <div className={cn("tk-worth", !(worth && !done) && "is-quiet")} aria-live="polite">
            {worth && !done ? (
              <>
                <Star size={16} aria-hidden="true" />
                <span>
                  <b>{fmtPoints(worth.total)} points</b>
                  <small>{worth.bonus ? `${fmtPoints(worth.base)} for finishing it, plus ${fmtPoints(worth.bonus)} if it is done by the due date` : "for finishing it"}</small>
                </span>
              </>
            ) : done ? (
              <span className="tk-worth-note">Finished{task?.completedAt ? ` ${fmtDay(task.completedAt)}` : ""}.</span>
            ) : (
              <span className="tk-worth-note">Pick a person to see what finishing it earns.</span>
            )}
          </div>
        </div>

        <div className={cn("tk-ed-pane tk-ed-side", tab !== "who" && "is-off")} id={fid("pane-who")} role="tabpanel" aria-labelledby={fid("tab-who")}>
          <div className="tk-f tk-wide">
            <label htmlFor={fid("assignee")}>Assigned to</label>
            <Select id={fid("assignee")} label="Assigned to" value={form.assignee} onChange={patch("assignee")} options={peopleOptions} placeholder="Nobody yet" disabled={!editable} searchPlaceholder="Find a person" />
          </div>

          <div className="tk-f">
            <span id={fid("prio")}>Priority</span>
            <div className="kregion-seg tk-prio" role="radiogroup" aria-labelledby={fid("prio")}>
              {PRIORITIES.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={form.priority === id}
                  className={cn("kregion-seg-btn", form.priority === id && "is-on")}
                  disabled={!editable}
                  onClick={() => patch("priority")(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="tk-f">
            <label htmlFor={fid("due")}>Due date</label>
            <DatePicker id={fid("due")} label="Due date" value={form.dueDate} onChange={patch("dueDate")} disabled={!editable} today={today} placeholder="No due date" />
          </div>

          <div className="tk-f">
            <label htmlFor={fid("section")}>Section</label>
            <Select id={fid("section")} label="Section" value={form.sectionId} onChange={patch("sectionId")} options={sectionOptions} placeholder="Choose a section" disabled={!editable} />
          </div>
          <div className="tk-f">
            <label htmlFor={fid("category")}>Category</label>
            <Select id={fid("category")} label="Category" value={form.category} onChange={patch("category")} options={categoryOptions} placeholder="None" disabled={!editable} />
          </div>

          <div className="tk-f tk-wide">
            <label htmlFor={fid("customer")}>Customer</label>
            <Select id={fid("customer")} label="Customer" value={form.customer} onChange={patch("customer")} options={customerOptions} placeholder="None" disabled={!editable} searchPlaceholder="Find a customer" />
          </div>
          <div className="tk-f">
            <label htmlFor={fid("order")}>Order reference</label>
            <input id={fid("order")} value={form.orderRef} onChange={set("orderRef")} placeholder="e.g. KZ-2418" maxLength={60} disabled={!editable} />
          </div>

          <div className="tk-f">
            <label htmlFor={fid("region")}>Region</label>
            <Select id={fid("region")} label="Region" value={form.region} onChange={patch("region")} options={regionOptions} placeholder="Not set" disabled={!editable} />
          </div>
          {!editable && (
            <p className="tk-hint tk-wide">You can read this task{canTick ? " and mark it done" : ""}. Changing it is for people who can edit Tasks.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
