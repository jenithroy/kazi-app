/**
 * An expense (money spent that is not a bill from a supplier) as one PDF: what its card in Finance
 * (components/finance/cards/ExpenseCard.jsx) shows: the category, the amount, the date, how it was paid (and the bank), which side of the
 * business it is filed under, the note, whether it is paid, whether it has a VAT bill, and who logged it. Nothing is added that the card
 * does not show; in particular the VAT bill's file is not part of it (the card links to it, and a bill goes in Chat as its own VAT bill).
 *
 * The amount is in rupees, the books' money, whatever currency the sender has picked for their screen. `record` is the expense row the card
 * holds. The copy is the SAVED expense, not what is half typed in the form.
 */
import { logoDataUrl, safeFileName, takenAt } from "./helpers";
import { fitSections, softWrap } from "./softWrap";
import { dateShort, dateText, money, paidBy, sideOf, text } from "./financeCopy";

const amountOf = (x) => Number(x?.amountNPR) || 0;

export default {
  label: "Expense",

  describe(x) {
    return { title: `${text(x?.category) || "Expense"} · ${money(amountOf(x))}`, subtitle: dateShort(x?.date) };
  },

  async build(x, { profile } = {}) {
    // The PDF maker is fetched now, alongside the logo, and not before.
    const [{ CardDoc, pdfFile }, logo] = await Promise.all([import("./pdfKit.jsx"), logoDataUrl()]);

    const category = text(x.category) || "Expense";
    const type = text(x.paymentType) || "CASH";                                  // the card opens an expense with no way of paying as Cash
    const paid = x.status === "Paid";
    const sections = [
      { total: { label: "Amount", value: money(amountOf(x)) } },
      {
        heading: "The expense",
        rows: [
          ["Category", category],
          ["Date", dateText(x.date)],
          ["Paid by", paidBy(type)],
          ["Bank", type === "Bank" ? (text(x.bankName) || "Nabil Bank") : ""],     // the card shows its default bank when none is saved
          ["Region", sideOf(x)],
          ["Status", paid ? "Paid" : "Not paid"],
          ["VAT bill", x.vatBill ? "Yes" : "No"],
          ["Logged by", text(x.loggedBy)],
        ],
      },
    ];
    if (text(x.note)) sections.push({ heading: "Note", text: text(x.note) });

    const doc = (
      <CardDoc
        kind="Expense" title={softWrap(category, 30)} subtitle={dateShort(x.date)}
        badges={[{ text: paid ? "Paid" : "Not paid", tone: paid ? "good" : "neutral" }, { text: x.vatBill ? "VAT bill" : "No VAT bill", tone: x.vatBill ? "info" : "neutral" }]}
        sections={fitSections(sections)} logo={logo} takenAt={takenAt()} by={profile?.name || ""}
      />
    );
    return pdfFile(doc, safeFileName(`Expense ${category} ${text(x.date).slice(0, 10)}`.trim(), "pdf"));
  },
};
