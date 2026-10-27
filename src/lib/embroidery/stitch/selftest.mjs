/**
 * Checks for the stitch engine. Run with `node src/lib/embroidery/stitch/selftest.mjs` (plain node, no browser, no files).
 * It draws shapes in code (discs, rings, a U, a star, strokes shaped like letters), makes stitches for them and checks what
 * must always be true: the area is covered, no number is NaN, no stitch is too long, the colours come in the right order,
 * and the same input gives the same stitches.
 */
import { generate } from "./engine.js";
import { tatamiFillShape } from "./fill.js";
import { satinIsland } from "./satin.js";
import { coverageOf } from "./quality.js";
import { CMD, patternStats } from "../pattern.js";
import { unionShapes } from "../geometry/clip.js";
import { islandsOf } from "../geometry/poly.js";

let failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log("ok  ", name);
  else { failed++; console.log("FAIL", name, extra); }
};

const circle = (cx, cy, r, n = 72) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const star = (R, r, k = 5) => Array.from({ length: k * 2 }, (_, i) => { const a = (i / (k * 2)) * 2 * Math.PI - Math.PI / 2; const rr = i % 2 ? r : R; return [rr * Math.cos(a), rr * Math.sin(a)]; });
const stroke = (lines, width) => {
  const parts = [];
  for (const pl of lines) for (let i = 1; i < pl.length; i++) {
    const [x0, y0] = pl[i - 1], [x1, y1] = pl[i];
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * (width / 2), ny = (dx / l) * (width / 2);
    parts.push([[[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]]);
  }
  return unionShapes(parts);
};
const shapes = {
  disc: [circle(0, 0, 14)],
  ring: [circle(0, 0, 16), circle(0, 0, 8)],
  U: [[[-14, -14], [-6, -14], [-6, 6], [6, 6], [6, -14], [14, -14], [14, 14], [-14, 14]]],
  star: [star(16, 7)],
  frame: [rect(-16, -12, 32, 24), rect(-10, -6, 20, 12)],
};
const letters = {
  T: stroke([[[-8, -10], [8, -10]], [[0, -10], [0, 10]]], 2.4),
  H: stroke([[[-7, -10], [-7, 10]], [[7, -10], [7, 10]], [[-7, 0], [7, 0]]], 2.4),
  V: stroke([[[-9, -10], [0, 10], [9, -10]]], 2.4),
  O: stroke([Array.from({ length: 49 }, (_, i) => [8 * Math.cos((i / 48) * 2 * Math.PI), 8 * Math.sin((i / 48) * 2 * Math.PI)])], 2.4),
};

// 1. Fill: every part of a shape is covered, and thread does not spread past it.
for (const [name, rings] of Object.entries(shapes)) {
  const { paths } = tatamiFillShape(rings, { angle: 30 });
  const cov = coverageOf(paths, rings, { threadMm: 0.45 });
  check(`tatami covers ${name}`, cov.covered > 0.93 && cov.spill < 0.12, JSON.stringify(cov));
  let longest = 0, nan = false;
  for (const p of paths) for (let i = 0; i < p.length; i++) {
    if (!Number.isFinite(p[i][0]) || !Number.isFinite(p[i][1])) nan = true;
    if (i) longest = Math.max(longest, Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  }
  check(`tatami ${name} has finite points and no stitch over 8 mm`, !nan && longest < 8, `longest ${longest}`);
}

// 2. Satin follows strokes.
for (const [name, rings] of Object.entries(letters)) {
  const is = islandsOf(rings)[0];
  const shape = [is.outer, ...is.holes];
  const sat = satinIsland(shape, {});
  check(`satin found for ${name}`, !!sat);
  if (!sat) continue;
  const cov = coverageOf(sat.tops, shape, { threadMm: 0.6 });
  check(`satin covers ${name}`, cov.covered > 0.85 && cov.spill < 0.15, JSON.stringify(cov));
  check(`satin ${name} stitches are finite`, sat.paths.every((p) => p.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]))));
}

// 3. A whole design: colours, order, commands.
const design = {
  name: "selftest",
  objects: [
    { id: "base", name: "Base", rings: shapes.disc, fill: { type: "tatami", color: "#16255c" } },
    { id: "ring", name: "Ring", rings: shapes.ring.map((r) => r.map(([x, y]) => [x + 50, y])), fill: { type: "auto", color: "#f1c40f" } },
    { id: "t", name: "T", rings: letters.T.map((r) => r.map(([x, y]) => [x, y])), fill: { type: "auto", color: "#ffffff" } },
    { id: "star", name: "Star", rings: shapes.star.map((r) => r.map(([x, y]) => [x - 50, y])), fill: { type: "auto", color: "#c0392b" }, stroke: { type: "satin", width: 1.2, color: "#f1c40f", position: "outside" } },
  ],
};
const a = generate(design, {});
const st = patternStats(a.pattern);
const cmds = a.pattern.stitches.map((s) => s[2]);
check("pattern ends with END", cmds[cmds.length - 1] === CMD.END);
check("first record is a JUMP", cmds[0] === CMD.JUMP);
check("colour changes = colours - 1", st.colorChanges === a.pattern.threads.length - 1, `${st.colorChanges} vs ${a.pattern.threads.length}`);
check("all coordinates are whole numbers", a.pattern.stitches.every((s) => Number.isInteger(s[0]) && Number.isInteger(s[1])));
check("no stitch longer than 12 mm", st.longestStitchMm < 12, String(st.longestStitchMm));
check("no zero-length repeated stitches", a.pattern.stitches.every((s, i, arr) => i === 0 || s[2] !== CMD.STITCH || arr[i - 1][2] !== CMD.STITCH || s[0] !== arr[i - 1][0] || s[1] !== arr[i - 1][1]));
let afterTrim = true;
for (let i = 0; i < cmds.length; i++) if (cmds[i] === CMD.TRIM && cmds[i + 1] !== CMD.JUMP) afterTrim = false;
check("every TRIM is followed by a JUMP", afterTrim);
check("the base (first in the design) is sewn first", a.pattern.threads[0].b === 0x5c);

