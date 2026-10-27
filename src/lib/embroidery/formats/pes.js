/**
 * PES and PEC, the Brother formats (Brother and Baby Lock home machines; PES is what their software and USB stick use,
 * PEC is the part of it that holds the stitches). A port of pyembroidery's PesWriter.py, PecWriter.py, PecGraphics.py,
 * PesReader.py, PecReader.py and EmbThreadPec.py (MIT licence, EmbroidePy), written to give the same bytes.
 *
 * WHAT THE FILES ARE
 *   PEC: a 512 byte header (the name, how many colours, and one colour NUMBER per colour block), the stitch block, and
 *   a set of little black and white pictures (48 by 38 dots): one of the whole design, then one per colour. The
 *   machine shows these pictures, so they are made here (thumbnails).
 *   PES: "#PES0001" (or "#PES0060"), then where the PEC part starts, then a PES part describing the design again for
 *   Brother's software, then the PEC part. Version 1 (the default) is the simplest and is read by every Brother and
 *   Baby Lock machine. Version 6 also stores the full RGB colour of every thread, with its name, code and brand, which is
 *   what Brother's software shows. The "truncated" forms leave the PES describing part out and keep only the PEC part
 *   (what a machine really needs).
 *
 * COLOURS
 *   A Brother machine knows 64 colours (tables.js: PEC_THREADS), and the PEC header lists a NUMBER 1..64 per colour
 *   block, not an RGB. Every different thread claims the closest Brother colour that is still free (they claim in the
 *   order Python lists a set, which is what pyembroidery does), so two similar blues become two different Brother
 *   colours. Matching uses the "red mean" colour distance. Version 6 also writes the true RGB, after the stitch data.
 *
 * STITCH DATA (PEC): each move is a pair of numbers, one byte each when it fits in -63..62, else two bytes
 *   (high bit set, 12 bit value, bit 0x20 says "trim", bit 0x10 says "jump"). One record moves at most 2047 units.
 *   0xFE 0xB0 then 1 or 2 (alternating) is a colour change, 0xFF ends the stitches.
 *
 * HOW THINGS ARE ENCODED (copied from pyembroidery; see transcode.js for the common rules)
 *   - TRIM: PEC has no trim command. Every JUMP after the first record is written with the "trim" flag, so the machine
 *     cuts the thread at each jump; the TRIM records themselves write nothing. (A TRIM with no move after it is lost.)
 *   - STOP: no stop command either; a STOP becomes a colour change to the same colour (the thread is listed twice).
 *   - LONG MOVES: more than 2047 units in x or y is cut into equal steps; a long STITCH becomes jumps and a final stitch.
 *     The first stitch of a block is preceded by a jump that lands exactly on it.
 *   - THE START: the first record is relative to (0, 0), the design is not re-centred. (The PES part, which only draws
 *     the picture in Brother's software, is written centred on the design as pyembroidery does.)
 *
 * OPTIONS used by these formats:
 *   title        the design name. PEC keeps the first 8 characters, PES version 6 all of them (up to 255)
 *   pesVersion   1 (default) or 6; also accepted: "1", "6", "1t", "6t" (the t means truncated)
 *   pesTruncated true for the PEC-only form (default false)
 *   author, category, keywords, comments   text for the PES version 6 header (default none)
 *   longStitch   "jump" (default) or "sew"
 *   maxStitchMm  the longest single stitch in mm, if shorter than 204.7 (default: 204.7). Machines sew about 12 mm at most,
 *                so give 12 when the design may hold longer stitches, and longStitch "sew" to cut them into short stitches
 * Reading has no options.
 */
import { CMD } from "../pattern.js";
import { PEC_BLANK_ROWS } from "./tables.js";
import {
  ByteReader,
  ByteWriter,
  PatternBuilder,
  asciiOnly,
  buildUniquePalette,
  defaultThread,
  designTitle,
  finishPattern,
  findNearestColorIndex,
  interpolateDuplicateColorAsStop,
  padRight,
  pecThreadSet,
  pyInt,
  pyRound,
  pyStrip,
  stitchLimit,
  toBytes,
} from "./util.js";
import { bounds, fixColorCount, interpolateStopAsDuplicateColor, normalizePattern } from "./transcode.js";

