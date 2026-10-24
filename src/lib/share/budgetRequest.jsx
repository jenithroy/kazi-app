/**
 * A request from the Budget page (a budget request, BR-079, or a requirement) as one PDF: what the request card
 * (components/budget/RequestCard.jsx) shows: the title, the amount asked for (rupees and pounds, as the card writes them), the reason, who
 * asked and in what job, when, how urgently, the category, the type, the quantity (a requirement), the reference, the side of the
 * business, the status, and (once decided) who decided and when.
 *
 * The card is read-only and shows the same to everyone who can open it (a position that may decide only gets the Approve and Reject
 * buttons), so the copy is the same whoever sends it. "N days ago" is left out: a copy does not update, and the footer says when it was taken.
 *
 * `record` is the budget_requests row the card holds.
 */
import { fromNPR, formatIn } from "../../utils/currency";
import { askedDay, decidedDay, fmtDay, isBudgetKind, isRequirement, isWaiting, kindLabel, requestAmount, roleLabel, statusLabel, statusTone, urgencyLabel, urgencyTone } from "../budget";
import { normaliseRegion, regionLabel } from "../../utils/region";
import { logoDataUrl, rs, safeFileName, takenAt } from "./helpers";
import { fitSections, softWrap } from "./softWrap";

const text = (v) => (v === undefined || v === null ? "" : String(v).trim());

/** "Rs 1,20,000 (£600.00)": rupees first, then the pounds the card writes beside them. */
function amountText(row) {
  const a = requestAmount(row);
  return a ? `${rs(a.npr)} (${formatIn(fromNPR(a.gbpNpr, "GBP"), "GBP")})` : "No amount given";
}

export default {
  label: "Request",

  describe(row) {
    const ref = text(row?.brId);
    return { title: `${ref ? `${ref} · ` : ""}${text(row?.title) || "Untitled request"}`, subtitle: kindLabel(row) };
  },

  async build(row, { profile } = {}) {
    // The PDF maker is fetched now, alongside the logo, and not before.
    const [{ CardDoc, pdfFile }, logo] = await Promise.all([import("./pdfKit.jsx"), logoDataUrl()]);

    const title = text(row.title) || "Untitled request";
    const asked = askedDay(row);
    const decided = decidedDay(row);
    const side = normaliseRegion(row.region);
    const reason = text(row.notes);

    const sections = [
      { heading: "Amount asked for", rows: [["Amount", amountText(row)]] },
      { heading: isBudgetKind(row) ? "Justification" : "Notes", text: reason || "No reason was given." },
    ];
    if (!isWaiting(row)) {
      sections.push({
        heading: "Decision",
        rows: [["Decision", statusLabel(row)], ["Decided by", text(row.reviewedBy)], ["Decided on", decided ? fmtDay(decided) : ""]],
      });
    }
    sections.push({
      heading: "The request",
      rows: [
        ["Requested by", text(row.requestedBy) || "Unknown"],
        ["Role", roleLabel(row.requestedByRole)],
        ["Asked", asked ? fmtDay(asked) : "—"],
        ["Category", text(row.category) || "—"],
        ["Type", kindLabel(row)],
        ...(isRequirement(row) ? [["Quantity", text(row.quantity) || "—"]] : []),
        ["Reference", text(row.brId)],
        ["Region", side ? regionLabel(side) : ""],
      ],
    });

    const doc = (
      <CardDoc
        kind={kindLabel(row)} title={softWrap(title, 30)}
        subtitle={softWrap([text(row.brId), asked ? `asked ${fmtDay(asked)}` : ""].filter(Boolean).join(" · "), 64)}
        badges={[
          { text: statusLabel(row), tone: statusTone(row) },
          { text: text(row.urgency) ? `${urgencyLabel(row.urgency)} urgency` : "Urgency not said", tone: urgencyTone(row.urgency) },
        ]}
        sections={fitSections(sections)} logo={logo} takenAt={takenAt()} by={profile?.name || ""}
      />
    );
    return pdfFile(doc, safeFileName(`${kindLabel(row)} ${text(row.brId)} ${title}`, "pdf"));
  },
};