// 4. Overlapping objects keep the order they were drawn in, even when colours would sort better.
const stacked = {
  objects: [
    { id: "a", rings: [rect(-20, -20, 40, 40)], fill: { type: "tatami", color: "#ff0000" } },
    { id: "b", rings: [rect(-10, -10, 20, 20)], fill: { type: "tatami", color: "#0000ff" } },
    { id: "c", rings: [rect(-5, -5, 10, 10)], fill: { type: "tatami", color: "#ff0000" } },
  ],
};
const sres = generate(stacked, {});
check("overlapping objects: red, blue, red (three colour blocks)", sres.pattern.threads.length === 3 && sres.pattern.threads[0].r === 255 && sres.pattern.threads[1].b === 255, JSON.stringify(sres.pattern.threads));

// 5. Degenerate input does not crash or make NaN.
const odd = {
  objects: [
    { id: "line", rings: [[[0, 0], [10, 0], [20, 0]]], fill: { type: "auto", color: "#000000" } },
    { id: "dot", rings: [[[0, 0], [0.01, 0], [0, 0.01]]], fill: { type: "auto", color: "#000000" } },
    { id: "two", rings: [[[0, 0], [5, 5]]], fill: { type: "auto", color: "#000000" } },
    { id: "dups", rings: [[[0, 0], [0, 0], [10, 0], [10, 0], [10, 10], [0, 10], [0, 10]]], fill: { type: "auto", color: "#000000" } },
    { id: "huge", rings: [rect(-400, -400, 800, 800)], fill: { type: "tatami", color: "#000000", spacing: 4 } },
    { id: "empty", rings: [], fill: { type: "auto", color: "#000000" } },
  ],
};
let crashed = null, odds = null;
try { odds = generate(odd, {}); } catch (e) { crashed = e; }
check("odd shapes do not crash", !crashed, String(crashed && crashed.stack));
check("odd shapes give finite numbers", !odds || odds.pattern.stitches.every((s) => s.every(Number.isFinite)));

// 5b. Damaged settings and absurd sizes must not hang the engine.
{
  const bad = {
    objects: [
      { id: "a", rings: [rect(-10, -10, 20, 20)], fill: { type: "tatami", stitchLen: 0, spacing: 0, pullComp: NaN, angle: "x" } },
      { id: "b", rings: [rect(-10, -10, 20, 20)], fill: { type: "none" }, stroke: { type: "run", len: 0, width: -3 } },
      { id: "c", rings: [rect(-10, -10, 20, 20)], fill: { type: "satin", satin: { spacing: 0 } } },
      { id: "d", rings: [[[0, 0], [NaN, 3], [4, 4]]], fill: { type: "auto" } },
      { id: "e", rings: [[[0, 0], [1e12, 3], [4, 4]]], fill: { type: "auto" } },
      { id: "f", fill: { type: "auto" } },
    ],
  };
  const t0 = Date.now();
  let res = null, err = null;
  try { res = generate(bad, {}); } catch (e) { err = e; }
  check("damaged stitch settings do not hang or crash", !err && Date.now() - t0 < 5000, String(err && err.stack));
  check("they still give finite stitches", !!res && res.pattern.stitches.every((s) => s.every(Number.isFinite)));
  const big = { objects: [{ id: "big", rings: [rect(-3000, -3000, 6000, 6000)], fill: { type: "tatami" } }] };
  let refused = null;
  const t1 = Date.now();
  try { generate(big, {}); } catch (e) { refused = e; }
  check("a design of millions of stitches is refused at once, with a message", !!refused && /million stitches/.test(refused.message) && Date.now() - t1 < 2000, String(refused && refused.message));
  // The underlay chosen for an Auto shape carries over when the engine sews it as satin.
  const bar = (underlay) => generate({ objects: [{ id: "bar", rings: [rect(-15, -1.5, 30, 3)], fill: { type: "auto", underlay } }] }, {});
  const withIt = bar("auto"), without = bar("none");
  check("the fill underlay choice reaches a shape sewn as satin", withIt.info[0] && withIt.info[0].kind === "satin" && without.pattern.stitches.length < withIt.pattern.stitches.length, `${without.pattern.stitches.length} vs ${withIt.pattern.stitches.length}`);
  // The fabric's own underlay applies until the shape has one of its own: leather asks for none, a woven shirt gets one.
  const plate = (fabric) => generate({ settings: { fabric }, objects: [{ id: "p", rings: [rect(-15, -15, 30, 30)], fill: { type: "tatami", spacing: 0.4, stitchLen: 3.5, pullComp: 0.2 } }] }, {});
  const leather = plate("leather"), woven = plate("woven");
  check("leather sews a fill with no underlay and a woven shirt with one", woven.pattern.stitches.length - leather.pattern.stitches.length > 100, `${leather.pattern.stitches.length} vs ${woven.pattern.stitches.length}`);
}

// 6. Same input, same stitches.
const b = generate(design, {});
check("deterministic", JSON.stringify(a.pattern.stitches) === JSON.stringify(b.pattern.stitches));

console.log(failed ? `${failed} FAILED` : "all stitch checks passed");
process.exit(failed ? 1 : 0);
