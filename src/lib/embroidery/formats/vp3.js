/**
 * VP3, the Pfaff / Husqvarna Viking format. A port of pyembroidery's Vp3Writer.py and Vp3Reader.py (MIT licence,
 * EmbroidePy), written to give the same bytes.
 *
 * WHAT A VP3 FILE IS
 *   A tree of blocks, each starting with a 3 byte tag and a 32 bit big endian length (so a reader can skip what it does
 *   not know): the file header, one design block, and inside it one block per COLOUR (tag 00 05 00) holding the thread
 *   (full RGB, a code, a name and a brand) and that colour's stitches (tag 00 01 00). Numbers are big endian. This
 *   format stores the thread colours exactly. Positions are in 1/1000 mm, so our 0.1 mm units are multiplied by 100.
 *
 * STITCH DATA (inside the colour block): after the bytes 0A F6 00 come the moves, relative to the colour's first position.
 *   dx dy                     two signed bytes, each within -127..127
 *   80 01 dx dy 80 02         a longer move: dx and dy as 16 bit numbers
 *   80 03                     cut the thread (a TRIM, and the END of the design)
 *   There is NO jump command: a jump is simply left out and the move shows up in the next stitch's dx, dy. A STOP is
 *   left out as well (a stop cannot be told apart from nothing in this format), so it does not survive.
 *
 * HOW THINGS ARE ENCODED (copied from pyembroidery; see transcode.js for the common rules)
 *   - LONG MOVES: more than 255 units in x or y is cut into equal steps; jumps may be up to 3200 units, and are dropped
 *     in the file anyway. A long STITCH becomes jumps and a final short stitch (all stitches with options.longStitch "sew").
 *   - COLOUR BLOCKS: the stitches between two COLOR_CHANGE records. A block's start is stored relative to the design's
 *     centre (the first block starts at 0, 0).
 *   - TEXT: the header strings are UTF-16 and the thread strings plain text, ASCII here. A thread with no name is
 *     named by its colour (#rrggbb).
 *   - THE START: the first stitch position is relative to (0, 0), the design is not re-centred. The design's centre,
 *     size and extremes are stored in 1/1000 mm.
 *
 * KNOWN INEXACTNESS (pyembroidery's, kept by default so the bytes are the same): the design's centre is stored as a whole
 *   number of units, but each colour block's start is measured from the centre WITH its fraction and then cut to whole
 *   units. When the centre is not a whole number (an odd width or height), every colour block after the first can come
 *   back up to 1 unit (0.1 mm) away from where it was written. options.vp3Exact measures from the whole-number centre
 *   instead, which makes every position exact; the bytes then differ from pyembroidery's only in those block starts.
 *
 * OPTIONS used by this format:
 *   longStitch  "jump" (the default) or "sew"
 *   maxStitchMm the longest single stitch in mm, if shorter than 25.5 (default: 25.5)
 *   vp3Exact    true to remove the 0.1 mm block offset described above (default false: the same bytes as pyembroidery)
 * Reading has no options.
 */
import { CMD } from "../pattern.js";
import {
  ByteReader,
  ByteWriter,
  PatternBuilder,
  defaultThread,
  finishPattern,
  hexColor,
  pyInt,
  signed16,
  signed32,
  stitchLimit,
  toBytes,
} from "./util.js";
import { bounds, countCommand, fixColorCount, normalizePattern } from "./transcode.js";

const MAX_JUMP = 3200;
const MAX_STITCH = 255;
const PRODUCER = "Produced by     Software Ltd";

const string8 = (w, s) => {
  w.int16be(s.length);
  w.ascii(s);
};

const string16 = (w, s) => {
  w.int16be(s.length * 2);
  w.utf16be(s);
};

/** Come back and fill in a block's length: the number of bytes written since the 4 byte length field at `offset`. */
function patchLength(w, offset) {
  const current = w.tell();
  w.seek(offset);
  w.int32be(current - offset - 4);
  w.seek(current);
}

/** The stitches cut at every COLOR_CHANGE (the change is the first record of the next block), each with its thread. */
function colorBlocks(stitches, threads) {
  const blocks = [];
  let threadIndex = 0;
  let lastPos = 0;
  for (let pos = 0; pos < stitches.length; pos++) {
    if ((stitches[pos][2] & 0xff) !== CMD.COLOR_CHANGE) continue;
    blocks.push([stitches.slice(lastPos, pos), threads[threadIndex] || defaultThread(threadIndex)]);
    threadIndex += 1;
    lastPos = pos;
  }
  blocks.push([stitches.slice(lastPos), threads[threadIndex] || defaultThread(threadIndex)]);
  return blocks;
}

