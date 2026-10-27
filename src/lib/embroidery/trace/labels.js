/**
 * Cleaning the label map (one palette index per pixel) before the outlines are drawn:
 *  - specks (small connected pieces of one colour, including tiny holes) are given to the neighbouring colour,
 *  - slivers (parts of a colour thinner than the smallest sewable detail) are given to the neighbouring colour.
 *
 * "Given to the neighbouring colour" is done pixel by pixel from the outside in, and each pixel takes the neighbouring
 * colour that is closest to its own real colour, so a thin line between two colours is split by what it looks like.
 *
 * Labels are bytes: 0..14 palette entries, 254 = "being decided", 255 = outside the picture.
 */
import { rgbToLab } from "./color.js";

export const OUT = 255;
const UNSET = 254;
/** The `soft` value of a pixel painted by thickenKept: never produced by the soft-edge step (its largest is 251), and not 255 (pure). */
export const PAINTED = 254;

/**
 * Connected pieces of equal label (4-neighbour connectivity: pixels that only touch at a corner are separate pieces).
 * Returns { comp, count, area, label } where comp[i] is the piece number of pixel i (0-based, in raster order of first
 * appearance), area[c] its pixel count and label[c] its colour.
 */
export function connectedComponents(labels, w, h) {
  const n = w * h;
  const prov = new Int32Array(n);
  const parent = new Int32Array(n + 1);
  let next = 1;
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = labels[i];
      const left = x > 0 && labels[i - 1] === v ? prov[i - 1] : 0;
      const up = y > 0 && labels[i - w] === v ? prov[i - w] : 0;
      if (left === 0 && up === 0) {
        parent[next] = next;
        prov[i] = next++;
      } else if (left !== 0 && up !== 0) {
        const a = find(left);
        const b = find(up);
        if (a !== b) {
          if (a < b) parent[b] = a;
          else parent[a] = b;
        }
        prov[i] = a < b ? a : b;
      } else prov[i] = left !== 0 ? left : up;
    }
  }
  const ids = new Int32Array(next).fill(-1);
  let count = 0;
  const comp = prov;
  for (let i = 0; i < n; i++) {
    const r = find(prov[i]);
    let id = ids[r];
    if (id < 0) {
      id = count++;
      ids[r] = id;
    }
    comp[i] = id;
  }
  const area = new Int32Array(count);
  const label = new Uint8Array(count);
  for (let i = 0; i < n; i++) {
    area[comp[i]]++;
    label[comp[i]] = labels[i];
  }
  return { comp, count, area, label };
}

/**
 * Give every flagged pixel to a neighbouring colour. `flag[i] = 1` marks pixels to give away; the pixels that are not
 * flagged keep their label and are the sources. Works outward from the sources, one ring at a time. A pixel takes the
 * colour (among the already decided pixels next to it) whose palette entry is closest to the pixel's own colour.
 * `labels`, `soft` and `lab2` are changed in place (a given-away pixel becomes a pure pixel of its new colour).
 */
export function reassign(labels, flag, soft, lab2, rgb, w, h, palLab, K) {
  const n = w * h;
  const queue = new Int32Array(n);
  let qh = 0;
  let qt = 0;
  const queued = new Uint8Array(n);
  let todo = 0;
  for (let i = 0; i < n; i++) {
    if (flag[i]) {
      labels[i] = UNSET;
      todo++;
    }
  }
  if (todo === 0) return 0;
  const hasSource = (i, x, y) =>
    (x > 0 && labels[i - 1] < UNSET) || (x < w - 1 && labels[i + 1] < UNSET) || (y > 0 && labels[i - w] < UNSET) || (y < h - 1 && labels[i + w] < UNSET);
  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNSET) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (hasSource(i, x, y)) {
      queue[qt++] = i;
      queued[i] = 1;
    }
  }
  const lab = new Float64Array(3);
  let done = 0;
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % w;
    const y = (i - x) / w;
    // decide among the neighbouring decided labels
    let c0 = x > 0 ? labels[i - 1] : UNSET;
    let c1 = x < w - 1 ? labels[i + 1] : UNSET;
    let c2 = y > 0 ? labels[i - w] : UNSET;
    let c3 = y < h - 1 ? labels[i + w] : UNSET;
    rgbToLab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], lab, 0);
    let best = UNSET;
    let bd = Infinity;
    for (let k = 0; k < 4; k++) {
      const c = k === 0 ? c0 : k === 1 ? c1 : k === 2 ? c2 : c3;
      if (c >= UNSET) continue;
      const dl = lab[0] - palLab[c * 3];
      const da = lab[1] - palLab[c * 3 + 1];
      const db = lab[2] - palLab[c * 3 + 2];
      const d = dl * dl + da * da + db * db;
      if (d < bd) { bd = d; best = c; }
    }
    labels[i] = best;
    soft[i] = 255;
    lab2[i] = 255;
    done++;
    if (x > 0 && labels[i - 1] === UNSET && !queued[i - 1]) { queued[i - 1] = 1; queue[qt++] = i - 1; }
    if (x < w - 1 && labels[i + 1] === UNSET && !queued[i + 1]) { queued[i + 1] = 1; queue[qt++] = i + 1; }
    if (y > 0 && labels[i - w] === UNSET && !queued[i - w]) { queued[i - w] = 1; queue[qt++] = i - w; }
    if (y < h - 1 && labels[i + w] === UNSET && !queued[i + w]) { queued[i + w] = 1; queue[qt++] = i + w; }
  }
  // pieces with no decided pixel anywhere near (cannot happen unless the whole picture is flagged): keep them as label 0
  if (done < todo) for (let i = 0; i < n; i++) if (labels[i] === UNSET) { labels[i] = 0; soft[i] = 255; lab2[i] = 255; }
  return todo;
}

