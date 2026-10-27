/**
 * Machine embroidery files: writers and readers for the formats a garment factory's machines use.
 *
 *   import { FORMATS, writePattern, readPattern, formatForFilename } from "./formats/index.js";
 *   const bytes = writePattern("dst", pattern, { title: "Logo" });   // Uint8Array, ready to save as logo.dst
 *   const pattern = readPattern(formatForFilename("logo.dst"), bytesOfAFile);
 *
 * A pattern is the page's (see ../pattern.js and ../README.md): { name, threads: [{ r, g, b, name?, code?, brand? }],
 * stitches: [[x, y, cmd], ...] }, absolute positions in 0.1 mm, +y down, commands CMD.STITCH / JUMP / TRIM /
 * COLOR_CHANGE / STOP / END, N colour blocks with N threads and N-1 COLOR_CHANGE. The writers do not re-centre anything:
 * positions are kept as they are (the first record of a file is relative to 0, 0), as pyembroidery does.
 *
 * WHERE THIS COMES FROM. The writers and readers are ports of pyembroidery (MIT licence, EmbroidePy,
 * github.com/EmbroidePy/pyembroidery), kept faithful on purpose: a real machine reads these files, so a file layout
 * is never "improved". Each format's file starts with a comment that says how that format spells jumps, trims, colour
 * changes and long moves, and what the header holds. The shared steps (cutting long moves, jumps to the start of each
 * colour, colour numbering) are in transcode.js and util.js. selftest.mjs runs the checks (`node selftest.mjs`).
 * Where this code differs from pyembroidery, on purpose, the file says so: text in the files is ASCII only, the DST
 * label is cut to its 16 characters, a DST extended header never grows past its 512 bytes, threads that a design does
 * not name get fixed stand-in colours instead of random ones, and JEF and PES 6 can write a design with nothing sewn
 * (pyembroidery stops with an error there).
 *
 * THIRD-PARTY NOTICE (pyembroidery, whose logic and data tables these files port):
 *   MIT License. Copyright (c) 2018 the pyembroidery authors (EmbroidePy).
 *   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 *   documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 *   the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 *   permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright
 *   notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 *   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
 *   OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 *   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * OPTIONS (every option is optional; a format ignores the ones that are not its own):
 *
 *   title        string   The design's name inside the file. Default: pattern.name, else "Untitled". ASCII only (other
 *                         characters become "?"). DST keeps 16 characters, PEC 8, PES version 6 up to 255.
 *   trimJumps    2 to 8   How many jump records spell one TRIM in a format that has no trim command (DST, JEF). Default 3.
 *                         When reading DST it is the number of jumps in a row that mean "a trim" (default 3); JEF reading
 *                         uses it only together with the trims option.
 *   longStitch   string   "jump" (default) or "sew". A STITCH longer than the format allows in one record (DST 12.1 mm,
 *                         EXP and JEF and U01 12.7 mm, XXX 12.4 mm, VP3 25.5 mm, PES and PEC 204.7 mm) is cut into equal steps:
 *                         with "jump" the early steps are jumps and only the last, short one is a stitch (pyembroidery's
 *                         way, no needle penetration in between); with "sew" every step is a stitch.
 *   maxStitchMm  number   The longest single stitch to write, in mm; a longer one is cut as longStitch says. Default: the
 *                         format's own limit (see longStitch). Real machines sew about 12 mm at most, yet a PES or PEC file
 *                         would store a stitch of up to 204.7 mm as one record, so give 12 when a design may hold long stitches
 *                         (with longStitch "sew" they become several short stitches). Jumps keep the format's limit.
 *   author       string   DST (with dstExtendedHeader) and PES version 6: the author's name in the header.
 *   copyright    string   DST with dstExtendedHeader: the copyright text.
 *   category, keywords, comments   string   PES version 6 header text.
 *   dstExtendedHeader  boolean  DST: also write the AU:, CP: and TC: (thread colour) header lines. Default false, the plain
 *                         header every machine knows. Our reader uses the TC: lines to get the colours back.
 *   pesVersion   1 | 6    PES: version 1 (default, the simplest, thread colours become Brother's 64) or 6 (also keeps each
 *                         thread's exact RGB, name, code and brand). The strings "1", "6", "1t", "6t" also work.
 *   pesTruncated boolean  PES: write only the PEC part (what a machine needs) after the signature. Default false.
 *   trims        boolean  JEF: write TRIM as zero-length jumps. Default false (pyembroidery writes no trims in JEF). When
 *                         reading JEF: a run of `trimJumps` jumps means a trim.
 *   needleCount  number   U01: how many needles the machine has; needle numbers go 1, 2, ... needleCount and round again.
 *                         Default 5 (pyembroidery's).
 *   date         string   JEF: the 14 digit date and time (YYYYMMDDHHMMSS) for the header. Default: now. Give it for a file
 *                         that is the same every time.
 *   vp3Exact     boolean  VP3: measure each colour block's start from the whole-number centre stored in the header, so every
 *                         position is exact. Default false, which gives the same bytes as pyembroidery, whose later colour
 *                         blocks can sit up to 0.1 mm away from where they were written (see the note in vp3.js).
 *
 * Reading only: trimDistanceMm (DST default none, JEF default 3: a run of jumps longer than this after sewing means a
 * trim; null for never) and clipping (default true: a run of jumps that ends where it began is dropped, which is how a
 * DST trim is spelled).
 *
 * WHAT READING GIVES. A pattern in the same shape plus `colorsFromFile`: true when the file named every thread colour,
 * false when the colours are stand-ins (DST without extended header, EXP and U01 hold no colours). There is always one
 * thread per colour block. Brother and Janome files give the closest colour of their chart, not the colour the maker
 * had in mind. A file the reader cannot make sense of throws an Error with a plain message.
 */
