/**
 * A sample from Inventory's library as one PDF: what the sample card (components/inventory/LibraryCards.jsx `SampleCard`) shows: the
 * name, product type, fabric used, colour, size, notes, stage, status, which side of the business it is filed under, and the photo.
 *
 * Left out on purpose: the COST. The card shows it, but a copy opens for everyone in the conversation whatever their position, and the
 * agreed list leaves out costs and margins, so no cost is in it for any sender. Nothing is added that the card does not show.
 *
 * `record` is the sample row. The copy is the saved sample, not what is half typed in the form. A photo that is set but cannot be read
 * when the copy is made leaves the photo out and says so on the sheet, rather than stopping the facts from being sent.
 */
import { logoDataUrl, pictureOrNull, safeFileName, takenAt } from "./helpers";
import { normaliseRegion, regionLabel } from "../../utils/region";
import { fitSections, softWrap } from "./softWrap";

const TONE = { Approved: "good", Rejected: "bad", "In Revision": "warn" };           // the colours the samples table gives them
const text = (v) => (v === undefined || v === null ? "" : String(v).trim());
const has = (v) => text(v) !== "";

export default {
  label: "Sample",

  describe(s) {
    return { title: text(s?.name) || "Sample", subtitle: [text(s?.stage), text(s?.status)].filter(Boolean).join(" · ") };
  },

  async build(s, { profile } = {}) {
    // The PDF maker is fetched now, alongside the logo and the photo, and not before.
    const [{ CardDoc, pdfFile }, logo, photo] = await Promise.all([import("./pdfKit.jsx"), logoDataUrl(), pictureOrNull(s.photo_url, 1200)]);

    const name = text(s.name) || "Sample";
    const stage = text(s.stage) || "Proto";
    const status = text(s.status) || "Pending";
    const side = normaliseRegion(s.region);
    const sections = [];
    if (photo) sections.push({ images: [{ dataUrl: photo.dataUrl, width: photo.width, height: photo.height, caption: "Sample photo" }] });
    else if (has(s.photo_url)) sections.push({ text: "The sample photo could not be added to this copy." });
    const facts = [
      ["Product type", text(s.product_type)],
      ["Fabric used", text(s.fabric_used)],
      ["Colour", text(s.color)],
      ["Size", text(s.size)],
      ["Region", side ? regionLabel(side) : ""],
    ];
    if (facts.some(([, v]) => v)) sections.push({ heading: "The sample", rows: facts });
    if (has(s.notes)) sections.push({ heading: "Notes", text: text(s.notes) });

    const doc = (
      <CardDoc
        kind="Sample" title={softWrap(name, 30)} subtitle={softWrap(text(s.product_type), 64)}
        badges={[{ text: stage, tone: "neutral" }, { text: status, tone: TONE[status] }]}
        sections={fitSections(sections)} logo={logo} takenAt={takenAt()} by={profile?.name || ""}
      />
    );
    return pdfFile(doc, safeFileName(`Sample ${name}`, "pdf"));
  },
};
