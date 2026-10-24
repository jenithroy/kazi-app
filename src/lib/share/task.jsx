/**
 * A task as one PDF (pdfKit's CardDoc), for "Send to chat". DESIGN.md "Send to chat" has the contract.
 *
 * It is sent from the task card (components/tasks/TaskPanel.jsx), which hands over what it shows right now, field by field, so the copy
 * says what is on the screen the sender is looking at and nothing the card does not show. There is no money on a task, and no points:
 * the user has put points on hold, so none appear on Tasks and none go in a copy.
 *
 *   record = {
 *     title, description, notes,   the card's "Title", "Details" and "Progress update"
 *     status,                      the section the task is in ("In progress"); "Done" for one that is finished
 *     done, completedAt,           finished or not, and when (a timestamp)
 *     priority,                    "high" | "med" | "low" (older rows say "Medium": `normPriority` reads them)
 *     dueDate,                     "YYYY-MM-DD" or ""
 *     assignee,                    the name of whoever it is for ("" when nobody)
 *     customer, category, orderRef, region,
 *     createdBy, createdAt,        "Added by X" and the day, the card's own subtitle
 *   }
 */
import { fmtField } from "../calendar";
import { fmtDay, normPriority } from "../tasks";
import { normaliseRegion, regionLabel } from "../../utils/region";
import { logoDataUrl, safeFileName, takenAt } from "./helpers";
import { fitSections, softWrap } from "./softWrap";

const PRIORITY = { high: "High", med: "Medium", low: "Low" };

/** A day as the card's date field writes it ("22 Oct 2026"), or "" for none. */
const dayText = (iso) => (iso ? fmtField(String(iso)) || String(iso) : "");

/** A timestamp as a day with its year ("17 Oct 2026"), or "" when it is not one. */
function stampText(value) {
  if (!value) return "";
  const text = fmtDay(value, true);
  return text === "—" ? "" : text;
}

/** The page: what the PDF says, as plain data. Exported so a test can read it without making the file. */
export function layoutOf(record) {
  const r = record || {};
  const priority = normPriority(r.priority);
  const region = normaliseRegion(r.region);
  const added = [r.createdBy && `Added by ${r.createdBy}`, stampText(r.createdAt)].filter(Boolean).join(" · ");
  const sections = [
    {
      heading: "Who and when",
      rows: [
        ["Assigned to", r.assignee || "Nobody yet"],
        ["Due date", dayText(r.dueDate) || "No due date"],
        ["Finished", r.done ? stampText(r.completedAt) : ""],
        ["Customer", r.customer],
        ["Order reference", r.orderRef],
        ["Category", r.category],
        ["Region", region ? regionLabel(region) : ""],
      ],
    },
  ];
  if (String(r.description || "").trim()) sections.push({ heading: "Details", text: String(r.description).trim() });
  if (String(r.notes || "").trim()) sections.push({ heading: "Progress update", text: String(r.notes).trim() });

  return {
    title: String(r.title || "").trim() || "Untitled task",
    subtitle: added,
    badges: [
      { text: r.done ? "Done" : r.status || "No section", tone: r.done ? "good" : "info" },
      { text: `${PRIORITY[priority]} priority`, tone: priority === "high" ? "bad" : "neutral" },
    ],
    sections,
  };
}

export default {
  label: "Task",

  describe(record) {
    return { title: String(record?.title || "").trim() || "Untitled task", subtitle: [record?.done ? "Done" : record?.status, record?.assignee].filter(Boolean).join(" · ") };
  },

  async build(record, { profile } = {}) {
    if (!record) throw new Error("There is no task to send.");

    // The PDF maker is fetched now, alongside the logo, and not before.
    const [{ CardDoc, pdfFile }, logo] = await Promise.all([import("./pdfKit.jsx"), logoDataUrl()]);
    const page = layoutOf(record);
    // free text (a title, the details, an update) may hold a long pasted word or link: softWrap lets all of it show, and leaves ordinary text alone
    const doc = (
      <CardDoc
        kind="Task" title={softWrap(page.title, 30)} subtitle={softWrap(page.subtitle, 64)} badges={page.badges.map((b) => ({ ...b, text: softWrap(b.text, 40) }))}
        sections={fitSections(page.sections)} logo={logo} takenAt={takenAt()} by={profile?.name || ""}
      />
    );
    return pdfFile(doc, safeFileName(`Task ${page.title}`, "pdf"));
  },
};
