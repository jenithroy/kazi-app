/**
 * U01, the Barudan format (the machine's own "U01/U00/U02" files). A port of pyembroidery's U01Writer.py and
 * U01Reader.py (MIT licence, EmbroidePy), written to give the same bytes.
 *
 * WHAT A U01 FILE IS
 *   A 256 byte header, then 3 byte records, then the end marker. The file names NEEDLE NUMBERS, not thread colours:
 *   "use needle 3 now", and the operator threads each needle. Units are 0.1 mm.
 *
 * THE HEADER (256 bytes): 128 bytes of the character "0", then the extremes of the design as signed 16 bit numbers
 *   (min x, minus max y, max x, minus min y, taken over every record, in the file's y-up), four zero bytes, the number of
 *   records plus one (32 bit), the last position (x, minus y), and zero bytes up to byte 256.
 *
 * A RECORD (3 bytes): [control, |dy|, |dx|]. The control byte holds the type in its low 5 bits and the directions above:
 *   0x80 always, 0x40 when dy is zero or more, 0x20 when dx is zero or less. Types: 0x00 stitch, 0x01 jump, 0x07 trim,
 *   0x08 stop, 0x09 and up needle number 1, 2, 3 ... (the needle select). A move is at most 127 units in each axis.
 *   The file ends with F8 00 00.
 *
 * HOW THINGS ARE ENCODED (copied from pyembroidery; see transcode.js for the common rules)
 *   - COLOUR CHANGE: a needle select, needle 1 first (also written at the very start), then 2, 3 ... up to needleCount
 *     and round again. A needle select record does not move the needle.
 *   - TRIM: one 0x07 record. STOP: one 0x08 record.
 *   - LONG MOVES: more than 127 units in x or y is cut into equal steps of the same direction; a long STITCH becomes
 *     jumps and a final short stitch (all stitches with options.longStitch "sew").
 *   - THE START: the first record is relative to (0, 0), the design is not re-centred.
 *
 * OPTIONS used by this format:
 *   needleCount  how many needles the machine has (default 5, which is pyembroidery's); needle numbers wrap after it
 *   longStitch   "jump" (default) or "sew"
 *   maxStitchMm  the longest single stitch in mm, if shorter than 12.7 (default: 12.7)
 * Reading has no options. The first needle select before any stitch is the starting thread, not a colour change.
 */
import { CMD } from "../pattern.js";
import { ByteReader, ByteWriter, PatternBuilder, finishPattern, pyInt, pyRound, stitchLimit, toBytes } from "./util.js";
import { NEEDLE_SET, bounds, decodeThreadChange, normalizePattern } from "./transcode.js";

const MAX_MOVE = 127;

/** The U01 file for a pattern, as bytes. */
export function write(pattern, options = {}) {
  const { stitches } = normalizePattern(pattern, {
    maxJump: MAX_MOVE,
    maxStitch: stitchLimit(MAX_MOVE, options),
    fullJump: false,
    round: false, // this writer does not round the positions first (the record step below does)
    needleSet: true,
    needleCount: options.needleCount,
    longStitch: options.longStitch,
  });
  const w = new ByteWriter(0x100 + stitches.length * 3 + 16);
  w.fill(0x30, 0x80); // "0" x 128
  if (stitches.length === 0) return w.toBytes();
  const e = bounds(stitches);
  w.int16le(pyInt(e[0]));
  w.int16le(-pyInt(e[3]));
  w.int16le(pyInt(e[2]));
  w.int16le(-pyInt(e[1]));
  w.int32le(0);
  w.int32le(stitches.length + 1);
  const last = stitches[stitches.length - 1];
  w.int16le(pyInt(last[0]));
  w.int16le(-pyInt(last[1]));
  while (w.tell() < 0x100) w.byte(0);

  let xx = 0;
  let yy = 0;
  for (const s of stitches) {
    const data = s[2] & 0xff;
    const dx = pyInt(pyRound(s[0] - xx));
    const dy = pyInt(pyRound(s[1] - yy));
    xx += dx;
    yy += dy;
    let cmd = 0x80;
    if (dy >= 0) cmd |= 0x40;
    if (dx <= 0) cmd |= 0x20;
    const deltaX = Math.abs(dx);
    const deltaY = Math.abs(dy);
    if (data === CMD.STITCH) {
      w.bytes([cmd, deltaY, deltaX]);
    } else if (data === CMD.JUMP) {
      cmd |= 0x01;
      w.bytes([cmd, deltaY, deltaX]);
    } else if (data === CMD.STOP) {
      cmd |= 0x08;
      w.bytes([cmd, deltaY, deltaX]);
    } else if (data === CMD.TRIM) {
      cmd |= 0x07;
      w.bytes([cmd, deltaY, deltaX]);
    } else if (data === NEEDLE_SET) {
      let needle = decodeThreadChange(s[2]).needle;
      if (needle >= 15) needle = (needle % 15) + 1;
      cmd |= 0x08;
      cmd += needle;
      w.bytes([cmd, deltaY, deltaX]);
    } else if (data === CMD.END) {
      break;
    }
  }
  w.bytes([0xf8, 0x00, 0x00]);
  return w.toBytes();
}

/** A U01 file's bytes as a pattern { name, threads, stitches, colorsFromFile }. */
export function read(bytes) {
  const r = new ByteReader(toBytes(bytes));
  r.seek(0x100, 0);
  const b = new PatternBuilder();
  let sewn = false; // has anything been stitched yet (the first needle select is the starting thread)
  for (;;) {
    const rec = r.read(3);
    if (rec.length !== 3) break;
    const ctrl = rec[0];
    let dy = -rec[1];
    let dx = rec[2];
    if ((ctrl & 0x20) !== 0) dx = -dx;
    if ((ctrl & 0x40) !== 0) dy = -dy;
    const command = ctrl & 0b11111;
    const moved = dx !== 0 || dy !== 0;
    if (command === 0x00 || command === 0x02 || command === 0x04) {
      // stitch (0x02 and 0x04 are the "fast" and "slow" flags, which the page does not keep)
      if (command === 0x00 || moved) {
        b.stitch(dx, dy);
        sewn = true;
      }
    } else if (command === 0x01 || command === 0x03 || command === 0x05) {
      if (command === 0x01 || moved) b.move(dx, dy);
    } else if (command === 0x06 || command === 0x07) {
      b.trim();
      if (moved) b.move(dx, dy);
    } else if (command === 0x08) {
      b.stop();
      if (moved) b.move(dx, dy);
    } else if (command >= 0x09 && command <= 0x17) {
      if (sewn) b.colorChange();
      if (moved) b.move(dx, dy);
    } else {
      break; // 0x18 is the end marker; anything else we do not know
    }
  }
  b.end();
  return finishPattern({ name: null, stitches: b.stitches, threads: [], fileHoldsColors: false });
}
