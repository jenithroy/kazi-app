/**
 * XXX, the Singer / Compucon format. A port of pyembroidery's XxxWriter.py and XxxReader.py (MIT licence, EmbroidePy),
 * written to give the same bytes.
 *
 * WHAT AN XXX FILE IS
 *   A 256 byte header, the records, a 4 byte end marker, and then the thread colours (this format DOES store them, as
 *   RGB). Units are 0.1 mm.
 *
 * THE HEADER (256 bytes, all little endian): zeros, then the number of records (not counting the END), the number of
 *   threads, the design's width and height, the last position (x, minus y), the left and bottom extremes, more zeros, and
 *   the number 0x20. The 32 bit number at byte 252 is where the records end, filled in after they are written.
 *
 * RECORDS (a move is at most 124 units in each axis, y is flipped like in DST: the file counts upward)
 *   stitch        dx dy                 (two bytes; only when both moves are under 124 units)
 *   long stitch   0x7D dx dy            (dx and dy as 16 bit numbers; the reader takes this one for a move)
 *   jump          0x7F 0x01 dx dy
 *   trim          0x7F 0x03 dx dy
 *   colour change 0x7F 0x08 dx dy       (a STOP is written the same way)
 *   end           0x7F 0x7F 0x02 0x14
 *   then the threads: 0x00 0x00, one "0x00 r g b" per thread, zero padding up to 21 threads, 00 FF FF FF, 0x00 0x01.
 *
 * HOW THINGS ARE ENCODED (copied from pyembroidery; see transcode.js for the common rules)
 *   - LONG MOVES: more than 124 units in x or y is cut into equal steps of the same direction; a long STITCH becomes
 *     jumps and a final short stitch (all stitches with options.longStitch "sew").
 *   - A stitch of EXACTLY 124 units in one axis is written as a "long stitch" and so comes back from a reader as a jump.
 *     pyembroidery does the same; it is one unit past the short form.
 *   - THE START: the first record is relative to (0, 0), the design is not re-centred.
 *
 * OPTIONS used by this format: longStitch ("jump", the default, or "sew"), maxStitchMm (a shorter longest stitch than 12.4 mm).
 * Reading has no options.
 */
import { CMD } from "../pattern.js";
import {
  ByteReader,
  ByteWriter,
  PatternBuilder,
  finishPattern,
  pyInt,
  pyRound,
  signed16,
  signed8,
  stitchLimit,
  toBytes,
} from "./util.js";
import { bounds, normalizePattern } from "./transcode.js";

const MAX_MOVE = 124;

function writeHeader(w, stitches, threads) {
  w.fill(0, 0x17);
  w.int32le(stitches.length - 1); // the END is not counted as a record
  w.fill(0, 0x0c);
  w.int32le(threads.length);
  w.int16le(0);
  const e = bounds(stitches);
  const last = stitches[stitches.length - 1];
  w.int16le(pyInt(e[2] - e[0])); // width
  w.int16le(pyInt(e[3] - e[1])); // height
  w.int16le(pyInt(last[0]));
  w.int16le(pyInt(-last[1]));
  w.int16le(pyInt(-e[0]));
  w.int16le(pyInt(e[3]));
  w.fill(0, 0x42);
  w.int16le(0);
  w.int16le(0);
  w.fill(0, 0x73);
  w.int16le(0x20);
  w.fill(0, 0x08);
}

function writeColors(w, threads) {
  w.byte(0x00);
  w.byte(0x00);
  for (const t of threads) {
    w.byte(0x00);
    w.byte((t.color >> 16) & 0xff);
    w.byte((t.color >> 8) & 0xff);
    w.byte(t.color & 0xff);
  }
  for (let i = 0; i < 21 - threads.length; i++) w.int32le(0);
  w.int32le(0xffffff00);
  w.byte(0x00);
  w.byte(0x01);
}

/** The XXX file for a pattern, as bytes. */
export function write(pattern, options = {}) {
  const { stitches, threads } = normalizePattern(pattern, {
    maxJump: MAX_MOVE,
    maxStitch: stitchLimit(MAX_MOVE, options),
    fullJump: false,
    round: true,
    longStitch: options.longStitch,
  });
  const w = new ByteWriter(0x200 + stitches.length * 4 + 128);
  writeHeader(w, stitches, threads);
  const placeholder = w.tell();
  w.int32le(0);

  let xx = 0;
  let yy = 0;
  for (const s of stitches) {
    const data = s[2] & 0xff;
    const dx = pyInt(pyRound(s[0] - xx));
    const dy = pyInt(pyRound(s[1] - yy));
    xx += dx;
    yy += dy;
    if (data === CMD.COLOR_CHANGE || data === CMD.STOP) {
      w.bytes([0x7f, 0x08]);
      w.byte(dx);
      w.byte(-dy);
    } else if (data === CMD.END) {
      break;
    } else if (data === CMD.STITCH) {
      if (dx > -124 && dx < 124 && dy > -124 && dy < 124) {
        w.byte(dx);
        w.byte(-dy);
      } else {
        w.byte(0x7d);
        w.int16le(dx);
        w.int16le(-dy);
      }
    } else if (data === CMD.TRIM) {
      w.bytes([0x7f, 0x03]);
      w.byte(dx);
      w.byte(-dy);
    } else if (data === CMD.JUMP) {
      w.bytes([0x7f, 0x01]);
      w.byte(dx);
      w.byte(-dy);
    }
  }
  const endOfStitches = w.tell();
  w.seek(placeholder);
  w.int32le(endOfStitches);
  w.seek(endOfStitches);
  w.bytes([0x7f, 0x7f, 0x02, 0x14]);
  writeColors(w, threads);
  return w.toBytes();
}

/** An XXX file's bytes as a pattern { name, threads, stitches, colorsFromFile }. */
export function read(bytes) {
  const r = new ByteReader(toBytes(bytes));
  r.seek(0x27, 1);
  const colorCount = r.u16le() || 0;
  r.seek(0x100, 0);
  const b = new PatternBuilder();
  for (;;) {
    const b1 = r.u8();
    if (b1 === null) break;
    if (b1 === 0x7d || b1 === 0x7e) {
      const x = r.u16le();
      const y = r.u16le();
      if (x === null || y === null) break;
      b.move(signed16(x), -signed16(y));
      continue;
    }
    const b2 = r.u8();
    if (b2 === null) break;
    if (b1 !== 0x7f) {
      b.stitch(signed8(b1), -signed8(b2));
      continue;
    }
    const b3 = r.u8();
    const b4 = r.u8();
    if (b3 === null || b4 === null) break;
    if (b2 === 0x01) {
      b.move(signed8(b3), -signed8(b4));
    } else if (b2 === 0x03) {
      b.trim();
      const x = signed8(b3);
      const y = -signed8(b4);
      if (x !== 0 || y !== 0) b.move(x, y);
    } else if (b2 === 0x08 || (b2 >= 0x0a && b2 <= 0x17)) {
      b.colorChange();
    } else if (b2 === 0x7f || b2 === 0x18) {
      break; // the end
    }
  }
  b.end();
  r.seek(2, 1);
  const threads = [];
  for (let i = 0; i < colorCount; i++) {
    const c = r.u32be();
    if (c === null) break;
    threads.push({ color: c & 0xffffff, description: null, catalog: null, brand: null, chart: null });
  }
  return finishPattern({ name: null, stitches: b.stitches, threads, fileHoldsColors: threads.length > 0 });
}
