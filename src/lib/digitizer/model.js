/**
 * The Digitizer's design, as plain data, and the small pure questions the editor asks of it (where is this object, what is
 * under the pointer, what happens to its numbers when it is moved, scaled or turned). Nothing here touches the screen.
 *
 * A design:  { name, hoop: { w, h }, fabric, objects: [object], reference: null | {...}, settings: {...} }
 *
 * An object keeps its shape in its OWN frame (rings in millimetres, centred on (0, 0)) and a transform that puts it in
 * the hoop: { x, y, sx, sy, rot } = centre in the hoop, scale, rotation in degrees (clockwise on screen). So moving, scaling
 * and turning change four numbers, never the shape; the engine bakes the transform in when it makes stitches.
 *
 *   { id, name, kind: "shape" | "text" | "rect" | "ellipse", visible, locked,
 *     rings, transform,
 *     fill:   { type: "auto" | "tatami" | "satin" | "none", color: "#rrggbb", angle, spacing, stitchLen, pullComp, underlay },
 *     stroke: { type: "none" | "run" | "bean" | "satin", color, width, len, position },
 *     text?:  { value, font, size, bold, italic, spacing, lineHeight, align },
 *     source?: "image" }
 *
 * Objects are never changed in place: every edit returns new objects, so undo is just keeping the old design.
 */
import { bboxOf, composeMatrix, invertMatrix, multiplyMatrix, transformRings, pointInRings, distanceToRings, islandsOf, ringArea } from "../embroidery/geometry/poly.js";

