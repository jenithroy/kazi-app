/**
 * DST, the Tajima format: the one nearly every industrial machine reads (Tajima, Barudan, ZSK, SWF, Happy, Feiya ...).
 * A port of pyembroidery's DstWriter.py and DstReader.py (MIT licence, EmbroidePy), written to give the same bytes.
 *
 * WHAT A DST FILE IS
 *   A 512 byte text header, then 3 byte records, then an END record. No thread colours are stored (the machine
 *   operator picks threads): only "change colour here". Units are 0.1 mm.
 *
 * THE HEADER (each line ends in a carriage return, the text is ASCII, the rest of the 512 bytes is spaces):
 *   LA:  the design name, 16 characters (shorter names padded with spaces, longer ones cut: pyembroidery does not cut,
 *        but a longer label would push every other field out of its fixed place)
 *   ST:  how many records the writer produced (7 digits): every stitch, jump, colour change and the END. A trim counts
 *        as one although it takes several records in the file (pyembroidery counts it this way too)
 *   CO:  how many COLOR_CHANGE records (3 digits). A STOP is not counted
 *   +X: -X: +Y: -Y:  the extremes of the design: +X the largest x, -X the size of the smallest x (positive numbers),
 *        +Y the size of the largest y, -Y the size of the smallest y, taken over EVERY record, jumps included, in the
 *        page's coordinates (y down). pyembroidery does it this way round, so do we; machines rely on the stitch
 *        records, not on these.
 *   AX: AY:  where the needle ends (the END record's position), with a sign; y is flipped to the file's y-up
 *   MX: MY:  always +0 (the position of a "multi design" file's next part)
 *   PD:  "******"
 *   then a 0x1A byte and spaces up to byte 512.
 *   The optional extended header (see options) adds AU: (author), CP: (copyright) and one TC: line per thread
 *   (#rrggbb,name,code) before the 0x1A, but only while it still fits in the 512 bytes.
 *
 * A RECORD (3 bytes b0 b1 b2): the move dx, dy is spelled as a sum of the weights 1, 3, 9, 27, 81 (each used
 * plus or minus once), so one record moves at most 121 units in each axis. b2 holds the type: bit 7 set is a JUMP
 * (needle up), bits 0 and 1 are always set on a move; 0xC3 is a colour change (a STOP is written the same),
 * 0xF3 is the END. y is flipped (the file counts y upward, the page downward).
 *
 * HOW THINGS ARE ENCODED (all copied from pyembroidery; see transcode.js for the common rules)
 *   - LONG MOVES: more than 121 units in x or y is cut into equal steps (records of the same direction). A long STITCH
 *     becomes jumps and a final short stitch (or all stitches with options.longStitch "sew").
 *   - THE START: the first record is relative to (0, 0), the design is not re-centred. A design that starts far from the
 *     middle begins with jump records.
 *   - TRIM: DST has no trim command. A trim is written as `trimJumps` jump records that wiggle and come back
 *     (with 3: +2,+2  then -4,-4  then +2,+2 in x and y), which machines read as "cut the thread". The reader turns a run
 *     of 3 or more jumps back into a TRIM.
 *   - COLOR_CHANGE and STOP: one 0xC3 record, no movement. END: one 0xF3 record.
 *
 * OPTIONS used by this format (all optional; the others in index.js are ignored here):
 *   title              the design name for the LA: line (default: the pattern's name)
 *   trimJumps          jump records per trim, 2 to 8 (default 3)
 *   longStitch         "jump" (default) or "sew": what a stitch longer than 12.1 mm becomes
 *   maxStitchMm        the longest single stitch in mm, if shorter than 12.1 (default: 12.1)
 *   dstExtendedHeader  true to add AU:/CP:/TC: lines (author, copyright and the thread colours); default false, which is the
 *                      plain header every machine knows. A reader that does not know the extra lines ignores them
 *   author, copyright  text for the AU: and CP: lines of the extended header
 * Reading options: trimJumps (default 3: this many jumps in a row after sewing mean a trim), trimDistanceMm (default
 * none: a run of jumps longer than this also means a trim), clipping (default true: a run of jumps that comes back to where it
 * started is dropped, which removes the wiggle a trim was written as).
 */
import { CMD } from "../pattern.js";
import {
  ByteReader,
  ByteWriter,
  PatternBuilder,
  asciiOnly,
  decodeUtf8,
  designTitle,
  finishPattern,
  hexColor,
  interpolateTrims,
  padLeft,
  padRight,
  parseHexColor,
  pyInt,
  pyRound,
  pyStrip,
  stitchLimit,
  toBytes,
  trimJumpCount,
} from "./util.js";
import { bounds, countCommand, normalizePattern } from "./transcode.js";

const HEADER_SIZE = 512;
const MAX_MOVE = 121;

const bit = (b) => 1 << b;

