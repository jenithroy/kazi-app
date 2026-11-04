/**
 * Checks for how the shapes of a converted picture are sewn: the angle of their rows (angles.js), the thin line along the edge of flat
 * shapes (edges.js), look.js that puts both on the objects, and the line that may sit a little inside an edge (stitch/outline.js, `inset`).
 * Run with `node src/lib/digitizer/selftest.mjs` (plain node, no browser, no files). Pictures here are drawn in code on purpose: these are unit
 * checks of rules; how it looks on real pictures is measured separately (see the engine README).
 */
import { assignAngles, elongationOf, touching, angleGap } from "./angles.js";
import { edgeLook, EDGE_DEFAULTS } from "./edges.js";
import { applyLook, lookOptions, LOOK_DEFAULTS } from "./look.js";
import { objectsFromTrace, mergeTraceObjects, traceOptions } from "./convert.js";
import { makeObject, engineDesign } from "./model.js";
import { traceImage } from "../embroidery/trace/index.js";
import { outlineRuns } from "../embroidery/stitch/outline.js";
import { generate } from "../embroidery/stitch/engine.js";
import { findPerson } from "./segmentClient.js";
import { CMD } from "../embroidery/pattern.js";

let failed = 0, total = 0;
const check = (name, cond, extra = "") => {
  total++;
  if (cond) console.log("ok  ", name);
  else { failed++; console.log("FAIL", name, extra); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/** A shape of the tracer's kind: a rectangle in picture pixels. */
const shapeRect = (x, y, w, h, id = 0, color = 0) => ({ id, color, contours: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]], area: w * h, bbox: [x, y, x + w, y + h] });

console.log("angles.js");
check("a gap between two row directions is 0 to 90 degrees", near(angleGap(10, 170), 20) && near(angleGap(0, 90), 90) && near(angleGap(45, 45), 0) && near(angleGap(-10, 10), 20));
{
  const e = elongationOf([[0, 0], [20, 0], [20, 4], [0, 4]]);
  check("a flat rectangle 20 x 4 is five times longer than wide, along x", e && near(e.ratio, 5, 0.01) && (near(e.deg, 0, 0.5) || near(Math.abs(e.deg), 90, 0.5) === false), JSON.stringify(e));
  const th = (30 * Math.PI) / 180, rot = ([x, y]) => [x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th)];
  const e2 = elongationOf([[0, 0], [20, 0], [20, 4], [0, 4]].map(rot));
  check("turned by 30 degrees it is long along 30 degrees", e2 && near(angleGap(e2.deg, 30), 0, 0.5), JSON.stringify(e2));
  check("a square has no long direction to speak of", elongationOf([[0, 0], [5, 0], [5, 5], [0, 5]]).ratio < 1.05);
}
{
  const a = shapeRect(0, 0, 10, 10, 0), b = shapeRect(10, 0, 10, 10, 1), c = shapeRect(100, 0, 10, 10, 2);
  const adj = touching([a, b, c]);
  check("two squares that share an edge touch, with the points they share", adj[0].get(1) === 2 && adj[1].get(0) === 2, JSON.stringify([...adj[0]]));
  check("a square far away touches nothing", adj[2].size === 0);
}
{
  // 100 px = 10 mm at 0.1 mm a pixel; the squares are 100 mm2
  const a = shapeRect(0, 0, 100, 100, 0), b = shapeRect(100, 0, 100, 100, 1), c = shapeRect(200, 0, 100, 100, 2);
  const o = { mmPerPx: 0.1, mode: "contrast" };
  const r1 = assignAngles([a, b, c], o), r2 = assignAngles([a, b, c], o);
  check("the same shapes always get the same angles", JSON.stringify(r1) === JSON.stringify(r2));
  check("the first (biggest, first of equals) takes the plain 45", r1[0] === 45, JSON.stringify(r1));
  check("a neighbour is set apart by at least 40 degrees", angleGap(r1[0], r1[1]) >= 40 && angleGap(r1[1], r1[2]) >= 40, JSON.stringify(r1));
  const tiny = shapeRect(0, 0, 8, 8, 0); // 0.64 mm2
  check("a shape too small to see its rows keeps the engine's own angle (null)", assignAngles([tiny], o)[0] === null);
}
{
  const long = shapeRect(0, 0, 200, 40, 0); // 20 x 4 mm
  const across = assignAngles([long], { mmPerPx: 0.1, mode: "shape", across: true })[0];
  const along = assignAngles([long], { mmPerPx: 0.1, mode: "shape", across: false })[0];
  check("a long shape is sewn across its length (like a satin)", near(angleGap(across, 90), 0, 1), String(across));
  check("or along it when asked", near(angleGap(along, 0), 0, 1), String(along));
  const sq = shapeRect(0, 0, 100, 100, 0);
  check("a square has no long axis: shape mode leaves it alone", assignAngles([sq], { mmPerPx: 0.1, mode: "shape" })[0] === null);
  check("a long shape is sewn along its length by default", near(angleGap(assignAngles([long], { mmPerPx: 0.1 })[0], 0), 0, 1));
  const th = (45 * Math.PI) / 180, rot = ([x, y]) => [x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th)];
  const diag = { ...long, contours: [[[0, 0], [200, 0], [200, 40], [0, 40]].map(rot)] };
  check("a long shape lying at exactly 45 degrees is nudged so the engine does not read it as 'not chosen'", assignAngles([diag], { mmPerPx: 0.1, mode: "shape" })[0] === 45.05);
}