let counter = 0;
/** A short id that is unique within a session and across reloads of a saved design. */
export const newId = () => `o${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export const HOOPS = [
  { id: "chest", label: "Left chest · 100 × 100 mm", w: 100, h: 100 },
  { id: "small", label: "Small · 130 × 180 mm", w: 130, h: 180 },
  { id: "medium", label: "Medium · 200 × 200 mm", w: 200, h: 200 },
  { id: "large", label: "Large · 260 × 260 mm", w: 260, h: 260 },
  { id: "back", label: "Back · 300 × 350 mm", w: 300, h: 350 },
  { id: "cap", label: "Cap · 150 × 60 mm", w: 150, h: 60 },
];

/** The cloth a new design is drawn on until the picture or the person says otherwise (a pale cream). */
export const DEFAULT_CLOTH = "#f4f1ea";

export function newDesign(partial = {}) {
  return { name: "Untitled design", hoop: { w: 100, h: 100 }, fabric: "woven", fabricColor: DEFAULT_CLOTH, objects: [], reference: null, settings: {}, ...partial };
}

// No underlay here on purpose: until one is chosen the fabric's own (leather: none, knit: more) is used.
export const DEFAULT_FILL = { type: "auto", color: "#1d3b8a", angle: 45 };
export const DEFAULT_STROKE = { type: "none", color: "#ffffff", width: 1.5, len: 2.5, position: "center" };

/**
 * Centre a set of rings on (0, 0) and return the centre they had, so a shape made anywhere becomes an object with its own
 * frame: { rings (centred), cx, cy }.
 */
export function centreRings(rings) {
  const box = bboxOf(rings);
  if (!box) return { rings, cx: 0, cy: 0 };
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  return { rings: rings.map((r) => r.map((p) => [p[0] - cx, p[1] - cy])), cx, cy };
}

/** An object from a shape given in the hoop's frame (millimetres). */
export function makeObject({ name = "Shape", kind = "shape", rings, fill, stroke, text, source, transform } = {}) {
  const { rings: local, cx, cy } = centreRings(rings);
  return {
    id: newId(),
    name,
    kind,
    visible: true,
    locked: false,
    rings: local,
    transform: transform || { x: cx, y: cy, sx: 1, sy: 1, rot: 0 },
    fill: { ...DEFAULT_FILL, ...(fill || {}) },
    stroke: { ...DEFAULT_STROKE, ...(stroke || {}) },
    ...(text ? { text } : {}),
    ...(source ? { source } : {}),
  };
}

export const objectMatrix = (obj) => composeMatrix(obj.transform);

/** The object's rings in the hoop's frame. */
export function worldRings(obj) {
  return transformRings(obj.rings, objectMatrix(obj));
}

const boxCache = new WeakMap();
/** [x0, y0, x1, y1] of the object's shape in its own frame (cached per rings array, since objects are immutable). */
export function localBox(obj) {
  let b = boxCache.get(obj.rings);
  if (!b) { b = bboxOf(obj.rings) || [0, 0, 0, 0]; boxCache.set(obj.rings, b); }
  return b;
}

/** The four corners of the object's local box in the hoop's frame, clockwise from top-left, plus its centre. */
export function objectCorners(obj) {
  const [x0, y0, x1, y1] = localBox(obj);
  const m = objectMatrix(obj);
  const map = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  return { c: [map(x0, y0), map(x1, y0), map(x1, y1), map(x0, y1)], centre: map((x0 + x1) / 2, (y0 + y1) / 2) };
}

/** The axis-aligned box of the object in the hoop's frame. */
export function objectBox(obj) {
  const { c } = objectCorners(obj);
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function boxOfObjects(objs) {
  let b = null;
  for (const o of objs) {
    const ob = objectBox(o);
    b = b ? [Math.min(b[0], ob[0]), Math.min(b[1], ob[1]), Math.max(b[2], ob[2]), Math.max(b[3], ob[3])] : ob;
  }
  return b;
}

/** Width and height of an object in millimetres (its local box scaled, ignoring rotation). */
export function objectSize(obj) {
  const [x0, y0, x1, y1] = localBox(obj);
  return { w: (x1 - x0) * Math.abs(obj.transform.sx), h: (y1 - y0) * Math.abs(obj.transform.sy) };
}

/**
 * The topmost visible, unlocked object under a point (hoop millimetres). `tolMm` is how close counts for thin shapes, so a
 * 1 mm letter stroke can still be picked at a low zoom. Objects later in the list are on top.
 */
export function hitObject(design, x, y, tolMm = 0) {
  for (let i = design.objects.length - 1; i >= 0; i--) {
    const o = design.objects[i];
    if (!o.visible || o.locked) continue;
    const ob = objectBox(o);
    if (x < ob[0] - tolMm || x > ob[2] + tolMm || y < ob[1] - tolMm || y > ob[3] + tolMm) continue;
    const inv = invertMatrix(objectMatrix(o));
    if (!inv) continue;
    const lx = inv[0] * x + inv[2] * y + inv[4], ly = inv[1] * x + inv[3] * y + inv[5];
    if (o.fill.type !== "none" && pointInRings(lx, ly, o.rings)) return o.id;
    const scale = Math.max(Math.abs(o.transform.sx), Math.abs(o.transform.sy)) || 1;
    if (tolMm > 0 && distanceToRings(lx, ly, o.rings) * scale <= tolMm) return o.id;
  }
  return null;
}

/** Objects whose box is inside (`inside`) or touches (`!inside`) the rectangle. */
export function objectsInRect(design, rect, inside) {
  const [rx0, ry0, rx1, ry1] = rect;
  return design.objects.filter((o) => {
    if (!o.visible || o.locked) return false;
    const [x0, y0, x1, y1] = objectBox(o);
    if (inside) return x0 >= rx0 && x1 <= rx1 && y0 >= ry0 && y1 <= ry1;
    return x0 <= rx1 && x1 >= rx0 && y0 <= ry1 && y1 >= ry0;
  }).map((o) => o.id);
}

/* ── changing an object's numbers ─────────────────────────────────────── */

export const withTransform = (obj, patch) => ({ ...obj, transform: { ...obj.transform, ...patch } });

/**
 * Mirror an object across the screen ("h") or down it ("v") about the middle of its box. A turned object is mirrored too: it
 * is turned the other way, so what you see is a true mirror image and not the shape flipped inside its own turn.
 */
export function flipObject(obj, axis) {
  const t = obj.transform;
  const before = objectCorners(obj).centre;
  const next = withTransform(obj, axis === "h" ? { sx: -t.sx, rot: -t.rot } : { sy: -t.sy, rot: -t.rot });
  const after = objectCorners(next).centre;
  return moveObject(next, before[0] - after[0], before[1] - after[1]);
}

/** Move by (dx, dy) millimetres. */
export const moveObject = (obj, dx, dy) => withTransform(obj, { x: obj.transform.x + dx, y: obj.transform.y + dy });

/** Rotate `deg` degrees about a point of the hoop. */
export function rotateObjectAbout(obj, deg, cx, cy) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const dx = obj.transform.x - cx, dy = obj.transform.y - cy;
  return withTransform(obj, { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c, rot: obj.transform.rot + deg });
}

/**
 * Scale about a point of the hoop by (a, b) along the hoop's axes. Where the object goes follows (a, b) exactly. Its own shape
 * is scaled exactly when it is turned by a multiple of 90 degrees; for any other turn the scale is made uniform (the geometric
 * mean), because a turned object scaled unevenly would shear. A negative factor mirrors it (properly, even when turned).
 */
export function scaleObjectAbout(obj, a, b, ax, ay) {
  const t = obj.transform;
  const q = (((t.rot % 180) + 180) % 180);
  const quarter = Math.abs(q) < 1e-6 || Math.abs(q - 90) < 1e-6;
  const x = ax + (t.x - ax) * a, y = ay + (t.y - ay) * b;
  if (quarter) {
    const swap = Math.abs(q - 90) < 1e-6;
    return withTransform(obj, { x, y, sx: t.sx * (swap ? b : a), sy: t.sy * (swap ? a : b) });
  }
  const u = Math.sqrt(Math.abs(a * b));
  let next = withTransform(obj, { x, y, sx: t.sx * u, sy: t.sy * u });
  if (a < 0) next = flipObject(next, "h");
  if (b < 0) next = flipObject(next, "v");
  return next;
}

/**
 * Drag a handle of a single object's box. `handle` is "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"; (px, py) is the
 * pointer in the hoop; `keepAspect` scales both ways together. The opposite side stays where it is.
 */
export function resizeByHandle(obj, handle, px, py, keepAspect) {
  const [x0, y0, x1, y1] = localBox(obj);
  const hx = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0;
  const hy = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;
  // The anchor is the opposite side (or the middle line for an edge handle's free axis).
  const ax = hx > 0 ? x0 : hx < 0 ? x1 : (x0 + x1) / 2, ay = hy > 0 ? y0 : hy < 0 ? y1 : (y0 + y1) / 2;
  const hxL = hx > 0 ? x1 : hx < 0 ? x0 : (x0 + x1) / 2, hyL = hy > 0 ? y1 : hy < 0 ? y0 : (y0 + y1) / 2;
  const t = obj.transform;
  const m = objectMatrix(obj);
  const aw = [m[0] * ax + m[2] * ay + m[4], m[1] * ax + m[3] * ay + m[5]];
  // The pointer, relative to the anchor, in the object's turned (but not scaled) axes.
  const r = (-t.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const dx = px - aw[0], dy = py - aw[1];
  const ux = dx * c - dy * s, uy = dx * s + dy * c;
  let sx = hx ? ux / (hxL - ax) : t.sx, sy = hy ? uy / (hyL - ay) : t.sy;
  if (keepAspect && hx && hy) {
    // Both ways by the same factor (the larger the pointer asks for), flipping only the way the pointer has crossed over.
    const kx = sx / t.sx, ky = sy / t.sy;
    const k = Math.max(Math.abs(kx), Math.abs(ky));
    sx = t.sx * k * (kx < 0 ? -1 : 1);
    sy = t.sy * k * (ky < 0 ? -1 : 1);
  }
  const MIN = 0.02;
  if (Math.abs(sx) < MIN) sx = MIN * (sx < 0 ? -1 : 1);
  if (Math.abs(sy) < MIN) sy = MIN * (sy < 0 ? -1 : 1);
  // Keep the anchor where it was in the hoop.
  const m2 = composeMatrix({ x: 0, y: 0, sx, sy, rot: t.rot });
  const ax2 = m2[0] * ax + m2[2] * ay, ay2 = m2[1] * ax + m2[3] * ay;
  return withTransform(obj, { sx, sy, x: aw[0] - ax2, y: aw[1] - ay2 });
}

/** Set an object's size in millimetres (its box), growing from its centre. */
export function setObjectSize(obj, w, h, keepAspect) {
  const [x0, y0, x1, y1] = localBox(obj);
  const lw = x1 - x0 || 1, lh = y1 - y0 || 1;
  const cur = objectSize(obj);
  let nw = w ?? cur.w, nh = h ?? cur.h;
  if (keepAspect) {
    if (w != null && h == null) nh = (cur.h / (cur.w || 1)) * nw;
    else if (h != null && w == null) nw = (cur.w / (cur.h || 1)) * nh;
  }
  const sx = Math.sign(obj.transform.sx || 1) * Math.max(0.0001, nw) / lw, sy = Math.sign(obj.transform.sy || 1) * Math.max(0.0001, nh) / lh;
  // Grow about the centre of the local box, not the origin, so the box stays where it is.
  const before = objectCorners(obj).centre;
  const next = withTransform(obj, { sx, sy });
  const after = objectCorners(next).centre;
  return moveObject(next, before[0] - after[0], before[1] - after[1]);
}

/**
 * Move an object's centre of box to (x, y) in the hoop. Used by the inspector's X and Y boxes, which show the box's
 * centre rather than the object's own origin.
 */
export function setObjectCentre(obj, x, y) {
  const c = objectCorners(obj).centre;
  return moveObject(obj, x - c[0], y - c[1]);
}

/* ── breaking an object into pieces ───────────────────────────────────── */

/** One object per island of a shape (letters of a word, the parts of a logo), each keeping the parent's look and place. */
export function breakApart(obj) {
  const world = worldRings(obj);
  const islands = islandsOf(world).filter((is) => ringArea(is.outer) > 0.05);
  if (islands.length < 2) return [obj];
  return islands.map((is, i) => {
    const { rings, cx, cy } = centreRings([is.outer, ...is.holes]);
    return {
      ...obj,
      id: newId(),
      name: `${obj.name} ${i + 1}`,
      kind: "shape",
      rings,
      transform: { x: cx, y: cy, sx: 1, sy: 1, rot: 0 },
      text: undefined,
    };
  });
}

/** Remove the holes of a shape (so a shape lying on top of it is sewn over a solid base). */
export function fillHoles(obj) {
  const kept = [];
  for (const is of islandsOf(obj.rings)) kept.push(is.outer);
  return { ...obj, rings: kept };
}

/** Copy objects (new ids), nudged by (dx, dy) mm. */
export function cloneObjects(objs, dx = 4, dy = 4) {
  return objs.map((o) => moveObject({ ...o, id: newId(), name: `${o.name} copy` }, dx, dy));
}

/* ── saving ───────────────────────────────────────────────────────────── */

/** The design as JSON text (rings rounded to a micrometre-ish 0.001 mm so a file stays small). */
export function serializeDesign(design) {
  const round = (v) => Math.round(v * 1000) / 1000;
  const objects = design.objects.map((o) => ({ ...o, rings: o.rings.map((r) => r.map((p) => [round(p[0]), round(p[1])])) }));
  return JSON.stringify({ v: 1, ...design, objects, reference: null }); // the picture itself is not kept, so neither is a pointer to it
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const numOr = (v, d) => (isNum(v) ? v : d);
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/**
 * A design from a file. A file can be damaged or written by hand, so everything the page draws from is checked: an object
 * without a position, a hoop that is not a number or a ring with a missing point must not be able to break the page.
 */
export function parseDesign(text) {
  const d = JSON.parse(text);
  if (!d || d.v !== 1 || !Array.isArray(d.objects)) throw new Error("This is not a Digitizer design file.");
  const hoop = plain(d.hoop);
  const seen = new Set();
  return newDesign({
    ...d,
    name: typeof d.name === "string" && d.name.trim() ? d.name.slice(0, 120) : "Untitled design",
    hoop: { w: Math.min(1000, Math.max(20, numOr(hoop.w, 100))), h: Math.min(1000, Math.max(20, numOr(hoop.h, 100))) },
    fabricColor: /^#[0-9a-f]{6}$/i.test(String(d.fabricColor)) ? d.fabricColor : "#f4f1ea",
    settings: plain(d.settings),
    objects: d.objects.filter((o) => o && typeof o === "object").map((o, i) => {
      const obj = makeObjectDefaults(o, i);
      while (seen.has(obj.id)) obj.id = newId(); // two objects with one id would be selected, moved and deleted together
      seen.add(obj.id);
      return obj;
    }),
    reference: null, // the picture a design was made from is not stored in its file, so there is nothing to point at
  });
}

/** Rings made only of points with two numbers in them, and at least three of those. */
function cleanRings(rings) {
  if (!Array.isArray(rings)) return [];
  return rings
    .map((r) => (Array.isArray(r) ? r.filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1])).map((p) => [p[0], p[1]]) : []))
    .filter((r) => r.length >= 3);
}

function makeObjectDefaults(o, i = 0) {
  const t = plain(o.transform);
  return {
    visible: true, locked: false, kind: "shape", ...o,
    id: typeof o.id === "string" && o.id ? o.id : newId(),
    name: typeof o.name === "string" ? o.name : `Shape ${i + 1}`,
    rings: cleanRings(o.rings),
    transform: { x: numOr(t.x, 0), y: numOr(t.y, 0), sx: numOr(t.sx, 1) || 1, sy: numOr(t.sy, 1) || 1, rot: numOr(t.rot, 0) },
    fill: { ...DEFAULT_FILL, ...plain(o.fill) },
    stroke: { ...DEFAULT_STROKE, ...plain(o.stroke) },
  };
}

/** Stitches need the object's rings in the hoop: the design in the shape the engine reads. */
export function engineDesign(design) {
  return {
    name: design.name,
    settings: { ...(design.settings || {}), fabric: design.fabric },
    objects: design.objects
      .filter((o) => o.visible)
      .map((o) => ({ id: o.id, name: o.name, visible: true, rings: o.rings, transform: o.transform, fill: o.fill, stroke: o.stroke })),
  };
}

export { multiplyMatrix };
