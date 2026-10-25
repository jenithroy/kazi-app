/**
 * The editor's plain logic: how a pack is started, what counts as changed, and the small operations on its lists (sizes, measurement
 * lines, views). Nothing here draws anything or touches the database, so each rule can be tested on its own; the components only call these.
 *
 * The pack the editor works on is `readPack`'s shape (lib/techpack.js) plus, on a picture that is not saved yet, a local `file` and a
 * `preview` (an object URL). Materials carry `swatchFile` / `swatchPreview`, the brand logo `brandLogoFile` / `brandLogoPreview`.
 */
import {
  blankPack, chartSizes, defaultRefSize, letterFor, MEASURE_TEMPLATES, newId, packPayload, readPack, sizeKeyFrom, sortSizes, VIEW_KINDS,
} from "../../lib/techpack";
import { prepareForSave } from "../../lib/techpackWrites";
import { normaliseRegion } from "../../utils/region";

const str = (v) => (v === null || v === undefined ? "" : String(v));
const norm = (v) => str(v).trim().toLowerCase().replace(/\s+/g, " ");

/* ── Starting a pack ───────────────────────────────────────────── */

/** The four slots a new sheet starts with, in the order the owner's sheet shows them. */
export const NEW_VIEW_KINDS = ["reference", "front", "back", "side"];

export const kindLabel = (kind) => VIEW_KINDS.find((k) => k.id === kind)?.label || "View";
export const newView = (kind) => ({ id: newId(), kind, label: kindLabel(kind), url: "" });

/** "UK" or "Nepal": the Market a new pack starts with, from the region the person is working in. */
export const marketFor = (region) => (normaliseRegion(region) === "uk" ? "UK" : "Nepal");

/** What `region` is written as for a Market: "uk", "nepal", or "" when none is chosen (then the row's region is left alone). */
export const regionOfMarket = (market) => normaliseRegion(market);