/**
 * Flag every connected piece smaller than `minArea` pixels. Returns the number of pixels flagged.
 * With `keep`, a small piece of an accent colour that is long (a stroke of lettering, a hairline) is not flagged but
 * recorded in keep.mask, to be made wide enough later (see thickenKept).
 */
export function flagSpecks(labels, w, h, minArea, flag, keep = null) {
  const cc = connectedComponents(labels, w, h);
  const small = new Uint8Array(cc.count);
  let any = 0;
  for (let c = 0; c < cc.count; c++) if (cc.area[c] < minArea) { small[c] = 1; any++; }
  if (!any) return 0;
  if (keep) {
    const n0 = w * h;
    const ext = new Int32Array(cc.count * 4);
    for (let c = 0; c < cc.count; c++) { ext[c * 4] = 1 << 30; ext[c * 4 + 1] = -1; ext[c * 4 + 2] = 1 << 30; ext[c * 4 + 3] = -1; }
    for (let i = 0; i < n0; i++) {
      const c = cc.comp[i];
      if (!small[c]) continue;
      const x = i % w;
      const y = (i - x) / w;
      if (x < ext[c * 4]) ext[c * 4] = x;
      if (x > ext[c * 4 + 1]) ext[c * 4 + 1] = x;
      if (y < ext[c * 4 + 2]) ext[c * 4 + 2] = y;
      if (y > ext[c * 4 + 3]) ext[c * 4 + 3] = y;
    }
    let kept = 0;
    for (let c = 0; c < cc.count; c++) {
      if (!small[c]) continue;
      const v = cc.label[c];
      // an accent colour always; any other colour when the piece lies inside the picture (lettering inside a badge)
      if (!keep.accent[v] && !(keep.solo && keep.solo[v] && ext[c * 4] > 0 && ext[c * 4 + 1] < w - 1 && ext[c * 4 + 2] > 0 && ext[c * 4 + 3] < h - 1)) continue;
      const len = Math.max(ext[c * 4 + 1] - ext[c * 4] + 1, ext[c * 4 + 3] - ext[c * 4 + 2] + 1);
      if (len >= keep.minExtent && (!keep.minAspect || (len * len) / cc.area[c] >= keep.minAspect)) { small[c] = 2; kept++; }
    }
    if (kept) {
      for (let i = 0; i < n0; i++) if (small[cc.comp[i]] === 2) { keep.mask[i] = 1; keep.lab[i] = labels[i]; }
      for (let c = 0; c < cc.count; c++) if (small[c] === 2) small[c] = 0;
    }
  }
  let flagged = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) if (small[cc.comp[i]] === 1) { flag[i] = 1; flagged++; }
  // never flag everything: if the whole picture is one tiny piece, leave it
  if (flagged === n) { flag.fill(0); return 0; }
  return flagged;
}

/**
 * Find the parts of every colour that are narrower than `2 * r` pixels ("slivers"), keeping tips and corners of wide
 * parts. A pixel is wide enough when some disc of radius r lies inside its colour and covers it (a morphological
 * opening by a disc). What is left over forms small pieces: a piece that is a corner or a tip of a wide part (small
 * compared with the length of the line along which it meets the wide part) is kept, a long thin stroke is flagged.
 * The picture edge is not an edge: parts reaching it are measured as if they went on.
 * Returns the number of pixels flagged.
 */
