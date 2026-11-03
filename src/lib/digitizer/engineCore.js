/**
 * The heavy work of the Digitizer, as plain functions of (type, payload): making stitches from a design, and reading a
 * picture into shapes. They run in a Web Worker (engine.worker.js) so the page stays smooth, and directly when there is no
 * worker (the tests). Results are made cheap to send: the stitches travel as one flat Int32Array of x, y, command triples.
 *
 * Reading a picture is two jobs. "trace" finds the regions and colours; with `keep` (a token the page makes up) the tracer's
 * answer STAYS HERE and only a small summary goes back (a big answer is tens of thousands of points, and sending it to the page
 * cost it a long freeze). "shapes" then turns that kept answer into the design's objects for the colours the person has chosen,
 * as often as they change their mind, and sends back just the objects (their outlines as typed arrays, see packRings.js) and the
 * colour list.
 */
import { generate } from "../embroidery/stitch/engine.js";
import { traceImage, quantize } from "../embroidery/trace/index.js";
import { checkStitches, checkMessages } from "../embroidery/stitch/checks.js";
import { flatten } from "./flat.js";
import { objectsFromTrace, changedColours } from "./convert.js";
import { packObjects, unpackObjects } from "./packRings.js";

/** How many tracer answers are kept at once (a conversion that fits the picture to the hoop makes two; the oldest go first). The page can always ask for one again. */
const KEEP_MAX = 4;
const kept = new Map(); // token -> the tracer's answer; the one used last is at the end

function remember(token, traced) {
  kept.delete(token);
  kept.set(token, traced);
  while (kept.size > KEEP_MAX) kept.delete(kept.keys().next().value);
}

/** What the page needs of an answer it does not hold: the colours, how the picture was read (stats), and each piece's colour and box (to fit the design to the hoop). Not the outlines, nor the points of the fine lines (only what was found, counted). */
function summary(traced) {
  const { details, ...rest } = traced;
  return { ...rest, shapes: traced.shapes.map((s) => ({ id: s.id, color: s.color, area: s.area, bbox: s.bbox })), ...(details ? { details: { stats: details.stats } } : {}) };
}

export function run(type, payload) {
  if (type === "generate") {
    // From a Web Worker the design's outlines come as typed arrays (see engineClient.js); on the page's own thread it is the design itself.
    const design = payload.packed ? { ...payload.design, objects: unpackObjects(payload.packed) } : payload.design;
    const res = generate(design, payload.options || {});
    const flat = flatten(res.pattern.stitches);
    const checks = checkStitches(flat);
    return {
      result: { flat, threads: res.pattern.threads, name: res.pattern.name, warnings: [...res.warnings, ...checkMessages(checks)], checks, runs: res.runs, ms: res.ms },
      transfer: [flat.buffer],
    };
  }
  if (type === "trace") {
    const traced = traceImage(payload.image, payload.options || {});
    if (payload.keep == null) return { result: traced, transfer: [] };
    remember(payload.keep, traced);
    return { result: summary(traced), transfer: [] };
  }
  if (type === "shapes") {
    const traced = kept.get(payload.token);
    if (!traced) return { result: { gone: true }, transfer: [] }; // not here (the worker was restarted, or made room): the page traces the picture again
    remember(payload.token, traced); // in use: the last to be let go
    const { objects: all, palette, rank, details } = objectsFromTrace(traced, {
      originX: payload.originX, originY: payload.originY, mmPerPx: payload.mmPerPx,
      skip: new Set(payload.skip), include: new Set(payload.include), fabric: payload.fabric, snap: payload.snap, before: payload.before || null,
      maxColors: payload.maxColors, detailThick: !!payload.detailThick,
    });
    // When only some colours were switched (see mergeTraceObjects) the page uses only those colours' shapes: the others stay as they are in the design.
    let objects = all;
    if (!payload.fresh && payload.before && payload.before.length === palette.length) {
      const changed = changedColours(palette, payload.before); // (the same colours the page puts into the design: mergeTraceObjects)
      objects = all.filter((o) => changed.has(o.pal));
    }
    const packed = packObjects(objects);
    // the sewing order as a list of [colour, place] pairs: plain data
    return { result: { palette, rank: [...rank], packed, details }, transfer: [packed.ringCounts.buffer, packed.ringLens.buffer, packed.coords.buffer] };
  }
  if (type === "release") {
    for (const token of payload.tokens || []) kept.delete(token);
    return { result: true, transfer: [] };
  }
  if (type === "quantize") {
    const q = quantize(payload.image, payload.options || {});
    return { result: q, transfer: q.labels ? [q.labels.buffer] : [] };
  }
  throw new Error(`Unknown job: ${type}`);
}