/** The next `#KAZI###` after the ones in use. Only that kind of reference counts, so a brand's own ("CV-JK-004") never pushes the number up. */
export function nextStyleCode(packs) {
  let max = 0;
  for (const p of packs || []) {
    const m = /KAZI\D*(\d+)/i.exec(str(p?.styleNo));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `#KAZI${String(max + 1).padStart(3, "0")}`;
}

/**
 * The pack the card opens with. A saved row is read as it is; a new pack is blank with the date, the next reference, the market and
 * (when asked for) the customer filled in. A pack with no views gets the four empty slots, so a first picture is one click away.
 */
export function startingPack({ row = null, customer = null, today = "", styleNo = "", market = "" } = {}) {
  const pack = row ? readPack(row) : blankPack({ customer, today, styleNo, market });
  if (!pack.views.length) pack.views = NEW_VIEW_KINDS.map(newView);
  return pack;
}

/* ── Has anything changed? ─────────────────────────────────────── */

const fileKey = (f) => (f ? `${f.name}|${f.size}|${f.lastModified}` : "");
const withoutLocal = (p) => ({ ...p, file: fileKey(p.file), preview: undefined });

/** A string that is the same for two packs that hold the same things. Object URLs change every time a picture is chosen, so they are left out. */
export function signature(pack) {
  return JSON.stringify({
    ...pack,
    views: pack.views.map(withoutLocal),
    details: pack.details.map(withoutLocal),
    construction: pack.construction.map(withoutLocal),
    labelling: pack.labelling.map(withoutLocal),
    prints: pack.prints.map(withoutLocal),
    materials: pack.materials.map((m) => ({ ...m, swatchFile: fileKey(m.swatchFile), swatchPreview: undefined })),
    brandLogoFile: fileKey(pack.brandLogoFile),
    brandLogoPreview: undefined,
  });
}

/* ── What the sheet would show, before it is saved ─────────────── */

/** A picture's address for showing: the local preview while it is only a file, else the saved address. */
export const shownUrl = (p) => (p ? p.preview || p.url || "" : "");

/**
 * The pack exactly as it would read back after a Save (empty lines left out, letters from A, numbers of removed sizes gone, pictures that
 * are still files shown from their previews): the preview sheet draws this, so it cannot differ from what Save then makes.
 */
export function previewPack(pack, row = null) {
  const saved = prepareForSave(pack, row);
  const show = (p) => (p.file && p.preview ? { ...p, url: p.preview } : p);
  const asRow = {
    ...packPayload({
      ...saved,
      views: saved.views.map(show),
      details: saved.details.map(show),
      construction: saved.construction.map(show),
      labelling: saved.labelling.map(show),
      prints: saved.prints.map(show),
      materials: saved.materials.map((m) => (m.swatchFile && m.swatchPreview ? { ...m, swatchUrl: m.swatchPreview } : m)),
      brandLogoUrl: saved.brandLogoFile && saved.brandLogoPreview ? saved.brandLogoPreview : saved.brandLogoUrl,
    }),
    id: pack.id || "preview",
    remarks: pack.remarks,
    tech_pack_images: pack.pages,
    tech_pack_url: pack.externalUrl || "",
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
  };
  return readPack(asRow);
}

/* ── Sizes ─────────────────────────────────────────────────────── */

/** A size as typed, made to match the standard ones where it can ("medium" and " m " are M); anything else is kept as typed. */
export function cleanSize(text) {
  const t = str(text).trim().replace(/\s+/g, " ").slice(0, 8);
  return sizeKeyFrom(t) || t.toUpperCase();
}

/**
 * Put a size on or take it off the list. At least one stays on. The numbers typed for a size that comes off are left where they are
 * (so putting it back brings them back); a Save is what drops them. The reference size follows if its size comes off.
 */
export function toggleSize(pack, size) {
  const on = pack.sizes.includes(size);
  if (on && pack.sizes.length <= 1) return pack;
  const sizes = on ? pack.sizes.filter((s) => s !== size) : sortSizes([...pack.sizes, size]);
  const refSize = sizes.includes(pack.refSize) ? pack.refSize : defaultRefSize(sizes);
  return { ...pack, sizes, refSize };
}

/* ── Measurement lines ─────────────────────────────────────────── */

export const reletter = (points) => points.map((p, i) => (p.letter === letterFor(i) ? p : { ...p, letter: letterFor(i) }));

export const blankPoint = (init = {}) => ({ id: newId(), letter: "", label: "", values: {}, view: null, line: null, ...init });

export const appendPoint = (points, point) => reletter([...points, point]);

export const removePoint = (points, id) => reletter(points.filter((p) => p.id !== id));

/** Move a line up (-1) or down (+1) in the list; the letters follow its place. */
export function movePoint(points, id, delta) {
  const from = points.findIndex((p) => p.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= points.length) return points;
  const next = points.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return reletter(next);
}

export const patchPoint = (points, id, patch) => points.map((p) => (p.id === id ? { ...p, ...patch } : p));

/**
 * What stays of a typed number: digits (Nepali digits too) and ONE "." or ",". It is text, never parsed: "11,5" is written as typed.
 * Whatever comes before the number (spaces, letters, a minus) is skipped; the first thing after it that is not part of it ends it. So a
 * pasted "34 cm" is "34", "34 1/2" is "34" and "1.2.3" is "1.2": digits are never joined across a gap (that made "34 1/2" into 3412).
 */
export function sanitizeNumber(raw) {
  let out = "";
  let separator = false;
  for (const ch of str(raw)) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch >= "०" && ch <= "९") out += String(ch.charCodeAt(0) - 0x0966);
    else if ((ch === "." || ch === ",") && !separator) { out += ch; separator = true; }
    else if (out !== "") break;
  }
  return out;
}

/**
 * Whether a key typed into a number box is turned down: a letter, a space, a slash, a minus, or a second point. The box then says what it
 * takes instead of dropping the key without a word (and joining the digits on either side of it). `from`..`to` is what the key replaces.
 */
export function numberKeyRefused(key, value, from = 0, to = from) {
  if (!key || [...key].length !== 1) return false;                // Backspace, Tab, the arrows, Enter, a dead key...
  if (/[0-9०-९]/.test(key)) return false;
  if (key === "." || key === ",") return /[.,]/.test(`${value.slice(0, from)}${value.slice(to)}`);          // there is room for one point or comma
  return true;
}

