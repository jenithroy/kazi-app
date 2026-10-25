/**
 * A tech pack's sheet as a PDF file: the same TechSheet the viewer draws, photographed page by page, one A4 landscape page each, then
 * (for a first-generation pack) the scanned pages of its paper tech pack, one page per picture, turned the way the picture is.
 *
 *   const { blob, fileName, missing } = await makeSheetPdf({ pack, customer, pages })
 *
 * `pages` are the scanned pictures as addresses (https or data) or as `{ dataUrl, width, height }`. `missing` counts pictures on the
 * sheet that could not be loaded (they are not in the PDF; the caller says so).
 *
 * The sheet is mounted off screen with the print look (mode "print"), waited for (the font and every picture), and captured by
 * html2canvas at 3x. html2canvas does not know `object-fit`, so every fitted picture is first given the box a "contain" would give it.
 * Both libraries are imported here, inside the function: they are big and nothing else on the page needs them.
 *
 * A message that is fit to show a person is thrown as an Error with `plain: true`; anything else is a bug to log and apologise for.
 */
import { createElement } from "react";
import { hasSheetContent, sheetFileName, sheetTitle } from "./sheetPlan";

const SCALE = 3;                        // 3 x 96 dpi: about 290 dpi on the paper, sharp enough for the 6.5 pt text
const JPEG_QUALITY = 0.92;
const WAIT_MS = 15000;                  // the longest to wait for pictures before drawing what has arrived

const plain = (message) => Object.assign(new Error(message), { plain: true });

/** Resolves when every picture in `root` has loaded or failed; returns how many different pictures failed (a failed one is hidden; the
 *  same picture used twice, as a view and in a drawing, is one). */
function settleImages(root, ms = WAIT_MS) {
  const imgs = Array.from(root.querySelectorAll("img"));
  const failed = new Set();
  const all = imgs.map((img) => new Promise((resolve) => {
    const fail = () => { failed.add(img.getAttribute("src")); img.style.visibility = "hidden"; resolve(); };
    if (img.complete) { if (img.naturalWidth) resolve(); else fail(); return; }
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", fail, { once: true });
  }));
  return Promise.race([Promise.all(all), new Promise((resolve) => setTimeout(resolve, ms))]).then(() => failed.size);
}

/*
 * html2canvas puts a line of text at (the top of its text box) + (its OWN measure of where the font's baseline is), and that measure is
 * made with the page's body line height and a 1px picture, which for most fonts comes out several pixels low (Geist at 9px: 6 to 7 px; a
 * 32px serif: 15 px). A line then lands too low and any box that clips it cuts it through the middle. So, in the throwaway copy that is
 * about to be photographed, each piece of text is moved up by exactly the error: the library's routine is repeated here to know what it
 * will say, and the real baseline is read from the browser. (Measured with html2canvas 1.4.1.)
 */
const ONE_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=";

function capturesBaseline(fontFamily, fontSize) {
  const container = document.createElement("div");
  const img = document.createElement("img");
  const span = document.createElement("span");
  Object.assign(container.style, { visibility: "hidden", fontFamily, fontSize, margin: "0", padding: "0", whiteSpace: "nowrap" });
  document.body.appendChild(container);
  img.src = ONE_PIXEL;
  img.width = 1;
  img.height = 1;
  Object.assign(img.style, { margin: "0", padding: "0", verticalAlign: "baseline" });
  Object.assign(span.style, { fontFamily, fontSize, margin: "0", padding: "0" });
  span.appendChild(document.createTextNode("Hidden Text"));
  container.appendChild(span);
  container.appendChild(img);
  const baseline = img.offsetTop - span.offsetTop + 2;
  container.remove();
  return baseline;
}

/** px from the top of a text box (what a Range reports) down to the line the letters stand on. */
function realAscent(fontFamily, fontSize) {
  const container = document.createElement("div");
  Object.assign(container.style, { position: "absolute", left: "0", top: "0", visibility: "hidden", whiteSpace: "nowrap", lineHeight: "normal", margin: "0", padding: "0", fontFamily, fontSize });
  const text = document.createTextNode("Hidden Text");
  const probe = document.createElement("span");
  Object.assign(probe.style, { display: "inline-block", width: "0", height: "0", verticalAlign: "baseline" });
  container.append(text, probe);
  document.body.appendChild(container);
  const range = document.createRange();
  range.selectNode(text);
  const ascent = probe.getBoundingClientRect().top - range.getClientRects()[0].top;
  container.remove();
  return ascent;
}