export function flagSlivers(labels, w, h, r, flag, tipRatio = 1.5, keep = null) {
  if (r < 0.75) return 0;
  const R = 2 * Math.ceil(r) + 2;
  const pw = w + 2 * R;
  const ph = h + 2 * R;
  const pad = new Uint8Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    const sy = Math.min(h - 1, Math.max(0, y - R));
    const srow = sy * w;
    const drow = y * pw;
    for (let x = 0; x < pw; x++) {
      const sx = Math.min(w - 1, Math.max(0, x - R));
      pad[drow + x] = labels[srow + sx];
    }
  }
  // 1) pixels within (r - 0.5) of a boundary pixel are "shallow": they cannot be the middle of a disc of radius r
  const coreD = r - 0.5;
  const offs = [];
  const rr = Math.floor(coreD);
  for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) if (dx * dx + dy * dy < coreD * coreD - 1e-9) offs.push(dy * pw + dx);
  const shallow = new Uint8Array(pw * ph);
  for (let y = rr + 1; y < ph - rr - 1; y++) {
    for (let x = rr + 1; x < pw - rr - 1; x++) {
      const i = y * pw + x;
      const v = pad[i];
      if (pad[i - 1] !== v || pad[i + 1] !== v || pad[i - pw] !== v || pad[i + pw] !== v) {
        for (let k = 0; k < offs.length; k++) shallow[i + offs[k]] = 1;
      }
    }
  }
  // 2) a pixel is covered by the opening when a deep pixel of its colour (a disc centre) lies within r of it
  const dOffs = [];
  const dr = Math.floor(r);
  for (let dy = -dr; dy <= dr; dy++) for (let dx = -dr; dx <= dr; dx++) if (dx * dx + dy * dy <= r * r + 1e-9) dOffs.push(dy * pw + dx);
  const thin = new Uint8Array(w * h);
  let thinCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pi = (y + R) * pw + (x + R);
      if (!shallow[pi]) continue;
      const v = pad[pi];
      let covered = false;
      for (let k = 0; k < dOffs.length; k++) {
        const q = pi + dOffs[k];
        if (!shallow[q] && pad[q] === v) { covered = true; break; }
      }
      if (!covered) { thin[y * w + x] = 1; thinCount++; }
    }
  }
  if (!thinCount) return 0;
  // 3) pieces of thin pixels. A piece that meets the wide part of its colour in ONE place is a tip or a corner: it is
  // kept when it is small next to the line it meets the wide part along. A piece that meets the wide part in two or
  // more separate places is a bridge (two letters touching at a point, a hairline joining two blobs): it is flagged.
  const stack = new Int32Array(4 * thinCount + 4);
  const seen = new Uint8Array(w * h);
  const list = new Int32Array(thinCount + 1);
  const iface = new Int32Array(4 * thinCount + 4);
  const mark = new Uint8Array(w * h);
  let flagged = 0;
  for (let s = 0; s < w * h; s++) {
    if (!thin[s] || seen[s]) continue;
    const v = labels[s];
    let sp = 0;
    let cnt = 0;
    let meet = 0;
    let nIface = 0;
    stack[sp++] = s;
    seen[s] = 1;
    while (sp) {
      const i = stack[--sp];
      list[cnt++] = i;
      const x = i % w;
      const y = (i - x) / w;
      for (let k = 0; k < 4; k++) {
        let q;
        if (k === 0) { if (x === 0) continue; q = i - 1; }
        else if (k === 1) { if (x === w - 1) continue; q = i + 1; }
        else if (k === 2) { if (y === 0) continue; q = i - w; }
        else { if (y === h - 1) continue; q = i + w; }
        if (labels[q] !== v) continue;
        if (thin[q]) {
          if (!seen[q]) { seen[q] = 1; stack[sp++] = q; }
        } else {
          meet++;
          if (!mark[q]) { mark[q] = 1; iface[nIface++] = q; }
        }
      }
    }
    // how many separate places does it meet the wide part? (meeting pixels within 2 pixels of each other are one place)
    let places = 0;
    for (let g = 0; g < nIface && places < 2; g++) {
      const p0 = iface[g];
      if (mark[p0] !== 1) continue;
      places++;
      let sp2 = 0;
      stack[sp2++] = p0;
      mark[p0] = 2;
      while (sp2) {
        const p = stack[--sp2];
        const px = p % w;
        const py = (p - px) / w;
        const ya = py < 2 ? 0 : py - 2;
        const yb = py + 2 >= h ? h - 1 : py + 2;
        const xa = px < 2 ? 0 : px - 2;
        const xb = px + 2 >= w ? w - 1 : px + 2;
        for (let yy = ya; yy <= yb; yy++) {
          for (let xx = xa; xx <= xb; xx++) {
            const q = yy * w + xx;
            if (mark[q] === 1) { mark[q] = 2; stack[sp2++] = q; }
          }
        }
      }
    }
    for (let g = 0; g < nIface; g++) mark[iface[g]] = 0;
    if (places >= 2 || meet === 0 || cnt / meet > tipRatio * r) {
      // a long thin piece of an accent colour is a stroke (a line of lettering, a hairline): keep it, to be widened later.
      // So is a whole letter of any other colour when it is thin all through and lies inside the picture (white lettering on a
      // dark badge: the white is the cloth, and thin letters of it would otherwise be filled in).
      if (keep && (keep.accent[v] || (keep.solo && keep.solo[v] && meet === 0))) {
        let x0 = w, x1 = -1, y0 = h, y1 = -1;
        for (let k = 0; k < cnt; k++) {
          const i = list[k];
          const x = i % w;
          const y = (i - x) / w;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
        const inside = x0 > 0 && y0 > 0 && x1 < w - 1 && y1 < h - 1;
        const ext = Math.max(x1 - x0 + 1, y1 - y0 + 1);
        if ((keep.accent[v] || inside) && ext >= keep.minExtent && (!keep.minAspect || (ext * ext) / cnt >= keep.minAspect)) {
          for (let k = 0; k < cnt; k++) { keep.mask[list[k]] = 1; keep.lab[list[k]] = v; }
          continue;
        }
      }
      for (let k = 0; k < cnt; k++) flag[list[k]] = 1;
      flagged += cnt;
    }
  }
  return flagged;
}


