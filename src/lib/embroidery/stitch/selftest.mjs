/**
 * Checks for the stitch engine. Run with `node src/lib/embroidery/stitch/selftest.mjs` (plain node, no browser, no files).
 * It draws shapes in code (discs, rings, a U, a star, strokes shaped like letters), makes stitches for them and checks what
 * must always be true: the area is covered, no number is NaN, no stitch is too long, the colours come in the right order,
 * and the same input gives the same stitches.
 */
import { generate } from "./engine.js";
import { tatamiFillShape } from "./fill.js";
import { satinIsland, lineIsland } from "./satin.js";
import { curveRun } from "./path.js";
import { coverageOf } from "./quality.js";
import { CMD, patternStats } from "../pattern.js";
import { unionShapes, intersectRings, offsetRings, prepareShape, intersectPrepared } from "../geometry/clip.js";
import { islandsOf, nearPairs, ringArea } from "../geometry/poly.js";
import { overlappingPairs } from "./overlap.js";

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

// 5c. What the lettering and picture work relies on: satin dense enough to look solid, a sensible order for separate
// pieces, one warning (not dozens) for specks too small to sew, and a blob is filled, not fanned out as satin.
{
  const bar = rect(-12, -0.9, 24, 1.8);
  const res = generate({ objects: [{ id: "bar", rings: [bar], fill: { type: "auto", color: "#112233" } }] }, {});
  check("a 1.8 mm wide strip is sewn as satin", res.info.some((i) => i.kind === "satin"));
  const is = islandsOf([bar])[0];
  const sat = satinIsland([is.outer, ...is.holes], { spacing: 0.3 });
  const tops = sat ? sat.tops[0] : [];
  const gaps = [];
  for (let k = 0; k + 2 < tops.length; k++) gaps.push(Math.hypot(tops[k][0] - tops[k + 2][0], tops[k][1] - tops[k + 2][1]));
  gaps.sort((p, q) => p - q);
  const median = gaps.length ? gaps[gaps.length >> 1] : 99;
  check("satin rows 0.3 mm apart put the needle holes on one edge about 0.6 mm apart", median > 0.5 && median < 0.7, median.toFixed(2));
  if (sat) {
    const cov = coverageOf(sat.tops, [is.outer], { threadMm: 0.45 });
    check("that satin covers the strip when the thread is 0.45 mm wide", cov.covered > 0.93, JSON.stringify(cov));
  }

  // Six squares given in a scrambled order along a line are sewn left to right (no long hop left for the end).
  const xs = [30, -30, 0, 60, -60, 90];
  const row = generate({ objects: [{ id: "row", rings: xs.map((x) => rect(x - 3, -3, 6, 6)), fill: { type: "tatami", color: "#445566" } }] }, {});
  const seen = [];
  for (const [x, , c] of row.pattern.stitches) {
    if (c !== CMD.STITCH) continue;
    const at = xs.find((cx) => Math.abs(x / 10 - cx) <= 3.6); // which square this stitch is in
    if (at !== undefined && seen[seen.length - 1] !== at) seen.push(at);
  }
  const increasing = seen.every((v, i) => i === 0 || v > seen[i - 1]);
  check("separate squares are sewn from the left, nearest next", increasing && seen.length === 6, seen.join(" "));

  // Specks too small to sew come back as ONE warning with their number.
  const dots = Array.from({ length: 12 }, (_, i) => rect(-20 + i * 3, 10, 0.5, 0.5));
  const dotted = generate({ objects: [{ id: "d", rings: [rect(-10, -10, 20, 12), ...dots], fill: { type: "tatami", color: "#778899" } }] }, {});
  const tiny = dotted.warnings.filter((w) => w.kind === "tiny");
  check("twelve specks too small to sew give one warning", tiny.length === 1 && /12 specks/.test(tiny[0].message), tiny.map((w) => w.message).join(" | "));

  // A blob is not a stroke: it is filled, never fanned out as satin.
  const blob = generate({ objects: [{ id: "blob", rings: [circle(0, 0, 4.5, 48)], fill: { type: "auto", color: "#aa5500" } }] }, {});
  check("a 9 mm blob is filled, not satin", blob.info.every((i) => i.kind !== "satin"));
}

