/**
 * The pattern: what an embroidery file holds, as plain data (see README.md for the units).
 * stitches are [x, y, cmd] with absolute positions in 0.1 mm, +y down.
 */

export const CMD = Object.freeze({ STITCH: 0, JUMP: 1, TRIM: 2, COLOR_CHANGE: 3, STOP: 4, END: 5 });

/** An empty pattern. `threads` are { r, g, b, name?, code?, brand? }, one per colour block in sewing order. */
export function createPattern({ name = "design", threads = [], stitches = [] } = {}) {
  return { name, threads, stitches };
}

/** The stitch units in a millimetre: files count in tenths of a millimetre. */
export const UNITS_PER_MM = 10;

/**
 * The numbers a person wants before sending a file to a machine: how many stitches, how many colours, how big,
 * how much thread. `colors` is the number of colour blocks (the colour changes plus one), at least 1 when there is
 * any stitch. The thread length is the sum of the sewn stitches only (jumps do not use thread), in metres, and does
 * not count the bobbin thread.
 */
export function patternStats(pattern) {
  const s = pattern.stitches;
  let stitchCount = 0, jumpCount = 0, trimCount = 0, colorChanges = 0, stopCount = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let sewnUnits = 0, longestUnits = 0, shortest = Infinity;
  let px = 0, py = 0, havePrev = false;
  for (let i = 0; i < s.length; i++) {
    const [x, y, cmd] = s[i];
    if (cmd === CMD.STITCH) {
      stitchCount++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (havePrev) {
        const d = Math.hypot(x - px, y - py);
        sewnUnits += d;
        if (d > longestUnits) longestUnits = d;
        if (d > 0 && d < shortest) shortest = d;
      }
    } else if (cmd === CMD.JUMP) jumpCount++;
    else if (cmd === CMD.TRIM) trimCount++;
    else if (cmd === CMD.COLOR_CHANGE) colorChanges++;
    else if (cmd === CMD.STOP) stopCount++;
    if (cmd === CMD.STITCH || cmd === CMD.JUMP) { px = x; py = y; havePrev = cmd === CMD.STITCH; }
  }
  const has = stitchCount > 0;
  return {
    stitchCount,
    jumpCount,
    trimCount,
    colorChanges,
    stopCount,
    colors: has ? colorChanges + 1 : 0,
    bounds: has ? { minX, minY, maxX, maxY } : null,
    widthMm: has ? (maxX - minX) / UNITS_PER_MM : 0,
    heightMm: has ? (maxY - minY) / UNITS_PER_MM : 0,
    threadMetres: sewnUnits / UNITS_PER_MM / 1000,
    longestStitchMm: longestUnits / UNITS_PER_MM,
    shortestStitchMm: shortest === Infinity ? 0 : shortest / UNITS_PER_MM,
  };
}

/** Round a millimetre figure to the file's grid (tenths of a millimetre). */
export const mmToUnits = (mm) => Math.round(mm * UNITS_PER_MM);