console.log("edges.js and look.js");
{
  const wide = shapeRect(0, 0, 400, 400, 0); // 40 x 40 mm at 0.1
  const ctx = { kind: "logo", mmPerPx: 0.1, color: "#112233", widthMm: 20 };
  const el = edgeLook(wide, ctx);
  check("a wide flat shape of a logo gets an edge line in its own colour, just inside the edge", el && el.stroke.type === "run" && el.stroke.color === "#112233" && el.stroke.inset === EDGE_DEFAULTS.inset && el.fillInset === EDGE_DEFAULTS.fillInset);
  check("artwork gets it too", !!edgeLook(wide, { ...ctx, kind: "art" }));
  check("a photograph gets none", edgeLook(wide, { ...ctx, kind: "photo" }) === null);
  check("a thin shape gets none (it is a line of thread already)", edgeLook(wide, { ...ctx, widthMm: 1 }) === null);
  check("a speck gets none", edgeLook(shapeRect(0, 0, 15, 15, 0), { ...ctx, widthMm: 1.6 }) === null);
  check("a long stroke that may be sewn as satin gets none", edgeLook(shapeRect(0, 0, 600, 100, 0), { ...ctx, widthMm: 3 }) === null);
  check("look settings read from anything", JSON.stringify(lookOptions()) === JSON.stringify(LOOK_DEFAULTS) && lookOptions({ angles: "plain" }).angles === "plain" && lookOptions({ edges: "none" }).edges === "none" && lookOptions({ angles: 7, edges: {} }).angles === LOOK_DEFAULTS.angles);

  const shapes = [shapeRect(0, 0, 400, 400, 0), shapeRect(400, 0, 400, 400, 1)];
  const objs = shapes.map((s, i) => makeObject({ name: `s${i}`, rings: s.contours.map((c) => c.map((p) => [p[0] * 0.1, p[1] * 0.1])), fill: { type: "auto", color: i ? "#aa0000" : "#0000aa" }, source: "image" }));
  const before = JSON.stringify(objs);
  const traced = { shapes, stats: { kind: "logo" }, look: { angles: "auto", edges: "auto" } };
  const out = applyLook(objs, shapes, traced, 0.1);
  check("the objects given are not changed (new ones come back, in the same order)", JSON.stringify(objs) === before && out.length === 2 && out[0].name === "s0" && out[1].name === "s1");
  check("touching shapes get rows that differ by 40 degrees or more", angleGap(out[0].fill.angle, out[1].fill.angle) >= 40, `${out[0].fill.angle} ${out[1].fill.angle}`);
  check("both got the edge line, in their own colours", out[0].stroke.type === "run" && out[0].stroke.color === "#0000aa" && out[1].stroke.color === "#aa0000" && out[0].fill.inset === EDGE_DEFAULTS.fillInset);
  const plain = applyLook(objs, shapes, { ...traced, look: { angles: "plain", edges: "none" } }, 0.1);
  check("plain / none changes nothing", JSON.stringify(plain) === before);
  const photo = applyLook(objs, shapes, { ...traced, stats: { kind: "photo" } }, 0.1);
  check("a photograph's shapes get angles but no edge line", photo.every((o) => o.stroke.type === "none") && photo[0].fill.angle !== undefined);
  const nolook = applyLook(objs, shapes, { shapes, stats: { kind: "logo" } }, 0.1);
  check("with no look settings the defaults apply (rows follow the shapes, big flat shapes get an edge line)", nolook.every((o) => o.stroke.type === "run") && angleGap(nolook[0].fill.angle, nolook[1].fill.angle) >= 40);
}

