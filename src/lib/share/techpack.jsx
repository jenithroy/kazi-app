/**
 * A tech pack (a row of the `patterns` table) as one PDF: its specification sheet, then each page picture of the pack.
 * See techpackPdf.jsx for the layout. A pack that is only a link to a file somewhere else cannot be copied, and says so.
 */
import { getTechPackImages } from "../inventoryImages";
import { logoDataUrl, pictureAsJpeg, pictureOrNull, safeFileName, takenAt } from "./helpers";

export default {
  label: "Tech pack",

  describe(item) {
    return { title: item.name || "Tech pack", subtitle: [item.styleNo, item.market].filter(Boolean).join(" · ") };
  },

  async build(item, { profile } = {}) {
    const urls = getTechPackImages(item);
    const measurements = Array.isArray(item.measurements) ? item.measurements : [];
    const hasSpec = Boolean(item.styleNo || measurements.length || item.trims || item.washCare || item.remarks || (Array.isArray(item.fabricRows) && item.fabricRows.length));
    if (!urls.length && !hasSpec) {
      throw new Error(item.tech_pack_url
        ? "This tech pack is a link to a file somewhere else, so there is nothing here to copy. Send the link in a message instead."
        : "This tech pack has no pages or specification to send yet.");
    }

    // The PDF maker is fetched now, alongside the pictures, and not before.
    const [{ pdfFile }, { default: TechPackDoc }, logo, front, back, ...pages] = await Promise.all([
      import("./pdfKit.jsx"),
      import("./techpackPdf.jsx"),
      logoDataUrl(),
      pictureOrNull(item.frontSketchUrl, 1200),
      pictureOrNull(item.backSketchUrl, 1200),
      ...urls.map((u, i) => pictureAsJpeg(u, 2000).catch(() => { throw new Error(`Page ${i + 1} of the tech pack could not be read.`); })),
    ]);

    const doc = <TechPackDoc item={item} pages={pages} front={front} back={back} logo={logo} takenAt={takenAt()} by={profile?.name || ""} />;
    return pdfFile(doc, safeFileName(`Tech pack ${item.name || ""}${item.styleNo ? ` (${item.styleNo})` : ""}`, "pdf"));
  },
};