function liftText(root) {
  const errors = new Map();                              // one measure per font and size
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (walker.currentNode.data.trim()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const cs = getComputedStyle(node.parentElement);
    const family = cs.fontFamily.replace(/["']/g, "");
    const key = `${family}|${cs.fontSize}`;
    if (!errors.has(key)) errors.set(key, capturesBaseline(family, cs.fontSize) - realAscent(family, cs.fontSize));
    const dy = errors.get(key);
    if (!dy) continue;
    const wrap = document.createElement("span");
    wrap.style.position = "relative";
    wrap.style.top = `${-dy}px`;
    node.parentNode.insertBefore(wrap, node);
    wrap.appendChild(node);
  }
}

/** Give each `object-fit: contain` picture the box a contain would draw, so a capture that ignores object-fit draws it right. */
function fitPictures(root) {
  for (const img of root.querySelectorAll("img.ts-fit")) {
    const box = img.parentElement;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!box || !nw || !nh) continue;
    const bw = box.clientWidth;
    const bh = box.clientHeight;
    const s = Math.min(bw / nw, bh / nh);
    const w = nw * s;
    const h = nh * s;
    Object.assign(img.style, {
      objectFit: "fill", left: `${(bw - w) / 2}px`, top: `${(bh - h) / 2}px`, width: `${w}px`, height: `${h}px`,
    });
  }
}

/** A scanned page as a JPEG data address with its size: already one, or fetched and turned by the picture maker the other PDFs use. */
async function scannedPage(entry, index) {
  if (entry && typeof entry === "object" && entry.dataUrl) return entry;
  const { pictureAsJpeg } = await import("../../lib/share/helpers");
  try {
    return await pictureAsJpeg(String(entry), 2000);
  } catch {
    throw plain(`Page ${index + 1} of the tech pack could not be read.`);
  }
}

export async function makeSheetPdf({ pack, customer = null, pages = [] }) {
  const wantSheet = hasSheetContent(pack);
  if (!wantSheet && !pages.length) throw plain("This tech pack has no pages or specification to send yet.");

  const [{ createRoot }, { flushSync }, { default: TechSheet }, { default: html2canvas }, { jsPDF }] = await Promise.all([
    import("react-dom/client"),
    import("react-dom"),
    import("./TechSheet"),
    import("html2canvas"),
    import("jspdf"),
  ]);

  const scans = [];
  for (let i = 0; i < pages.length; i += 1) scans.push(await scannedPage(pages[i], i));

  const title = sheetTitle(pack);
  let pdf = null;
  let missing = 0;
  const addPage = (orientation) => {
    if (!pdf) pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
    else pdf.addPage("a4", orientation);
    return pdf;
  };

  if (wantSheet) {
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    Object.assign(host.style, { position: "fixed", left: "-10000px", top: "0", width: "297mm", pointerEvents: "none", zIndex: "-1" });
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      flushSync(() => root.render(createElement(TechSheet, { pack, customer, mode: "print" })));
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      missing = await settleImages(host);
      fitPictures(host);
      liftText(host);
      for (const el of host.querySelectorAll(".ts-page")) {
        const canvas = await html2canvas(el, { scale: SCALE, useCORS: true, backgroundColor: "#ffffff", logging: false });
        const doc = addPage("landscape");
        doc.addImage(canvas.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG", 0, 0, 297, 210, undefined, "FAST");
        canvas.width = 0;                                   // let the browser have the memory back at once
        canvas.height = 0;
      }
    } finally {
      root.unmount();
      host.remove();
    }
  }

  for (const s of scans) {
    const land = s.width > s.height;
    const doc = addPage(land ? "landscape" : "portrait");
    const pw = land ? 297 : 210;
    const ph = land ? 210 : 297;
    const margin = 6;
    const k = Math.min((pw - 2 * margin) / s.width, (ph - 2 * margin) / s.height);
    const w = s.width * k;
    const h = s.height * k;
    doc.addImage(s.dataUrl, "JPEG", (pw - w) / 2, (ph - h) / 2, w, h, undefined, "FAST");
  }

  pdf.setProperties({ title, author: "Kazi Manufacturing", creator: "Kazi" });
  return { blob: pdf.output("blob"), fileName: sheetFileName(pack), missing };
}
