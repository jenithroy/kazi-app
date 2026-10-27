/**
 * Lettering: draw some text on a canvas, big, and hand the pixels to the tracer, which finds the outline of every letter.
 * The browser's own fonts are used, so any font on the computer works and the shapes are exactly what the person sees. The
 * text is kept as words on the object (`obj.text`), so it can be edited again: changing a word draws and traces it again.
 */
import { centreRings } from "./model.js";

export const FONTS = [
  { id: "sans", label: "Sans", css: "Arial, Helvetica, sans-serif" },
  { id: "black", label: "Sans heavy", css: '"Arial Black", Arial, sans-serif' },
  { id: "condensed", label: "Condensed", css: 'Impact, "Arial Narrow", sans-serif' },
  { id: "geist", label: "Geist", css: 'Geist, "Segoe UI", sans-serif' },
  { id: "humanist", label: "Humanist", css: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { id: "serif", label: "Serif", css: 'Georgia, "Times New Roman", serif' },
  { id: "times", label: "Times", css: '"Times New Roman", Times, serif' },
  { id: "mono", label: "Typewriter", css: '"Courier New", Courier, monospace' },
  { id: "script", label: "Script", css: '"Brush Script MT", "Segoe Script", cursive' },
  { id: "round", label: "Rounded", css: '"Comic Sans MS", "Chalkboard SE", sans-serif' },
];

export const DEFAULT_TEXT = { value: "Text", font: "sans", size: 12, bold: true, italic: false, spacing: 0, lineHeight: 1.15, align: "center" };

const fontCss = (id) => (FONTS.find((f) => f.id === id) || FONTS[0]).css;

/** A line as its letters, each with the marks that belong to it (a Devanagari syllable stays in one piece). */
function graphemes(line) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(line)].map((x) => x.segment);
  return [...line];
}

/** The longest side, in pixels, a text is drawn on. */
const MAX_CANVAS = 4096;

/** A letter's height as a share of the font size (capitals of the usual fonts are about 0.72 of the em). */
export const CAP_HEIGHT = 0.72;

/**
 * Draw the text. `size` is the height of a capital in millimetres. Returns a canvas (black text, clear background) and the
 * pixels per millimetre it was drawn at, so shapes found in it can be turned back into millimetres.
 */
export async function drawText(text, pxPerMm = 14) {
  const t = { ...DEFAULT_TEXT, ...text };
  const emMm = Math.max(0.5, t.size) / CAP_HEIGHT;
  const emPx = emMm * pxPerMm;
  const family = fontCss(t.font);
  const spec = `${t.italic ? "italic " : ""}${t.bold ? "700" : "400"} ${emPx}px ${family}`;
  try { await document.fonts.load(spec, t.value || "A"); } catch { /* the browser falls back */ }
  const lines = String(t.value || "").split("\n");
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = spec;
  const gap = t.spacing * pxPerMm;
  // With no extra gap a line is drawn whole, so the browser kerns it and joins the letters of scripts like Devanagari itself.
  // With a gap it is drawn one letter (one grapheme: a letter with its marks) at a time.
  const widths = lines.map((line) => {
    if (!gap) return probe.measureText(line).width;
    let w = 0;
    for (const ch of graphemes(line)) w += probe.measureText(ch).width + gap;
    return Math.max(0, w - gap);
  });
  const lineH = emPx * t.lineHeight;
  const pad = Math.ceil(emPx * 0.3);
  const width = Math.max(8, Math.ceil(Math.max(...widths, 1)) + 2 * pad);
  const height = Math.max(8, Math.ceil(lineH * lines.length + emPx * 0.4) + 2 * pad);
  // Big lettering is drawn at fewer pixels to the millimetre: a canvas of tens of thousands of pixels comes out blank.
  if (Math.max(width, height) > MAX_CANVAS && pxPerMm > 0.5) return drawText(text, Math.max(0.5, (pxPerMm * MAX_CANVAS) / Math.max(width, height) * 0.97));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.font = spec;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#000";
  lines.forEach((line, i) => {
    let x = pad + (t.align === "left" ? 0 : t.align === "right" ? Math.max(...widths) - widths[i] : (Math.max(...widths) - widths[i]) / 2);
    const y = pad + emPx * 0.15 + lineH * i + emPx * 0.8;
    if (!gap) { ctx.fillText(line, x, y); return; }
    for (const ch of graphemes(line)) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + gap; }
  });
  return { canvas, pxPerMm, width, height };
}

/**
 * Turn the shapes the tracer found in a drawn text into rings in millimetres, centred on (0, 0).
 * @param {{ shapes: {contours: number[][][]}[] }} traced
 */
export function textRings(traced, pxPerMm) {
  const rings = [];
  for (const s of traced.shapes) for (const c of s.contours) rings.push(c.map((p) => [p[0] / pxPerMm, p[1] / pxPerMm]));
  return centreRings(rings).rings;
}