/**
 * Clean a label map: specks, then slivers, then specks again (removing slivers can leave crumbs).
 * `ctx` = { rgb, palLab, K, soft, lab2 }. `labels`, `soft`, `lab2` are changed in place.
 * Returns { specks, slivers } pixel counts, `widened` (pixels painted to thicken strokes), and `strokeCount` / `strokeMedian`:
 * how many thin strokes were kept and the median length (px) of them.
 */
export function cleanLabels(labels, w, h, ctx, minArea, minFeature, strokes = null) {
  const n = w * h;
  const flag = new Uint8Array(n);
  let specks = 0;
  let slivers = 0;
  const give = () => reassign(labels, flag, ctx.soft, ctx.lab2, ctx.rgb, w, h, ctx.palLab, ctx.K);
  // `strokes` = { accent: Uint8Array(256), minExtent: px } asks for long thin pieces of the accent colours to be kept and widened
  // `strokes.solo` (optional) names the colours whose thin pieces are kept too when the piece is a whole letter inside the picture
  // `strokes.minAspect` (optional): a kept piece must be this many times longer than it is wide (extent^2 / area): a photograph's
  // patches of colour are blobs, a stroke is long and thin
  const keep = strokes ? { accent: strokes.accent, solo: strokes.solo || null, minExtent: strokes.minExtent, minAspect: strokes.minAspect || 0, mask: new Uint8Array(n), lab: new Uint8Array(n) } : null;
  // specks first, then slivers; removing slivers can leave crumbs, so go round again until a round finds nothing
  for (let round = 0; round < 4; round++) {
    flag.fill(0);
    const sp = flagSpecks(labels, w, h, minArea, flag, keep);
    if (sp) { give(); specks += sp; }
    flag.fill(0);
    const sl = flagSlivers(labels, w, h, minFeature / 2, flag, 1.5, keep);
    if (sl) { give(); slivers += sl; }
    if (!sp && !sl) break;
    if (!sl) break; // only specks went: nothing new can have been made
  }
  let widened = 0;
  let strokeCount = 0;
  let strokeMedian = 0;
  if (keep) {
    // a kept pixel that a later round gave to another colour is no longer part of a stroke
    for (let i = 0; i < n; i++) if (keep.mask[i] && labels[i] !== keep.lab[i]) keep.mask[i] = 0;
    // how long (px, the longer side of its box) each kept stroke is: the size of the smallest lettering the picture holds
    const aux = new Uint8Array(n);
    for (let i = 0; i < n; i++) aux[i] = keep.mask[i] ? labels[i] : OUT;
    const cc = connectedComponents(aux, w, h);
    const box = new Int32Array(cc.count * 4);
    for (let c = 0; c < cc.count; c++) { box[c * 4] = 1 << 30; box[c * 4 + 1] = -1; box[c * 4 + 2] = 1 << 30; box[c * 4 + 3] = -1; }
    for (let i = 0; i < n; i++) {
      if (!keep.mask[i]) continue;
      const c = cc.comp[i];
      const x = i % w;
      const y = (i - x) / w;
      if (x < box[c * 4]) box[c * 4] = x;
      if (x > box[c * 4 + 1]) box[c * 4 + 1] = x;
      if (y < box[c * 4 + 2]) box[c * 4 + 2] = y;
      if (y > box[c * 4 + 3]) box[c * 4 + 3] = y;
    }
    const lens = [];
    for (let c = 0; c < cc.count; c++) if (cc.label[c] !== OUT && box[c * 4 + 1] >= 0) lens.push(Math.max(box[c * 4 + 1] - box[c * 4] + 1, box[c * 4 + 3] - box[c * 4 + 2] + 1));
    lens.sort((a, b) => a - b);
    strokeCount = lens.length;
    strokeMedian = lens.length ? lens[lens.length >> 1] : 0;
    widened = thickenKept(labels, ctx.soft, ctx.lab2, keep.mask, w, h, (strokes.targetPx || minFeature) / 2);
    if (widened) {
      // painting leaves a one- or two-pixel sliver here and there where a stroke grew up against another colour: take those away
      flag.fill(0);
      if (flagSlivers(labels, w, h, 1, flag, 1.5, null)) give();
    }
  }
  return { specks, slivers, widened, strokeCount, strokeMedian };
}

