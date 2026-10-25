/**
 * A tech pack (a row of the `patterns` table) as one PDF: its printed technical sheet (the same one the sheet viewer shows, prints and
 * saves: components/techpack/TechSheet.jsx, made into a PDF by sheetPdf.js), then, for an older pack, each scanned page picture of its
 * paper tech pack, one to a page and turned the way round the picture is.
 *
 * The PDF maker here is html2canvas + jsPDF (about 0.5 MB, fetched only now), not pdfKit.jsx: the sheet is a drawing, and the one
 * drawing is used for the screen, Print and this file so they cannot disagree. Like a Billing document's copy it carries no "a copy
 * taken by" footer: the ruled sheet has no room for one, the file name says what it is, and the message it goes with says who sent it.
 *
 * A pack that is only a link to a file somewhere else cannot be copied, and says so.
 */
import { fetchOne } from "../db";
import { readPack } from "../techpack";
import { hasSheetContent } from "../../components/techpack/sheetPlan";

export default {
  label: "Tech pack",

  describe(item) {
    return { title: item.name || "Tech pack", subtitle: [item.styleNo, item.market].filter(Boolean).join(" · ") };
  },

  async build(item) {
    // A list's row has no pictures in it (an older pack keeps its scanned pages inside the row: lib/packColumns.js), and the file must
    // have them, so a row without that column is read whole first. A row that cannot be read is not sent short.
    let whole = item && Object.prototype.hasOwnProperty.call(item, "tech_pack_images") ? item : null;
    if (!whole && item?.id) whole = await fetchOne("patterns", String(item.id)).catch(() => null);
    if (!whole) throw new Error("The tech pack could not be read just now, so it was not sent. Check the connection and try again.");
    const pack = readPack(whole);
    if (!hasSheetContent(pack) && !pack.pages.length) {
      throw new Error(pack.externalUrl
        ? "This tech pack is a link to a file somewhere else, so there is nothing here to copy. Send the link in a message instead."
        : "This tech pack has no pages or specification to send yet.");
    }

    // who it is for gives the sheet its brand name when the pack has none of its own; a customer that cannot be read is no customer
    let customer = null;
    if (pack.customerId) {
      const row = await fetchOne("customers", pack.customerId).catch(() => null);
      if (row && row.name) customer = { id: row.id, name: row.name };
    }

    // the PDF maker is fetched now, alongside the pictures, and not before
    const { makeSheetPdf } = await import("../../components/techpack/sheetPdf");
    let made;
    try {
      made = await makeSheetPdf({ pack, customer, pages: pack.pages });
    } catch (err) {
      if (err && err.plain) throw err;
      console.error("[share] the tech pack PDF could not be made:", err);
      throw new Error("The tech pack could not be turned into a PDF. Try again.");
    }
    // a sheet with a picture missing is worse than no sheet: the factory would build from it
    if (made.missing) {
      throw new Error(`${made.missing === 1 ? "A picture" : `${made.missing} pictures`} on this tech pack could not be loaded, so the PDF would be missing ${made.missing === 1 ? "it" : "them"}. Check the connection and try again.`);
    }
    return new File([made.blob], made.fileName, { type: "application/pdf" });
  },
};
