/**
 * The stitch plan: turns runs of points into the commands a machine reads. It decides, between one run and the next,
 * whether the needle just carries on with a stitch, or the thread is tied off, cut (a trim), the frame jumps and a new
 * thread is tied in; and where a colour changes. Positions are millimetres while the plan is built, and become the
 * pattern's integer 0.1 mm units (rounded from absolute positions, so rounding never drifts) at the end.
 */
import { CMD, UNITS_PER_MM, createPattern } from "../pattern.js";

export const PLAN_DEFAULTS = {
  trimOver: 3.0, // a jump longer than this is cut (a trim) first
  lock: true, // tie-in and tie-off stitches at every start and cut
  lockLen: 0.5, // mm, how far a tie stitch reaches
  minStitch: 0.2, // consecutive points closer than this are merged (tie stitches excepted)
  returnHome: false, // jump back to the hoop centre before the end
  startLead: 0.4, // mm: a thread starts with a jump to a point this far along the run and a stitch back onto its first point (a jump followed by a stitch of no length is a zero-length record in the file)
  shortMm: 0.3, // a stitch shorter than this inside a run is merged into its neighbour (0 = never) ...
  shortTol: 0.05, // ... when the path moves by no more than this (mm); corners, run ends and tie stitches stay
  shortMax: 7, // mm: ... and the merged stitch is no longer than this
  travelMax: 25, // mm: a move to the next run that lies under layers sewn later (the engine says so) is stitched when it is no longer than this, not jumped (and not cut)
  travelStep: 2.5, // mm: the stitch length of such a move
};

