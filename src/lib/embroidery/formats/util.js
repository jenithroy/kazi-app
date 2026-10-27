/**
 * Small shared helpers for the embroidery file writers and readers (dst, exp, pes/pec, jef, vp3, xxx, u01):
 * byte buffers, Python-style rounding, thread colour matching, and the pieces every reader needs to build a pattern.
 *
 * Pure JavaScript. No Buffer, no fs, no DOM. Bytes are Uint8Array. Text in the files is plain ASCII, done by hand.
 *
 * Much of this is a port of pyembroidery (MIT licence, EmbroidePy: WriteHelper.py, ReadHelper.py, EmbThread.py,
 * EmbPattern.py). It copies the behaviour, including the quirks, because the files must come out the same as the ones
 * pyembroidery writes (machines and other software are known to read those):
 *   - Python 3 rounds halves to the EVEN neighbour (round(2.5) is 2). Math.round does not. See pyRound.
 *   - Thread colour matching is the "red mean" distance and a tie goes to the LATER chart entry.
 *   - Which thread claims a Brother colour first follows the order Python lists a set(), reproduced in pySetOrder.
 */
import { CMD } from "../pattern.js";
import { PEC_THREADS, JEF_THREADS } from "./tables.js";

// ---------------------------------------------------------------------------------------------------------------
// Numbers

/**
 * Python 3's round(): a half goes to the even neighbour (2.5 gives 2, 3.5 gives 4, -2.5 gives -2). The file writers
 * round every move this way, so we must too or a stitch lands one unit away from where pyembroidery puts it.
 */
export function pyRound(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f + 0;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f + 0 : f + 1;
}

/** Python's int() on a number: drop the fraction, towards zero (-2.7 gives -2). Never returns -0. */
export function pyInt(x) {
  return Math.trunc(x) + 0;
}