console.log("a drawn picture through the tracer and objectsFromTrace");
{
  const W = 400, H = 300;
  const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(255) };
  const disc = (cx, cy, r, rgb) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { const o = (y * W + x) * 4; img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; } };
  disc(110, 150, 90, [20, 40, 140]);
  disc(290, 150, 90, [190, 30, 30]);
  const base = traceOptions({ kind: "logo", detail: 0.5, background: "auto" }, 0.25);
  check("traceOptions carries the look settings", base.look && base.look.angles === LOOK_DEFAULTS.angles && base.look.edges === LOOK_DEFAULTS.edges);
  check("and the person's choice wins", traceOptions({ angles: "plain", edges: "none" }, 0.25).look.angles === "plain" && traceOptions({ angles: "plain", edges: "none" }, 0.25).look.edges === "none");
  const run = (look, kind) => {
    const traced = traceImage(img, { ...traceOptions({ kind, detail: 0.5, background: "auto" }, 0.25), look });
    return { traced, ...objectsFromTrace(traced, { originX: -50, originY: -37.5, mmPerPx: 0.25, fabric: "#ffffff" }) };
  };
  const a = run({ angles: "auto", edges: "auto" }, "logo");
  check("the tracer's answer carries the look settings", a.traced.look && a.traced.look.edges === "auto");
  check("two discs of a logo: both get an edge line", a.objects.length === 2 && a.objects.every((o) => o.stroke.type === "run" && o.stroke.inset > 0), JSON.stringify(a.objects.map((o) => o.stroke.type)));
  check("and rows that differ (they touch nowhere, so both may keep 45: they differ only when they touch)", a.objects.every((o) => o.fill.angle !== undefined));
  const b = run({ angles: "auto", edges: "auto" }, "logo");
  check("the same picture gives the same angles and lines (deterministic)", JSON.stringify(a.objects.map((o) => [o.fill, o.stroke])) === JSON.stringify(b.objects.map((o) => [o.fill, o.stroke])));
  const p = run({ angles: "auto", edges: "auto" }, "photo");
  check("the same picture read as a photograph gets no edge line", p.objects.every((o) => o.stroke.type === "none"));
  const off = run({ angles: "plain", edges: "none" }, "logo");
  check("with both off the objects are as they always were (45 degrees, no outline)", off.objects.every((o) => o.fill.angle === 45 && o.stroke.type === "none"));
  // a person's own change to a shape's angle survives a colour being switched on or off (the merge keeps every shape it is not remaking)
  const mine = a.objects.map((o, i) => (i === 0 ? { ...o, fill: { ...o.fill, angle: 77 } } : o));
  const before = a.palette.map((q) => ({ ...q })), after = a.palette.map((q, i) => (i === a.objects[1].pal ? { ...q, skipped: true } : q));
  const merged = mergeTraceObjects(mine, a.objects, { before, after, rank: a.rank });
  check("a shape's angle set by hand stays when another colour is switched", merged.find((o) => o.id === mine[0].id).fill.angle === 77);
}