const MAX_MOVE = 2047;

const JUMP_CODE = 0b00010000;
const TRIM_CODE = 0b00100000;
const FLAG_LONG = 0b10000000;
const PEC_ICON_WIDTH = 48;
const PEC_ICON_HEIGHT = 38;
const PEC_STRIDE = 6; // bytes per picture row (48 dots)

// ---------------------------------------------------------------------------------------------------------------
// Thumbnails

const BLANK = (() => {
  const g = new Uint8Array(PEC_STRIDE * PEC_ICON_HEIGHT);
  for (let row = 0; row < PEC_ICON_HEIGHT; row++) {
    for (let c = 0; c < PEC_STRIDE; c++) g[row * PEC_STRIDE + c] = parseInt(PEC_BLANK_ROWS[row].slice(c * 2, c * 2 + 2), 16);
  }
  return g;
})();

/** Switch one dot on. Out of range dots are ignored (and a negative place counts from the end, as in Python). */
function markBit(graphic, x, y, stride) {
  let index = y * stride + Math.trunc(x / 8);
  if (index < 0) index += graphic.length;
  if (index < 0 || index >= graphic.length) return;
  graphic[index] |= 1 << (((x % 8) + 8) % 8);
}

/** Draw the stitch points scaled to fit the picture (`ext` is the design's box), `buffer` dots from the edge. */
function drawScaled(ext, points, graphic, stride, buffer = 5) {
  const [left, top, right, bottom] = ext;
  let diagramWidth = right - left;
  let diagramHeight = bottom - top;
  const graphicWidth = stride * 8;
  const graphicHeight = graphic.length / stride;
  if (diagramWidth === 0) diagramWidth = 1;
  if (diagramHeight === 0) diagramHeight = 1;
  const scale = Math.min((graphicWidth - buffer) / diagramWidth, (graphicHeight - buffer) / diagramHeight);
  const cx = (right + left) / 2;
  const cy = (bottom + top) / 2;
  let translateX = -cx;
  let translateY = -cy;
  translateX *= scale;
  translateY *= scale;
  translateX += graphicWidth / 2;
  translateY += graphicHeight / 2;
  for (const p of points) {
    markBit(graphic, Math.floor(p[0] * scale + translateX), Math.floor(p[1] * scale + translateY), stride);
  }
}

/** The pictures: the whole design, then one for each colour block (records up to and including each colour change). */
function writePecGraphics(w, stitches, ext) {
  const whole = BLANK.slice();
  drawScaled(ext, stitches.filter((s) => (s[2] & 0xff) === CMD.STITCH), whole, PEC_STRIDE, 4);
  w.bytes(whole);
  const block = (start, end) => {
    const g = BLANK.slice();
    drawScaled(ext, stitches.slice(start, end).filter((s) => s[2] === CMD.STITCH), g, PEC_STRIDE);
    w.bytes(g);
  };
  let start = 0;
  for (let pos = 0; pos < stitches.length; pos++) {
    if ((stitches[pos][2] & 0xff) === CMD.COLOR_CHANGE) {
      block(start, pos + 1);
      start = pos + 1;
    }
  }
  if (start !== stitches.length) block(start, stitches.length);
}

// ---------------------------------------------------------------------------------------------------------------
// The PEC part

function writeValue(w, value, long = false, flag = 0) {
  if (!long && value > -64 && value < 63) {
    w.byte(value & 0x7f);
  } else {
    let v = value & 0x0fff;
    v |= 0x8000;
    v |= flag << 8;
    w.byte((v >> 8) & 0xff);
    w.byte(v & 0xff);
  }
}

const writeTrimJump = (w, dx, dy) => {
  writeValue(w, dx, true, TRIM_CODE);
  writeValue(w, dy, true, TRIM_CODE);
};
const writeJump = (w, dx, dy) => {
  writeValue(w, dx, true, JUMP_CODE);
  writeValue(w, dy, true, JUMP_CODE);
};
const writeStitch = (w, dx, dy) => {
  writeValue(w, dx, false);
  writeValue(w, dy, false);
};

