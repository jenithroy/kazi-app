/**
 * What goes where on the printed tech sheet. Nothing here draws anything: it is arithmetic on a tech pack (`readPack`'s shape) that
 * says how tall each region of the page is and what has to move to page 2, so the sheet can be drawn the same way on screen, in the
 * print window and in the PDF, and so every rule can be checked in plain node.
 *
 * The page is A4 landscape (297 x 210 mm) in a ruled frame. Page 1 is the base of the factory's technical sheet (header band, a row of
 * views, details / measurements / size chart on the left, materials / finishing on the right, notes and the brand along the bottom).
 * Every region has a fixed size and clips, so a long text can never push the layout: what the budgets below say will not fit goes to
 * page 2, in full, marked "(continued)". Page 2 also carries the pictures that only some garments have (prints, labels, construction).
 * Never more than two pages: what even page 2 cannot hold is cut off, and `clipped` says what.
 *
 * Budgets are in millimetres and in lines of the smallest type on the sheet (6.5 pt). Text is measured by an estimate of how many
 * characters fit a line, from the average width of a character in the sheet's own font (`MM`, measured in Chrome with Geist), because
 * the print window and the PDF are planned before any browser has laid a word out. The millimetre figures here are the same ones
 * sheet.css uses (block padding, label height, line heights): change one, change both.
 */
import { MATERIAL_KINDS, MAX_VIEWS, VIEW_KINDS, bullets, brandName, chartSizes, drawnOn, oneLine, referenceLines } from "../../lib/techpack";
import { safeFileName } from "../../lib/share/helpers";

/* ── The page ───────────────────────────────────────────────────── */

export const PAGE = { w: 297, h: 210, margin: 6, border: 0.3 };
/** What is inside the ruled frame. */
export const FRAME = { w: PAGE.w - 2 * PAGE.margin - 2 * PAGE.border, h: PAGE.h - 2 * PAGE.margin - 2 * PAGE.border };

export const BRAND_FALLBACK = "KAZI";          // the factory's own name, for a pack that is for nobody yet

const G = {
  headMin: 20, headMax: 31, headPad: 3.2, factLine: 2.85, headPadX: 6,
  footMin: 14, footMax: 21.5, footLabel: 3.8, noteLine: 2.7, footPad: 1.8, markW: 62,
  lowerMax: 88, viewMin: 46,
  pad: 2.4,                                     // a block's padding, top and bottom together
  padX: 4.8,                                    // and left and right together
  label: 4,                                     // a section label and the space under it
  tileCaption: 6.4, tileMin: 22, tileMax: 44, tileGap: 2.4,   // details: a square photo, a gap, two caption lines
  chartRow: 3.2, listRow: 3.1, drawMin: 34, drawTop: 3,
  finLine: 2.6, matLine: 2.6, matGap: 1.5, matBudget: 42.5,
  swatch: { 1: 18, 2: 16, 3: 13 },
  list: 12,                                     // size chart rows and finishing lines on page 1
  detailsMax: 6, notesMax: 6,
  leftShare: 0.71,
};

/** Average width of one character, in mm, of each kind of text on the sheet (measured with the real font; see the note above). */
const MM = { mixed65: 1.059, mixed68: 1.108, upper65: 1.292, fact: 1.419 };
/** How many characters of `perChar` mm fit `widthMm`: a tenth under the arithmetic, because a word that does not fit wastes the rest of its line
 *  and a line that is within a pixel of the width wraps in one render and not in the next (a random pack showed it). */
const cplOf = (widthMm, perChar) => Math.max(6, Math.floor((widthMm * 0.9) / perChar));

/* ── Small pure helpers ─────────────────────────────────────────── */

/** The picture of a thing: the saved address, else the preview the editor made before the file was uploaded. */
export const pic = (p) => String((p && (p.url || p.preview)) || "");
export const swatchOf = (m) => String((m && (m.swatchUrl || m.swatchPreview || m.preview)) || "");

