/**
 * A fabric from Inventory's library as one PDF: what the fabric card (components/inventory/LibraryCards.jsx `FabricCard`) shows: the
 * name, composition, weight in GSM, roll weight, status, which side of the business it is filed under, and the swatch photo.
 *
 * Left out on purpose: the PRICE PER KG. The card shows it, but a copy opens for everyone in the conversation whatever their position, and
 * the agreed list leaves out costs and margins, so no price is in it for any sender. Nothing is added that the card does not show either:
 * the library table has more columns (type, supplier, price per metre, colours, notes), but the card has no field for them, so they are not here.
 *
 * `record` is the fabric row. The copy is the saved fabric, not what is half typed in the form. A swatch photo that is set but cannot be
 * read when the copy is made leaves the photo out and says so on the sheet, rather than stopping the facts from being sent.
 */
import { logoDataUrl, pictureOrNull, safeFileName, takenAt } from "./helpers";
import { normaliseRegion, regionLabel } from "../../utils/region";
import { fitSections, softWrap } from "./softWrap";

const TONE = { "In Stock": "good", "Low Stock": "warn", "Out of Stock": "bad" };      // the colours the fabrics table gives them
const text = (v) => (v === undefined || v === null ? "" : String(v).trim());
const has = (v) => text(v) !== "";

export default {
  label: "Fabric",

  describe(f) {
    return { title: text(f?.name) || "Fabric", subtitle: [text(f?.composition), has(f?.gsm) ? `${f.gsm} GSM` : ""].filter(Boolean).join(" · ") };
  },

  async build(f, { profile } = {}) {
    // The PDF maker is fetched now, alongside the logo and the swatch photo, and not before.
    const [{ CardDoc, pdfFile }, logo, photo] = await Promise.all([import("./pdfKit.jsx"), logoDataUrl(), pictureOrNull(f.swatchImageUrl, 1200)]);

    const name = text(f.name) || "Fabric";
    const status = text(f.status) || "In Stock";
    const side = normaliseRegion(f.region);
    const sections = [];
    if (photo) sections.push({ images: [{ dataUrl: photo.dataUrl, width: photo.width, height: photo.height, caption: "Swatch photo" }] });
    else if (has(f.swatchImageUrl)) sections.push({ text: "The swatch photo could not be added to this copy." });
    const facts = [
      ["Composition", text(f.composition)],
      ["Weight", has(f.gsm) ? `${f.gsm} GSM` : ""],
      ["Roll weight", text(f.weight)],
      ["Region", side ? regionLabel(side) : ""],
    ];
    if (facts.some(([, v]) => v)) sections.push({ heading: "The fabric", rows: facts });
    if (sections.length === 0) sections.push({ text: "Nothing else is recorded for this fabric yet." });

    const doc = (
      <CardDoc
        kind="Fabric" title={softWrap(name, 30)} subtitle={softWrap([text(f.composition), has(f.gsm) ? `${f.gsm} GSM` : ""].filter(Boolean).join(" · "), 64)}
        badges={[{ text: status, tone: TONE[status] }]}
        sections={fitSections(sections)} logo={logo} takenAt={takenAt()} by={profile?.name || ""}
      />
    );
    return pdfFile(doc, safeFileName(`Fabric ${name}`, "pdf"));
  },
};