function pecEncode(w, stitches) {
  let colorTwo = true;
  let jumping = true;
  let init = true;
  let xx = 0;
  let yy = 0;
  for (const s of stitches) {
    const data = s[2] & 0xff;
    const dx = pyInt(pyRound(s[0] - xx));
    const dy = pyInt(pyRound(s[1] - yy));
    xx += dx;
    yy += dy;
    if (data === CMD.STITCH) {
      if (jumping) {
        if (dx !== 0 && dy !== 0) writeStitch(w, 0, 0);
        jumping = false;
      }
      writeStitch(w, dx, dy);
    } else if (data === CMD.JUMP) {
      jumping = true;
      if (init) writeJump(w, dx, dy);
      else writeTrimJump(w, dx, dy);
    } else if (data === CMD.COLOR_CHANGE) {
      if (jumping) {
        writeStitch(w, 0, 0);
        jumping = false;
      }
      w.bytes([0xfe, 0xb0]);
      w.byte(colorTwo ? 0x02 : 0x01);
      colorTwo = !colorTwo;
    } else if (data === CMD.END) {
      w.byte(0xff);
      break;
    }
    // STOP and TRIM write nothing: stops became colour changes, and a jump carries the trim
    init = false;
  }
}

/** The 512 byte PEC header. Returns the colour numbers (with the count first) and the RGB list, which PES 6 needs. */
function writePecHeader(w, threads, title) {
  w.ascii("LA:" + padRight(title.slice(0, 8), 16) + "\r");
  w.fill(0x20, 12);
  w.bytes([0xff, 0x00]);
  w.int8(PEC_ICON_WIDTH / 8); // bytes per picture row
  w.int8(PEC_ICON_HEIGHT);
  const colorIndexList = buildUniquePalette(pecThreadSet(), threads);
  const rgbList = threads.map((t) => t.color);
  const count = colorIndexList.length;
  if (count !== 0) {
    w.fill(0x20, 12);
    colorIndexList.unshift(count - 1);
    if (colorIndexList[0] >= 255) throw new Error(`Too many colour changes (${count}) for a PEC file; the most is 255.`);
    w.bytes(colorIndexList);
  } else {
    w.bytes([0x20, 0x20, 0x20, 0x20, 0x64, 0x20, 0x00, 0x20, 0x00, 0x20, 0x20, 0x20, 0xff]);
  }
  for (let i = count; i < 463; i++) w.byte(0x20);
  return { colorIndexList, rgbList };
}

function writePecBlock(w, stitches, ext) {
  const width = ext[2] - ext[0];
  const height = ext[3] - ext[1];
  const start = w.tell();
  w.bytes([0x00, 0x00]);
  w.int24le(0); // the length, filled in below
  w.bytes([0x31, 0xff, 0xf0]);
  w.int16le(pyInt(pyRound(width)));
  w.int16le(pyInt(pyRound(height)));
  w.int16le(0x1e0);
  w.int16le(0x1b0);
  pecEncode(w, stitches);
  const length = w.tell() - start;
  const current = w.tell();
  w.seek(start + 2);
  w.int24le(length);
  w.seek(current);
}

/** The PEC part: header, stitches, pictures. Returns what PES 6 needs after it. */
function writePec(w, stitches, threads, title) {
  const ext = bounds(stitches);
  fixColorCount(stitches, threads);
  const info = writePecHeader(w, threads, title);
  writePecBlock(w, stitches, ext);
  writePecGraphics(w, stitches, ext);
  return info;
}

// ---------------------------------------------------------------------------------------------------------------
// The PES part

function writePesString8(w, s) {
  if (s === null || s === undefined) {
    w.int8(0);
    return;
  }
  let t = asciiOnly(s);
  if (t.length > 255) t = t.slice(0, 255);
  w.int8(t.length);
  w.ascii(t);
}

function writePesString16(w, s) {
  w.int16le(s.length);
  w.ascii(s);
}

