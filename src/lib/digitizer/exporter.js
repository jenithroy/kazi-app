/**
 * Getting a finished design out of the page: the machine files, a picture of the stitched design, and a printable sheet for the
 * person who loads the threads. The file writers are fetched when a file is first made (they are not needed to edit).
 */
import { rasterizePattern } from "../embroidery/stitch/raster.js";
import { unflatten } from "./flat.js";
import { fileSafe, canvasToBlob } from "./image.js";
import { rgbToHex, threadName } from "../embroidery/thread/chart.js";
import { formatMinutes, summarize } from "./stats.js";

export async function loadFormats() {
  return import("../embroidery/formats/index.js");
}

/** The stitches as the pattern the writers read. */
export function toPattern(design, stitches) {
  return { name: fileSafe(design.name), threads: stitches.threads, stitches: unflatten(stitches.flat) };
}

/**
 * The stitches moved so the middle of the design is the middle of the hoop (the machine's zero point), which is where most
 * machines and operators expect a design to be. The same stitches come back when they are already there.
 */
export function centreStitches(stitches) {
  const b = summarize(stitches.flat, stitches.threads).bounds;
  if (!b) return stitches;
  const dx = -Math.round(((b[0] + b[2]) / 2) * 10), dy = -Math.round(((b[1] + b[3]) / 2) * 10);
  if (!dx && !dy) return stitches;
  const flat = stitches.flat.slice();
  for (let i = 0; i < flat.length; i += 3) { flat[i] += dx; flat[i + 1] += dy; }
  return { ...stitches, flat };
}

/**
 * One machine file.
 * @param {string} formatId  "dst", "pes", ...
 * @param {object} options  trimJumps (jump records that stand for a cut, in formats that have no cut command)
 * @returns {Promise<{ blob: Blob, filename: string, bytes: number }>}
 */
export async function buildFile(formatId, design, stitches, options = {}) {
  const { writePattern, FORMATS } = await loadFormats();
  const fmt = FORMATS.find((f) => f.id === formatId);
  if (!fmt || !fmt.write) throw new Error(`Cannot write ${formatId} files.`);
  const bytes = writePattern(formatId, toPattern(design, stitches), { title: fileSafe(design.name).slice(0, 16), ...options });
  return { blob: new Blob([bytes], { type: "application/octet-stream" }), filename: `${fileSafe(design.name)}.${fmt.ext}`, bytes: bytes.length };
}

/** A picture of the stitched design on its fabric colour (PNG). */
export async function buildPreview(design, stitches, { pxPerMm = 10, fabricColor = "#f4f1ea", marginMm = 4 } = {}) {
  const pattern = toPattern(design, stitches);
  const hex = fabricColor.replace("#", "");
  const n = parseInt(hex, 16);
  const img = rasterizePattern(pattern, { pxPerMm, marginMm, background: [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255] });
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d").putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  const blob = await canvasToBlob(canvas, "image/png");
  return { blob, canvas, filename: `${fileSafe(design.name)} preview.png` };
}

/** Where the design's middle is, in words, for a sheet of a design that was not centred. */
function placeText(summary) {
  const b = summary.bounds;
  if (!b) return "at";
  const x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2;
  const part = (v, neg, pos) => (Math.abs(v) < 0.05 ? "" : `${Math.abs(v).toFixed(1)} mm ${v < 0 ? neg : pos}`);
  const text = [part(x, "left of", "right of"), part(y, "above", "below")].filter(Boolean);
  return text.length ? text.join(" and ") : "at";
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** The sheet the operator reads: the picture, the size, and the colours in the order they are loaded. */
export function productionSheetHtml(design, summary, previewUrl, { fabricLabel = "", fileNames = [], centred = true } = {}) {
  const rows = summary.blocks
    .map((b, i) => {
      const t = b.thread;
      const hex = t ? rgbToHex(t.r, t.g, t.b) : "#cccccc";
      return `<tr><td>${i + 1}</td><td><span class="sw" style="background:${hex}"></span></td><td>${esc(t ? threadName(hex) : "")}</td><td class="mono">${hex}</td><td class="num">${b.stitches.toLocaleString("en-GB")}</td></tr>`;
    })
    .join("");
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(design.name)} – production sheet</title><style>
    @page { size: A4; margin: 14mm; }
    body { font: 13px/1.45 system-ui, "Segoe UI", Arial, sans-serif; color: #111; margin: 0; }
    h1 { font-size: 20px; margin: 0 0 2px; } .sub { color: #555; margin: 0 0 14px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
    .pic { border: 1px solid #ccc; border-radius: 8px; padding: 8px; text-align: center; } .pic img { max-width: 100%; max-height: 360px; }
    dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; } dt { color: #555; } dd { margin: 0; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; } th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #555; } .num { text-align: right; font-variant-numeric: tabular-nums; }
    .mono { font-family: ui-monospace, Consolas, monospace; } .sw { display: inline-block; width: 22px; height: 14px; border-radius: 3px; border: 1px solid #0003; vertical-align: middle; }
    .note { margin-top: 16px; color: #555; font-size: 11.5px; }
  </style></head><body>
    <h1>${esc(design.name)}</h1><p class="sub">Embroidery production sheet · ${esc(date)}</p>
    <div class="grid">
      <div class="pic"><img src="${previewUrl}" alt="The stitched design"></div>
      <div><dl>
        <dt>Size</dt><dd>${summary.widthMm.toFixed(1)} × ${summary.heightMm.toFixed(1)} mm</dd>
        <dt>Hoop</dt><dd>${design.hoop.w} × ${design.hoop.h} mm</dd>
        <dt>Fabric</dt><dd>${esc(fabricLabel || design.fabric)}</dd>
        <dt>Stitches</dt><dd>${summary.stitches.toLocaleString("en-GB")}</dd>
        <dt>Colours</dt><dd>${summary.blocks.length} (${summary.colorChanges} change${summary.colorChanges === 1 ? "" : "s"})</dd>
        <dt>Trims</dt><dd>${summary.trims}</dd>
        <dt>Thread</dt><dd>about ${summary.threadMetres.toFixed(1)} m (top thread)</dd>
        <dt>Time</dt><dd>${esc(formatMinutes(summary.minutes))} on one head</dd>
        ${fileNames.length ? `<dt>Files</dt><dd>${esc(fileNames.join(", "))}</dd>` : ""}
      </dl></div>
    </div>
    <table><thead><tr><th>Step</th><th>Colour</th><th>Thread</th><th>Hex</th><th class="num">Stitches</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="note">${centred ? "The design is centred on the middle of the hoop." : `The design is not centred: its middle is ${placeText(summary)} the middle of the hoop.`} Colour names are the nearest in a plain chart: match the spool by eye or by your thread maker's chart.</p>
  </body></html>`;
}

/** Open the sheet in a window and print it. Returns false if the browser blocked the window. */
export function printSheet(html) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  let printed = false;
  const go = () => { if (printed) return; printed = true; try { w.focus(); w.print(); } catch { /* the window was closed */ } };
  w.onload = go;
  setTimeout(go, 600); // some browsers never fire onload for a window written to by hand
  return true;
}