function writeThread(w, thread) {
  w.bytes([0x01, 0x00]); // single colour, no transition
  w.int24be(thread.color);
  w.bytes([0x00, 0x00, 0x00, 0x05, 0x28]); // no parts, no length, rayon 40 weight
  string8(w, thread.catalog !== null ? thread.catalog : "");
  string8(w, thread.description !== null ? thread.description : hexColor(thread.color));
  string8(w, thread.brand !== null ? thread.brand : "");
}

function writeStitchesBlock(w, stitches, firstX, firstY) {
  w.bytes([0x00, 0x01, 0x00]);
  const placeholder = w.tell();
  w.int32be(0);
  w.bytes([0x0a, 0xf6, 0x00]);
  let lastX = firstX;
  let lastY = firstY;
  for (const s of stitches) {
    const flags = s[2] & 0xff;
    const alt = s[2] & 0xff00;
    if (flags === CMD.END) {
      w.bytes([0x80, 0x03]); // the machine does not trim by itself, so a cut closes the design
      break;
    } else if (flags === CMD.COLOR_CHANGE) {
      continue; // colour changes divide the design into blocks
    } else if (flags === CMD.TRIM) {
      w.bytes([0x80, 0x03]);
      continue;
    } else if (flags === CMD.STOP || flags === CMD.JUMP) {
      continue; // VP3 has neither
    }
    const dx = pyInt(s[0] - lastX);
    const dy = pyInt(s[1] - lastY);
    lastX += dx;
    lastY += dy;
    if (flags === CMD.STITCH) {
      if (dx >= -127 && dx <= 127 && dy >= -127 && dy <= 127 && alt === 0) {
        w.int8(dx);
        w.int8(dy);
      } else {
        w.bytes([0x80, 0x01]);
        w.int16be(dx);
        w.int16be(dy);
        w.bytes([0x80, 0x02]);
      }
    }
  }
  patchLength(w, placeholder);
}

function writeColorBlock(w, first, centerX, centerY, stitches, thread, exact) {
  if (exact) {
    // a reader rebuilds a block's start from the centre in the header, which is a whole number of units; measure from that
    centerX = pyInt(centerX);
    centerY = pyInt(centerY);
  }
  w.bytes([0x00, 0x05, 0x00]);
  const placeholder = w.tell();
  w.int32be(0);
  let firstX = 0;
  let firstY = 0;
  let lastX = 0;
  let lastY = 0;
  if (stitches.length > 0) {
    firstX = stitches[0][0];
    firstY = stitches[0][1];
    if (first) {
      firstX = 0;
      firstY = 0;
    }
    lastX = stitches[stitches.length - 1][0];
    lastY = stitches[stitches.length - 1][1];
  }
  w.int32be(pyInt(firstX - centerX) * 100);
  w.int32be(pyInt(-(firstY - centerY)) * 100);
  writeThread(w, thread);
  w.int32be(pyInt(lastX - firstX) * 100);
  w.int32be(pyInt(-(lastY - firstY)) * 100);
  writeStitchesBlock(w, stitches, firstX, firstY);
  w.int8(0);
  patchLength(w, placeholder);
}

function writeDesignBlock(w, e, blocks, exact) {
  w.bytes([0x00, 0x03, 0x00]);
  const placeholder = w.tell();
  w.int32be(0);
  const width = e[2] - e[0];
  const height = e[3] - e[1];
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const centerX = e[2] - halfWidth;
  const centerY = e[3] - halfHeight;
  w.int32be(pyInt(centerX) * 100); // initial x
  w.int32be(pyInt(centerY) * -100); // initial y
  w.int8(0);
  w.int8(0);
  w.int8(0);
  w.int32be(pyInt(halfWidth) * -100);
  w.int32be(pyInt(halfWidth) * 100);
  w.int32be(pyInt(halfHeight) * -100);
  w.int32be(pyInt(halfHeight) * 100);
  w.int32be(pyInt(width) * 100);
  w.int32be(pyInt(height) * 100);
  string16(w, "");
  w.bytes([0x64, 0x64]);
  w.int32be(4096);
  w.int32be(0);
  w.int32be(0);
  w.int32be(4096);
  w.ascii("xxPP");
  w.bytes([0x01, 0x00]);
  string16(w, PRODUCER);
  w.int16be(blocks.length);
  let first = true;
  for (const [stitches, thread] of blocks) {
    writeColorBlock(w, first, centerX, centerY, stitches, thread, exact);
    first = false;
  }
  patchLength(w, placeholder);
}