function writePesThread(w, t) {
  writePesString8(w, t.catalog);
  w.int8((t.color >> 16) & 0xff);
  w.int8((t.color >> 8) & 0xff);
  w.int8(t.color & 0xff);
  w.int8(0); // unknown
  w.int32le(0xa); // 10 means a custom colour
  writePesString8(w, t.description);
  writePesString8(w, t.brand);
  writePesString8(w, t.chart);
}

function writePesHeaderV1(w, distinctBlockObjects) {
  w.int16le(0x01); // scale to fit
  w.int16le(0x01); // 0 = 100x100, 130x180 hoop
  w.int16le(distinctBlockObjects);
}

function writePesHeaderV6(w, chart, distinctBlockObjects, meta) {
  w.int16le(0x01); // 0 = 100x100, 130x180 hoop
  w.ascii("02"); // a 2 digit number as text
  writePesString8(w, meta.name);
  writePesString8(w, meta.category);
  writePesString8(w, meta.author);
  writePesString8(w, meta.keywords);
  writePesString8(w, meta.comments);
  w.int16le(0); // optimize hoop change: no
  w.int16le(0); // design page is custom: no
  w.int16le(0x64); // hoop width
  w.int16le(0x64); // hoop height
  w.int16le(0); // use existing design area: no
  w.int16le(0xc8); // design width
  w.int16le(0xc8); // design height
  w.int16le(0x64); // design page section width
  w.int16le(0x64); // design page section height
  w.int16le(0x64);
  w.int16le(0x07); // design page background colour
  w.int16le(0x13); // design page foreground colour
  w.int16le(0x01); // show grid
  w.int16le(0x01); // with axes
  w.int16le(0x00); // snap to grid
  w.int16le(100); // grid interval
  w.int16le(0x01);
  w.int16le(0x00); // optimize entry/exit points
  w.int8(0); // length of the "from image" file name
  w.float32le(1);
  w.float32le(0);
  w.float32le(0);
  w.float32le(1);
  w.float32le(0);
  w.float32le(0);
  w.int16le(0); // programmable fill patterns
  w.int16le(0); // motif patterns
  w.int16le(0); // feather patterns
  w.int16le(chart.length); // number of colours
  for (const t of chart) writePesThread(w, t);
  w.int16le(distinctBlockObjects);
}

function writePesAddendum(w, colorIndexList, rgbList) {
  w.bytes(colorIndexList);
  w.fill(0x20, 128 - colorIndexList.length);
  for (let s = 0; s < rgbList.length; s++) w.fill(0x00, 0x90);
  for (const c of rgbList) w.int24le(c);
}

/** Runs of records that are the same command (pyembroidery's get_as_command_blocks). */
function commandBlocks(stitches) {
  const blocks = [];
  let lastPos = 0;
  let lastCommand = -1;
  for (let pos = 0; pos < stitches.length; pos++) {
    const command = stitches[pos][2] & 0xff;
    if (command === lastCommand || lastCommand === -1) {
      lastCommand = command;
      continue;
    }
    lastCommand = command;
    blocks.push(stitches.slice(lastPos, pos));
    lastPos = pos;
  }
  blocks.push(stitches.slice(lastPos));
  return blocks;
}

/** The design as the PES part sees it: runs of stitches or of jumps, each with its colour number. */
function segmentBlocks(stitches, threads, chart, adjustX, adjustY) {
  const out = [];
  const threadAt = (i) => threads[i] || defaultThread(i);
  let colorIndex = 0;
  let current = threadAt(colorIndex);
  colorIndex += 1;
  let colorCode = findNearestColorIndex(current.color, chart);
  let stitchedX = 0;
  let stitchedY = 0;
  for (const block of commandBlocks(stitches)) {
    const seg = [];
    const command = block[0][2] & 0xff;
    let flag;
    if (command === CMD.JUMP) {
      seg.push([stitchedX - adjustX, stitchedY - adjustY]);
      const last = block[block.length - 1];
      seg.push([last[0] - adjustX, last[1] - adjustY]);
      flag = 1;
    } else if (command === CMD.COLOR_CHANGE) {
      current = threadAt(colorIndex);
      colorIndex += 1;
      colorCode = findNearestColorIndex(current.color, chart);
      continue;
    } else if (command === CMD.STITCH) {
      for (const st of block) {
        stitchedX = st[0];
        stitchedY = st[1];
        seg.push([stitchedX - adjustX, stitchedY - adjustY]);
      }
      flag = 0;
    } else {
      continue;
    }
    out.push([seg, colorCode === null ? 0 : colorCode, flag]);
  }
  return out;
}