/** A colour channel as a whole number 0 to 255 (anything odd becomes 0). */
export function clampByte(v) {
  const n = Math.round(Number(v));
  return n >= 255 ? 255 : n > 0 ? n : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Text

/** Text for a file field: printable ASCII only, anything else (accents, control characters, line breaks) becomes "?". */
export function asciiOnly(s) {
  return String(s == null ? "" : s).replace(/[^\x20-\x7e]/gu, "?");
}

/** Pad on the right with spaces up to `n` characters (never cuts), like Python's "%-16s". */
export function padRight(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

/** Pad on the left with spaces up to `n` characters (never cuts), like Python's "%7d". */
export function padLeft(s, n) {
  s = String(s);
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

/** Python's str.strip(): white space off both ends (this also takes the odd control characters 0x1C to 0x1F). */
export function pyStrip(s) {
  return s.replace(/^[\s\x1c-\x1f]+|[\s\x1c-\x1f]+$/g, "");
}

/** Strict UTF-8 to string. Returns null when the bytes are not valid UTF-8 (the way Python's decode would fail). */
export function decodeUtf8(bytes) {
  let out = "";
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const b = bytes[i++];
    if (b < 0x80) {
      out += String.fromCharCode(b);
      continue;
    }
    let need;
    let cp;
    let min;
    if (b >= 0xc2 && b <= 0xdf) { need = 1; cp = b & 0x1f; min = 0x80; }
    else if (b >= 0xe0 && b <= 0xef) { need = 2; cp = b & 0x0f; min = 0x800; }
    else if (b >= 0xf0 && b <= 0xf4) { need = 3; cp = b & 0x07; min = 0x10000; }
    else return null;
    if (i + need > n) return null;
    for (let k = 0; k < need; k++) {
      const c = bytes[i++];
      if ((c & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (c & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    out += String.fromCodePoint(cp);
  }
  return out;
}

/**
 * The design's name for a file: `options.title`, else the pattern's own name, else "Untitled" (pyembroidery's default),
 * as plain ASCII.
 */
export function designTitle(pattern, options) {
  const wanted = options && options.title != null && options.title !== "" ? options.title : pattern && pattern.name;
  return asciiOnly(wanted == null || wanted === "" ? "Untitled" : wanted);
}

/**
 * How many jump records spell one TRIM in a format that has no trim command (DST, JEF): `options.trimJumps`, a whole
 * number from 2 to 8, default 3 (pyembroidery's trim_at). A DST trim is a small wiggle of that many jumps that ends
 * where it began; the machine reads it as "cut the thread here".
 */
export function trimJumpCount(options) {
  const v = options ? options.trimJumps : undefined;
  const n = Math.floor(Number(v));
  if (v === undefined || v === null || !Number.isFinite(n)) return 3;
  return n < 2 ? 2 : n > 8 ? 8 : n;
}

/**
 * The longest single stitch to write, in units: the format's own limit, or less when `options.maxStitchMm` asks for a
 * shorter one (never below 1 unit, 0.1 mm). A longer stitch is then cut up the way options.longStitch says. Jumps keep the
 * format's limit.
 */
export function stitchLimit(formatMax, options) {
  const mm = options ? Number(options.maxStitchMm) : NaN;
  if (!(mm > 0)) return formatMax;
  return Math.max(1, Math.min(formatMax, Math.floor(mm * 10 + 1e-6)));
}

/** "#rrggbb" for a colour number, lower case (what the DST extended header and pyembroidery print). */
export function hexColor(color) {
  const h = (n) => (n & 255).toString(16).padStart(2, "0");
  return "#" + h(color >> 16) + h(color >> 8) + h(color);
}

/** "#rrggbb", "rrggbb", "#rgb" or an 8 digit form to a colour number, or null when it is not a colour. */
export function parseHexColor(text) {
  const h = String(text).replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(h) || /^[0-9a-fA-F]{8}$/.test(h)) return parseInt(h.slice(0, 6), 16);
  if (/^[0-9a-fA-F]{3,4}$/.test(h)) return parseInt(h[0] + h[0] + h[1] + h[1] + h[2] + h[2], 16);
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Bytes

/** The file's bytes as a Uint8Array, from a Uint8Array, an ArrayBuffer, any typed array, or a plain array of numbers. */
export function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (Array.isArray(input)) return Uint8Array.from(input);
  throw new Error("Expected the file's bytes (a Uint8Array or an ArrayBuffer).");
}

/**
 * A growing byte buffer with a cursor, like a Python BytesIO: you can seek back, write over earlier bytes (the writers
 * do that to fill in sizes and offsets), and seek to the end again. All integer writers keep the low bits only.
 */
export class ByteWriter {
  constructor(capacity = 4096) {
    this.data = new Uint8Array(capacity);
    this.pos = 0;
    this.size = 0;
    this.scratch = new DataView(new ArrayBuffer(4));
  }

  grow(extra) {
    const end = this.pos + extra;
    if (end <= this.data.length) return;
    let cap = this.data.length * 2;
    while (cap < end) cap *= 2;
    const bigger = new Uint8Array(cap);
    bigger.set(this.data);
    this.data = bigger;
  }

  /** Where the cursor is. */
  tell() {
    return this.pos;
  }

  /** Move the cursor to an absolute position. */
  seek(position) {
    this.pos = position;
  }

  /** One byte (only the low 8 bits of the number are kept). */
  byte(v) {
    this.grow(1);
    this.data[this.pos++] = v & 0xff;
    if (this.pos > this.size) this.size = this.pos;
  }

  int8(v) { this.byte(v); }
  int16le(v) { this.byte(v); this.byte(v >> 8); }
  int16be(v) { this.byte(v >> 8); this.byte(v); }
  int24le(v) { this.byte(v); this.byte(v >> 8); this.byte(v >> 16); }
  int24be(v) { this.byte(v >> 16); this.byte(v >> 8); this.byte(v); }
  int32le(v) { this.byte(v); this.byte(v >> 8); this.byte(v >> 16); this.byte(v >> 24); }
  int32be(v) { this.byte(v >> 24); this.byte(v >> 16); this.byte(v >> 8); this.byte(v); }

  /** A 32 bit float, little endian (what Python's struct.pack("<f") writes). */
  float32le(v) {
    this.scratch.setFloat32(0, v, true);
    for (let i = 0; i < 4; i++) this.byte(this.scratch.getUint8(i));
  }

  /** Several bytes from an array (or typed array). */
  bytes(list) {
    for (let i = 0; i < list.length; i++) this.byte(list[i]);
  }

  /** ASCII text (callers pass text that went through asciiOnly). */
  ascii(text) {
    for (let i = 0; i < text.length; i++) this.byte(text.charCodeAt(i));
  }

  /** The same byte `count` times. */
  fill(value, count) {
    for (let i = 0; i < count; i++) this.byte(value);
  }

  /** Text as UTF-16, big endian, no byte order mark (VP3 header strings). */
  utf16be(text) {
    for (let i = 0; i < text.length; i++) this.int16be(text.charCodeAt(i));
  }

  /** The finished file (a copy). */
  toBytes() {
    return this.data.slice(0, this.size);
  }
}

/**
 * A reader over a Uint8Array with a cursor, like a Python file opened "rb". Reading past the end gives fewer bytes
 * (or null for the integer readers), never an error, so a damaged file ends the loops instead of crashing them.
 */
export class ByteReader {
  constructor(bytes) {
    this.b = bytes;
    this.pos = 0;
  }

  get length() {
    return this.b.length;
  }

  tell() {
    return this.pos;
  }

  /** `whence` 0: to an absolute position; 1: forward by `offset` from where the cursor is. */
  seek(offset, whence = 0) {
    this.pos = whence === 1 ? this.pos + offset : offset;
    if (this.pos < 0) this.pos = 0;
  }

  /** Up to `n` bytes (fewer at the end of the file). */
  read(n) {
    if (n <= 0 || this.pos >= this.b.length) return this.b.subarray(0, 0);
    const out = this.b.subarray(this.pos, Math.min(this.pos + n, this.b.length));
    this.pos += out.length;
    return out;
  }

  /** One byte 0 to 255, or null at the end of the file. */
  u8() {
    if (this.pos >= this.b.length) return null;
    return this.b[this.pos++];
  }

  u16le() {
    const c = this.read(2);
    return c.length === 2 ? c[0] | (c[1] << 8) : null;
  }

  u16be() {
    const c = this.read(2);
    return c.length === 2 ? (c[0] << 8) | c[1] : null;
  }

  u24le() {
    const c = this.read(3);
    return c.length === 3 ? c[0] | (c[1] << 8) | (c[2] << 16) : null;
  }

  u24be() {
    const c = this.read(3);
    return c.length === 3 ? (c[0] << 16) | (c[1] << 8) | c[2] : null;
  }

  u32le() {
    const c = this.read(4);
    return c.length === 4 ? (c[0] | (c[1] << 8) | (c[2] << 16) | (c[3] << 24)) >>> 0 : null;
  }

  u32be() {
    const c = this.read(4);
    return c.length === 4 ? ((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | c[3]) >>> 0 : null;
  }

  /** `n` bytes as UTF-8 text, or null when they are not valid UTF-8. */
  string8(n) {
    return decodeUtf8(this.read(n));
  }
}

/** A byte 0..255 as a signed number -128..127. */
export function signed8(b) {
  return b > 127 ? b - 256 : b;
}

/** Any number's low 16 bits as a signed number. */
export function signed16(v) {
  v &= 0xffff;
  return v > 0x7fff ? v - 0x10000 : v;
}

/** Any number's low 32 bits as a signed number. */
export function signed32(v) {
  return v | 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Threads
//
// Inside this folder a thread is { color (0xRRGGBB), description, catalog, brand, chart }, with null for "not given".
// The page's threads are { r, g, b, name?, code?, brand? }; threadFromApp / threadToApp convert.

/** The page's thread { r, g, b, name?, code?, brand? } as the inside form. */
export function threadFromApp(t) {
  const o = t || {};
  const text = (v) => (v == null || v === "" ? null : asciiOnly(v));
  return {
    color: (clampByte(o.r) << 16) | (clampByte(o.g) << 8) | clampByte(o.b),
    description: text(o.name),
    catalog: text(o.code),
    brand: text(o.brand),
    chart: null,
  };
}

/** The inside form as the page's thread: { r, g, b } plus name, code, brand when the file gave them. */
export function threadToApp(t) {
  const o = { r: (t.color >> 16) & 255, g: (t.color >> 8) & 255, b: t.color & 255 };
  if (t.description) o.name = t.description;
  if (t.catalog) o.code = t.catalog;
  if (t.brand) o.brand = t.brand;
  return o;
}

/** Same thread? Colour and every label must match (this is pyembroidery's EmbThread equality). */
export function threadsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    (a.color & 0xffffff) === (b.color & 0xffffff) &&
    a.description === b.description &&
    a.catalog === b.catalog &&
    a.brand === b.brand &&
    a.chart === b.chart
  );
}

/**
 * Twelve clearly different colours, used for threads a file cannot name (DST, EXP, U01 hold no colours, and pyembroidery
 * makes up random ones; we use the same twelve every time so the same file always previews the same way).
 */
export const DEFAULT_COLORS = [
  0xd7263d, 0x1b6ca8, 0x2e933c, 0xf4b400, 0x7b2cbf, 0xff7a00, 0x00a6a6, 0xe5509c, 0x6b4226, 0x6c757d, 0x111111, 0xf2f2f2,
];

/** The stand-in thread for colour block number `index` (0 is the first block). */
export function defaultThread(index) {
  return { color: DEFAULT_COLORS[index % DEFAULT_COLORS.length], description: null, catalog: null, brand: null, chart: null };
}

/** The 64 Brother colours as threads. Index 0 is null (unknown). A fresh list each time, because matching uses entries up. */
export function pecThreadSet() {
  return PEC_THREADS.map((e) =>
    e === null ? null : { color: (e[0] << 16) | (e[1] << 8) | e[2], description: e[3], catalog: e[4], brand: "Brother", chart: "Brother" }
  );
}

/** The Janome colours as threads. Index 0 is null (placeholder). A fresh list each time. */
export function jefThreadSet() {
  return JEF_THREADS.map((e) => (e === null ? null : { color: e[0], description: e[1], catalog: e[2], brand: "Jef", chart: "Jef" }));
}

/**
 * How far apart two colours look, the "red mean" distance (compuphase.com/cmetric.htm). Whole numbers, so matching the
 * same colour twice always gives the same answer. This is pyembroidery's color_distance_red_mean.
 */
export function colorDistanceRedMean(r1, g1, b1, r2, g2, b2) {
  const redMean = pyRound((r1 + r2) / 2);
  const r = r1 - r2;
  const g = g1 - g2;
  const b = b1 - b2;
  return (((512 + redMean) * r * r) >> 8) + 4 * g * g + (((767 - redMean) * b * b) >> 8);
}

/**
 * The index of the chart entry that looks closest to `color` (a 0xRRGGBB number), skipping null entries. When two are
 * equally close the LATER one wins (pyembroidery does the same). Returns null when every entry is null.
 */
export function findNearestColorIndex(color, values) {
  const red = (color >> 16) & 255;
  const green = (color >> 8) & 255;
  const blue = color & 255;
  let closest = null;
  let best = Infinity;
  for (let i = 0; i < values.length; i++) {
    const t = values[i];
    if (t === null || t === undefined) continue;
    const dist = colorDistanceRedMean(red, green, blue, (t.color >> 16) & 255, (t.color >> 8) & 255, t.color & 255);
    if (dist <= best) {
      best = dist;
      closest = i;
    }
  }
  return closest;
}

/**
 * The order Python 3 lists the members of set(items) in, for items hashed by `hashOf` (a whole number 0 or more) and
 * compared by `equal`. Python's set is a small hash table: the position comes from the hash, and a clash is settled by
 * probing the next slots, so the order is fixed and can be reproduced (CPython's Objects/setobject.c, the same since
 * 3.7). pyembroidery hands out Brother colours in this order, so to pick the same colours we need it too.
 */
export function pySetOrder(items, hashOf, equal) {
  const LINEAR_PROBES = 9;
  const PERTURB_SHIFT = 5;
  let mask = 7;
  let table = new Array(mask + 1).fill(null);
  let fill = 0;

  const insertClean = (tbl, msk, entry) => {
    let perturb = entry.hash;
    let i = entry.hash & msk;
    for (;;) {
      if (tbl[i] === null) { tbl[i] = entry; return; }
      if (i + LINEAR_PROBES <= msk) {
        for (let j = 1; j <= LINEAR_PROBES; j++) {
          if (tbl[i + j] === null) { tbl[i + j] = entry; return; }
        }
      }
      perturb >>>= PERTURB_SHIFT;
      i = (i * 5 + 1 + perturb) & msk;
    }
  };

  const resize = (minused) => {
    let newsize = 8;
    while (newsize <= minused) newsize <<= 1;
    const old = table;
    mask = newsize - 1;
    table = new Array(newsize).fill(null);
    for (const entry of old) if (entry !== null) insertClean(table, mask, entry);
  };

  for (const item of items) {
    const hash = hashOf(item);
    let i = hash & mask;
    let perturb = hash;
    let placed = false;
    while (!placed) {
      const probes = i + LINEAR_PROBES <= mask ? LINEAR_PROBES : 0;
      for (let j = 0; j <= probes; j++) {
        const slot = table[i + j];
        if (slot === null) {
          table[i + j] = { item, hash };
          fill++;
          placed = true;
          if (fill * 5 >= mask * 3) resize(fill > 50000 ? fill * 2 : fill * 4);
          break;
        }
        if (slot.hash === hash && (slot.item === item || equal(slot.item, item))) {
          placed = true; // already in the set
          break;
        }
      }
      if (!placed) {
        perturb >>>= PERTURB_SHIFT;
        i = (i * 5 + 1 + perturb) & mask;
      }
    }
  }
  const out = [];
  for (const entry of table) if (entry !== null) out.push(entry.item);
  return out;
}

/**
 * Brother and Janome style colour assignment (pyembroidery's build_unique_palette): every DIFFERENT thread in the list
 * claims the closest chart colour not yet taken (they claim in Python's set order), then each thread in the list gets
 * the chart index its colour claimed. Two threads that would like the same Brother colour therefore get two different
 * ones. `palette` is changed (claimed entries become null), so pass a fresh set. Returns one palette index per thread.
 */
export function buildUniquePalette(palette, threads) {
  const claimed = new Array(palette.length).fill(null);
  const unique = pySetOrder(threads, (t) => t.color & 0xffffff, threadsEqual);
  for (const thread of unique) {
    const index = findNearestColorIndex(thread.color, palette);
    if (index === null) break; // the palette has run out
    palette[index] = null;
    claimed[index] = thread;
  }
  return threads.map((t) => findNearestColorIndex(t.color, claimed));
}

// ---------------------------------------------------------------------------------------------------------------
// Building a pattern while reading (the reader side of pyembroidery's EmbPattern)

/**
 * Collects the stitches of a file being read. A file stores moves RELATIVE to the previous position; this keeps the
 * running position and records ABSOLUTE ones, exactly like pyembroidery's add_stitch_relative. Commands are the
 * page's (CMD in ../pattern.js).
 */
export class PatternBuilder {
  constructor() {
    this.stitches = [];
    this.x = 0;
    this.y = 0;
  }

  add(cmd, x, y) {
    this.stitches.push([x, y, cmd]);
    this.x = x;
    this.y = y;
  }

  rel(cmd, dx = 0, dy = 0) {
    this.add(cmd, this.x + dx, this.y + dy);
  }

  stitch(dx, dy) { this.rel(CMD.STITCH, dx, dy); }
  move(dx, dy) { this.rel(CMD.JUMP, dx, dy); }
  moveAbs(x, y) { this.add(CMD.JUMP, x, y); }
  trim() { this.rel(CMD.TRIM, 0, 0); }
  colorChange(dx = 0, dy = 0) { this.rel(CMD.COLOR_CHANGE, dx, dy); }
  stop(dx = 0, dy = 0) { this.rel(CMD.STOP, dx, dy); }
  end(dx = 0, dy = 0) { this.rel(CMD.END, dx, dy); }
}

/** A cut mark put in before position `position`, sitting where the stitch before it ended (pyembroidery's insert). */
function insertTrim(stitches, position) {
  if (position === 0) {
    stitches.splice(0, 0, [0, 0, CMD.TRIM]);
  } else if (position > 0 && position < stitches.length) {
    const p = stitches[position - 1];
    stitches.splice(position, 0, [p[0], p[1], CMD.TRIM]);
  }
}

/**
 * Files without a trim command (DST, JEF) say "cut the thread" with several jumps in a row. This puts the TRIM
 * commands back (pyembroidery's interpolate_trims): a run of jumps after sewing gets a TRIM in front when it has
 * `jumpsToRequireTrim` jumps (null to ignore the count) or travels further than `distanceToRequireTrim` units in x or
 * y (null to ignore the distance). With `clipping`, a run of jumps that ends where it started is dropped (that is how
 * a DST writer spells a trim, a little wiggle that returns home). Changes `stitches` in place.
 */
export function interpolateTrims(stitches, jumpsToRequireTrim, distanceToRequireTrim, clipping = true) {
  let i = -1;
  let ie = stitches.length - 1;
  let x = 0;
  let y = 0;
  let jumpCount = 0;
  let jumpStart = 0;
  let jumpDx = 0;
  let jumpDy = 0;
  let jumping = false;
  let trimmed = true;
  while (i < ie) {
    i += 1;
    const stitch = stitches[i];
    const dx = stitch[0] - x;
    const dy = stitch[1] - y;
    x = stitch[0];
    y = stitch[1];
    const command = stitch[2];
    if (command === CMD.STITCH) {
      trimmed = false;
      jumping = false;
    } else if (command === CMD.COLOR_CHANGE || command === CMD.TRIM) {
      trimmed = true;
      jumping = false;
    }
    if (command === CMD.JUMP) {
      if (!jumping) {
        jumpDx = 0;
        jumpDy = 0;
        jumpCount = 0;
        jumpStart = i;
        jumping = true;
      }
      jumpCount += 1;
      jumpDx += dx;
      jumpDy += dy;
      if (!trimmed) {
        if (
          jumpCount === jumpsToRequireTrim ||
          (distanceToRequireTrim !== null &&
            distanceToRequireTrim !== undefined &&
            (Math.abs(jumpDy) > distanceToRequireTrim || Math.abs(jumpDx) > distanceToRequireTrim))
        ) {
          insertTrim(stitches, jumpStart);
          jumpStart += 1; // we put one in front, so the jump run has moved down by one
          i += 1;
          ie += 1;
          trimmed = true;
        }
      }
      if (clipping && jumpDx === 0 && jumpDy === 0) {
        stitches.splice(jumpStart, i + 1 - jumpStart);
        i = jumpStart - 1;
        ie = stitches.length - 1;
      }
    }
  }
}

/**
 * Brother files spell "stop here" as a colour change to the same colour. This turns such a colour change (two threads in
 * a row that are the same) back into a STOP and drops the repeated thread (pyembroidery's
 * interpolate_duplicate_color_as_stop). Changes `stitches` and `threads` in place.
 */
export function interpolateDuplicateColorAsStop(stitches, threads) {
  let threadIndex = 0;
  let initColor = true;
  let lastChange = null;
  for (let position = 0; position < stitches.length; position++) {
    const data = stitches[position][2];
    if (data === CMD.STITCH) {
      if (initColor) {
        if (lastChange !== null && threadIndex !== 0) {
          if (threadIndex >= threads.length) return; // a thread that does not exist cannot repeat
          if (threadsEqual(threads[threadIndex - 1], threads[threadIndex])) {
            threads.splice(threadIndex, 1); // the repeat is dropped, the colour change becomes a stop
            stitches[lastChange][2] = CMD.STOP;
          } else {
            threadIndex += 1;
          }
        } else {
          threadIndex += 1;
        }
        initColor = false;
      }
    } else if (data === CMD.COLOR_CHANGE) {
      initColor = true;
      lastChange = position;
    }
  }
}

/**
 * What every reader returns: the page's pattern { name, threads, stitches } plus `colorsFromFile`.
 *   - positions are rounded to whole 0.1 mm units (a few files store finer);
 *   - there is exactly one thread per colour block (colour changes plus one, 0 when nothing is sewn): a file that names
 *     fewer gets stand-in colours (defaultThread), one that names more is cut short;
 *   - `colorsFromFile` is true only when the file itself named every colour. False means the colours are stand-ins,
 *     so the page can say "this file has no thread colours".
 * `threads` are the inside form (see threadFromApp); `fileHoldsColors` says the format can name colours at all.
 */
export function finishPattern({ name, stitches, threads, fileHoldsColors }) {
  const out = stitches.map((s) => [Math.round(s[0]) + 0, Math.round(s[1]) + 0, s[2]]);
  let sewn = false;
  let changes = 0;
  for (const s of out) {
    if (s[2] === CMD.STITCH) sewn = true;
    else if (s[2] === CMD.COLOR_CHANGE) changes += 1;
  }
  const blocks = sewn ? changes + 1 : 0;
  const given = threads || [];
  const list = [];
  for (let i = 0; i < blocks; i++) list.push(i < given.length ? given[i] : defaultThread(i));
  return {
    name: name || "design",
    threads: list.map(threadToApp),
    stitches: out,
    colorsFromFile: Boolean(fileHoldsColors) && blocks > 0 && given.length >= blocks,
  };
}