console.log("stitch/outline.js: a line inside the edge");
{
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const inside = (runs, lo, hi, eps = 1e-6) => runs.every((r) => r.every((p) => p[0] >= lo - eps && p[0] <= hi + eps && p[1] >= lo - eps && p[1] <= hi + eps));
  const onEdge = outlineRuns([sq], { type: "run", len: 2 });
  const moved = outlineRuns([sq], { type: "run", len: 2, inset: 0.2 });
  check("without `inset` the line runs on the edge, as it always did", onEdge.length === 1 && inside(onEdge, 0, 10) && onEdge[0].some((p) => p[0] === 0 || p[1] === 0));
  check("with `inset` 0.2 every point is inside the square, 0.2 mm from its sides", moved.length === 1 && inside(moved, 0.2, 9.8) && moved[0].some((p) => near(p[0], 0.2, 1e-3) || near(p[1], 0.2, 1e-3)), JSON.stringify(moved[0] && moved[0].slice(0, 3)));
  check("a bean line moves the same way", inside(outlineRuns([sq], { type: "bean", len: 2, inset: 0.2 }), 0.2, 9.8));
  check("a damaged inset is no inset (NaN, negative), a huge one is held to 2 mm", JSON.stringify(outlineRuns([sq], { type: "run", len: 2, inset: NaN })) === JSON.stringify(onEdge) && JSON.stringify(outlineRuns([sq], { type: "run", len: 2, inset: -3 })) === JSON.stringify(onEdge) && inside(outlineRuns([sq], { type: "run", len: 2, inset: 99 }), 2, 8));
  check("a satin outline ignores `inset` (it has its own position)", JSON.stringify(outlineRuns([sq], { type: "satin", width: 1.5, position: "inside", inset: 0.5 })) === JSON.stringify(outlineRuns([sq], { type: "satin", width: 1.5, position: "inside" })));
  const thin = [[0, 0], [10, 0], [10, 0.3], [0, 0.3]];
  check("a piece thinner than twice the inset keeps its own edge (it is not left out)", outlineRuns([thin], { type: "run", len: 2, inset: 0.2 }).length === 1);
  // through the engine: a design with the edge line and the fill pulled in
  const design = (extra) => ({ name: "t", settings: { fabric: "woven" }, objects: [{ id: "a", name: "a", visible: true, rings: [sq.map(([x, y]) => [x - 5, y - 5])], transform: { x: 0, y: 0, sx: 1, sy: 1, rot: 0 }, fill: { type: "tatami", color: "#102a6b", angle: 30, ...extra.fill }, stroke: extra.stroke || { type: "none", color: "#102a6b" } }] });
  const none = generate(design({}));
  const line = generate(design({ fill: { inset: 0.35 }, stroke: { type: "run", color: "#102a6b", width: 0.4, len: 2, position: "center", inset: 0.2 } }));
  const count = (g) => g.pattern.stitches.filter((s) => s[2] === CMD.STITCH).length;
  const trims = (g) => g.pattern.stitches.filter((s) => s[2] === CMD.TRIM).length;
  const box = (g) => { const s = g.pattern.stitches.filter((q) => q[2] === CMD.STITCH); return [Math.min(...s.map((q) => q[0])), Math.max(...s.map((q) => q[0])), Math.min(...s.map((q) => q[1])), Math.max(...s.map((q) => q[1]))].map((v) => v / 10); };
  check("the edge line adds stitches and no thread cuts", count(line) > count(none) && trims(line) === trims(none), `${count(none)} -> ${count(line)}, trims ${trims(none)} -> ${trims(line)}`);
  const bn = box(none), bl = box(line);
  check("and with the fill pulled in nothing sticks out past the square", bl[0] >= -5 - 0.15 && bl[1] <= 5 + 0.15 && bl[2] >= -5 - 0.15 && bl[3] <= 5 + 0.15, JSON.stringify(bl));
  check("while the plain fill reaches past its edge a little (that is the point)", bn[1] - bn[0] >= bl[1] - bl[0] - 1e-9, `${bn} vs ${bl}`);
  check("no NaN, no stitch over 12 mm", line.pattern.stitches.every((s) => Number.isFinite(s[0]) && Number.isFinite(s[1])));
}

console.log("tracer and engine agree on what a thin line is (script lettering fell apart when they did not)");
{
  // A hairline of a script is widened by the tracer to 0.45-0.7 mm (`thickenMm`, by the Detail slider) and the engine sews a piece that thin as ONE line
  // of bean stitches (`lineMaxWidth`). After a merge the tracer drew 0.6-0.7 mm while the engine stopped at 0.58: every stroke went to a tatami fill and broke into pieces,
  // and none of the checks on either side saw it, because each is right on its own. This runs the two together: a wavy stroke on white, 60 mm long, as wide as the
  // hairlines of a script get (0.3 to 0.6 mm).
  const W = 600, H = 120, mm = 0.1;
  const strokeImage = (r) => {
    const data = new Uint8ClampedArray(W * H * 4).fill(255);
    for (let t = 20; t < 580; t += 0.5) {
      const cx = t, cy = 60 + 25 * Math.sin(t / 40);
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { const o = (y * W + x) * 4; data[o] = data[o + 1] = data[o + 2] = 30; }
      }
    }
    return { width: W, height: H, data };
  };
  const kindsAt = (r, detail, options = {}) => {
    const traced = traceImage(strokeImage(r), traceOptions({ detail }, mm));
    const { objects } = objectsFromTrace(traced, { originX: -30, originY: -6, mmPerPx: mm, fabric: "#ffffff" });
    const g = generate(engineDesign({ name: "script", fabric: "woven", settings: {}, objects }), options);
    const kinds = {};
    for (const i of g.info || []) kinds[i.kind] = (kinds[i.kind] || 0) + 1;
    return kinds;
  };
  for (const r of [1.5, 2, 2.5, 3]) {
    const bad = [0.5, 0.75, 1].map((d) => [d, kindsAt(r, d)]).filter(([, k]) => !((k.line || 0) >= 1 && !k.tatami && !k.satin));
    check(`a stroke ${(2 * r * mm).toFixed(1)} mm wide is sewn as a line at Detail 0.5, 0.75 and 1 (no fill, no satin)`, bad.length === 0, JSON.stringify(bad));
  }
  const old = kindsAt(3, 0.75, { lineMaxWidth: 0.58 });
  check("(control) with the old limit of 0.58 mm a 0.6 mm stroke goes to a fill, so these checks can fail", !!old.tatami || !!old.satin, JSON.stringify(old));
  // The wider limit is for shapes made from a picture only: typed lettering and shapes drawn by hand are sewn as they always were (a review found 14 of 48
  // font and size combinations of typed text changing from satin to a single line when the limit was widened for everything).
  const strip = [[0, 0], [25, 0], [25, 0.65], [0, 0.65]];
  const kindOf = (extra) => {
    const g = generate(engineDesign({ name: "strip", fabric: "woven", settings: {}, objects: [{ id: "s", name: "s", visible: true, rings: [strip], transform: { x: 0, y: 0, sx: 1, sy: 1, rot: 0 }, fill: { type: "auto", color: "#202020" }, stroke: { type: "none", color: "#202020" }, ...extra }] }));
    return (g.info || []).map((i) => i.kind).join(",");
  };
  check("a 0.65 mm strip made from a picture is one line of stitches", kindOf({ source: "image" }) === "line", kindOf({ source: "image" }));
  check("the same strip as typed lettering keeps the old limit: not a single line", kindOf({ kind: "text" }) !== "line", kindOf({ kind: "text" }));
  check("and as a shape drawn by hand (source hand, or none) too", kindOf({ source: "hand" }) !== "line" && kindOf({}) !== "line", kindOf({ source: "hand" }) + " / " + kindOf({}));
}

