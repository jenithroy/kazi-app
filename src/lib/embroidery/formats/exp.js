/**
 * EXP, Melco's "expanded" format (also read by many other machines and programs). A port of pyembroidery's
 * ExpWriter.py and ExpReader.py (MIT licence, EmbroidePy), written to give the same bytes.
 *
 * WHAT AN EXP FILE IS
 *   No header at all, just records, and no END marker (the file simply stops). No thread colours: only "change colour
 *   here". Units are 0.1 mm. A move is stored RELATIVE to the previous position as two signed bytes (dx, dy), so one
 *   record moves at most 127 units in each axis. y is flipped (the file counts y upward, the page downward).
 *   An empty design is therefore an empty file.
 *
 * RECORDS
 *   stitch        dx dy                      (two bytes)
 *   jump          0x80 0x04 dx dy            (the needle moves without sewing)
 *   trim          0x80 0x80 0x07 0x00        (cut the thread, no movement)
 *   colour change 0x80 0x01 0x00 0x00        (a STOP is written the same way)
 *
 * HOW THINGS ARE ENCODED (copied from pyembroidery; see transcode.js for the common rules)
 *   - LONG MOVES: more than 127 units in x or y is cut into equal steps of the same direction; a long STITCH becomes jumps
 *     and a final short stitch (all stitches with options.longStitch "sew").
 *   - THE START: the first record is relative to (0, 0), the design is not re-centred. The first stitch of each colour block
 *     is preceded by a jump that lands exactly on it, and a stitch of length zero follows.
 *
 * OPTIONS used by this format: longStitch ("jump", the default, or "sew"), maxStitchMm (a shorter longest stitch than 12.7 mm).
 * Reading has no options.
 */
import { CMD } from "../pattern.js";
import { ByteReader, ByteWriter, PatternBuilder, finishPattern, pyInt, pyRound, signed8, stitchLimit, toBytes } from "./util.js";
import { normalizePattern } from "./transcode.js";

const MAX_MOVE = 127;

/** The EXP file for a pattern, as bytes. */
export function write(pattern, options = {}) {
  const { stitches } = normalizePattern(pattern, {
    maxJump: MAX_MOVE,
    maxStitch: stitchLimit(MAX_MOVE, options),
    fullJump: true,
    round: true,
    longStitch: options.longStitch,
  });
  const w = new ByteWriter(stitches.length * 4 + 16);
  let xx = 0;
  let yy = 0;
  for (const s of stitches) {
    const data = s[2] & 0xff;
    const dx = pyInt(pyRound(s[0] - xx));
    const dy = pyInt(pyRound(s[1] - yy));
    xx += dx;
    yy += dy;
    if (data === CMD.STITCH) {
      w.byte(dx);
      w.byte(-dy);
    } else if (data === CMD.JUMP) {
      w.bytes([0x80, 0x04]);
      w.byte(dx);
      w.byte(-dy);
    } else if (data === CMD.TRIM) {
      w.bytes([0x80, 0x80, 0x07, 0x00]);
    } else if (data === CMD.COLOR_CHANGE || data === CMD.STOP) {
      w.bytes([0x80, 0x01, 0x00, 0x00]);
    }
    // END writes nothing
  }
  return w.toBytes();
}

/** An EXP file's bytes as a pattern { name, threads, stitches, colorsFromFile }. */
export function read(bytes) {
  const r = new ByteReader(toBytes(bytes));
  const b = new PatternBuilder();
  for (;;) {
    let c = r.read(2);
    if (c.length !== 2) break;
    if (c[0] !== 0x80) {
      b.stitch(signed8(c[0]), -signed8(c[1]));
      continue;
    }
    const control = c[1];
    c = r.read(2);
    if (c.length !== 2) break;
    const x = signed8(c[0]);
    const y = -signed8(c[1]);
    if (control === 0x80) {
      b.trim();
    } else if (control === 0x02) {
      b.stitch(x, y); // pyembroidery says this one "shouldn't exist"
    } else if (control === 0x04) {
      b.move(x, y);
    } else if (control === 0x01) {
      b.colorChange();
      if (x !== 0 || y !== 0) b.move(x, y);
    } else {
      break; // a control we do not know
    }
  }
  b.end();
  return finishPattern({ name: null, stitches: b.stitches, threads: [], fileHoldsColors: false });
}