/**
 * One 3 byte record. `x` and `y` are the move in the page's units (y down, flipped here); `flags` is the command.
 * Throws if the move is longer than a record can hold (the normalizer never lets that happen).
 */
function encodeRecord(x, y, flags) {
  y = -y;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  if (flags === CMD.JUMP) b2 += bit(7); // jump: 10xxxx11
  if (flags === CMD.STITCH || flags === CMD.JUMP) {
    b2 += bit(0);
    b2 += bit(1);
    if (x > 40) { b2 += bit(2); x -= 81; }
    if (x < -40) { b2 += bit(3); x += 81; }
    if (x > 13) { b1 += bit(2); x -= 27; }
    if (x < -13) { b1 += bit(3); x += 27; }
    if (x > 4) { b0 += bit(2); x -= 9; }
    if (x < -4) { b0 += bit(3); x += 9; }
    if (x > 1) { b1 += bit(0); x -= 3; }
    if (x < -1) { b1 += bit(1); x += 3; }
    if (x > 0) { b0 += bit(0); x -= 1; }
    if (x < 0) { b0 += bit(1); x += 1; }
    if (x !== 0) throw new Error("The dx value given to the writer exceeds maximum allowed.");
    if (y > 40) { b2 += bit(5); y -= 81; }
    if (y < -40) { b2 += bit(4); y += 81; }
    if (y > 13) { b1 += bit(5); y -= 27; }
    if (y < -13) { b1 += bit(4); y += 27; }
    if (y > 4) { b0 += bit(5); y -= 9; }
    if (y < -4) { b0 += bit(4); y += 9; }
    if (y > 1) { b1 += bit(7); y -= 3; }
    if (y < -1) { b1 += bit(6); y += 3; }
    if (y > 0) { b0 += bit(7); y -= 1; }
    if (y < 0) { b0 += bit(6); y += 1; }
    if (y !== 0) throw new Error("The dy value given to the writer exceeds maximum allowed.");
  } else if (flags === CMD.COLOR_CHANGE) {
    b2 = 0b11000011;
  } else if (flags === CMD.STOP) {
    b2 = 0b11000011;
  } else if (flags === CMD.END) {
    b2 = 0b11110011;
  }
  return [b0, b1, b2];
}

/** The header text, as far as it fits in 512 bytes with the closing 0x1A. */
function headerText(stitches, threads, title, options) {
  const b = bounds(stitches);
  let ax = 0;
  let ay = 0;
  if (stitches.length > 0) {
    const last = stitches[stitches.length - 1];
    ax = pyInt(last[0]);
    ay = -pyInt(last[1]);
  }
  const n = (v, width) => padLeft(pyInt(Math.abs(v)), width);
  let text = "";
  text += "LA:" + padRight(title.slice(0, 16), 16) + "\r";
  text += "ST:" + padLeft(stitches.length, 7) + "\r";
  text += "CO:" + padLeft(countCommand(stitches, CMD.COLOR_CHANGE), 3) + "\r";
  text += "+X:" + n(b[2], 5) + "\r";
  text += "-X:" + n(b[0], 5) + "\r";
  text += "+Y:" + n(b[3], 5) + "\r";
  text += "-Y:" + n(b[1], 5) + "\r";
  text += (ax >= 0 ? "AX:+" + padLeft(ax, 5) : "AX:-" + padLeft(Math.abs(ax), 5)) + "\r";
  text += (ay >= 0 ? "AY:+" + padLeft(ay, 5) : "AY:-" + padLeft(Math.abs(ay), 5)) + "\r";
  text += "MX:+" + padLeft(0, 5) + "\r";
  text += "MY:+" + padLeft(0, 5) + "\r";
  text += "PD:" + padLeft("******", 6) + "\r";
  if (options.dstExtendedHeader) {
    const lines = [];
    if (options.author != null && options.author !== "") lines.push("AU:" + asciiOnly(options.author) + "\r");
    if (options.copyright != null && options.copyright !== "") lines.push("CP:" + asciiOnly(options.copyright) + "\r");
    for (const t of threads) {
      lines.push("TC:" + hexColor(t.color) + "," + (t.description === null ? "None" : t.description) + "," + (t.catalog === null ? "None" : t.catalog) + "\r");
    }
    for (const line of lines) {
      if (text.length + line.length + 1 > HEADER_SIZE) break; // a longer header would push the stitches out of place
      text += line;
    }
  }
  return text;
}