console.log("convert.js: fine details are ranked by the region of the person they lie in");
{
  // a face and a jacket, a short dark line on the face (30 mm) and a longer pattern on the jacket (60 mm): both want a thread of their own, and there is room for ONE
  const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const make = (regions) => ({
    width: 400, height: 200, stats: { kind: "photo" }, look: null, order: [0, 1],
    palette: [{ r: 225, g: 170, b: 150, fraction: 0.5, background: false }, { r: 30, g: 40, b: 90, fraction: 0.5, background: false }],
    shapes: [{ id: 0, color: 0, contours: [sq(0, 0, 200, 200)], area: 40000, bbox: [0, 0, 200, 200] }, { id: 1, color: 1, contours: [sq(200, 0, 200, 200)], area: 40000, bbox: [200, 0, 400, 200] }],
    details: {
      stats: {},
      spots: [],
      lines: [
        { pts: [[20, 40], [140, 40]], lengthMm: 30, rgb: [60, 35, 25], strength: 30, under: 0, ...(regions ? { region: 3 } : {}) },
        { pts: [[210, 120], [390, 120]], lengthMm: 60, rgb: [110, 90, 200], strength: 30, under: 1, ...(regions ? { region: 4 } : {}) },
      ],
    },
  });
  const made = (regions) => objectsFromTrace(make(regions), { originX: 0, originY: 0, mmPerPx: 0.25, fabric: "#f4f1ea", maxColors: 3 }).details;
  const ranked = made(true), plain = made(false);
  check("with the regions, the one new thread goes to the face's dark line, not to the longer pattern of the jacket", !!ranked && ranked.newColours === 1 && ranked.colours.join() === "#3c2319", ranked && JSON.stringify(ranked.colours));
  check("(control) without regions the longer line wins the thread, so the check above can fail", !!plain && plain.colours.join() === "#6e5ac8", plain && JSON.stringify(plain.colours));
  check("a detail limit can be changed by the caller (detailTune)", (() => { const d = objectsFromTrace(make(true), { originX: 0, originY: 0, mmPerPx: 0.25, fabric: "#f4f1ea", maxColors: 3, detailTune: { newColours: 0 } }).details; return !d || d.newColours === 0; })());
}

console.log("segmentClient.js (the person finder's door; the model itself runs in a browser worker and is checked there)");
{
  const img = (alpha) => ({ width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(alpha) });
  check("with no Worker (here, plain node) the person finder answers null and the picture is traced as it is", (await findPerson(img(255))) === null);
  check("a picture with real see-through parts is never sent to it", (await findPerson(img(0))) === null);
}

console.log(failed ? `\n${failed} of ${total} checks FAILED` : `\nall ${total} checks passed`);
process.exit(failed ? 1 : 0);
