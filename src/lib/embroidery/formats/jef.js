/**
 * JEF, the Janome format (Janome home and professional machines, also sold as Elna and Kenmore). A port of pyembroidery's
 * JefWriter.py and JefReader.py and EmbThreadJef.py (MIT licence, EmbroidePy), written to give the same bytes.
 *
 * WHAT A JEF FILE IS
 *   A header, then one colour number per colour block, then 2 byte records and the end marker. Colours are numbers from
 *   Janome's own chart of 78 threads (tables.js: JEF_THREADS); a thread that is not on the chart is matched to the closest
 *   one. Units are 0.1 mm.
 *
 * THE HEADER (little endian, 0x74 bytes plus 8 bytes per colour block)
 *   where the records start; the number 0x14; the date and time as 14 ASCII digits (YYYYMMDDHHMMSS); two zero bytes;
 *   the number of colour blocks; the number of "points" (stitches, 2 for each jump and colour change, the trim jumps, plus
 *   1 for the end); a hoop number picked from the design size (0 = 110x110 mm, 1 = 50x50, 2 = 140x200, 3 = 126x110,
 *   4 = 200x200); half the design's width and height twice; then, for each of four hoops (110x110, 50x50, 140x200 and a
 *   custom 140x200), how far the design is from the hoop's edge (left, top, right, bottom; all -1 when it does not fit);
 *   then one colour number per block, then the number 0x0D once per block.
 *
 * RECORDS: a stitch is dx, then dy (signed bytes, y flipped), at most 127 units in each axis. Control records start with
 *   0x80: 0x80 0x01 dx dy colour change (a STOP is written the same way), 0x80 0x02 dx dy jump, 0x80 0x10 the end.
 *
 * HOW THINGS ARE ENCODED (copied from pyembroidery; see transcode.js for the common rules)
 *   - COLOURS: each block gets the closest Janome colour. If two blocks IN A ROW would get the same colour but are
 *     different threads, the second takes its second closest, so the machine shows a colour change. A STOP is a colour
 *     number 0 entry (the machine stops) and the next STOP goes back to the block's colour.
 *   - TRIM: JEF has no trim command, and by default pyembroidery writes NO trim at all (the machine trims on its own for
 *     long jumps). With options.trims on, a TRIM is written as `trimJumps` jumps of zero length (0x80 0x02 0x00 0x00).
 *   - LONG MOVES: more than 127 units in x or y is cut into equal steps of the same direction; a long STITCH becomes
 *     jumps and a final short stitch (all stitches with options.longStitch "sew"). The first stitch of each colour block
 *     is preceded by a jump that lands exactly on it.
 *   - THE START: the first record is relative to (0, 0), the design is not re-centred.
 *
 * OPTIONS used by this format:
 *   trims        true to write TRIM as zero-length jumps (default false, as pyembroidery)
 *   trimJumps    how many such jumps, 2 to 8 (default 3)
 *   longStitch   "jump" (default) or "sew"
 *   maxStitchMm  the longest single stitch in mm, if shorter than 12.7 (default: 12.7)
 *   date         the 14 digit date/time to put in the header (default: now, local time). Give it to get the same bytes twice
 * Reading options: trimDistanceMm (default 3: a run of jumps longer than this after sewing means a trim; null for never),
 * trims (default false: when true, a run of `trimJumps` jumps, default 3, also means a trim), trimJumps, clipping (default
 * true: a run of jumps that comes back to where it started is dropped; turn it off with trims, because the zero-length
 * jumps that spell a trim would be dropped before they are counted).
 */
import { CMD } from "../pattern.js";
import {
  ByteReader,
  ByteWriter,
  PatternBuilder,
  defaultThread,
  finishPattern,
  findNearestColorIndex,
  interpolateTrims,
  jefThreadSet,
  pyInt,
  pyRound,
  signed8,
  threadsEqual,
  stitchLimit,
  toBytes,
  trimJumpCount,
} from "./util.js";
import { bounds, fixColorCount, normalizePattern } from "./transcode.js";

const MAX_MOVE = 127;

// hoop numbers in the header
const HOOP_110X110 = 0;
const HOOP_50X50 = 1;
const HOOP_140X200 = 2;
const HOOP_126X110 = 3;
const HOOP_200X200 = 4;