import * as dst from "./dst.js";
import * as exp from "./exp.js";
import * as jef from "./jef.js";
import * as pes from "./pes.js";
import * as u01 from "./u01.js";
import * as vp3 from "./vp3.js";
import * as xxx from "./xxx.js";
import { toBytes } from "./util.js";

/**
 * The formats, in the order a page would list them. `machines` is who uses the format, `holdsColors` says whether the file
 * stores thread colours (otherwise the operator picks the threads at the machine), `note` is one line of advice.
 */
export const FORMATS = [
  {
    id: "dst",
    ext: "dst",
    name: "Tajima DST",
    machines: "Tajima, Barudan, ZSK, SWF, Happy, Feiya and most industrial machines",
    read: true,
    write: true,
    holdsColors: false,
    note: "The standard industrial format. It holds stitches, jumps, trims and colour changes but no thread colours (an optional extended header can list them, which machines ignore): the operator picks the thread for each colour.",
  },
  {
    id: "exp",
    ext: "exp",
    name: "Melco EXP",
    machines: "Melco machines, and many other machines and programs that read Melco files",
    read: true,
    write: true,
    holdsColors: false,
    note: "A plain stream of moves with no header and no thread colours.",
  },
  {
    id: "pes",
    ext: "pes",
    name: "Brother PES",
    machines: "Brother and Baby Lock embroidery machines, including the PR multi-needle models",
    read: true,
    write: true,
    holdsColors: true,
    note: "Thread colours become Brother's 64 colours (version 6 also keeps the exact colour). The file carries small pictures the machine shows.",
  },
  {
    id: "pec",
    ext: "pec",
    name: "Brother PEC",
    machines: "Brother and Baby Lock machines (the stitch part of a PES file on its own)",
    read: true,
    write: true,
    holdsColors: true,
    note: "The stitch part of a PES file on its own, with Brother's colour numbers.",
  },
  {
    id: "jef",
    ext: "jef",
    name: "Janome JEF",
    machines: "Janome home and professional machines (also sold as Elna and Kenmore)",
    read: true,
    write: true,
    holdsColors: true,
    note: "Thread colours become the closest of Janome's 78 colours. Trims are written only when the trims option is on.",
  },
  {
    id: "vp3",
    ext: "vp3",
    name: "Pfaff / Husqvarna Viking VP3",
    machines: "Pfaff and Husqvarna Viking embroidery machines",
    read: true,
    write: true,
    holdsColors: true,
    note: "Keeps each thread's exact colour, name and brand. Jumps and stops are not stored.",
  },
  {
    id: "xxx",
    ext: "xxx",
    name: "Singer XXX",
    machines: "Singer embroidery machines (the Singer / Compucon format)",
    read: true,
    write: true,
    holdsColors: true,
    note: "Keeps each thread's RGB colour (up to 21 listed).",
  },
  {
    id: "u01",
    ext: "u01",
    name: "Barudan U01",
    machines: "Barudan machines (the machine's own U01, U00 and U02 files)",
    read: true,
    write: true,
    holdsColors: false,
    note: "Names needle numbers, not thread colours. Set needleCount to the machine's number of needles.",
  },
];

const IMPLEMENTATIONS = {
  dst: { write: dst.write, read: dst.read },
  exp: { write: exp.write, read: exp.read },
  pes: { write: pes.write, read: pes.read },
  pec: { write: pes.writePecFile, read: pes.readPecFile },
  jef: { write: jef.write, read: jef.read },
  vp3: { write: vp3.write, read: vp3.read },
  xxx: { write: xxx.write, read: xxx.read },
  u01: { write: u01.write, read: u01.read },
};

function implementation(id) {
  const key = String(id).toLowerCase();
  const impl = IMPLEMENTATIONS[key];
  if (!impl) throw new Error(`Unknown embroidery file format "${id}". Known: ${FORMATS.map((f) => f.id).join(", ")}.`);
  return impl;
}

/** The format for a file name ("Logo.DST" gives "dst"), or null when we do not know it. U00 and U02 are U01. */
export function formatForFilename(name) {
  const m = /\.([A-Za-z0-9]+)\s*$/.exec(String(name == null ? "" : name));
  if (!m) return null;
  const ext = m[1].toLowerCase();
  if (ext === "u00" || ext === "u02") return "u01";
  return FORMATS.some((f) => f.id === ext) ? ext : null;
}

/** The file for a pattern, as a Uint8Array. `id` is one of the FORMATS ids; see the options in the header above. */
export function writePattern(id, pattern, options = {}) {
  if (!pattern || typeof pattern !== "object") throw new Error("writePattern needs a pattern { name, threads, stitches }.");
  return implementation(id).write(pattern, options || {});
}

/**
 * A file's bytes (Uint8Array or ArrayBuffer) as a pattern in the page's shape, plus `colorsFromFile`. A file that is not
 * this format (or is damaged) throws an Error whose message says so in plain words.
 */
export function readPattern(id, bytes, options = {}) {
  const impl = implementation(id);
  const data = toBytes(bytes);
  try {
    return impl.read(data, options || {});
  } catch (e) {
    const format = FORMATS.find((f) => f.id === String(id).toLowerCase());
    throw new Error(`This does not look like a ${format ? format.name : id} file, or it is damaged (${e && e.message ? e.message : e}).`);
  }
}