// 5d. Lines thinner than a satin column can be (a hairline, small lettering, the lines of line art) are sewn as ONE line of bean stitch
// along their middle, as thin as the drawing: satin bunches up under a millimetre, and closes the holes of small letters.
{
  const sew = (rings) => generate({ objects: [{ id: "x", rings, fill: { type: "auto", color: "#202020" } }] }, {});
  const on = (res) => res.pattern.stitches.filter((s) => s[2] === CMD.STITCH).map((s) => [s[0] / 10, s[1] / 10]);
  const hair = sew([rect(-10, -0.25, 20, 0.5)]);
  check("a 0.5 mm wide line is sewn as a line of stitches", hair.info.length === 1 && hair.info[0].kind === "line", JSON.stringify(hair.info.map((i) => `${i.kind} ${i.why}`)));
  const hp = on(hair);
  check("its stitches lie along the middle of the line and run its whole length", hp.length > 20 && hp.every((q) => Math.abs(q[1]) < 0.15) && Math.min(...hp.map((q) => q[0])) < -9.5 && Math.max(...hp.map((q) => q[0])) > 9.5);
  check("a hairline takes far fewer stitches than a satin column of the same length", hair.pattern.stitches.length < 60, String(hair.pattern.stitches.length));

  const ringLine = stroke([Array.from({ length: 73 }, (_, i) => [3 * Math.cos((i / 72) * 2 * Math.PI), 3 * Math.sin((i / 72) * 2 * Math.PI)])], 0.5);
  const loop = sew(ringLine);
  const radii = on(loop).map((q) => Math.hypot(q[0], q[1]));
  check("a thin ring of radius 3 mm is sewn as a loop that stays round", loop.info.some((i) => i.kind === "line") && radii.every((r) => Math.abs(r - 3) < 0.2), `${Math.min(...radii).toFixed(2)} to ${Math.max(...radii).toFixed(2)}`);

  check("a 2 mm wide stroke is still satin", sew([rect(-10, -1, 20, 2)]).info[0].kind === "satin");
  const mixed = unionShapes([stroke([[[0, -8], [0, 8]]], 2), stroke([[[0, -8], [4, -6], [6, -2], [4, 2], [0, 4]]], 0.5)]);
  check("a letter with a thick stem and a hairline is satin (it would lose its stem as a line)", sew(mixed).info.every((i) => i.kind !== "line"));
  check("a blob is not a line", lineIsland([circle(0, 0, 3, 48)]) === null);

  // The stitches of a curve follow it: short on a tight curve (a small circle stays round), as long as allowed on a straight line.
  const unit = Array.from({ length: 120 }, (_, i) => [Math.cos((i / 120) * 2 * Math.PI), Math.sin((i / 120) * 2 * Math.PI)]);
  const round = curveRun(unit, { len: 2, dev: 0.07, closed: true });
  let chord = 0;
  for (let i = 1; i < round.length; i++) chord = Math.max(chord, Math.hypot(round[i][0] - round[i - 1][0], round[i][1] - round[i - 1][1]));
  check("a running stitch round a 1 mm circle has stitches under 0.8 mm and closes the loop", chord < 0.8 && Math.hypot(round[0][0] - round.at(-1)[0], round[0][1] - round.at(-1)[1]) < 1e-9, `longest ${chord.toFixed(2)}`);
  check("on a straight 10 mm line the stitches are as long as allowed (2 mm)", curveRun(Array.from({ length: 51 }, (_, i) => [i * 0.2, 0]), { len: 2 }).length === 6);

  // When a letter is refused satin the engine says which check it failed (a K whose bend fans the stitches out too far).
  const K = stroke([[[-4, -10], [-4, 10]], [[-4, 1], [6, -10]], [[-4, 1], [6, 10]]], 3);
  const kRes = sew(K);
  check("a refused satin is explained by the check it failed", kRes.info.some((i) => /satin refused: .*mm apart on an edge/.test(i.why) || i.kind === "satin"), JSON.stringify(kRes.info.map((i) => i.why)));
}