/**
 * Make the kept strokes as wide as the smallest sewable detail (2 * r pixels). Every kept stroke is a thin piece, so its
 * middle line is where its distance to the stroke's edge is greatest (locally: the arms of an E have their own lines); a
 * disc of radius r is painted on every pixel of that middle line, which leaves every part of the stroke at least 2 * r wide
 * and a stroke that was wide enough alone.
 * Painted pixels become pure pixels of the stroke's colour. Returns the number of pixels painted.
 */
export function thickenKept(labels, soft, lab2, mask, w, h, r) {
  const n = w * h;
  let any = false;
  for (let i = 0; i < n; i++) if (mask[i]) { any = true; break; }
  if (!any) return 0;
  // chamfer distance (3 per step, 4 on a diagonal) of every kept pixel to the nearest pixel that is not part of its stroke
  const same = (i, j) => mask[j] && labels[j] === labels[i];
  const d = new Int32Array(n);
  for (let i = 0; i < n; i++) d[i] = mask[i] ? 1 << 20 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, same(i, i - 1) ? d[i - 1] + 3 : 3);
      else v = Math.min(v, 3);
      if (y > 0) v = Math.min(v, same(i, i - w) ? d[i - w] + 3 : 3);
      else v = Math.min(v, 3);
      if (x > 0 && y > 0) v = Math.min(v, same(i, i - w - 1) ? d[i - w - 1] + 4 : 4);
      if (x < w - 1 && y > 0) v = Math.min(v, same(i, i - w + 1) ? d[i - w + 1] + 4 : 4);
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!mask[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, same(i, i + 1) ? d[i + 1] + 3 : 3);
      else v = Math.min(v, 3);
      if (y < h - 1) v = Math.min(v, same(i, i + w) ? d[i + w] + 3 : 3);
      else v = Math.min(v, 3);
      if (x < w - 1 && y < h - 1) v = Math.min(v, same(i, i + w + 1) ? d[i + w + 1] + 4 : 4);
      if (x > 0 && y < h - 1) v = Math.min(v, same(i, i + w - 1) ? d[i + w - 1] + 4 : 4);
      d[i] = v;
    }
  }
  const rr = Math.max(1, Math.ceil(r - 0.5));
  const offs = [];
  for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) if (dx * dx + dy * dy <= rr * rr + 0.5) offs.push([dx, dy]);
  let painted = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    // on the middle line: no neighbour of the same stroke is deeper (a letter's arms are thinner than its stem, each has its own line)
    let ridge = true;
    for (let dy = -1; dy <= 1 && ridge; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (same(i, j) && d[j] > d[i]) { ridge = false; break; }
      }
    }
    if (!ridge) continue;
    const v = labels[i];
    for (let k = 0; k < offs.length; k++) {
      const xx = x + offs[k][0];
      const yy = y + offs[k][1];
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (labels[j] === v) continue;
      if (mask[j]) continue; // another stroke's own pixels stay as they are
      labels[j] = v;
      soft[j] = PAINTED; // not 255: the picture's own pixel here is NOT this colour, so it must not be counted when the colour is measured
      lab2[j] = 255;
      painted++;
    }
  }
  return painted;
}
