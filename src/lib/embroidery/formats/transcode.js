/**
 * The step every writer goes through before it writes a byte: it turns the page's pattern into the exact list of
 * records a machine format can hold. This is a port of pyembroidery's Transcoder (EmbEncoder.py, MIT licence,
 * EmbroidePy), kept line for line, because the decisions made here are what a real machine sees:
 *
 *   - ROUNDING. With `round` on, every position is rounded to a whole unit first (Python rounding, halves to even).
 *   - THE START. The first stitch of a design, and the first stitch after a TRIM or a COLOR_CHANGE, is reached by
 *     JUMP records from where the needle was (the very first record is relative to 0,0, so a design far from the
 *     middle begins with jumps). With `fullJump` on (Brother, Janome, Melco) a final JUMP lands exactly on the first
 *     stitch, and the stitch follows at the same spot.
 *   - LONG MOVES. A move longer than the format allows in one record (`maxJump` for jumps, `maxStitch` for stitches,
 *     counted in x and y separately) is cut into equal steps. A long STITCH becomes JUMP records for all but the last
 *     step and a STITCH for the last one ("jump needle": the needle goes down only where a stitch is short enough).
 *     With `longStitch: "sew"` every step is a STITCH instead.
 *   - TRIM. A TRIM cuts the thread where the needle is. A TRIM when the thread is already cut (two in a row, one
 *     right after a COLOR_CHANGE, or before any stitch) is dropped.
 *   - COLOR_CHANGE. Asks for the next thread. The first colour needs no command (a COLOR_CHANGE before any stitch is
 *     the first colour, not a change). Threads are listed in the order they are used: thread n is block n.
 *   - NEEDLE SET. Formats that name a needle (Barudan U01) get NEEDLE_SET records numbered 1..needleCount in turn in
 *     place of COLOR_CHANGE, and the first colour gets one too.
 *   - END. Always the last record, at the needle's position; anything after the page's END is ignored.
 *   - STOP stays a STOP.
 *
 * Unlike pyembroidery this port does not support tie-in/tie-out lock stitches, sequins, or matrix transforms (the
 * page's patterns have none of them).
 *
 * The result is { stitches: [[x, y, cmd], ...], threads: [thread, ...] }. Positions may be fractions (the steps of a long
 * move are not rounded; the writers round each record against the one before it, so nothing drifts). Commands are
 * the page's CMD, plus NEEDLE_SET (9) which carries a thread and needle number in its upper bits.
 */
import { CMD } from "../pattern.js";
import { defaultThread, pyRound, threadFromApp } from "./util.js";

/** A thread change that names a needle (U01). Never in a page pattern; only inside the normalized list. */
export const NEEDLE_SET = 9;

const NO_COMMAND = -1;

/** No machine sews 100 metres from its centre: a position beyond this (in units) is a mistake, and cutting such a move would fill the memory. */
const MAX_POSITION = 1000000;

/** Pack a thread-change command with its thread number and needle number in the upper bits (pyembroidery's encoding). */
export function encodeThreadChange(command, thread = null, needle = null, order = null) {
  const t = thread === null ? 0 : (thread & 0xff) + 1;
  const n = needle === null ? 0 : (needle & 0xff) + 1;
  const o = order === null ? 0 : (order & 0xff) + 1;
  return (command & 0xff) + t * 256 + n * 65536 + o * 16777216;
}

/** Unpack a command: { flag, thread, needle, order } with null for the ones not given. */
export function decodeThreadChange(cmd) {
  const field = (shift) => {
    const v = ((cmd >>> shift) & 0xff) - 1;
    return v === -1 ? null : v;
  };
  return { flag: cmd & 0xff, thread: field(8), needle: field(16), order: field(24) };
}

class Transcoder {
  constructor(s) {
    this.maxStitch = s.maxStitch === undefined ? Infinity : s.maxStitch;
    this.maxJump = s.maxJump === undefined ? Infinity : s.maxJump;
    this.fullJump = Boolean(s.fullJump);
    this.round = Boolean(s.round);
    const needles = s.needleCount === undefined || s.needleCount === null ? 5 : Number(s.needleCount);
    this.needleCount = Number.isFinite(needles) ? Math.max(1, Math.floor(needles)) : 5;
    this.change = s.needleSet ? "needle" : "color";
    // One needle cannot be told apart from another, so a needle format on one needle just stops (pyembroidery does this).
    if (this.change === "needle" && this.needleCount <= 1) this.change = "stop";
    this.sew = s.longStitch === "sew";

    this.out = [];
    this.threads = [];
    this.needleX = 0;
    this.needleY = 0;
    this.stateTrimmed = true;
    this.orderIndex = -1;
    this.sourceThreads = [];
  }