export const viewCaption = (v) => (v.label || "").trim() || VIEW_KINDS.find((k) => k.id === v.kind)?.label || "";
export const materialKind = (m) => MATERIAL_KINDS.find((k) => k.id === m.kind)?.label || "Other";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-30" -> "30/09/2026" (read as written: no time zone can move the day). */
export function dmy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
/** "2026-09-30" -> "30 Sep 2026" */
export function dMonY(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] || ""} ${m[1]}` : "";
}

/** A first-generation pack's numbers were typed in inches (its column is called `inch`); only a new-format pack says what it used. */
export const unitOf = (pack) => (pack.legacy ? "inch" : pack.measureUnit === "inch" ? "inch" : "cm");

/** How many lines `text` takes when a line holds about `cpl` characters (greedy word wrap). 0 for nothing. Typed line breaks count. */
export function wrapCount(text, cpl) {
  let total = 0;
  for (const part of String(text ?? "").split(/\r?\n/)) {
    const t = part.trim();
    if (!t) continue;
    let lines = 1;
    let cur = 0;
    for (const word of t.split(/\s+/)) {
      const len = word.length;
      if (cur === 0) cur = len;
      else if (cur + 1 + len <= cpl) cur += 1 + len;
      else { lines += 1; cur = len; }
      while (cur > cpl) { lines += 1; cur -= cpl; }        // a word longer than the line breaks across lines
    }
    total += lines;
  }
  return total;
}

/** Whole lines from `lines` that fit in `max` printed lines (at least one when there is one), and what is left over. */
function takeLines(lines, max, cpl) {
  const shown = [];
  let used = 0;
  let i = 0;
  for (; i < lines.length; i += 1) {
    const n = Math.max(1, wrapCount(lines[i], cpl));
    if (used + n > max && shown.length) break;
    shown.push(lines[i]);
    used += n;
  }
  return { shown, rest: lines.slice(i), used };
}

/** The size of a serif wordmark that fits `widthMm` on one line, in mm. Georgia caps with wide spacing run about .86 em a letter. */
export function wordmarkSize(text, widthMm, maxMm, minMm = 2.4) {
  const n = Math.max(1, String(text).length);
  return Math.round(Math.min(maxMm, Math.max(minMm, widthMm / (0.86 * n))) * 10) / 10;
}

/** The notes block's lines: the typed notes, then a first-generation pack's remarks, then its wash care. */
export function noteLines(pack) {
  const out = [...bullets(pack.notes), ...bullets(pack.remarks)];
  const wash = oneLine(pack.washCare);
  if (wash) out.push(`Wash care: ${wash}`);
  return out;
}

/** "Tech pack Military cropped jacket (CV-JK-004)": the print window's title (what "Save as PDF" suggests) and the PDF's file name. */
export function sheetTitle(pack) {
  const ref = (pack.styleNo || "").trim();
  return `Tech pack ${(pack.name || "").trim()}${ref ? ` (${ref})` : ""}`.replace(/\s+/g, " ").trim();
}
export const sheetFileName = (pack) => safeFileName(sheetTitle(pack), "pdf");

const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** A header line: what it says and how many printed lines it may take at most. */
function fact(label, value, max = 1) {
  return { label, value: String(value ?? "").trim(), max };
}

/** The columns of a size chart in `innerMm`: a name column that gets what the sizes do not need, and one narrow column per size. */
export function chartCols(innerMm, nSizes) {
  const n = Math.max(1, nSizes);
  let size = clamp((innerMm - 24) / n, 6.5, 12);
  let label = innerMm - size * n - 0.4;                                  // a little left over for the table's own borders
  if (label < 18) { size = Math.max(5, (innerMm - 18.4) / n); label = innerMm - size * n - 0.4; }
  return { label: r1(Math.max(12, label)), size: r1(size) };
}

/**
 * Whether there is anything to draw on the sheet itself. Something in the body of the sheet (a picture, a material, a measurement, a
 * line of finishing or notes...) always is. The heading alone is a sheet for a new pack (a name and a collection are what it is about),
 * but a first-generation pack that is only a name, a season and photographs of its paper has no sheet worth drawing: its pages are
 * the document, as they were when it was made. (Every old row has a season and a colour; only a style number is something it typed.)
 */
export function hasSheetContent(pack) {
  const some = (...texts) => texts.some((t) => String(t || "").trim());
  const body = pack.views.some(pic) || pack.details.length > 0 || pack.materials.length > 0 || pack.points.some((p) => p.label.trim())
    || pack.prints.length > 0 || pack.construction.length > 0 || pack.labelling.length > 0
    || some(pack.finishing, pack.notes, pack.washCare, pack.remarks);
  if (body) return true;
  return pack.legacy ? some(pack.styleNo) : some(pack.name, pack.styleNo, pack.season, pack.description, pack.colour);
}

/** How tall the views may grow before the lower area is given the room instead: two big pictures do not need 125 mm. */
const viewsCap = (n) => [0, 100, 96, 84, 76][Math.min(4, n)];

/** About how wide a section label is (6.6 pt bold capitals, spaced): a block narrower than this would cut its own heading. */
const labelMm = (label) => r1(label.length * 1.75 + G.padX);

/**
 * Share `total` mm between blocks in proportion to what each `want`s, but never give one less than its `min` (a heading or a chart
 * must fit): the ones that would fall short are held at their minimum and the rest share what is left.
 */
export function shareWidths(items, total) {
  const minSum = items.reduce((n, it) => n + it.min, 0);
  if (minSum >= total) return items.map((it) => r1((it.min * total) / minSum));
  let pinned = items.map(() => false);
  let widths = items.map(() => 0);
  for (let pass = 0; pass <= items.length; pass += 1) {
    const fixed = items.reduce((n, it, i) => n + (pinned[i] ? it.min : 0), 0);
    const free = items.reduce((n, it, i) => n + (pinned[i] ? 0 : it.want), 0) || 1;
    widths = items.map((it, i) => (pinned[i] ? it.min : (it.want * (total - fixed)) / free));
    const next = widths.map((w, i) => pinned[i] || w < items[i].min);
    if (next.every((v, i) => v === pinned[i])) break;
    pinned = next;
  }
  return widths.map(r1);
}

/* ── The plan ───────────────────────────────────────────────────── */

/**
 * `opts.placeholder` (the screen only): a pack with no pictures keeps a views row, for the dashed "No picture yet" box; on paper that row
 * is simply not there and its room goes to the rest.
 *
 * @returns {{ brand: string, logo: string, pages: 1 | 2, clipped: string[], p1: object, p2: object | null }}
 */
export function planSheet(pack, customer = null, opts = {}) {
  const brand = brandName(pack, customer) || BRAND_FALLBACK;
  const logo = String(pack.brandLogoUrl || pack.brandLogoPreview || "");

  /* — what there is — */
  const views = pack.views.filter((v) => pic(v));
  const details = pack.details.filter((d) => pic(d) || (d.caption || "").trim());
  const materials = pack.materials.filter((m) => (m.name || "").trim() || (m.spec || "").trim() || swatchOf(m));
  const rows = pack.points.filter((p) => (p.label || "").trim());
  const sizes = rows.length ? chartSizes(pack) : [];
  const finishing = bullets(pack.finishing);
  const notes = noteLines(pack);
  const prints = pack.prints.filter((p) => pic(p) || (p.placement || "").trim() || (p.technique || "").trim());
  const construction = pack.construction.filter((p) => pic(p) || (p.caption || "").trim());
  const labelling = pack.labelling.filter((p) => pic(p) || (p.caption || "").trim());

  /* — header band: a wider middle cell when there is a description to give room — */
  const hasDesc = Boolean(pack.description.trim());
  const shares = hasDesc ? [36, 44, 20] : [46, 31, 23];
  const cellW = shares.map((s) => (FRAME.w * s) / 100 - G.headPadX);
  const headDate = dmy(pack.specDate);
  const mid = [
    fact("Collection", pack.season),
    fact("Reference", pack.styleNo || "-"),
    fact("Name", pack.name || "-", 2),
    ...(hasDesc ? [fact("Description", oneLine(pack.description), 3)] : []),         // the brief says two lines; the owner's own sample needs a third
    ...(headDate ? [fact("Date", headDate)] : []),
  ].filter((f) => f.value);
  const end = [
    fact("Category", pack.productType || pack.category),
    fact("Sizes", pack.sizes.join(" - "), 2),
    fact("Colour", pack.colour, 2),
    ...pack.headerLines.filter((l) => l.label.trim() && l.value.trim()).map((l) => fact(l.label.trim(), oneLine(l.value))),
    fact("Designer", pack.designerName),
  ].filter((f) => f.value);
  const linesIn = (f, cpl) => Math.min(f.max, Math.max(1, wrapCount(`${f.label}: ${f.value}`, cpl)));
  const midLines = mid.reduce((n, f) => n + linesIn(f, cplOf(cellW[1], MM.fact)), 0);
  const endOne = end.reduce((n, f) => n + linesIn(f, cplOf(cellW[2], MM.fact)), 0);
  // a long list of header lines runs in two columns, split where the lines add up to half
  const endCols = endOne > 7 ? 2 : 1;
  let endSplit = [end];
  let endRows = endOne;
  if (endCols === 2) {
    const cpl2 = cplOf((cellW[2] - 3) / 2, MM.fact);
    const total = end.reduce((n, f) => n + linesIn(f, cpl2), 0);
    let acc = 0;
    let cut = 0;
    while (cut < end.length && acc < total / 2) { acc += linesIn(end[cut], cpl2); cut += 1; }
    endSplit = [end.slice(0, cut), end.slice(cut)];
    endRows = Math.max(acc, total - acc);
  }
  const headRows = Math.max(midLines, endRows, 4);
  const headH = clamp(r1(G.headPad + headRows * G.factLine), G.headMin, G.headMax);

  /* — bottom strip — */
  const noteCpl = cplOf(FRAME.w - G.markW - G.padX - 2.4, MM.mixed68);
  const noteFit = takeLines(notes, G.notesMax, noteCpl);
  const footH = noteFit.shown.length ? clamp(r1(G.footLabel + noteFit.used * G.noteLine + G.footPad), G.footMin, G.footMax) : G.footMin;

  /* — the left and right columns — */
  const hasMeasure = rows.length > 0;
  const rightW = FRAME.w * (1 - G.leftShare);

  /* — measurements — */
  const drawings = views
    .map((v) => ({ view: v, points: drawnOn(pack, v.id) }))
    .filter((d) => d.points.length)
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, 2);
  const chartRows = rows.slice(0, G.list);
  const list = referenceLines(pack).slice(0, G.list);
  const drawW = drawings.length === 0 ? 0 : drawings.length === 1 ? 54 : 80;
  const listW = hasMeasure ? 36 : 0;
  const chartH = sizes.length ? (chartRows.length + 1) * G.chartRow + 0.15 : 0;
  const drawBox = drawings.length ? G.drawMin + G.drawTop : 0;           // the picture, and room above it for a letter that sticks out
  const measureH = hasMeasure ? r1(G.pad + G.label + Math.max(drawBox, chartH, list.length * G.listRow, 14) + 0.4) : 0;   // and a little for the borders a screen rounds up

  /* — details — */
  const detailFit = details.slice(0, G.detailsMax);
  const detailMin = detailFit.length ? G.pad + G.label + G.tileMin + G.tileCaption : 0;

  /* — finishing (right column, below the materials) — */
  const finCpl = cplOf(rightW - G.padX, MM.mixed65);
  const finFit = takeLines(finishing, G.list, finCpl);
  const finBlock = finFit.shown.length ? r1(G.pad + G.label + finFit.used * G.finLine) : 0;

  /* — materials (right column): what the finishing does not need is theirs — */
  const withSwatch = materials.some((m) => swatchOf(m));
  const matCap = withSwatch ? 3 : 4;
  const sw = withSwatch ? G.swatch[clamp(Math.min(materials.length, matCap), 1, 3)] : 0;
  const matCpl = cplOf(rightW - G.padX - (withSwatch ? sw + 2 : 0), MM.upper65);
  const matLinesOf = (m) => 1 + wrapCount(m.name, matCpl) + wrapCount(m.spec, matCpl) + ((m.colour || "").trim() ? 1 : 0);
  const matHeight = (m) => Math.max(sw, matLinesOf(m) * G.matLine + 0.4);
  const matBudget = Math.max(G.matBudget, G.lowerMax - G.pad - G.label - (finBlock ? finBlock + 0.6 : 0));
  const matShown = [];
  let matUsed = 0;
  for (const m of materials) {
    const h = matHeight(m) + (matShown.length ? G.matGap : 0);
    if (matShown.length >= matCap || (matShown.length && matUsed + h > matBudget)) break;
    matShown.push(m);
    matUsed += h;
  }
  const matRest = materials.slice(matShown.length);
  const matBlock = matShown.length ? r1(G.pad + G.label + matUsed) : 0;

  /* — the lower area — */
  const hasLeft = detailFit.length > 0 || hasMeasure;
  const hasRight = matShown.length > 0 || finFit.shown.length > 0;
  const showPlaceholder = views.length === 0 && Boolean(opts.placeholder);
  const noViews = views.length === 0 && !showPlaceholder;
  const room = FRAME.h - headH - footH;
  const need = Math.min(G.lowerMax, Math.max(detailMin + measureH, matBlock + finBlock) + 0.6);
  // the left column is 71% of the frame (all of it when nothing stands to its right); a tile is a square no taller than the room under
  // the label and no wider than its share of the row
  const leftW = hasRight ? FRAME.w * G.leftShare : FRAME.w;
  const leftInner = leftW - G.padX;
  let lowerH = hasLeft || hasRight ? need : 0;
  if (!noViews && lowerH) {
    // Views that would grow past their cap hand the room to the lower area, but only as far as the detail tiles can use it (they grow
    // to a size and stop); a lower area with nothing to grow leaves the room to the pictures.
    const side = Math.min(G.tileMax, (leftInner - G.tileGap * (detailFit.length - 1)) / Math.max(1, detailFit.length));
    const grown = detailFit.length ? G.pad + G.label + side + G.tileCaption + measureH + 0.6 : need;
    lowerH = Math.min(Math.max(need, room - viewsCap(views.length)), Math.max(need, grown));
    lowerH = Math.min(lowerH, Math.max(need, room - G.viewMin));
  }
  const viewsH = noViews ? 0 : room - lowerH;
  lowerH = r1(lowerH);
  const detailsH = r1(Math.max(0, lowerH - measureH));
  const tileSide = detailFit.length
    ? r1(Math.min(
      G.tileMax,
      Math.max(G.tileMin, detailsH - G.pad - G.label - G.tileCaption),
      (leftInner - G.tileGap * (detailFit.length - 1)) / detailFit.length,
    ))
    : 0;

  const measureLabel = `Measurements (${unitOf(pack)}) - size ${pack.refSize} (reference)`;
  const blockW = r1(Math.max(drawW + listW + G.padX + (drawings.length ? 2 : 0), labelMm(measureLabel) + 2, 70));
  const chartInner = leftW - blockW - G.padX - 0.7;                    // less the separator and the table's own border
  const p1 = {
    brand, logo,
    head: { mid, end, endSplit, endCols, h: headH, shares, brandW: cellW[0] },
    views: views.slice(0, MAX_VIEWS), showPlaceholder, noViews, viewsH: r1(viewsH),
    lower: { h: lowerH, hasLeft, hasRight, soloRight: hasRight && !hasLeft },
    details: { items: detailFit, tile: tileSide, h: detailsH },
    measure: {
      h: measureH, drawings, drawW, listW, list, sizes, rows: chartRows, blockW,
      drawH: r1(measureH - G.pad - G.label), drawTop: G.drawTop,
      cols: sizes.length ? chartCols(chartInner, sizes.length) : null,
      unit: unitOf(pack), refSize: pack.refSize, hasLetters: rows.some((p) => p.line),
    },
    materials: { items: matShown, sw, boxes: withSwatch, h: matBlock, legacy: pack.legacy },
    finishing: { lines: finFit.shown },
    foot: { h: footH, notes: noteFit.shown, markW: G.markW },
  };

  /* — page 2 — */
  const clipped = [];
  const p2need = prints.length || labelling.length || construction.length
    || views.length > MAX_VIEWS || details.length > G.detailsMax || matRest.length || rows.length > G.list
    || finFit.rest.length || noteFit.rest.length;
  const p2 = p2need ? planPage2({
    brand, logo, clipped, legacy: pack.legacy, prints, labelling, construction,
    views: views.slice(MAX_VIEWS), details: details.slice(G.detailsMax),
    materials: matRest, rows: rows.slice(G.list), sizes, finishing: finFit.rest, notes: noteFit.rest,
  }) : null;

  return { brand, logo, pages: p2 ? 2 : 1, clipped, p1, p2 };
}

/* ── Page 2 ─────────────────────────────────────────────────────── */

/**
 * A heading strip, a band of pictures (prints, labels, construction, what did not fit of the views and details) and a band of text and
 * tables (what did not fit of the materials, size chart, finishing and notes), each only when there is something for it. A picture is
 * a box of a fixed size: as tall as a square the width of its column, between 30 and 72 mm, so a few pictures are big and many are not
 * lost. Each band is as tall as what is in it; what is left of the page stays white. A block is never narrower than its own heading
 * (or, for a chart, its columns), whatever it would have been given.
 */
function planPage2(d) {
  const head = 11;
  const room = FRAME.h - head;
  const W = FRAME.w;

  /* — pictures — */
  const kinds = [
    [d.prints, "print", "Prints", Math.min(3, Math.max(1, d.prints.length)), 3],
    [d.labelling, "caption", "Tag / labelling", d.labelling.length > 1 ? 2 : 1, 3],
    [d.construction, "caption", "Construction", d.construction.length > 1 ? 2 : 1, 3],
    [d.details, "caption", "Details (continued)", Math.min(4, Math.max(1, d.details.length)), 3],
    [d.views, "caption", "Views (continued)", Math.min(2, Math.max(1, d.views.length)), 2],
  ];
  const picBlocks = [];
  for (const [items, kind, label, cols, rowsMax] of kinds) {
    if (!items.length) continue;
    const take = items.slice(0, cols * rowsMax);
    if (items.length > take.length) d.clipped.push(label.replace(" (continued)", ""));
    const c = Math.min(cols, take.length);
    picBlocks.push({ kind, label, items: take, cols: c, rows: Math.ceil(take.length / c), cap: kind === "print" ? 14.6 : 9.1 });
  }
  const picW = shareWidths(picBlocks.map((b) => ({ want: b.cols, min: Math.max(labelMm(b.label), b.cols * 18 + G.padX) })), W);
  picBlocks.forEach((b, i) => {
    b.w = picW[i];
    b.tw = r1((b.w - G.padX - G.tileGap * (b.cols - 1)) / b.cols);
  });
  const tileH = (th) => (b) => G.pad + G.label + b.rows * (th + b.cap) + (b.rows - 1) * G.tileGap;
  let th = picBlocks.length ? clamp(Math.min(...picBlocks.map((b) => b.tw)) * 1.05, 30, 72) : 0;
  const slackA = 0.6;                                                    // an estimate is never exact: a little room under what is drawn
  let bandA = picBlocks.length ? Math.max(...picBlocks.map(tileH(th))) + slackA : 0;

  /* — text and tables, in what the pictures leave — */
  const budgetB = room - bandA;
  const textBlocks = [];
  const mats = d.materials;
  const withSw = mats.some((m) => swatchOf(m));
  const sw = withSw ? G.swatch[3] : 0;
  // how tall materials come out in `cols` columns of `innerMm` in all
  const matNeed = (cols, innerMm) => {
    const cpl = cplOf((innerMm - 3 * (cols - 1)) / cols - (withSw ? sw + 2 : 0), MM.upper65);
    const heights = mats.map((m) => Math.max(sw, (1 + wrapCount(m.name, cpl) + wrapCount(m.spec, cpl) + ((m.colour || "").trim() ? 1 : 0)) * G.matLine + 0.4));
    let h = 0;
    for (let i = 0; i < heights.length; i += cols) h += Math.max(...heights.slice(i, i + cols)) + G.matGap;
    return G.pad + G.label + h;
  };
  if (mats.length) {
    // as few columns as the room allows: one column is the easiest to read, three the most that fit across
    let cols = 3;
    for (let c = 1; c <= 3; c += 1) {
      if (matNeed(c, c * 62) <= budgetB - 0.6) { cols = c; break; }
    }
    textBlocks.push({ kind: "materials", label: "Materials (continued)", items: mats, cols, sw, boxes: withSw, want: cols * 62 + G.padX, min: cols * 48 + G.padX });
  }
  if (d.rows.length) {
    textBlocks.push({
      kind: "chart", label: "Size chart (continued)", rows: d.rows, sizes: d.sizes,
      want: Math.max(90, 28 + 9 * d.sizes.length + G.padX), min: 20 + 6.5 * d.sizes.length + G.padX,
    });
  }
  if (d.finishing.length) textBlocks.push({ kind: "finishing", label: "Finishing (continued)", lines: d.finishing, want: 75, min: 55 });
  if (d.notes.length) textBlocks.push({ kind: "notes", label: "Notes (continued)", lines: d.notes, want: 100, min: 55 });
  const textW = shareWidths(textBlocks.map((b) => ({ want: b.want, min: Math.max(b.min, labelMm(b.label)) })), W);
  textBlocks.forEach((b, i) => {
    b.w = textW[i];
    const inner = b.w - G.padX;
    if (b.kind === "materials") {
      b.need = matNeed(b.cols, inner) * 1.1;                              // narrow columns waste more of each line than the estimate allows for
    } else if (b.kind === "chart") {
      b.colsMm = chartCols(inner - 0.7, d.sizes.length);
      b.need = G.pad + G.label + (b.rows.length + 1) * G.chartRow + 0.15;
    } else {
      const notes = b.kind === "notes";
      const cpl = cplOf(inner - (notes ? 2.4 : 0), notes ? MM.mixed68 : MM.mixed65);
      const lines = b.lines.reduce((n, l) => n + Math.max(1, wrapCount(l, cpl)), 0);
      b.need = (G.pad + G.label + lines * (notes ? G.noteLine : G.finLine)) * 1.05;
    }
  });

  /* — how tall each band is — */
  const textNeed = textBlocks.reduce((n, b) => Math.max(n, b.need), 0);
  let bandB = textBlocks.length ? textNeed + 4 : 0;                      // about a line over what the estimate says
  while (bandA + bandB > room && th > 24) {                                    // pictures give way first, down to a small box
    th -= 2;
    bandA = Math.max(...picBlocks.map(tileH(th))) + slackA;
  }
  if (bandA + bandB > room) bandB = Math.max(0, room - bandA);
  for (const b of textBlocks) if (b.need > bandB) d.clipped.push(b.label.replace(" (continued)", ""));
  for (const b of picBlocks) b.th = r1(th);

  return { head, brand: d.brand, logo: d.logo, legacy: d.legacy, picBlocks, textBlocks, bandA: r1(bandA), bandB: r1(bandB) };
}