/** The distance of point b from the segment a-c. */
function distToSegment(b, a, c) {
  const vx = c[0] - a[0], vy = c[1] - a[1];
  const l2 = vx * vx + vy * vy;
  if (l2 === 0) return Math.hypot(b[0] - a[0], b[1] - a[1]);
  let t = ((b[0] - a[0]) * vx + (b[1] - a[1]) * vy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(b[0] - (a[0] + t * vx), b[1] - (a[1] + t * vy));
}

/**
 * Take the needle holes out of a stretch of sewing that only make a stitch shorter than `minLen` (all in pattern units): a hole is dropped when the stitch before it
 * or the one after it is that short and the path between its neighbours passes within `tol` of it (the run is straight there), so the sewn line does not move.
 * Corners, tie stitches and the first and last stitch of a run (`keep`) stay, and so does everything that is not a stitch. `list` is the pattern's [x, y, cmd],
 * `keep[i]` says whether list[i] must stay. Returns the new list.
 */
function dropShortStitches(list, keep, minLen, tol, maxLen) {
  const result = [];
  const n = list.length;
  let i = 0;
  while (i < n) {
    if (list[i][2] !== CMD.STITCH) { result.push(list[i]); i++; continue; }
    let e = i;
    while (e + 1 < n && list[e + 1][2] === CMD.STITCH) e++;
    // the stitches i..e are one stretch of sewing
    result.push(list[i]);
    let a = list[i];
    for (let k = i + 1; k < e; k++) {
      const b = list[k], c = list[k + 1];
      if (!keep[k] && (Math.hypot(b[0] - a[0], b[1] - a[1]) < minLen || Math.hypot(c[0] - b[0], c[1] - b[1]) < minLen)
        && Math.hypot(c[0] - a[0], c[1] - a[1]) <= maxLen && distToSegment(b, a, c) <= tol) continue; // this hole is not needed
      result.push(b);
      a = b;
    }
    if (e > i) result.push(list[e]);
    i = e + 1;
  }
  return result;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function createPlan(options = {}) {
  const opt = { ...PLAN_DEFAULTS, ...options };
  const out = []; // [x, y, cmd] in mm
  const threads = [];
  let cur = null; // the needle, [x, y]
  let prevDir = null; // unit vector of the last stitch
  let colorKey = null;
  let started = false; // is a thread running (a stitch has been sewn since the last cut or colour change)?
  const blocks = []; // { color, from, to } index ranges in `out`

  // (a 4th number of 1 marks a stitch that must stay: a tie stitch, the needle drop that starts a thread, the first and last stitch of a run)
  const push = (p, cmd, keep = false) => { out.push(keep ? [p[0], p[1], cmd, 1] : [p[0], p[1], cmd]); };

  /** The first point of a run that is at least `far` mm from its start (else the furthest): the way the run goes, as the tie stitches see it. */
  const wayPoint = (p, pts, far) => {
    if (!pts) return null;
    let q = null, d = 0;
    for (let i = 1; i < pts.length; i++) {
      const di = dist(p, pts[i]);
      if (di > d) { d = di; q = pts[i]; }
      if (di >= far) break;
    }
    return d < 1e-6 ? null : q;
  };

  /** Where a jump to the start of a run lands: a little way along the run, so the first stitch (back onto the start) has a length. */
  const leadPoint = (p, way) => {
    if (!way) return p;
    const d = dist(p, way);
    if (d < 1e-6) return p;
    const k = Math.min(opt.startLead, d);
    return [p[0] + ((way[0] - p[0]) / d) * k, p[1] + ((way[1] - p[1]) / d) * k];
  };

  const stitchTo = (p, lock = false, keep = lock) => {
    if (cur && !lock && dist(cur, p) < opt.minStitch) return;
    if (cur) {
      const d = dist(cur, p);
      if (d > 1e-9) prevDir = [(p[0] - cur[0]) / d, (p[1] - cur[1]) / d];
    }
    push(p, CMD.STITCH, keep);
    cur = p;
  };

  /** Back and forth over the last stitch so the thread cannot pull out. */
  const tieOff = () => {
    if (!opt.lock || !started || !cur || !prevDir) return;
    const q = [cur[0] - prevDir[0] * opt.lockLen, cur[1] - prevDir[1] * opt.lockLen];
    const e = cur;
    stitchTo(q, true); stitchTo(e, true); stitchTo(q, true);
    // The needle is left at q: where the thread is cut.
  };

  /** A needle drop at the start of a new thread, then a short back-and-forth along the way the run goes. */
  const tieIn = (p, next) => {
    cur = p;
    push(p, CMD.STITCH, true);
    started = true;
    prevDir = null;
    if (!opt.lock || !next) return;
    const d = dist(p, next);
    if (d < 1e-6) return;
    const u = [(next[0] - p[0]) / d, (next[1] - p[1]) / d];
    if (d < 2 * opt.shortMm) { prevDir = u; return; } // a run shorter than 0.6 mm is no more than its own stitches: tie stitches of a tenth of a millimetre would only pile thread up
    const q = [p[0] + u[0] * Math.min(opt.lockLen, d * 0.5), p[1] + u[1] * Math.min(opt.lockLen, d * 0.5)];
    stitchTo(q, true); stitchTo(p, true);
    prevDir = u;
  };

  const startAt = (p, next, pts) => {
    // the tie stitches and the first stitch go along the run towards a point at least 0.6 mm away, so none of them is shorter than 0.3 mm
    const way = wayPoint(p, pts, 2 * opt.shortMm) || next;
    push(leadPoint(p, way), CMD.JUMP);
    cur = p;
    tieIn(p, way);
  };

  return {
    /** Begin a block of a new colour (a COLOR_CHANGE after the first). `color` is { r, g, b, ... }. */
    colour(color) {
      const key = `${color.r},${color.g},${color.b}`;
      if (key === colorKey) return;
      if (cur) {
        tieOff();
        push(cur, CMD.COLOR_CHANGE);
        started = false;
        prevDir = null;
      }
      colorKey = key;
      threads.push({ r: color.r, g: color.g, b: color.b, name: color.name, code: color.code, brand: color.brand });
      blocks.push({ color: { ...color }, from: out.length });
    },

    /**
     * Sew a run of points. `join` lets it carry on from the needle with a plain stitch when the gap is no longer than
     * `connectMax`; otherwise the thread is tied off, cut if the move is long, and a jump leads to the run's start.
     */
    run(pts, { join = false, connectMax = 3, travel = false } = {}) {
      if (!pts || pts.length < 2) return;
      const p0 = pts[0];
      if (!cur || !started) {
        startAt(p0, pts[1], pts);
      } else {
        const gap = dist(cur, p0);
        if (gap < 0.15) {
          // already there
        } else if (join && gap <= connectMax) {
          stitchTo(p0, false, true);
        } else if (travel && gap <= opt.travelMax) {
          // The way to this run lies under what is sewn after it, so the needle goes there stitching: no jump, and no thread cut.
          const a = cur;
          const n = Math.max(1, Math.ceil(gap / opt.travelStep));
          for (let i = 1; i <= n; i++) stitchTo([a[0] + ((p0[0] - a[0]) * i) / n, a[1] + ((p0[1] - a[1]) * i) / n], false, true);
        } else if (gap <= opt.trimOver) {
          // A short move: the thread is not cut, the frame just jumps and the needle comes down.
          push(leadPoint(p0, wayPoint(p0, pts, 2 * opt.shortMm)), CMD.JUMP);
          cur = p0;
          push(p0, CMD.STITCH, true);
          prevDir = null;
        } else {
          tieOff();
          push(cur, CMD.TRIM);
          startAt(p0, pts[1], pts);
        }
      }
      for (let i = 1; i < pts.length; i++) stitchTo(pts[i], false, i === pts.length - 1);
    },

    /** Where the needle is now ([x, y]) or null. */
    needle() { return cur; },

    /** Is a thread running (so a move to the next run could be stitched instead of cut)? */
    threaded() { return !!(cur && started); },

    /** Close the design: tie off, optionally jump home, END. Returns the pattern in 0.1 mm units. */
    finish(name = "design") {
      if (cur) {
        tieOff();
        if (opt.returnHome) { push(cur, CMD.TRIM); push([0, 0], CMD.JUMP); cur = [0, 0]; }
      }
      push(cur || [0, 0], CMD.END);
      if (blocks.length) blocks[blocks.length - 1].to = out.length;
      for (let i = 0; i < blocks.length - 1; i++) blocks[i].to = blocks[i + 1].from;
      // To integer units from absolute positions; drop a stitch that lands on the same unit as the one before it.
      let stitches = [];
      const keep = [];
      let px = null, py = null, pc = -1;
      for (const [x, y, c, k] of out) {
        const ix = Math.round(x * UNITS_PER_MM), iy = Math.round(y * UNITS_PER_MM);
        if (c === CMD.STITCH && pc === CMD.STITCH && ix === px && iy === py) { if (k) keep[keep.length - 1] = true; continue; }
        stitches.push([ix, iy, c]);
        keep.push(!!k);
        px = ix; py = iy; pc = c;
      }
      // Stitches of 0.1 or 0.2 mm (and the ones the rounding makes) are needle holes that only pile thread up: take out the ones a straight run does not need.
      if (opt.shortMm > 0) stitches = dropShortStitches(stitches, keep, opt.shortMm * UNITS_PER_MM, opt.shortTol * UNITS_PER_MM, opt.shortMax * UNITS_PER_MM);
      return createPattern({ name, threads, stitches });
    },

    blocks,
    threads,
  };
}