  threadAt(index) {
    return index < this.sourceThreads.length ? this.sourceThreads[index] : defaultThread(index);
  }

  run(source, sourceThreads) {
    this.sourceThreads = sourceThreads;
    if (this.change === "needle") this.threads.push(...sourceThreads);
    let flags = NO_COMMAND;
    for (let position = 0; position < source.length; position++) {
      const stitch = source[position];
      let x = stitch[0];
      let y = stitch[1];
      if (this.round) {
        x = pyRound(x);
        y = pyRound(y);
      }
      flags = stitch[2] & 0xff;
      if (flags === CMD.STITCH) {
        if (this.stateTrimmed) {
          this.declareNotTrimmed();
          this.jumpToWithinStitchRange(x, y);
          this.stitchAt(x, y);
        } else if (this.sew) {
          this.sewTo(x, y);
        } else {
          this.needleTo(x, y);
        }
      } else if (flags === CMD.TRIM) {
        if (!this.stateTrimmed) this.trimHere();
      } else if (flags === CMD.JUMP) {
        this.jumpTo(x, y);
      } else if (flags === CMD.COLOR_CHANGE) {
        // pyembroidery cuts the thread first only when its "explicit_trim" setting is on, and no writer here turns it on.
        this.nextChangeSequence();
        this.stateTrimmed = true;
      } else if (flags === CMD.STOP) {
        this.stopHere();
      } else if (flags === CMD.END) {
        this.endHere();
        break;
      }
      // any other number is not a command we know: it is skipped
    }
    if (flags !== CMD.END) this.endHere();
  }

  declareNotTrimmed() {
    if (this.orderIndex === -1) this.nextChangeSequence();
    this.stateTrimmed = false;
  }

  /** Start the next colour block: list its thread and (after the first) put the change command in the stream. */
  nextChangeSequence() {
    this.orderIndex += 1;
    const k = this.orderIndex;
    const needle = (k % this.needleCount) + 1;
    if (this.change === "color") {
      this.threads.push(this.threadAt(k));
      if (k !== 0) this.addThreadChange(CMD.COLOR_CHANGE, k, needle);
    } else if (this.change === "needle") {
      this.addThreadChange(NEEDLE_SET, k, needle);
    } else {
      this.threads.push(this.threadAt(k));
      this.addThreadChange(CMD.STOP, k, needle);
    }
    this.stateTrimmed = true;
  }

  addThreadChange(command, thread, needle) {
    this.out.push([this.needleX, this.needleY, encodeThreadChange(command, thread, needle, null)]);
  }

  add(cmd, x = this.needleX, y = this.needleY) {
    this.out.push([x, y, cmd]);
  }

  trimHere() {
    this.add(CMD.TRIM);
    this.stateTrimmed = true;
  }

  stopHere() {
    this.add(CMD.STOP);
    this.stateTrimmed = true;
  }

  endHere() {
    this.add(CMD.END);
    this.stateTrimmed = true;
  }

  /** Jumps to within one record of (x, y), without putting the needle down; with `fullJump` on, all the way. */
  jumpToWithinStitchRange(x, y) {
    this.interpolate(this.needleX, this.needleY, x, y, this.maxJump, CMD.JUMP);
    if (this.fullJump && (this.needleX !== x || this.needleY !== y)) this.jumpAt(x, y);
  }

  jumpTo(x, y) {
    this.interpolate(this.needleX, this.needleY, x, y, this.maxJump, CMD.JUMP);
    this.jumpAt(x, y);
  }

  jumpAt(x, y) {
    this.add(CMD.JUMP, x, y);
    this.needleX = x;
    this.needleY = y;
  }

  /** A stitch where long moves are made of jumps and only the last, short step puts the needle down. */
  needleTo(x, y) {
    this.interpolate(this.needleX, this.needleY, x, y, this.maxStitch, CMD.JUMP);
    this.stitchAt(x, y);
  }

  /** A stitch where long moves are made of several stitches. */
  sewTo(x, y) {
    this.interpolate(this.needleX, this.needleY, x, y, this.maxStitch, CMD.STITCH);
    this.stitchAt(x, y);
  }

  stitchAt(x, y) {
    this.add(CMD.STITCH, x, y);
    this.needleX = x;
    this.needleY = y;
  }

