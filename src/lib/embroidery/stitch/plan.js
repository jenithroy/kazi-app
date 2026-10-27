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
};

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

  const push = (p, cmd) => { out.push([p[0], p[1], cmd]); };

  const stitchTo = (p, lock = false) => {
    if (cur && !lock && dist(cur, p) < opt.minStitch) return;
    if (cur) {
      const d = dist(cur, p);
      if (d > 1e-9) prevDir = [(p[0] - cur[0]) / d, (p[1] - cur[1]) / d];
    }
    push(p, CMD.STITCH);
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
    push(p, CMD.STITCH);
    started = true;
    prevDir = null;
    if (!opt.lock || !next) return;
    const d = dist(p, next);
    if (d < 1e-6) return;
    const u = [(next[0] - p[0]) / d, (next[1] - p[1]) / d];
    const q = [p[0] + u[0] * Math.min(opt.lockLen, d * 0.5), p[1] + u[1] * Math.min(opt.lockLen, d * 0.5)];
    stitchTo(q, true); stitchTo(p, true);
    prevDir = u;
  };

  const startAt = (p, next) => {
    push(p, CMD.JUMP);
    cur = p;
    tieIn(p, next);
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
    run(pts, { join = false, connectMax = 3 } = {}) {
      if (!pts || pts.length < 2) return;
      const p0 = pts[0];
      if (!cur || !started) {
        startAt(p0, pts[1]);
      } else {
        const gap = dist(cur, p0);
        if (gap < 0.15) {
          // already there
        } else if (join && gap <= connectMax) {
          stitchTo(p0);
        } else if (gap <= opt.trimOver) {
          // A short move: the thread is not cut, the frame just jumps and the needle comes down.
          push(p0, CMD.JUMP);
          cur = p0;
          push(p0, CMD.STITCH);
          prevDir = null;
        } else {
          tieOff();
          push(cur, CMD.TRIM);
          startAt(p0, pts[1]);
        }
      }
      for (let i = 1; i < pts.length; i++) stitchTo(pts[i]);
    },

    /** Where the needle is now ([x, y]) or null. */
    needle() { return cur; },

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
      const stitches = [];
      let px = null, py = null, pc = -1;
      for (const [x, y, c] of out) {
        const ix = Math.round(x * UNITS_PER_MM), iy = Math.round(y * UNITS_PER_MM);
        if (c === CMD.STITCH && pc === CMD.STITCH && ix === px && iy === py) continue;
        stitches.push([ix, iy, c]);
        px = ix; py = iy; pc = c;
      }
      return createPattern({ name, threads, stitches });
    },

    blocks,
    threads,
  };
}