function writePesSewSegHeader(w, left, top, right, bottom) {
  const width = right - left;
  const height = bottom - top;
  const hoopHeight = 1800;
  const hoopWidth = 1300;
  for (let i = 0; i < 8; i++) w.int16le(0); // left, top, right, bottom, twice
  let transX = 0;
  let transY = 0;
  transX += 350;
  transY += 100 + height;
  transX += hoopWidth / 2;
  transY += hoopHeight / 2;
  transX += -width / 2;
  transY += -height / 2;
  w.float32le(1);
  w.float32le(0);
  w.float32le(0);
  w.float32le(1);
  w.float32le(transX);
  w.float32le(transY);
  w.int16le(1);
  w.int16le(0);
  w.int16le(0);
  w.int16le(pyInt(width));
  w.int16le(pyInt(height));
  w.fill(0x00, 8);
  const placeholder = w.tell();
  w.int16le(0); // the number of sections, filled in later
  return placeholder;
}

function writePesSegments(w, stitches, threads, chart, left, bottom, cx, cy) {
  let section = 0;
  const colorLog = [];
  let previousColorCode = -1;
  let flag = -1;
  const adjustX = left + cx;
  const adjustY = bottom + cy;
  for (const [segments, colorCode, f] of segmentBlocks(stitches, threads, chart, adjustX, adjustY)) {
    if (flag !== -1) w.int16le(0x8003); // end of the section before
    flag = f;
    if (previousColorCode !== colorCode) {
      colorLog.push([section, colorCode]);
      previousColorCode = colorCode;
    }
    w.int16le(flag);
    w.int16le(colorCode);
    w.int16le(segments.length);
    for (const sg of segments) {
      w.int16le(pyInt(sg[0]));
      w.int16le(pyInt(sg[1]));
    }
    section += 1;
  }
  w.int16le(colorLog.length);
  for (const item of colorLog) {
    w.int16le(item[0]);
    w.int16le(item[1]);
  }
  return { sections: section, colorLog };
}

function writePesBlocks(w, stitches, threads, chart, left, top, right, bottom, cx, cy) {
  writePesString16(w, "CEmbOne");
  const placeholder = writePesSewSegHeader(w, left, top, right, bottom);
  w.int16le(0xffff);
  w.int16le(0x0000); // FFFF 0000 means more blocks follow
  writePesString16(w, "CSewSeg");
  const data = writePesSegments(w, stitches, threads, chart, left, bottom, cx, cy);
  const current = w.tell();
  w.seek(placeholder);
  w.int16le(data.sections);
  w.seek(current); // the section count is now right
  w.int16le(0x0000);
  w.int16le(0x0000); // 00000000 means no more blocks
  return data.colorLog;
}

function patchPecOffset(w, placeholder) {
  const current = w.tell();
  w.seek(placeholder);
  w.int32le(current);
  w.seek(current);
}

function writeVersion1(w, stitches, threads, title) {
  const chart = pecThreadSet();
  w.ascii("#PES0001");
  const e = bounds(stitches);
  const cx = (e[2] + e[0]) / 2.0;
  const cy = (e[3] + e[1]) / 2.0;
  const left = e[0] - cx;
  const top = e[1] - cy;
  const right = e[2] - cx;
  const bottom = e[3] - cy;
  const placeholder = w.tell();
  w.int32le(0); // where the PEC part starts, filled in below
  writePesHeaderV1(w, 1);
  w.int16le(0xffff);
  w.int16le(0x0000);
  writePesBlocks(w, stitches, threads, chart, left, top, right, bottom, cx, cy);
  patchPecOffset(w, placeholder);
  writePec(w, stitches, threads, title);
}