/** The DST file for a pattern, as bytes. */
export function write(pattern, options = {}) {
  const trimAt = trimJumpCount(options);
  const { stitches, threads } = normalizePattern(pattern, {
    maxJump: MAX_MOVE,
    maxStitch: stitchLimit(MAX_MOVE, options),
    fullJump: false,
    round: true,
    longStitch: options.longStitch,
  });
  const w = new ByteWriter(HEADER_SIZE + stitches.length * 3 + 64);
  w.ascii(headerText(stitches, threads, designTitle(pattern, options), options));
  w.byte(0x1a);
  while (w.tell() < HEADER_SIZE) w.byte(0x20);

  let xx = 0;
  let yy = 0;
  for (const s of stitches) {
    const data = s[2] & 0xff;
    const dx = pyInt(pyRound(s[0] - xx));
    const dy = pyInt(pyRound(s[1] - yy));
    xx += dx;
    yy += dy;
    if (data === CMD.TRIM) {
      let delta = -4;
      w.bytes(encodeRecord(-delta / 2, -delta / 2, CMD.JUMP));
      for (let p = 1; p < trimAt - 1; p++) {
        w.bytes(encodeRecord(delta, delta, CMD.JUMP));
        delta = -delta;
      }
      w.bytes(encodeRecord(delta / 2, delta / 2, CMD.JUMP));
    } else {
      w.bytes(encodeRecord(dx, dy, data));
    }
  }
  return w.toBytes();
}

// ---------------------------------------------------------------------------------------------------------------
// Reading

const getbit = (b, pos) => (b >> pos) & 1;

function decodeDx(b0, b1, b2) {
  let x = 0;
  x += getbit(b2, 2) * 81;
  x += getbit(b2, 3) * -81;
  x += getbit(b1, 2) * 27;
  x += getbit(b1, 3) * -27;
  x += getbit(b0, 2) * 9;
  x += getbit(b0, 3) * -9;
  x += getbit(b1, 0) * 3;
  x += getbit(b1, 1) * -3;
  x += getbit(b0, 0) * 1;
  x += getbit(b0, 1) * -1;
  return x;
}

function decodeDy(b0, b1, b2) {
  let y = 0;
  y += getbit(b2, 5) * 81;
  y += getbit(b2, 4) * -81;
  y += getbit(b1, 5) * 27;
  y += getbit(b1, 4) * -27;
  y += getbit(b0, 5) * 9;
  y += getbit(b0, 4) * -9;
  y += getbit(b1, 7) * 3;
  y += getbit(b1, 6) * -3;
  y += getbit(b0, 7) * 1;
  y += getbit(b0, 6) * -1;
  return -y + 0; // the file counts y upward
}

/** The header lines we use: the name (LA:) and, when the file has them, the thread colours (TC:). */
function readHeader(r) {
  const header = r.read(HEADER_SIZE);
  const info = { name: null, threads: [] };
  let start = 0;
  for (let i = 0; i < header.length; i++) {
    const c = header[i];
    if (c !== 13 && c !== 10) continue;
    const text = decodeUtf8(header.subarray(start, i));
    start = i;
    if (text === null) continue; // not text: skip the line
    const line = pyStrip(text);
    if (line.length <= 3) continue;
    const prefix = pyStrip(line.slice(0, 2));
    const value = pyStrip(line.slice(3));
    if (prefix === "LA") {
      if (value !== "") info.name = value;
    } else if (prefix === "TC") {
      const parts = value.split(",").map(pyStrip);
      const color = parseHexColor(parts[0] || "");
      if (color !== null) {
        const label = (v) => (v === undefined || v === "" || v === "None" ? null : v);
        info.threads.push({ color, description: label(parts[1]), catalog: label(parts[2]), brand: null, chart: null });
      }
    }
  }
  return info;
}

/** A DST file's bytes as a pattern { name, threads, stitches, colorsFromFile }. */
export function read(bytes, options = {}) {
  const r = new ByteReader(toBytes(bytes));
  const info = readHeader(r);
  const b = new PatternBuilder();
  for (;;) {
    const rec = r.read(3);
    if (rec.length !== 3) break;
    const dx = decodeDx(rec[0], rec[1], rec[2]);
    const dy = decodeDy(rec[0], rec[1], rec[2]);
    const b2 = rec[2];
    if ((b2 & 0b11110011) === 0b11110011) break; // END
    if ((b2 & 0b11000011) === 0b11000011) {
      b.colorChange(dx, dy);
    } else if ((b2 & 0b01000011) === 0b01000011) {
      // "sequin mode" on or off: the page has no sequins, so only the movement is kept
      if (dx !== 0 || dy !== 0) b.move(dx, dy);
    } else if ((b2 & 0b10000011) === 0b10000011) {
      b.move(dx, dy); // a jump (in sequin mode a sequin drop, which is also just a move for us)
    } else {
      b.stitch(dx, dy);
    }
  }
  b.end();
  let count = options.trimJumps === undefined ? 3 : options.trimJumps;
  if (!count) count = null;
  const distance = options.trimDistanceMm === undefined || options.trimDistanceMm === null ? null : options.trimDistanceMm * 10;
  interpolateTrims(b.stitches, count, distance, options.clipping === undefined ? true : Boolean(options.clipping));
  return finishPattern({ name: info.name, stitches: b.stitches, threads: info.threads, fileHoldsColors: info.threads.length > 0 });
}
