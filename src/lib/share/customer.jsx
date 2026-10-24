/**
 * A customer as one PDF: what the customer card's Details tab shows (who to ask for, how to reach them, where they are, which side of the
 * business they are filed under, the ad they came from, the notes). One card serves the Customers page and the Sales page
 * (components/sales/CustomerCard.jsx), and it puts the button on a customer that already exists.
 *
 * What is NOT in it, on purpose: the money (invoiced, collected, owed), the invoices, payments and orders. The card shows those only to
 * a position that may read Billing and Orders, and a chat reaches people who may not; the user listed the details, so the details are
 * what goes. The `country` column is not on the card either (the card has a Region), so it is not here.
 *
 * `record` is the customer's details as the card's form holds them (the card passes `customerForm(customer)`, so the money, invoices and
 * orders never reach this file), plus `sourceCampaignName` (the card has already read the campaign's name for its own Source campaign
 * field; a viewer who cannot read campaigns sees "Not set" there, and so gets no such line here). The copy is the SAVED customer, not
 * what is half typed in the form.
 */
import { logoDataUrl, safeFileName, takenAt } from "./helpers";
import { fitSections, softWrap } from "./softWrap";
import { normaliseRegion, regionLabel } from "../../utils/region";

const text = (v) => (v === undefined || v === null ? "" : String(v).trim());
const sideOf = (c) => { const r = normaliseRegion(c?.region); return r ? regionLabel(r) : ""; };

export default {
  label: "Customer",

  describe(c) {
    return { title: text(c?.name) || "Customer", subtitle: [text(c?.city), sideOf(c)].filter(Boolean).join(" · ") };
  },

  async build(c, { profile } = {}) {
    // The PDF maker is fetched now, alongside the logo, and not before.
    const [{ CardDoc, pdfFile }, logo] = await Promise.all([import("./pdfKit.jsx"), logoDataUrl()]);

    const name = text(c.name) || "Customer";
    const sections = [];
    const facts = [
      ["Contact person", text(c.contactPerson)],
      ["Email", text(c.email)],
      ["Phone", text(c.phone)],
      ["Address", text(c.address)],
      ["City", text(c.city)],
      ["Region", sideOf(c)],
      ["Source campaign", text(c.sourceCampaignName)],
    ];
    if (facts.some(([, v]) => v)) sections.push({ heading: "Details", rows: facts });
    if (text(c.notes)) sections.push({ heading: "Notes", text: text(c.notes) });
    if (sections.length === 0) sections.push({ text: "Nothing else is recorded for this customer yet." });

    const doc = (
      <CardDoc
        kind="Customer" title={softWrap(name, 30)} subtitle={softWrap([text(c.city), sideOf(c)].filter(Boolean).join(" · "), 64)}
        sections={fitSections(sections)} logo={logo} takenAt={takenAt()} by={profile?.name || ""}
      />
    );
    return pdfFile(doc, safeFileName(`Customer ${name}`, "pdf"));
  },
};