/** The VP3 file for a pattern, as bytes. */
export function write(pattern, options = {}) {
  const { stitches, threads } = normalizePattern(pattern, {
    maxJump: MAX_JUMP,
    maxStitch: stitchLimit(MAX_STITCH, options),
    fullJump: false,
    round: false, // this writer does not round the positions first
    longStitch: options.longStitch,
  });
  fixColorCount(stitches, threads);
  const w = new ByteWriter(0x400 + stitches.length * 3 + 512);
  w.ascii("%vsm%");
  w.int8(0);
  string16(w, PRODUCER);

  w.bytes([0x00, 0x02, 0x00]);
  const placeholder = w.tell();
  w.int32be(0); // the end of the final block
  string16(w, ""); // global notes and settings
  const blocks = colorBlocks(stitches, threads);
  const e = bounds(stitches);
  w.int32be(pyInt(e[2] * 100)); // right
  w.int32be(pyInt(e[1] * -100)); // minus top
  w.int32be(pyInt(e[0] * 100)); // left
  w.int32be(pyInt(e[3] * -100)); // minus bottom
  w.int32be(stitches.length - countCommand(stitches, CMD.END)); // the stitch count, without the END
  w.int8(0);
  w.int8(blocks.length);
  w.int8(12);
  w.int8(0);
  w.int8(1); // number of designs
  writeDesignBlock(w, e, blocks, Boolean(options.vp3Exact));
  patchLength(w, placeholder);
  return w.toBytes();
}

// ---------------------------------------------------------------------------------------------------------------
// Reading

function skipString(r) {
  const n = r.u16be();
  if (n !== null) r.seek(n, 1);
}

function readString8(r) {
  const n = r.u16be();
  return n === null ? null : r.string8(n);
}

function readThread(r) {
  const thread = { color: 0, description: null, catalog: null, brand: null, chart: null };
  const colors = r.u8() || 0;
  r.u8(); // transition
  for (let m = 0; m < colors; m++) {
    const c = r.u24be();
    if (c !== null) thread.color = c;
    r.u8(); // parts
    r.u16be(); // length
  }
  r.u8(); // thread type
  r.u8(); // weight
  const text = (v) => (v === null || v === "" ? null : v);
  thread.catalog = text(readString8(r));
  thread.description = text(readString8(r));
  thread.brand = text(readString8(r));
  // a thread with no name is written with its colour as the name; that is not a real name
  if (thread.description === hexColor(thread.color)) thread.description = null;
  return thread;
}

function readColorBlock(r, b, threads, centerX, centerY) {
  r.read(3); // 00 05 00
  const distance = r.u32be();
  if (distance === null) return false;
  const blockEnd = distance + r.tell();
  const startX = signed32(r.u32be()) / 100;
  const startY = -(signed32(r.u32be()) / 100);
  const absX = startX + centerX;
  const absY = startY + centerY;
  if (absX !== 0 && absY !== 0) b.moveAbs(absX, absY);
  threads.push(readThread(r));
  r.seek(15, 1);
  r.read(3); // 0A F6 00
  const length = blockEnd - r.tell();
  const data = length > 0 ? r.read(length) : new Uint8Array(0);
  const s8 = (v) => (v > 127 ? v - 256 : v);
  let i = 0;
  while (i < data.length - 1) {
    const x = s8(data[i]);
    const y = s8(data[i + 1]);
    i += 2;
    if ((x & 0xff) !== 0x80) {
      b.stitch(x, y);
      continue;
    }
    if (y === 0x01) {
      if (i + 4 > data.length) break;
      const dx = signed16((data[i] << 8) | data[i + 1]);
      const dy = signed16((data[i + 2] << 8) | data[i + 3]);
      i += 4;
      b.stitch(dx, dy);
      i += 2; // the closing 80 02 is skipped, whatever it holds
    } else if (y === 0x03) {
      b.trim();
    }
    // 80 02 on its own has no known effect
  }
  return true;
}

/** A VP3 file's bytes as a pattern { name, threads, stitches, colorsFromFile }. */
export function read(bytes) {
  const r = new ByteReader(toBytes(bytes));
  r.read(6); // %vsm%\0
  skipString(r); // the producer text
  r.seek(7, 1);
  skipString(r); // notes
  r.seek(32, 1);
  const cx = r.u32be();
  const cy = r.u32be();
  const centerX = cx === null ? 0 : signed32(cx) / 100;
  const centerY = cy === null ? 0 : -(signed32(cy) / 100);
  r.seek(27, 1);
  skipString(r);
  r.seek(24, 1);
  skipString(r);
  const count = r.u16be() || 0;
  const b = new PatternBuilder();
  const threads = [];
  for (let i = 0; i < count; i++) {
    if (!readColorBlock(r, b, threads, centerX, centerY)) break;
    if (i + 1 < count) b.colorChange(); // no colour change after the last block
  }
  b.end();
  return finishPattern({ name: null, stitches: b.stitches, threads, fileHoldsColors: true });
}