// 5e. The fast ways of finding which shapes touch or overlap (a portrait has thousands of shapes: clipping every pair takes minutes) give
// the same answers as the exact ones. Shapes of every kind, some with holes, from a fixed seed.
{
  let seed = 7;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const scene = [];
  for (let i = 0; i < 40; i++) {
    const x = rnd() * 80, y = rnd() * 80, w = 3 + rnd() * 25, h = 3 + rnd() * 25;
    const kind = i % 4;
    if (kind === 0) scene.push([rect(x, y, w, h)]);
    else if (kind === 1) scene.push([circle(x + w / 2, y + h / 2, Math.min(w, h) / 2, 40)]);
    else if (kind === 2) scene.push([rect(x, y, w, h), rect(x + w * 0.3, y + h * 0.3, w * 0.4, h * 0.4)]); // with a hole
    else scene.push([circle(x + w / 2, y + h / 2, Math.min(w, h) / 2, 40), circle(x + w / 2, y + h / 2, Math.min(w, h) / 4, 40)]);
  }
  const area = (rings) => islandsOf(rings).reduce((a, is) => a + ringArea(is.outer) - is.holes.reduce((q, hh) => q + ringArea(hh), 0), 0);
  const exact = (i, j) => area(intersectRings(scene[i], scene[j]));

  const found = new Set(overlappingPairs(scene, 0.4).map(([i, j]) => `${i},${j}`));
  let missed = 0, spurious = 0, compared = 0;
  for (let i = 0; i < scene.length; i++) for (let j = i + 1; j < scene.length; j++) {
    const a = exact(i, j), has = found.has(`${i},${j}`);
    if (a > 0 || has) compared++;
    if (a > 0.7 && !has) missed++; // clearly over each other, not found
    if (a < 0.15 && has) spurious++; // clearly not, found
  }
  check("the grid finds every pair of shapes that overlap clearly (and none that clearly do not)", missed === 0 && spurious === 0 && compared > 20, `missed ${missed}, spurious ${spurious}, compared ${compared}`);

  // "Near" means the OUTLINES come within the distance. A shape lying wholly inside another's filled area is not near by outline (in a
  // traced picture a shape inside another sits in its hole, so it touches the hole's outline and is found), so nested pairs are left out.
  const near = nearPairs(scene, 0.4);
  let lost = 0, checked = 0;
  for (let i = 0; i < scene.length; i++) for (let j = i + 1; j < scene.length; j++) {
    const both = area(intersectRings(scene[i], scene[j]));
    if (both > 0.99 * Math.min(area(scene[i]), area(scene[j]))) continue; // one inside the other
    const closer = area(intersectRings(offsetRings(scene[i], 0.35), scene[j])) > 0; // within 0.35 mm of each other
    if (closer) checked++;
    if (closer && !(near[i].includes(j) && near[j].includes(i))) lost++;
  }
  check("every pair of shapes whose outlines come within 0.35 mm is listed as near, both ways round", lost === 0 && checked > 10, `${lost} lost of ${checked}`);

  let worst = 0;
  for (let i = 0; i < scene.length; i += 3) for (let j = 0; j < scene.length; j += 5) {
    const a = area(intersectRings(scene[i], scene[j])), b = area(intersectPrepared(prepareShape(scene[i]), prepareShape(scene[j])));
    worst = Math.max(worst, Math.abs(a - b));
  }
  check("cutting both shapes to their shared box first gives the same overlap area (to 0.01 mm²)", worst < 0.01, `worst difference ${worst.toFixed(4)}`);
}

// 6. Same input, same stitches.
const b = generate(design, {});
check("deterministic", JSON.stringify(a.pattern.stitches) === JSON.stringify(b.pattern.stitches));

console.log(failed ? `${failed} FAILED` : "all stitch checks passed");
process.exit(failed ? 1 : 0);
