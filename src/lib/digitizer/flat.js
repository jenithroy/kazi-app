/**
 * The stitches as one flat Int32Array of x, y, command triples (0.1 mm units): the cheap way to send them from the worker and to draw
 * them, and back to the arrays of [x, y, cmd] the file writers read. Kept apart from the engine so the page can use it without
 * pulling the engine in.
 */

/** Flatten a pattern's stitches to [x, y, cmd, x, y, cmd, ...] for sending and for drawing. */
export function flatten(stitches) {
  const flat = new Int32Array(stitches.length * 3);
  for (let i = 0; i < stitches.length; i++) {
    const s = stitches[i];
    flat[i * 3] = s[0]; flat[i * 3 + 1] = s[1]; flat[i * 3 + 2] = s[2];
  }
  return flat;
}

/** The other way: arrays of [x, y, cmd] (what the file writers read). */
export function unflatten(flat) {
  const n = flat.length / 3;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = [flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]];
  return out;
}