/** The sentence a number box says when it turns something down. */
export const NUMBER_NOTE = "A size box takes one number, like 34 or 34.5. Write 34 1/2 as 34.5.";

/** A line's number for a size changed; an emptied box leaves no key behind. */
export function setPointValue(points, id, size, raw) {
  const v = sanitizeNumber(raw);
  return points.map((p) => {
    if (p.id !== id) return p;
    const values = { ...p.values };
    if (v === "") delete values[size];
    else values[size] = v;
    return { ...p, values };
  });
}

/** Add the names of a garment's usual measurements that are not in the list yet, as empty lines. Never touches a line already there. */
export function addTemplateRows(points, template) {
  const have = new Set(points.map((p) => norm(p.label)).filter(Boolean));
  const fresh = template.names.filter((n) => !have.has(norm(n))).map((label) => blankPoint({ label }));
  return { points: reletter([...points, ...fresh]), added: fresh.length };
}

/** Which garment's measurement names to suggest for what was typed as the product type (null when none fits). */
export function guessTemplate(productType) {
  const t = norm(productType);
  if (!t) return null;
  const rules = [
    ["tshirt", /t-?shirt|tee\b|top\b|polo|vest/],
    ["hoodie", /hood|sweat|pullover|fleece/],
    ["jacket", /jacket|coat|blazer|gilet|bomber|outer/],
    ["trousers", /trouser|pant|jean|jogger|chino|legging/],
    ["shorts", /short/],
    ["dress", /dress|skirt|gown/],
  ];
  const hit = rules.find(([, re]) => re.test(t));
  return hit ? MEASURE_TEMPLATES.find((m) => m.id === hit[0]) : null;
}

/** Names to offer in a line's name box: the chosen garment's (or the one the product type suggests, or all of them), minus the ones already used. */
export function nameSuggestions(pack, templateId) {
  const chosen = MEASURE_TEMPLATES.find((m) => m.id === templateId) || guessTemplate(pack.productType);
  const names = chosen ? chosen.names : [...new Set(MEASURE_TEMPLATES.flatMap((m) => m.names))];
  const used = new Set(pack.points.map((p) => norm(p.label)));
  return names.filter((n) => !used.has(norm(n)));
}

/** Sizes shown as columns of the measurement table. */
export const boardSizes = (pack) => chartSizes(pack);

/* ── Views ─────────────────────────────────────────────────────── */

export const hasPicture = (v) => Boolean(v && (v.preview || v.url));

/** The view the board opens on: a front view with a picture, else a reference photo, else the first one with a picture. */
export function pickBoardView(views) {
  const withPic = views.filter(hasPicture);
  return withPic.find((v) => v.kind === "front") || withPic.find((v) => v.kind === "reference") || withPic[0] || null;
}

/** What a view is called on screen: its caption, else its kind's name. */
export const viewName = (v) => str(v?.label).trim() || kindLabel(v?.kind);

/* ── Rows a Save leaves out although something was typed in them ─── */

const has = (v) => str(v).trim() !== "";
const rows = (v) => (Array.isArray(v) ? v : []);

/**
 * Which rows `packPayload` would drop although the person typed something in them, as 1-based places in their list: a material is kept
 * for a name or a description, a print for a picture, a place or a method, a header line only with a label (a new pack starts with two
 * labels and no values, and that is just "not filled in": only a value with no label is lost). A row with nothing in it at all is not
 * listed (an unused row is simply not saved). Said under the list, as lines with no name are on the board.
 */
export function leftOutRows(pack) {
  const place = (list, test) => rows(list).map((x, i) => (x && test(x) ? i + 1 : 0)).filter(Boolean);
  return {
    materials: place(pack.materials, (m) => !has(m.name) && !has(m.spec) && (has(m.colour) || has(m.swatchUrl) || m.swatchFile)),
    prints: place(pack.prints, (p) => !has(p.url) && !p.file && !has(p.placement) && !has(p.technique) && (has(p.colour) || has(p.width))),
    headerLines: place(pack.headerLines, (l) => has(l.value) && !has(l.label)),
  };
}