function hoopSize(width, height) {
  if (width < 500 && height < 500) return HOOP_50X50;
  if (width < 1260 && height < 1100) return HOOP_126X110;
  if (width < 1400 && height < 2000) return HOOP_140X200;
  if (width < 2000 && height < 2000) return HOOP_200X200;
  return HOOP_110X110;
}

function writeHoopEdgeDistance(w, xEdge, yEdge) {
  if (Math.min(xEdge, yEdge) >= 0) {
    w.int32le(xEdge); // left
    w.int32le(yEdge); // top
    w.int32le(xEdge); // right
    w.int32le(yEdge); // bottom
  } else {
    w.int32le(-1);
    w.int32le(-1);
    w.int32le(-1);
    w.int32le(-1);
  }
}

/** The 14 digits for the header: `options.date` (digits only, padded or cut to 14), else now in local time. */
function headerDate(options) {
  if (options.date !== undefined && options.date !== null) {
    return String(options.date).replace(/[^0-9]/g, "").padEnd(14, "0").slice(0, 14);
  }
  const d = new Date();
  const p = (n, len = 2) => String(n).padStart(len, "0");
  return p(d.getFullYear(), 4) + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

/** The JEF file for a pattern, as bytes. */
export function write(pattern, options = {}) {
  const trims = Boolean(options.trims);
  const commandCountMax = trimJumpCount(options);
  const { stitches, threads } = normalizePattern(pattern, {
    maxJump: MAX_MOVE,
    maxStitch: stitchLimit(MAX_MOVE, options),
    fullJump: true,
    round: true,
    longStitch: options.longStitch,
  });
  fixColorCount(stitches, threads);

  // which Janome colour each colour block gets (and the stops)
  const jefThreads = jefThreadSet();
  let lastIndex = null;
  let lastThread = null;
  const palette = [];
  let colorToggled = false;
  let colorCount = 0;
  let indexInThreadlist = 0;
  for (const stitch of stitches) {
    const flags = stitch[2] & 0xff;
    if (flags === CMD.COLOR_CHANGE || indexInThreadlist === 0) {
      const thread = threads[indexInThreadlist] || defaultThread(indexInThreadlist);
      indexInThreadlist += 1;
      colorCount += 1;
      let indexOfJefThread = findNearestColorIndex(thread.color, jefThreads);
      if (lastIndex === indexOfJefThread && !threadsEqual(lastThread, thread)) {
        // the last block and this one are different threads that look like the same Janome colour: take the second closest
        const repeatedThread = jefThreads[indexOfJefThread];
        const repeatedIndex = indexOfJefThread;
        jefThreads[indexOfJefThread] = null;
        indexOfJefThread = findNearestColorIndex(thread.color, jefThreads);
        jefThreads[repeatedIndex] = repeatedThread;
      }
      palette.push(indexOfJefThread);
      lastIndex = indexOfJefThread;
      lastThread = thread;
      colorToggled = false;
    }
    if (flags === CMD.STOP) {
      colorCount += 1;
      colorToggled = !colorToggled;
      palette.push(colorToggled ? 0 : lastIndex);
    }
  }

  const w = new ByteWriter(0x100 + stitches.length * 4 + 64);
  w.int32le(0x74 + colorCount * 8);
  w.int32le(0x14);
  w.ascii(headerDate(options));
  w.int8(0);
  w.int8(0);
  w.int32le(colorCount);
  let pointCount = 1; // 1 for the END
  for (const s of stitches) {
    const data = s[2] & 0xff;
    if (data === CMD.STITCH) pointCount += 1;
    else if (data === CMD.JUMP) pointCount += 2;
    else if (data === CMD.TRIM) {
      if (trims) pointCount += 2 * commandCountMax;
    } else if (data === CMD.COLOR_CHANGE || data === CMD.STOP) pointCount += 2;
    else if (data === CMD.END) break;
  }
  w.int32le(pointCount);
  const e = bounds(stitches);
  const designWidth = pyInt(pyRound(e[2] - e[0]));
  const designHeight = pyInt(pyRound(e[3] - e[1]));
  w.int32le(hoopSize(designWidth, designHeight));
  const halfWidth = pyInt(pyRound(designWidth / 2));
  const halfHeight = pyInt(pyRound(designHeight / 2));
  // distance from the centre of the hoop
  w.int32le(halfWidth);
  w.int32le(halfHeight);
  w.int32le(halfWidth);
  w.int32le(halfHeight);
  // distance from the edge of the default 110 x 110 hoop, the 50 x 50, the 140 x 200 and the custom hoop
  writeHoopEdgeDistance(w, 550 - halfWidth, 550 - halfHeight);
  writeHoopEdgeDistance(w, 250 - halfWidth, 250 - halfHeight);
  writeHoopEdgeDistance(w, 700 - halfWidth, 1000 - halfHeight);
  writeHoopEdgeDistance(w, 700 - halfWidth, 1000 - halfHeight);

  for (const t of palette) w.int32le(t);
  for (let i = 0; i < colorCount; i++) w.int32le(0x0d);

  let xx = 0;
  let yy = 0;
  for (const s of stitches) {
    const data = s[2] & 0xff;
    const dx = pyInt(pyRound(s[0] - xx));
    const dy = pyInt(pyRound(s[1] - yy));
    xx += dx;
    yy += dy;
    if (data === CMD.STITCH) {
      w.int8(dx);
      w.int8(-dy);
    } else if (data === CMD.COLOR_CHANGE || data === CMD.STOP) {
      w.bytes([0x80, 0x01]);
      w.int8(dx);
      w.int8(-dy);
    } else if (data === CMD.TRIM) {
      if (trims) for (let n = 0; n < commandCountMax; n++) w.bytes([0x80, 0x02, 0x00, 0x00]);
    } else if (data === CMD.JUMP) {
      w.bytes([0x80, 0x02]);
      w.int8(dx);
      w.int8(-dy);
    } else if (data === CMD.END) {
      break;
    }
  }
  w.bytes([0x80, 0x10]);
  return w.toBytes();
}

/** A JEF file's bytes as a pattern { name, threads, stitches, colorsFromFile }. */
export function read(bytes, options = {}) {
  const r = new ByteReader(toBytes(bytes));
  const jefThreads = jefThreadSet();
  const stitchOffset = r.u32le();
  r.seek(20, 1);
  const countColors = r.u32le() || 0;
  r.seek(88, 1);
  const threadList = []; // a null entry is a "stop" place holder (colour number 0)
  for (let i = 0; i < countColors; i++) {
    const v = r.u32le();
    if (v === null) break;
    const index = Math.abs(v);
    threadList.push(index === 0 ? null : jefThreads[index % jefThreads.length]);
  }
  if (stitchOffset === null) return finishPattern({ name: null, stitches: [[0, 0, CMD.END]], threads: [], fileHoldsColors: true });
  r.seek(stitchOffset, 0);

  const b = new PatternBuilder();
  let colorIndex = 1;
  for (;;) {
    let c = r.read(2);
    if (c.length !== 2) break;
    if (c[0] !== 0x80) {
      b.stitch(signed8(c[0]), -signed8(c[1]));
      continue;
    }
    const ctrl = c[1];
    c = r.read(2);
    if (c.length !== 2) break;
    const x = signed8(c[0]);
    const y = -signed8(c[1]);
    if (ctrl === 0x02) {
      b.move(x, y);
    } else if (ctrl === 0x01) {
      if (colorIndex < threadList.length && threadList[colorIndex] === null) {
        b.stop(0, 0); // colour number 0 is "stop here"
        threadList.splice(colorIndex, 1);
      } else {
        b.colorChange(0, 0);
        colorIndex += 1;
      }
    } else {
      break; // 0x10 is the end; anything else we do not know
    }
  }
  b.end(0, 0);

  let countMax = options.trimJumps === undefined || !options.trimJumps ? null : options.trimJumps;
  const trims = Boolean(options.trims);
  if (trims && countMax === null) countMax = 3;
  const mm = options.trimDistanceMm === undefined ? 3.0 : options.trimDistanceMm;
  const distance = mm === null ? null : mm * 10;
  interpolateTrims(b.stitches, countMax, distance, options.clipping === undefined ? true : Boolean(options.clipping));
  return finishPattern({ name: null, stitches: b.stitches, threads: threadList.filter(Boolean), fileHoldsColors: true });
}
