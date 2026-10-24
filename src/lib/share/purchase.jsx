/**
 * A purchase (a bill from a supplier or a shop) as one PDF: what its card in Finance (components/finance/cards/PurchaseCard.jsx) shows:
 * the number, who it was bought from, the date, the category, how it was paid (and the bank), whether there is a VAT bill, which side of
 * the business it is filed under, what was bought line by line, and the amounts worked out from the lines (subtotal, discount, taxable
 * amount, VAT, total). Nothing is added that the card does not show.
 *
 * The amounts are the card's own: worked out from the lines with the same functions the card uses (initialGroupData and the three
 * purchase* sums in components/PurchaseRowGroup.jsx), not read from the stored totals, so a copy can never disagree with the card. They are
 * written in rupees, the books' money, whatever currency the sender has picked for their screen.
 *
 * `record` is `{ purchase, bills }`: the purchase row the card holds and the VAT bill files it lists. The card lists the files only for a
 * viewer who may read VAT bills (and the fiscal-year page does not read them at all), so a copy names a file only when the card has one to
 * list, and never says "no file" for lack of one. The copy is the SAVED purchase, not what is half typed in the form.
 */
import { initialGroupData, purchaseGrandTotal, purchaseSubtotal, purchaseVatAmount } from "../../components/PurchaseRowGroup";
import { fiscalYearForDate } from "../../utils/fiscalYear";
import { logoDataUrl, safeFileName, takenAt } from "./helpers";
import { fitSections, softWrap } from "./softWrap";
import { dateShort, dateText, money, num, paidBy, sideOf, text } from "./financeCopy";

const vatWords = (v) => (v === null ? "N/A" : v ? "Yes, 13%" : "No");           // the card's three choices: "Yes, 13%", "No", "N/A"
const isLine = (it) => text(it.particulars) !== "" || (Number(it.amount) || 0) !== 0;

/** "400 m"; a unit with no quantity ("lump sum") stands alone, and the default "pcs" of a line with no quantity says nothing. */
function quantityText(it) {
  const q = text(it.quantity);
  const u = text(it.unit);
  if (q !== "") return u ? `${q} ${u}` : q;
  return u && u.toLowerCase() !== "pcs" ? u : "";
}

/** What the card is opened with, and the sums it shows from it. */
function figures(p) {
  const form = initialGroupData(p);
  const discount = Number(form.discountAmt || 0);
  const taxable = Number(form.taxableAmt || 0);
  return {
    form,
    lines: form.items.filter(isLine),
    subtotal: purchaseSubtotal(form.items),
    discount,
    taxable,
    vat: purchaseVatAmount(form.items, form.vatBill, discount, taxable),
    total: purchaseGrandTotal(form.items, form.vatBill, discount, taxable),
  };
}

export default {
  label: "Purchase",

  describe({ purchase: p } = {}) {
    if (!p) return { title: "Purchase", subtitle: "" };
    const supplier = text(p.expenseItem);
    return { title: `${text(p.expenseId) || "Purchase"}${supplier ? ` · ${supplier}` : ""}`, subtitle: [dateShort(p.date), money(figures(p).total)].filter(Boolean).join(" · ") };
  },

  async build({ purchase: p, bills = [] }, { profile } = {}) {
    // The PDF maker is fetched now, alongside the logo, and not before.
    const [{ CardDoc, pdfFile }, logo] = await Promise.all([import("./pdfKit.jsx"), logoDataUrl()]);

    const f = figures(p);
    const number = text(p.expenseId) || "Purchase";
    const supplier = text(p.expenseItem);
    const way = paidBy(f.form.paymentType);
    const vatBill = f.form.vatBill === undefined ? false : f.form.vatBill;
    const files = bills.map((b) => text(b.fileName)).filter(Boolean);
    const sections = [];

    sections.push({
      heading: "The purchase",
      rows: [
        ["Bought from", supplier],
        ["Date", dateText(p.date)],
        ["Fiscal year", text(p.fiscalYear) || fiscalYearForDate(text(p.date).slice(0, 10)) || ""],
        ["Category", text(f.form.category)],
        ["Paid by", way],
        ["Bank", f.form.paymentType === "Bank" ? text(f.form.bankName) : ""],
        ["VAT bill", vatWords(vatBill)],
        ["VAT bill file", vatBill === true ? files.join(", ") : ""],
        ["Region", sideOf(p)],
        ["Entered", p.createdAt ? dateText(String(p.createdAt).slice(0, 10)) : ""],
      ],
    });

    if (f.lines.length > 0) {
      sections.push({
        heading: "What was bought",
        table: {
          head: ["Particulars", "Qty", "Rate (Rs)", "Amount (Rs)"],
          flex: [5.2, 1.7, 1.7, 2],
          align: ["left", "right", "right", "right"],
          rows: f.lines.map((it) => [softWrap(text(it.particulars), 34), quantityText(it), text(it.rate) === "" ? "" : num(it.rate), text(it.amount) === "" ? "" : num(it.amount)]),
        },
      });
    }

    sections.push({
      heading: "Amounts",
      rows: [
        ["Subtotal", money(f.subtotal)],
        ["Discount", f.discount > 0 ? `- ${money(f.discount)}` : ""],
        ["Taxable amount", vatBill === true && f.taxable > 0 ? money(f.taxable) : ""],
        ["VAT 13%", vatBill === true ? `+ ${money(f.vat)}` : ""],
      ],
      total: { label: "Total", value: money(f.total) },
    });

    const doc = (
      <CardDoc
        kind="Purchase" title={softWrap(number, 30)} subtitle={softWrap([supplier, dateShort(p.date)].filter(Boolean).join(" · "), 64)}
        badges={[{ text: `Paid by ${way}`, tone: "neutral" }, { text: vatBill === true ? "VAT bill" : vatBill === false ? "No VAT bill" : "VAT bill N/A", tone: vatBill === true ? "good" : "neutral" }]}
        sections={fitSections(sections)} logo={logo} takenAt={takenAt()} by={profile?.name || ""}
      />
    );
    return pdfFile(doc, safeFileName(`Purchase ${number}${supplier ? ` ${supplier}` : ""}`, "pdf"));
  },
};
