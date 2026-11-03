/**
 * How the shapes of a converted picture are sewn, apart from where they are and what colour they are: the way their rows run
 * (`angles.js`) and whether a hard-edged flat shape gets a thin line along its edge (`edges.js`). Two plain settings:
 *
 *   settings.angles  "auto" | "plain"   rows follow the long axis of a shape and touching shapes differ (ON by default) | all at 45 degrees
 *   settings.edges   "auto" | "none"    a thin line just inside the edge of big flat shapes (logos and artwork) | rows end at the edge (ON by default)
 *
 * The settings travel with the tracer's options (`traceOptions` adds `look`), the tracer's answer keeps them (`traced.look`), and
 * `objectsFromTrace` calls `applyLook` on the objects it makes, so a conversion, a colour switched on or off and a change of cloth all get
 * the same look. Objects not made from the picture (hand traced, text, shapes drawn in the editor) are never touched.
 */
import { assignAngles } from "./angles.js";
import { edgeLook } from "./edges.js";

/** What a person gets without asking: the rows follow the shapes (measured: 6 % fewer stitches, far fewer crowded spots) and big flat shapes get an edge line (closer to the drawing, see edges.js). */
export const LOOK_DEFAULTS = { angles: "auto", edges: "auto" };

/** The look settings of a settings object, whatever it holds (a saved design or an old page has none). */
export function lookOptions(settings = {}) {
  return {
    angles: settings.angles === "plain" ? "plain" : settings.angles === "auto" ? "auto" : LOOK_DEFAULTS.angles,
    edges: settings.edges === "none" ? "none" : settings.edges === "auto" ? "auto" : LOOK_DEFAULTS.edges,
    ...(settings.lookTune ? { tune: settings.lookTune } : {}),
  };
}

/** The mean width of a traced shape in millimetres (twice its area over its outline's length). */
function meanWidthMm(shape, mmPerPx) {
  let per = 0;
  for (const c of shape.contours) {
    for (let i = 0, n = c.length; i < n; i++) { const p = c[i], q = c[(i + 1) % n]; per += Math.hypot(q[0] - p[0], q[1] - p[1]); }
  }
  return per > 0 ? (2 * shape.area * mmPerPx) / per : 0;
}

/**
 * Give the objects made from `shapes` their rows' angle and their edge line.
 * @param {object[]} objects  one object per entry of `shapes`, in the same order
 * @param {object[]} shapes  the tracer's shapes that became the objects
 * @param {object} traced  the tracer's answer (all its shapes, `stats.kind`, `look`)
 */
export function applyLook(objects, shapes, traced, mmPerPx) {
  const look = { ...LOOK_DEFAULTS, ...(traced.look || {}) };
  const tune = look.tune || {};
  const wantAngles = look.angles !== "plain";
  const wantEdges = look.edges !== "none";
  if (!wantAngles && !wantEdges) return objects;
  const kind = traced.stats && traced.stats.kind;
  // Angles are worked out over EVERY shape of the picture, not only the ones in the design, so switching a colour off and on again
  // never changes the angle of a shape that stays.
  let angleOf = null;
  if (wantAngles) {
    const all = assignAngles(traced.shapes, { mmPerPx, ...(tune.angles || {}) });
    angleOf = new Map(traced.shapes.map((s, i) => [s, all[i]]));
  }
  return objects.map((o, k) => {
    const s = shapes[k];
    let next = o;
    const a = angleOf && angleOf.get(s);
    if (a != null) next = { ...next, fill: { ...next.fill, angle: a } };
    if (wantEdges) {
      const el = edgeLook(s, { kind, mmPerPx, color: o.fill.color, widthMm: meanWidthMm(s, mmPerPx) }, tune.edges || {});
      if (el) next = { ...next, stroke: { ...next.stroke, ...el.stroke }, ...(el.fillInset == null ? {} : { fill: { ...next.fill, inset: el.fillInset } }) };
    }
    return next;
  });
}
