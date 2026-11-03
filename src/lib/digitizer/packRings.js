/**
 * The shapes of a design (each object's rings: lists of [x, y] points) as typed arrays, and back.
 *
 * A message that carries tens of thousands of points as arrays of arrays costs the thread that sends it, and the one that gets it, a
 * long freeze to copy (about a tenth of a second for a design of a quarter of a million points, and it grows with the design). Typed
 * arrays are handed over without copying, and turning them back into points can be done in small pieces between other work.
 *   packObjects(objects)  -> { meta, ringCounts, ringLens, coords }   meta: the objects without their rings; the three arrays can be transferred
 *   unpackObjects(packed)        sync: the objects again, rings and all (values are exact: coordinates travel as 64-bit floats)
 *   unpackObjectsAsync(packed)   the same, giving the page a turn after every few milliseconds of work
 */
export function packObjects(objects) {
  let rings = 0, points = 0;
  for (const o of objects) {
    rings += o.rings.length;
    for (const r of o.rings) points += r.length;
  }
  const ringCounts = new Int32Array(objects.length);
  const ringLens = new Int32Array(rings);
  const coords = new Float64Array(points * 2);
  let ri = 0, ci = 0;
  const meta = new Array(objects.length);
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    ringCounts[i] = o.rings.length;
    for (const r of o.rings) {
      ringLens[ri++] = r.length;
      for (let j = 0; j < r.length; j++) {
        const p = r[j];
        coords[ci++] = p[0];
        coords[ci++] = p[1];
      }
    }
    const { rings: _outlines, ...rest } = o; // everything but the outlines
    meta[i] = rest;
  }
  return { meta, ringCounts, ringLens, coords };
}

/** Object `i` of `packed`, its rings made again; `at` is where in the arrays to read ({ ring, coord }), moved on past it. */
function unpackOne(packed, i, at) {
  const { meta, ringCounts, ringLens, coords } = packed;
  const rings = new Array(ringCounts[i]);
  for (let k = 0; k < rings.length; k++) {
    const n = ringLens[at.ring++];
    const ring = new Array(n);
    for (let j = 0; j < n; j++, at.coord += 2) ring[j] = [coords[at.coord], coords[at.coord + 1]];
    rings[k] = ring;
  }
  return { ...meta[i], rings };
}

export function unpackObjects(packed) {
  const at = { ring: 0, coord: 0 };
  const out = new Array(packed.meta.length);
  for (let i = 0; i < out.length; i++) out[i] = unpackOne(packed, i, at);
  return out;
}

const waiting = [];
let channel = null;
/** The next turn of the event loop (a message to ourselves: unlike a timer it is not slowed down in a tab that is in the background). */
const nextTurn = () => new Promise((resolve) => {
  if (typeof globalThis.MessageChannel === "undefined") { setTimeout(resolve, 0); return; }
  if (!channel) {
    channel = new globalThis.MessageChannel();
    channel.port1.onmessage = () => { const r = waiting.shift(); if (r) r(); };
  }
  waiting.push(resolve);
  channel.port2.postMessage(0);
});

export async function unpackObjectsAsync(packed, sliceMs = 10) {
  const at = { ring: 0, coord: 0 };
  const out = new Array(packed.meta.length);
  let t = performance.now();
  for (let i = 0; i < out.length; i++) {
    out[i] = unpackOne(packed, i, at);
    if (performance.now() - t > sliceMs) { await nextTurn(); t = performance.now(); }
  }
  return out;
}