  /**
   * The in-between points of a line from (x0, y0) to (x1, y1) when it is longer than `maxLength` in x or y: the line is
   * cut into equal steps no longer than that, and a record of kind `cmd` is added for every point except the start and
   * the end. The caller adds the end.
   */
  interpolate(x0, y0, x1, y1, maxLength, cmd) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (Math.abs(dx) > maxLength || Math.abs(dy) > maxLength) {
      const stepsX = Math.ceil(Math.abs(dx / (maxLength * 1.0)));
      const stepsY = Math.ceil(Math.abs(dy / (maxLength * 1.0)));
      const steps = stepsX > stepsY ? stepsX : stepsY;
      const stepX = dx / steps;
      const stepY = dy / steps;
      let qx = x0;
      let qy = y0;
      for (let q = 1; q < steps; q++) {
        qx += stepX;
        qy += stepY;
        this.out.push([qx, qy, cmd]);
        this.needleX = qx;
        this.needleY = qy;
      }
    }
  }
}

/** The page's stitches as plain [x, y, cmd] triples, with a clear error for a bad one. */
function sourceStitches(pattern) {
  const list = pattern && Array.isArray(pattern.stitches) ? pattern.stitches : [];
  const out = new Array(list.length);
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s || s.length < 3 || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) {
      throw new Error(`Stitch number ${i} is not [x, y, command] with real numbers for x and y.`);
    }
    if (Math.abs(s[0]) > MAX_POSITION || Math.abs(s[1]) > MAX_POSITION) {
      throw new Error(`Stitch number ${i} is ${Math.round(Math.max(Math.abs(s[0]), Math.abs(s[1])) / 10)} mm from the centre: that is not a real design.`);
    }
    out[i] = [s[0], s[1], s[2]];
  }
  return out;
}

/**
 * The records a format will store, from the page's pattern. `settings`:
 *   maxStitch, maxJump  the longest move one record can hold, in units (default: no limit)
 *   fullJump            land a JUMP exactly on the first stitch of every block (default false)
 *   round               round every position to a whole unit first (default false)
 *   needleSet           write NEEDLE_SET instead of COLOR_CHANGE (default false), with `needleCount` needles (default 5)
 *   longStitch          "jump" (default, pyembroidery's) or "sew": what a stitch longer than maxStitch becomes
 * Returns { stitches, threads } (threads in the inside form of util.js; one per colour block used).
 */
export function normalizePattern(pattern, settings = {}) {
  const t = new Transcoder(settings);
  const source = sourceStitches(pattern);
  const threads = ((pattern && pattern.threads) || []).map(threadFromApp);
  t.run(source, threads);
  return { stitches: t.out, threads: t.threads };
}

/** The box round every record: [minX, minY, maxX, maxY] (Infinity, Infinity, -Infinity, -Infinity when empty). */
export function bounds(stitches) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of stitches) {
    if (s[0] > maxX) maxX = s[0];
    if (s[0] < minX) minX = s[0];
    if (s[1] > maxY) maxY = s[1];
    if (s[1] < minY) minY = s[1];
  }
  return [minX, minY, maxX, maxY];
}

/** How many records are this command. */
export function countCommand(stitches, cmd) {
  let n = 0;
  for (const s of stitches) if ((s[2] & 0xff) === cmd) n++;
  return n;
}

/** Make sure there is a thread for every colour block that has a stitch (adds stand-in threads at the end). */
export function fixColorCount(stitches, threads) {
  let threadIndex = 0;
  let initColor = true;
  for (const s of stitches) {
    const data = s[2] & 0xff;
    if (data === CMD.STITCH) {
      if (initColor) {
        threadIndex += 1;
        initColor = false;
      }
    } else if (data === CMD.COLOR_CHANGE || data === NEEDLE_SET) {
      initColor = true;
    }
  }
  while (threads.length < threadIndex) threads.push(defaultThread(threads.length));
}

/**
 * Brother and a few others have no STOP command. A STOP becomes a colour change to the same colour: the thread is
 * listed twice and the STOP record becomes a COLOR_CHANGE (pyembroidery's interpolate_stop_as_duplicate_color).
 * Changes `stitches` and `threads` in place.
 */
export function interpolateStopAsDuplicateColor(stitches, threads) {
  let threadIndex = 0;
  for (const s of stitches) {
    const data = s[2] & 0xff;
    if (data === CMD.COLOR_CHANGE || data === NEEDLE_SET) {
      threadIndex += 1;
    } else if (data === CMD.STOP) {
      if (threadIndex >= threads.length) return; // no colour to repeat
      threads.splice(threadIndex, 0, threads[threadIndex]);
      s[2] = CMD.COLOR_CHANGE;
      threadIndex += 1;
    }
  }
}