function writeVersion6(w, stitches, threads, title, meta) {
  fixColorCount(stitches, threads);
  const chart = threads;
  w.ascii("#PES0060");
  const e = bounds(stitches);
  const cx = (e[2] + e[0]) / 2.0;
  const cy = (e[3] + e[1]) / 2.0;
  const left = e[0] - cx;
  const top = e[1] - cy;
  const right = e[2] - cx;
  const bottom = e[3] - cy;
  const placeholder = w.tell();
  w.int32le(0);
  writePesHeaderV6(w, chart, 1, meta);
  w.int16le(0xffff);
  w.int16le(0x0000);
  const log = writePesBlocks(w, stitches, threads, chart, left, top, right, bottom, cx, cy);
  // in version 6 there is also a small node / order table
  w.int32le(0);
  w.int32le(0);
  for (let i = 0; i < log.length; i++) {
    w.int32le(i);
    w.int32le(0);
  }
  patchPecOffset(w, placeholder);
  const info = writePec(w, stitches, threads, title);
  writePesAddendum(w, info.colorIndexList, info.rgbList);
  w.int16le(0x0000);
}

function writeTruncatedVersion1(w, stitches, threads, title) {
  w.ascii("#PES0001");
  w.bytes([0x16, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  writePec(w, stitches, threads, title);
}

function writeTruncatedVersion6(w, stitches, threads, title, meta) {
  w.ascii("#PES0060");
  const placeholder = w.tell();
  w.int32le(0);
  writePesHeaderV6(w, threads, 0, meta);
  w.fill(0x00, 5);
  w.int16le(0x0000);
  w.int16le(0x0000);
  patchPecOffset(w, placeholder);
  writePec(w, stitches, threads, title);
  writePesAddendum(w, [0xff], []);
  w.int16le(0x0000);
}

/** Which PES form the options ask for: { version: 1 | 6, truncated }. */
function pesForm(options) {
  let version = options.pesVersion === undefined || options.pesVersion === null ? 1 : options.pesVersion;
  let truncated = Boolean(options.pesTruncated);
  if (typeof version === "string") {
    if (version.endsWith("t")) {
      truncated = true;
      version = version.slice(0, -1);
    }
    version = Number(version);
  }
  if (version !== 1 && version !== 6) throw new Error("PES version must be 1 or 6.");
  return { version, truncated };
}

function prepare(pattern, options) {
  const { stitches, threads } = normalizePattern(pattern, {
    maxJump: MAX_MOVE,
    maxStitch: stitchLimit(MAX_MOVE, options),
    fullJump: true,
    round: true,
    longStitch: options.longStitch,
  });
  fixColorCount(stitches, threads);
  interpolateStopAsDuplicateColor(stitches, threads);
  return { stitches, threads };
}

/** The PES file for a pattern, as bytes. */
export function write(pattern, options = {}) {
  const { version, truncated } = pesForm(options);
  const { stitches, threads } = prepare(pattern, options);
  const title = designTitle(pattern, options);
  const meta = {
    name: title,
    category: options.category == null ? null : options.category,
    author: options.author == null ? null : options.author,
    keywords: options.keywords == null ? null : options.keywords,
    comments: options.comments == null ? null : options.comments,
  };
  const w = new ByteWriter(0x1000 + stitches.length * 8 + 4096);
  if (truncated) {
    if (version === 1) writeTruncatedVersion1(w, stitches, threads, title);
    else writeTruncatedVersion6(w, stitches, threads, title, meta);
  } else if (version === 1) {
    writeVersion1(w, stitches, threads, title);
  } else {
    writeVersion6(w, stitches, threads, title, meta);
  }
  return w.toBytes();
}

/** The PEC file (the signature "#PEC0001" and the PEC part) for a pattern, as bytes. */
export function writePecFile(pattern, options = {}) {
  const { stitches, threads } = prepare(pattern, options);
  const w = new ByteWriter(0x1000 + stitches.length * 8 + 4096);
  w.ascii("#PEC0001");
  writePec(w, stitches, threads, designTitle(pattern, options));
  return w.toBytes();
}

// ---------------------------------------------------------------------------------------------------------------
// Reading

const signed12 = (b) => {
  b &= 0xfff;
  return b > 0x7ff ? b - 0x1000 : b;
};
const signed7 = (b) => (b > 63 ? b - 128 : b);

function readPesString(r) {
  const length = r.u8();
  if (length === null || length === 0) return null;
  return r.string8(length);
}

function readPesMetadata(r, meta) {
  const take = (key) => {
    const v = readPesString(r);
    if (v !== null && v.length > 0) meta[key] = v;
  };
  take("name");
  take("category");
  take("author");
  take("keywords");
  take("comments");
}

function readPesThread(r, threads) {
  const catalog = readPesString(r);
  const color = r.u24be();
  r.seek(5, 1);
  const description = readPesString(r);
  const brand = readPesString(r);
  const chart = readPesString(r);
  threads.push({ color: color === null ? 0 : color, description, catalog, brand, chart });
}

/** Read the colour list that follows the counts of fill, motif and feather patterns (we stop if the file has any). */
function readPesThreads(r, threads) {
  if (r.u16le() !== 0) return; // programmable fill patterns
  if (r.u16le() !== 0) return; // motifs
  if (r.u16le() !== 0) return; // feather patterns
  const count = r.u16le() || 0;
  for (let i = 0; i < count; i++) {
    if (r.tell() >= r.length) break;
    readPesThread(r, threads);
  }
}

/** The header of each PES version, only as far as the colours (the file layouts differ in what comes before them). */
function readPesHeader(r, signature, meta, threads) {
  if (signature === "#PES0100") {
    r.seek(4, 1);
    readPesMetadata(r, meta);
    r.seek(14, 1);
    readPesString(r); // hoop name
    r.seek(38, 1);
    readPesString(r); // image file
    r.seek(34, 1);
    readPesThreads(r, threads);
  } else if (signature === "#PES0090") {
    r.seek(4, 1);
    readPesMetadata(r, meta);
    r.seek(14, 1);
    readPesString(r);
    r.seek(30, 1);
    readPesString(r);
    r.seek(34, 1);
    readPesThreads(r, threads);
  } else if (signature === "#PES0080") {
    r.seek(4, 1);
    readPesMetadata(r, meta);
    r.seek(38, 1);
    readPesString(r);
    r.seek(26, 1);
    readPesThreads(r, threads);
  } else if (signature === "#PES0070" || signature === "#PES0060") {
    r.seek(4, 1);
    readPesMetadata(r, meta);
    r.seek(36, 1);
    readPesString(r);
    r.seek(24, 1);
    readPesThreads(r, threads);
  } else if (signature === "#PES0050" || signature === "#PES0055" || signature === "#PES0056") {
    r.seek(4, 1);
    readPesMetadata(r, meta);
    r.seek(24, 1);
    readPesString(r);
    r.seek(24, 1);
    readPesThreads(r, threads);
  } else if (signature === "#PES0040") {
    r.seek(4, 1);
    readPesMetadata(r, meta);
  }
  // versions 1, 2, 2.2 and 3 have nothing we need; an unknown signature is read as far as its PEC part anyway
}

/** Which threads the colour numbers in a PEC header mean (pyembroidery's map_pec_colors). */
function mapPecColors(colorBytes, chart) {
  const set = pecThreadSet();
  const max = set.length;
  const threads = [];
  const black = () => ({ color: 0, description: null, catalog: null, brand: null, chart: null });
  if (!chart || chart.length === 0) {
    // the colour numbers are Brother colours
    for (const byte of colorBytes) threads.push(set[byte % max] || black());
  } else if (chart.length >= colorBytes.length) {
    // the file lists its own threads, one for each block
    for (const t of chart) threads.push(t);
  } else {
    // fewer threads than blocks: the same colour number means the same thread (Brother's own way)
    const map = new Map();
    const pool = chart.slice();
    for (let i = 0; i < colorBytes.length; i++) {
      const colorIndex = colorBytes[i] % max;
      let t = map.get(colorIndex);
      if (t === undefined) {
        t = pool.length > 0 ? pool.shift() : set[colorIndex] || black();
        map.set(colorIndex, t);
      }
      threads.push(t);
    }
  }
  return threads;
}

function readPecStitches(r, b) {
  for (;;) {
    let val1 = r.u8();
    let val2 = r.u8();
    if ((val1 === 0xff && val2 === 0x00) || val2 === null || val1 === null) break;
    if (val1 === 0xfe && val2 === 0xb0) {
      r.seek(1, 1);
      b.colorChange(0, 0);
      continue;
    }
    let jump = false;
    let trim = false;
    let x;
    let y;
    if ((val1 & FLAG_LONG) !== 0) {
      if ((val1 & TRIM_CODE) !== 0) trim = true;
      if ((val1 & JUMP_CODE) !== 0) jump = true;
      x = signed12((val1 << 8) | val2);
      val2 = r.u8();
      if (val2 === null) break;
    } else {
      x = signed7(val1);
    }
    if ((val2 & FLAG_LONG) !== 0) {
      if ((val2 & TRIM_CODE) !== 0) trim = true;
      if ((val2 & JUMP_CODE) !== 0) jump = true;
      const val3 = r.u8();
      if (val3 === null) break;
      y = signed12((val2 << 8) | val3);
    } else {
      y = signed7(val2);
    }
    if (jump) {
      b.move(x, y);
    } else if (trim) {
      b.trim();
      b.move(x, y);
    } else {
      b.stitch(x, y);
    }
  }
  b.end();
}

/** The PEC part, with the file's own thread list when a PES header gave one. Returns { label, threads }. */
function readPecPart(r, b, pesThreads) {
  r.seek(3, 1); // "LA:"
  const label = r.string8(16);
  r.seek(0xf, 1);
  r.u8(); // bytes per picture row
  r.u8(); // picture height
  r.seek(0xc, 1);
  const colorChanges = r.u8();
  if (colorChanges === null) throw new Error("This Brother file stops before its colour list.");
  const countColors = colorChanges + 1; // PEC stores the count minus one, so 0xFF means no colours
  const raw = r.read(countColors);
  const colorBytes = colorChanges === 0xff ? [] : Array.from(raw);
  const threads = mapPecColors(colorBytes, pesThreads);
  r.seek(0x1d0 - colorChanges, 1);
  const length = r.u24le();
  if (length === null) throw new Error("This Brother file stops before its stitches.");
  r.seek(0x0b, 1); // 31 FF F0, then four 16 bit numbers
  readPecStitches(r, b);
  return { label: label === null ? null : pyStrip(label), threads };
}

function finishRead(b, label, meta, threads) {
  interpolateDuplicateColorAsStop(b.stitches, threads);
  return finishPattern({ name: meta.name || label || null, stitches: b.stitches, threads, fileHoldsColors: true });
}

/** A PES file's bytes as a pattern { name, threads, stitches, colorsFromFile }. */
export function read(bytes) {
  const r = new ByteReader(toBytes(bytes));
  const signature = r.string8(8);
  const b = new PatternBuilder();
  if (signature === "#PEC0001") {
    const part = readPecPart(r, b, []);
    return finishRead(b, part.label, {}, part.threads);
  }
  const pecPosition = r.u32le();
  if (pecPosition === null) throw new Error("This is not a Brother PES file.");
  const meta = {};
  const pesThreads = [];
  readPesHeader(r, signature, meta, pesThreads);
  r.seek(pecPosition, 0);
  const part = readPecPart(r, b, pesThreads);
  return finishRead(b, part.label, meta, part.threads);
}

/** A PEC file's bytes (starting "#PEC0001") as a pattern { name, threads, stitches, colorsFromFile }. */
export function readPecFile(bytes) {
  const r = new ByteReader(toBytes(bytes));
  r.read(8); // "#PEC0001"
  const b = new PatternBuilder();
  const part = readPecPart(r, b, []);
  return finishRead(b, part.label, {}, part.threads);
}
