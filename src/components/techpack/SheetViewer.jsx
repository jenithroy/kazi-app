/**
 * A tech pack's printed sheet in the document viewer: the glass dialog (components/viewer/DocViewer.jsx) with the sheet on its veiled
 * stage, zoom, Print, Download PDF, and, for a saved pack, Send to chat.
 *
 *   <SheetViewer row={fs_patterns row} customer={{ id, name } | null} onClose onEdit? onPages? />
 *   <SheetViewer pack={readPack(...)}  ... />            an unsaved preview (the editor's pack): there is no row, so no Send
 *
 *   onEdit    the person may edit tech packs: draws an Edit button
 *   onPages   the pack has photographs of a paper tech pack (`pack.pages`) and the caller can show them: draws "Scanned pages (N)"
 *
 * The sheet is shown at its natural size (A4 landscape, 1123 x 794 px a page) and the viewer only scales it for the screen, so what is
 * printed and what is saved is the sheet as drawn here. Print opens a window that holds only the sheet (printSheet.js); the PDF is made
 * from the same drawing (sheetPdf.js). Both are fetched when first wanted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DocViewer from "../viewer/DocViewer";
import ShareButton from "../share/ShareButton";
import { Icons } from "../ui";
import { brandName, completeness, missingWords, readPack } from "../../lib/techpack";
import TechSheet, { findCutOff } from "./TechSheet";
import { dMonY, planSheet } from "./sheetPlan";
import { printSheet } from "./printSheet";

const PAGE_PX = { w: 1123, h: 794, gap: 16 };       // A4 landscape at 96 dpi, and the grey between two sheets of paper

/** "a, b and c" */
function words(list) {
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** The pill is one line, so a pack that lacks a lot says the first two things and how many more. */
function statusOf(pack) {
  const c = completeness(pack);
  if (c.legacy) return { text: "Old format", tone: "neutral" };
  if (c.ok) return { text: "Complete", tone: "good" };
  if (c.missing.length <= 3) return { text: `Needs: ${missingWords(c)}`, tone: "warn" };
  const [a, b] = c.missing;
  return { text: `Needs: ${a.text}, ${b.text} and ${c.missing.length - 2} more`, tone: "warn" };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function SheetViewer({ row, pack: packProp, customer = null, onClose, onEdit, onPages }) {
  const pack = useMemo(() => packProp || readPack(row), [packProp, row]);
  const plan = useMemo(() => planSheet(pack, customer), [pack, customer]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);                 // { tone, text }: what the last Print or Download PDF had to say
  const making = useRef(false);
  const sheetRef = useRef(null);
  const [cutOff, setCutOff] = useState([]);                    // what the browser says the paper would cut off

  // asked once the font is in (the words are wider before it) and again a moment later, when the pictures have settled the layout
  useEffect(() => {
    let alive = true;
    const look = () => { if (alive) setCutOff(findCutOff(sheetRef.current)); };
    look();
    const later = setTimeout(look, 400);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(look).catch(() => {});
    return () => { alive = false; clearTimeout(later); };
  }, [pack, customer]);

  const scanned = pack.pages.length;
  // (DocViewer's footer message has colours for good and bad only: a plain note takes the dialog's own ink, so it is set here)
  const scannedLine = scanned ? `${plural(scanned, "scanned page is", "scanned pages are")} also in the PDF.` : "";
  const paper = { width: PAGE_PX.w, height: PAGE_PX.h * plan.pages + PAGE_PX.gap * (plan.pages - 1) };
  const brand = brandName(pack, customer);

  const print = useCallback(() => {
    setNotice(null);
    // called straight from the press: the print window has to open before anything is waited for, or a browser blocks it as a pop-up
    printSheet({ pack, customer }).then((res) => {
      if (res && res.ok === false) setNotice({ tone: "bad", text: res.message });
    });
  }, [pack, customer]);

  const download = useCallback(async () => {
    if (making.current) return;
    making.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const { makeSheetPdf } = await import("./sheetPdf");
      const { blob, fileName } = await makeSheetPdf({ pack, customer, pages: pack.pages });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);      // not at once: a browser that has not started reading the file would lose it
      const extra = scanned ? ` The ${plural(scanned, "scanned page", "scanned pages")} ${scanned === 1 ? "is" : "are"} in it too.` : "";
      setNotice({ tone: "good", text: `${fileName} is ready. Look in your downloads.${extra}` });
    } catch (err) {
      console.error("Tech pack PDF failed:", err);
      setNotice({ tone: "bad", text: err?.plain ? err.message : "The PDF could not be made. Press Print and choose Save as PDF instead." });
    } finally {
      making.current = false;
      setBusy(false);
    }
  }, [pack, customer, scanned]);

  // the plan knows when there is more than two sheets can hold; the browser knows when a text did not fit its box
  const banner = plan.clipped.length
    ? `There is more on this tech pack than two sheets hold, so the end of ${words(plan.clipped.map((c) => c.toLowerCase()))} is cut off here, in Print and in the PDF.`
    : cutOff.length
      ? `Some text does not fit on the sheet and is cut off here, in Print and in the PDF: ${words(cutOff)}. Shorten it to see all of it.`
      : null;

  const footerExtra = (
    <>
      {onPages && scanned ? (
        <button type="button" className="ghost-button dv-print" onClick={onPages} aria-label={`Scanned pages (${scanned})`} title="Look at the photographs of the paper tech pack">
          <Icons.Image size={15} sw={1.9} aria-hidden="true" />
          <span className="dv-lbl">Scanned pages ({scanned})</span>
        </button>
      ) : null}
      {row?.id ? <ShareButton type="techpack" record={row} compact className="ghost-button dv-print" title="Send this tech pack to someone in Chat" /> : null}
      {onEdit ? (
        <button type="button" className="ghost-button dv-print" onClick={onEdit} aria-label="Edit" title="Edit this tech pack">
          <Icons.Edit size={15} sw={1.9} aria-hidden="true" />
          <span className="dv-lbl">Edit</span>
        </button>
      ) : null}
    </>
  );

  return (
    <DocViewer
      title="Tech pack"
      number={pack.styleNo}
      meta={[brand, pack.name, pack.season, dMonY(pack.specDate)]}
      status={statusOf(pack)}
      paper={paper}
      banner={banner}
      notice={notice || (scannedLine ? { tone: "info", text: <span style={{ color: "var(--ink-2)" }}>{scannedLine}</span> } : null)}
      busy={busy}
      onClose={onClose}
      onPrint={print}
      onDownload={download}
      footerExtra={footerExtra}
    >
      <div ref={sheetRef} style={{ display: "contents" }}>
        <TechSheet pack={pack} customer={customer} mode="screen" />
      </div>
    </DocViewer>
  );
}
