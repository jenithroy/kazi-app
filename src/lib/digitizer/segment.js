// segment.js - splits a portrait into background / hair / body skin / face skin / clothes / other, in the browser.
//
// Model : MediaPipe "selfie_multiclass_256x256" (Apache-2.0), run through @mediapipe/tasks-vision (Apache-2.0) on the
//         WASM/CPU delegate. The model sees a 256x256 picture, so its class boundaries are soft and 6 px wide on a
//         1600 px picture. This file snaps them to the picture's own edges: the six per-class confidence maps are
//         upsampled and filtered with a colour-guided filter (He et al., "Guided Image Filtering"; the fast variant that
//         is evaluated at low resolution and applied at full resolution), then the class with the highest value wins.
//
// Use   : import { segmentPicture, ready } from "./segment.js";
//         await ready({ ...file locations... });             // optional: warm up (downloads wasm + model once); rejects on failure
//         const r = await segmentPicture({ width, height, data /* Uint8ClampedArray RGBA */ });
//         r.classes[y * r.width + x]  ->  0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 other
//         segmentPicture NEVER throws: on any failure (offline, file missing, no WebGL2 ...) it resolves to
//         { person: false, classes: all 0, error: "why", ... }. When person is false the class map means nothing: ignore it.
//
// Files : the wasm loader + binary of tasks-vision and the .tflite model are NOT bundled; give their URLs, either as
//         wasmLoaderUrl + wasmBinaryUrl (Vite: `import u from "@mediapipe/tasks-vision/vision_wasm_internal.js?url"`)
//         or as wasmBase (a folder holding vision_wasm_internal.* and vision_wasm_module_internal.*). See REPORT.md.
//
// Workers: runs on the main thread, in a classic worker and in a module worker (tested, same output). The wasm loader must match
//          the thread: classic script loader (vision_wasm_internal.*) on the main thread / classic worker, ES-module loader
//          (vision_wasm_module_internal.*) in a module worker. With wasmBase this is picked automatically (isModuleWorker());
//          with wasmLoaderUrl/wasmBinaryUrl you pass the matching pair. A Vite worker bundle needs worker.format "es" (see REPORT.md).

export const CLASS = Object.freeze({ background: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, other: 5 });
export const CLASS_NAMES = Object.freeze(["background", "hair", "bodySkin", "faceSkin", "clothes", "other"]);
const NC = 6;
const MODEL_LABELS = ["background", "hair", "body-skin", "face-skin", "clothes", "others"]; // order inside the .tflite

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// ------------------------------------------------------------------------------------------------------ options
const FILES = {
  wasmBase: "/mediapipe/wasm", // folder with vision_wasm_internal.{js,wasm} and vision_wasm_module_internal.{js,wasm}
  wasmLoaderUrl: null, // or give the two files directly (wins over wasmBase)
  wasmBinaryUrl: null,
  modelUrl: "/mediapipe/selfie_multiclass_256x256.tflite",
  visionUrl: null, // URL of vision_bundle.mjs when there is no bundler (workers have no import maps); else the bare import is used
  vision: null, // or the already imported module namespace
  useModule: null, // true = ES-module wasm loader (needed in a MODULE worker); null = detect
  cacheName: "segmenter-model-v1", // Cache API bucket for the model file; change the name when the model file changes
  warm: true, // run one dummy inference inside ready() so the first real call is not slower
  fetchTimeoutMs: 180000, // giving up on the model download after this long
  loadTimeoutMs: 300000, // giving up on the whole of ready() (wasm download + compile + model) after this long
};

const DEFAULTS = {
  workSize: 384, // long side (px) of the picture the guided filter runs on (384 and 512 give the same result; 384 is a quarter faster)
  radius: 8, // guided-filter window radius at workSize
  eps: 2e-3, // guided-filter regulariser, colours in 0..1 (smaller = follows weaker edges, noisier)
  smoothGuide: true, // evaluate the filter on a 3x3-blurred copy of the full-size picture (fewer 1-px spikes along hairlines)
  modeFilter: true, // 3x3 majority filter on the result (removes 1-px spikes)
  refine: true, // false: plain bilinear upsample + argmax (what you would get without the refinement)
  minIsland: 0.0003, // connected pieces smaller than this fraction of the picture are merged into their neighbours (0 = off)
  floater: 0.05, // separate foreground pieces smaller than this fraction of the biggest one and under 50% skin become background (0 = off)
  minFace: 0.015, // "person" when the biggest face-skin piece covers at least this fraction of the picture ...
  minFaceConf: 0.75, // ... and the model is at least this sure about its face pixels (people 0.88-0.90, bird/flower 0.55 and below)
  withRaw: false, // also return rawClasses = the unrefined bilinear version (for comparison only)
};

// ------------------------------------------------------------------------------------------------------ loading
let loading = null;
let engine = null; // { seg, vision, info }

function inWorker() {
  return typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope;
}
// importScripts() exists in every worker but throws a TypeError in a MODULE worker; calling it with no URL is a no-op elsewhere.
export function isModuleWorker() {
  if (!inWorker()) return false;
  try {
    // eslint-disable-next-line no-undef
    importScripts();
    return false;
  } catch (e) {
    return e instanceof TypeError;
  }
}

function looksLikeTflite(bytes) {
  // a flatbuffer with the file identifier "TFL3" at byte 4. An SPA host that answers a missing file with index.html would fail here.
  return bytes.length > 1e6 && bytes[4] === 0x54 && bytes[5] === 0x46 && bytes[6] === 0x4c && bytes[7] === 0x33;
}

function withTimeout(p, ms, what) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`segment.js: timed out ${what} after ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

async function fetchModel(url, cacheName, timeoutMs) {
  let cache = null;
  try {
    if (typeof caches !== "undefined") cache = await caches.open(cacheName); // undefined on plain http (not localhost)
  } catch {
    cache = null;
  }
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) {
        const bytes = new Uint8Array(await hit.arrayBuffer());
        if (looksLikeTflite(bytes)) return { bytes, fromCache: true };
        await cache.delete(url);
      }
    } catch {
      /* fall through to the network */
    }
  }
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : 0;
  let bytes;
  try {
    const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
    if (!res.ok) throw new Error(`segment.js: model ${url} -> HTTP ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
  if (!looksLikeTflite(bytes)) throw new Error(`segment.js: ${url} is not a .tflite file (wrong path? an SPA host answers a missing file with index.html)`);
  if (cache) {
    try {
      await cache.put(url, new Response(bytes, { headers: { "content-type": "application/octet-stream" } }));
    } catch {
      /* quota or private mode: just do not cache */
    }
  }
  return { bytes, fromCache: false };
}

async function load(f) {
  const t0 = now();
  const vision = f.vision || (await (f.visionUrl ? import(/* @vite-ignore */ f.visionUrl) : import("@mediapipe/tasks-vision")));
  const t1 = now();
  const useModule = f.useModule ?? isModuleWorker();
  const filesetPromise =
    f.wasmLoaderUrl && f.wasmBinaryUrl
      ? Promise.resolve({ wasmLoaderPath: f.wasmLoaderUrl, wasmBinaryPath: f.wasmBinaryUrl })
      : vision.FilesetResolver.forVisionTasks(f.wasmBase, useModule);
  const [fileset, model] = await Promise.all([filesetPromise, fetchModel(f.modelUrl, f.cacheName, f.fetchTimeoutMs)]);
  const t2 = now();
  const seg = await vision.ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: model.bytes, delegate: "CPU" },
    runningMode: "IMAGE",
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  const t3 = now();
  const labels = seg.getLabels();
  if (labels.length && labels.join() !== MODEL_LABELS.join()) {
    seg.close();
    throw new Error("segment.js: unexpected model labels " + labels.join(",") + " (expected selfie_multiclass_256x256)");
  }
  const info = {
    vision: Math.round(t1 - t0),
    files: Math.round(t2 - t1), // wasm settings + model download (or cache read)
    create: Math.round(t3 - t2), // wasm compile + model load
    warm: 0,
    total: 0,
    modelFromCache: model.fromCache,
    modelBytes: model.bytes.length,
    moduleLoader: !!useModule,
  };
  engine = { seg, vision, info };
  if (f.warm) {
    const tw = now();
    runModel(new Uint8ClampedArray(256 * 256 * 4).fill(128)); // flat grey picture
    info.warm = Math.round(now() - tw);
  }
  info.total = Math.round(now() - t0);
  return info;
}

/** Loads the wasm + model (once). Resolves to timing info. Safe to call many times; options only count on the first call. */
export function ready(options = {}) {
  if (!loading) {
    const f = { ...FILES, ...options };
    loading = withTimeout(load(f), f.loadTimeoutMs, "loading the wasm and the model").catch((e) => {
      loading = null; // allow a retry after a network error
      throw e;
    });
  }
  return loading;
}

/** Frees the wasm instance. The next call to ready()/segmentPicture() loads it again. */
export function dispose() {
  if (engine) engine.seg.close();
  engine = null;
  loading = null;
}

// Runs the network on a 256x256 RGBA picture -> six Float32Array(w*h) confidence maps (softmax: they sum to 1).
function runModel(rgba256) {
  const result = engine.seg.segment(new ImageData(rgba256, 256, 256));
  try {
    const masks = result.confidenceMasks;
    if (!masks || masks.length !== NC) throw new Error("segment.js: the model returned " + (masks ? masks.length : 0) + " masks, expected 6");
    const w = masks[0].width;
    const h = masks[0].height;
    return { w, h, probs: masks.map((m) => Float32Array.from(m.getAsFloat32Array())) }; // copy: result.close() frees the originals
  } finally {
    result.close();
  }
}

// ------------------------------------------------------------------------------------------------------ resampling
// Per output index: which input indices and weights. Shrinking = exact area average, enlarging = linear.
function axisPlan(srcLen, dstLen) {
  const start = new Int32Array(dstLen);
  const count = new Int32Array(dstLen);
  const off = new Int32Array(dstLen);
  const wt = [];
  const scale = srcLen / dstLen;
  for (let i = 0; i < dstLen; i++) {
    off[i] = wt.length;
    if (scale >= 1) {
      const lo = i * scale;
      const hi = (i + 1) * scale;
      const j0 = Math.floor(lo);
      const j1 = Math.min(srcLen, Math.ceil(hi - 1e-9));
      let sum = 0;
      for (let j = j0; j < j1; j++) {
        const ov = Math.min(hi, j + 1) - Math.max(lo, j);
        wt.push(ov);
        sum += ov;
      }
      for (let k = off[i]; k < wt.length; k++) wt[k] /= sum;
      start[i] = j0;
      count[i] = j1 - j0;
    } else {
      const pos = (i + 0.5) * scale - 0.5;
      const fl = Math.floor(pos);
      const f = pos - fl;
      const a = Math.min(srcLen - 1, Math.max(0, fl));
      const b = Math.min(srcLen - 1, Math.max(0, fl + 1));
      start[i] = a;
      if (a === b) {
        count[i] = 1;
        wt.push(1);
      } else {
        count[i] = 2;
        wt.push(1 - f, f);
      }
    }
  }
  return { start, count, off, w: Float32Array.from(wt) };
}

// RGBA (opaque or not) -> Float32Array(dw*dh*3), channel values 0..255. Transparent pixels are laid over white.
function resizeRGB(rgba, sw, sh, dw, dh) {
  let data = rgba;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      opaque = false;
      break;
    }
  }
  if (!opaque) {
    data = new Uint8ClampedArray(rgba.length);
    for (let i = 0; i < rgba.length; i += 4) {
      const a = rgba[i + 3] / 255;
      data[i] = rgba[i] * a + 255 * (1 - a);
      data[i + 1] = rgba[i + 1] * a + 255 * (1 - a);
      data[i + 2] = rgba[i + 2] * a + 255 * (1 - a);
      data[i + 3] = 255;
    }
  }
  const px = axisPlan(sw, dw);
  const py = axisPlan(sh, dh);
  const tmp = new Float32Array(sh * dw * 3);
  for (let y = 0; y < sh; y++) {
    const row = y * sw * 4;
    let t = y * dw * 3;
    for (let x = 0; x < dw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let p = row + px.start[x] * 4;
      const o = px.off[x];
      const c = px.count[x];
      for (let k = 0; k < c; k++, p += 4) {
        const w = px.w[o + k];
        r += w * data[p];
        g += w * data[p + 1];
        b += w * data[p + 2];
      }
      tmp[t++] = r;
      tmp[t++] = g;
      tmp[t++] = b;
    }
  }
  const out = new Float32Array(dw * dh * 3);
  const rowLen = dw * 3;
  for (let y = 0; y < dh; y++) {
    const o = py.off[y];
    const c = py.count[y];
    const ob = y * rowLen;
    for (let k = 0; k < c; k++) {
      const w = py.w[o + k];
      const ib = (py.start[y] + k) * rowLen;
      for (let i = 0; i < rowLen; i++) out[ob + i] += w * tmp[ib + i];
    }
  }
  return out;
}

// Bilinear enlargement of one plane (pixel-centre convention, same as the model's own resize).
function bilinearPlane(src, sw, sh, dw, dh, dst) {
  const x0 = new Int32Array(dw);
  const x1 = new Int32Array(dw);
  const fx = new Float32Array(dw);
  for (let x = 0; x < dw; x++) {
    const pos = ((x + 0.5) * sw) / dw - 0.5;
    const fl = Math.floor(pos);
    fx[x] = pos - fl;
    x0[x] = Math.min(sw - 1, Math.max(0, fl));
    x1[x] = Math.min(sw - 1, Math.max(0, fl + 1));
  }
  for (let y = 0; y < dh; y++) {
    const pos = ((y + 0.5) * sh) / dh - 0.5;
    const fl = Math.floor(pos);
    const fy = pos - fl;
    const ra = Math.min(sh - 1, Math.max(0, fl)) * sw;
    const rb = Math.min(sh - 1, Math.max(0, fl + 1)) * sw;
    const ob = y * dw;
    for (let x = 0; x < dw; x++) {
      const a = src[ra + x0[x]] * (1 - fx[x]) + src[ra + x1[x]] * fx[x];
      const b = src[rb + x0[x]] * (1 - fx[x]) + src[rb + x1[x]] * fx[x];
      dst[ob + x] = a * (1 - fy) + b * fy;
    }
  }
  return dst;
}

// ------------------------------------------------------------------------------------------------------ guided filter
function makeBox(w, h, r) {
  const tmp = new Float32Array(w * h);
  const col = new Float64Array(w);
  const invX = new Float32Array(w);
  const invY = new Float32Array(h);
  for (let x = 0; x < w; x++) invX[x] = 1 / (Math.min(w - 1, x + r) - Math.max(0, x - r) + 1);
  for (let y = 0; y < h; y++) invY[y] = 1 / (Math.min(h - 1, y + r) - Math.max(0, y - r) + 1);
  // dst = mean of src over the (2r+1)^2 window, clipped at the borders (so edges are averaged over fewer pixels)
  return function box(src, dst) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let s = 0;
      const hi = Math.min(r, w - 1);
      for (let i = 0; i <= hi; i++) s += src[row + i];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = s;
        const add = x + r + 1;
        if (add < w) s += src[row + add];
        const sub = x - r;
        if (sub >= 0) s -= src[row + sub];
      }
    }
    col.fill(0);
    const hi = Math.min(r, h - 1);
    for (let y = 0; y <= hi; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) col[x] += tmp[o + x];
    }
    for (let y = 0; y < h; y++) {
      const o = y * w;
      const iy = invY[y];
      for (let x = 0; x < w; x++) dst[o + x] = col[x] * iy * invX[x];
      const add = y + r + 1;
      if (add < h) {
        const q = add * w;
        for (let x = 0; x < w; x++) col[x] += tmp[q + x];
      }
      const sub = y - r;
      if (sub >= 0) {
        const q = sub * w;
        for (let x = 0; x < w; x++) col[x] -= tmp[q + x];
      }
    }
    return dst;
  };
}

// Colour-guided filter of the classes 1..5 (class 0 follows from "the six sum to 1"). Output: per work pixel and class,
// four numbers (aR, aG, aB, b) so that  filtered value = aR*R + aG*G + aB*B + b  can be evaluated with ANY resolution of the guide.
function guidedCoefficients(guide, probs, mw, mh, w, h, radius, eps) {
  const n = w * h;
  const box = makeBox(w, h, radius);
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    R[i] = guide[j] / 255;
    G[i] = guide[j + 1] / 255;
    B[i] = guide[j + 2] / 255;
  }
  const mR = box(R, new Float32Array(n));
  const mG = box(G, new Float32Array(n));
  const mB = box(B, new Float32Array(n));
  const prod = new Float32Array(n);
  const mul = (u, v) => {
    for (let i = 0; i < n; i++) prod[i] = u[i] * v[i];
    return prod;
  };
  // covariance of the guide + eps on the diagonal, then its inverse (symmetric 3x3, six numbers per pixel)
  const sRR = box(mul(R, R), new Float32Array(n));
  const sRG = box(mul(R, G), new Float32Array(n));
  const sRB = box(mul(R, B), new Float32Array(n));
  const sGG = box(mul(G, G), new Float32Array(n));
  const sGB = box(mul(G, B), new Float32Array(n));
  const sBB = box(mul(B, B), new Float32Array(n));
  const i00 = new Float32Array(n);
  const i01 = new Float32Array(n);
  const i02 = new Float32Array(n);
  const i11 = new Float32Array(n);
  const i12 = new Float32Array(n);
  const i22 = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = sRR[i] - mR[i] * mR[i] + eps;
    const b = sRG[i] - mR[i] * mG[i];
    const c = sRB[i] - mR[i] * mB[i];
    const d = sGG[i] - mG[i] * mG[i] + eps;
    const e = sGB[i] - mG[i] * mB[i];
    const f = sBB[i] - mB[i] * mB[i] + eps;
    const det = a * (d * f - e * e) - b * (b * f - e * c) + c * (b * e - d * c);
    const id = 1 / det;
    i00[i] = (d * f - e * e) * id;
    i01[i] = (c * e - b * f) * id;
    i02[i] = (b * e - c * d) * id;
    i11[i] = (a * f - c * c) * id;
    i12[i] = (b * c - a * e) * id;
    i22[i] = (a * d - b * b) * id;
  }
  const coeff = new Float32Array(n * NC * 4);
  const p = new Float32Array(n);
  const mp = new Float32Array(n);
  const mpR = new Float32Array(n);
  const mpG = new Float32Array(n);
  const mpB = new Float32Array(n);
  const aR = new Float32Array(n);
  const aG = new Float32Array(n);
  const aB = new Float32Array(n);
  const bb = new Float32Array(n);
  const sa = new Float32Array(n);
  for (let c = 1; c < NC; c++) {
    bilinearPlane(probs[c], mw, mh, w, h, p);
    box(p, mp);
    box(mul(R, p), mpR);
    box(mul(G, p), mpG);
    box(mul(B, p), mpB);
    for (let i = 0; i < n; i++) {
      const cr = mpR[i] - mR[i] * mp[i];
      const cg = mpG[i] - mG[i] * mp[i];
      const cb = mpB[i] - mB[i] * mp[i];
      const ar = i00[i] * cr + i01[i] * cg + i02[i] * cb;
      const ag = i01[i] * cr + i11[i] * cg + i12[i] * cb;
      const ab = i02[i] * cr + i12[i] * cg + i22[i] * cb;
      aR[i] = ar;
      aG[i] = ag;
      aB[i] = ab;
      bb[i] = mp[i] - ar * mR[i] - ag * mG[i] - ab * mB[i];
    }
    for (const [src, k] of [[aR, 0], [aG, 1], [aB, 2], [bb, 3]]) {
      box(src, sa);
      const o = c * 4 + k;
      for (let i = 0, q = o; i < n; i++, q += NC * 4) coeff[q] = sa[i];
    }
  }
  // class 0 = 1 - the others (exact, the filter is linear)
  for (let i = 0, q = 0; i < n; i++, q += NC * 4) {
    let ar = 0;
    let ag = 0;
    let ab = 0;
    let b = 0;
    for (let c = 1; c < NC; c++) {
      ar += coeff[q + c * 4];
      ag += coeff[q + c * 4 + 1];
      ab += coeff[q + c * 4 + 2];
      b += coeff[q + c * 4 + 3];
    }
    coeff[q] = -ar;
    coeff[q + 1] = -ag;
    coeff[q + 2] = -ab;
    coeff[q + 3] = 1 - b;
  }
  return coeff;
}

// Evaluates the coefficients at full resolution with the full-resolution picture as guide, and picks the best class.
function applyCoefficients(coeff, w, h, rgb, W, H) {
  const labels = new Uint8Array(W * H);
  const x0 = new Int32Array(W);
  const x1 = new Int32Array(W);
  const fx = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const pos = ((x + 0.5) * w) / W - 0.5;
    const fl = Math.floor(pos);
    fx[x] = pos - fl;
    x0[x] = Math.min(w - 1, Math.max(0, fl));
    x1[x] = Math.min(w - 1, Math.max(0, fl + 1));
  }
  const S = NC * 4;
  for (let y = 0; y < H; y++) {
    const pos = ((y + 0.5) * h) / H - 0.5;
    const fl = Math.floor(pos);
    const fy = pos - fl;
    const ra = Math.min(h - 1, Math.max(0, fl)) * w;
    const rb = Math.min(h - 1, Math.max(0, fl + 1)) * w;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const p = i * 3;
      const r = rgb[p] / 255;
      const g = rgb[p + 1] / 255;
      const b = rgb[p + 2] / 255;
      const wx = fx[x];
      const w11 = fy * wx;
      const w10 = fy * (1 - wx);
      const w01 = (1 - fy) * wx;
      const w00 = (1 - fy) * (1 - wx);
      const q00 = (ra + x0[x]) * S;
      const q01 = (ra + x1[x]) * S;
      const q10 = (rb + x0[x]) * S;
      const q11 = (rb + x1[x]) * S;
      let best = -1e30;
      let bestC = 0;
      for (let c = 0; c < NC; c++) {
        const o = c * 4;
        const v =
          w00 * (coeff[q00 + o] * r + coeff[q00 + o + 1] * g + coeff[q00 + o + 2] * b + coeff[q00 + o + 3]) +
          w01 * (coeff[q01 + o] * r + coeff[q01 + o + 1] * g + coeff[q01 + o + 2] * b + coeff[q01 + o + 3]) +
          w10 * (coeff[q10 + o] * r + coeff[q10 + o + 1] * g + coeff[q10 + o + 2] * b + coeff[q10 + o + 3]) +
          w11 * (coeff[q11 + o] * r + coeff[q11 + o + 1] * g + coeff[q11 + o + 2] * b + coeff[q11 + o + 3]);
        if (v > best) {
          best = v;
          bestC = c;
        }
      }
      labels[i] = bestC;
    }
  }
  return labels;
}

// Plain bilinear enlargement of the six maps + argmax: what you get without the refinement.
function bilinearArgmax(probs, mw, mh, W, H) {
  const inter = new Float32Array(mw * mh * NC);
  for (let c = 0; c < NC; c++) for (let i = 0, q = c; i < mw * mh; i++, q += NC) inter[q] = probs[c][i];
  const labels = new Uint8Array(W * H);
  const x0 = new Int32Array(W);
  const x1 = new Int32Array(W);
  const fx = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const pos = ((x + 0.5) * mw) / W - 0.5;
    const fl = Math.floor(pos);
    fx[x] = pos - fl;
    x0[x] = Math.min(mw - 1, Math.max(0, fl));
    x1[x] = Math.min(mw - 1, Math.max(0, fl + 1));
  }
  for (let y = 0; y < H; y++) {
    const pos = ((y + 0.5) * mh) / H - 0.5;
    const fl = Math.floor(pos);
    const fy = pos - fl;
    const ra = Math.min(mh - 1, Math.max(0, fl)) * mw;
    const rb = Math.min(mh - 1, Math.max(0, fl + 1)) * mw;
    for (let x = 0; x < W; x++) {
      const wx = fx[x];
      const w00 = (1 - fy) * (1 - wx);
      const w01 = (1 - fy) * wx;
      const w10 = fy * (1 - wx);
      const w11 = fy * wx;
      const q00 = (ra + x0[x]) * NC;
      const q01 = (ra + x1[x]) * NC;
      const q10 = (rb + x0[x]) * NC;
      const q11 = (rb + x1[x]) * NC;
      let best = -1;
      let bestC = 0;
      for (let c = 0; c < NC; c++) {
        const v = w00 * inter[q00 + c] + w01 * inter[q01 + c] + w10 * inter[q10 + c] + w11 * inter[q11 + c];
        if (v > best) {
          best = v;
          bestC = c;
        }
      }
      labels[y * W + x] = bestC;
    }
  }
  return labels;
}

// ------------------------------------------------------------------------------------------------------ pieces
// 4-connected pieces of equal class. -> { comp: Int32Array (piece id per pixel), n, area, cls, x0, y0, x1, y1 (x1,y1 inclusive) }
function labelPieces(lab, W, H) {
  const N = W * H;
  const comp = new Int32Array(N);
  const parent = new Int32Array(N + 2); // worst case (a checkerboard) starts a provisional piece at every pixel
  let next = 1;
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const c = lab[i];
      const left = x > 0 && lab[i - 1] === c ? comp[i - 1] : 0;
      const up = y > 0 && lab[i - W] === c ? comp[i - W] : 0;
      if (!left && !up) {
        comp[i] = next;
        parent[next] = next;
        next++;
      } else if (left && !up) comp[i] = left;
      else if (!left && up) comp[i] = up;
      else {
        comp[i] = left;
        if (left !== up) {
          const ra = find(left);
          const rb = find(up);
          if (ra < rb) parent[rb] = ra;
          else if (rb < ra) parent[ra] = rb;
        }
      }
    }
  }
  const idOf = new Int32Array(next).fill(-1);
  let n = 0;
  for (let l = 1; l < next; l++) {
    const r = find(l);
    if (idOf[r] < 0) idOf[r] = n++;
    idOf[l] = idOf[r];
  }
  const area = new Int32Array(n);
  const cls = new Uint8Array(n);
  const x0 = new Int32Array(n).fill(1 << 30);
  const y0 = new Int32Array(n).fill(1 << 30);
  const x1 = new Int32Array(n).fill(-1);
  const y1 = new Int32Array(n).fill(-1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const id = idOf[comp[i]];
      comp[i] = id;
      area[id]++;
      cls[id] = lab[i];
      if (x < x0[id]) x0[id] = x;
      if (x > x1[id]) x1[id] = x;
      if (y < y0[id]) y0[id] = y;
      if (y > y1[id]) y1[id] = y;
    }
  }
  return { comp, n, area, cls, x0, y0, x1, y1 };
}

// Pieces smaller than minArea take the class of the big piece they touch most (4-neighbour votes).
function mergeSmallPieces(lab, W, H, pieces, minArea) {
  const { comp, n, area } = pieces;
  const small = new Uint8Array(n);
  let any = false;
  for (let id = 0; id < n; id++) {
    if (area[id] < minArea) {
      small[id] = 1;
      any = true;
    }
  }
  if (!any) return 0;
  const votes = new Int32Array(n * NC);
  const vote = (id, j) => {
    const o = comp[j];
    if (o !== id && !small[o]) votes[id * NC + lab[j]]++;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const id = comp[i];
      if (!small[id]) continue;
      if (x > 0) vote(id, i - 1);
      if (x < W - 1) vote(id, i + 1);
      if (y > 0) vote(id, i - W);
      if (y < H - 1) vote(id, i + W);
    }
  }
  const newCls = new Int16Array(n).fill(-1);
  let changed = 0;
  for (let id = 0; id < n; id++) {
    if (!small[id]) continue;
    let best = 0;
    let bc = -1;
    for (let c = 0; c < NC; c++) {
      const v = votes[id * NC + c];
      if (v > best) {
        best = v;
        bc = c;
      }
    }
    newCls[id] = bc;
    if (bc >= 0) changed++;
  }
  for (let i = 0; i < W * H; i++) {
    const nc = newCls[comp[i]];
    if (nc >= 0) lab[i] = nc;
  }
  return changed;
}


// Separate foreground pieces (any non-background class, 4-connected) that are tiny next to the main subject and are not skin
// (a "clothes" blob on a flag, a fleck of "other") become background. Hands and other skin pieces are kept.
function dropFloaters(lab, W, H, frac) {
  const n = W * H;
  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i++) fg[i] = lab[i] ? 1 : 0;
  const pieces = labelPieces(fg, W, H);
  let big = 0;
  for (let id = 0; id < pieces.n; id++) if (pieces.cls[id] === 1 && pieces.area[id] > big) big = pieces.area[id];
  const hist = new Int32Array(pieces.n * NC);
  for (let i = 0; i < n; i++) if (fg[i]) hist[pieces.comp[i] * NC + lab[i]]++;
  const drop = new Uint8Array(pieces.n);
  let any = 0;
  for (let id = 0; id < pieces.n; id++) {
    if (pieces.cls[id] !== 1 || pieces.area[id] >= big * frac) continue;
    const skin = (hist[id * NC + 2] + hist[id * NC + 3]) / pieces.area[id];
    if (skin < 0.5) {
      drop[id] = 1;
      any++;
    }
  }
  if (any) for (let i = 0; i < n; i++) if (drop[pieces.comp[i]]) lab[i] = 0;
  return any;
}

// 3x3 majority filter (a pixel changes only when another class holds strictly more of its 3x3 neighbourhood).
function modeFilter3(lab, W, H) {
  const src = lab.slice();
  const cnt = new Uint8Array(NC);
  let changed = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const c = src[i];
      if (src[i - 1] === c && src[i + 1] === c && src[i - W] === c && src[i + W] === c) continue; // 5 of 9 already agree
      cnt.fill(0);
      cnt[src[i - W - 1]]++;
      cnt[src[i - W]]++;
      cnt[src[i - W + 1]]++;
      cnt[src[i - 1]]++;
      cnt[c]++;
      cnt[src[i + 1]]++;
      cnt[src[i + W - 1]]++;
      cnt[src[i + W]]++;
      cnt[src[i + W + 1]]++;
      let best = c;
      let bn = cnt[c];
      for (let k = 0; k < NC; k++) {
        if (cnt[k] > bn) {
          bn = cnt[k];
          best = k;
        }
      }
      if (best !== c) {
        lab[i] = best;
        changed++;
      }
    }
  }
  return changed;
}

// RGBA -> RGB (transparent pixels over white), optionally 3x3 box blurred.
function flatRGB(rgba, W, H, blur) {
  const n = W * H;
  const out = new Uint8ClampedArray(n * 3);
  for (let i = 0, p = 0, q = 0; i < n; i++, p += 4, q += 3) {
    const a = rgba[p + 3];
    if (a === 255) {
      out[q] = rgba[p];
      out[q + 1] = rgba[p + 1];
      out[q + 2] = rgba[p + 2];
    } else {
      const t = a / 255;
      out[q] = rgba[p] * t + 255 * (1 - t);
      out[q + 1] = rgba[p + 1] * t + 255 * (1 - t);
      out[q + 2] = rgba[p + 2] * t + 255 * (1 - t);
    }
  }
  if (!blur) return out;
  const tmp = new Uint16Array(n * 3);
  for (let y = 0; y < H; y++) {
    const row = y * W * 3;
    for (let x = 0; x < W; x++) {
      const a = row + Math.max(0, x - 1) * 3;
      const b = row + x * 3;
      const c = row + Math.min(W - 1, x + 1) * 3;
      tmp[b] = out[a] + out[b] + out[c];
      tmp[b + 1] = out[a + 1] + out[b + 1] + out[c + 1];
      tmp[b + 2] = out[a + 2] + out[b + 2] + out[c + 2];
    }
  }
  for (let y = 0; y < H; y++) {
    const ra = Math.max(0, y - 1) * W * 3;
    const rb = y * W * 3;
    const rc = Math.min(H - 1, y + 1) * W * 3;
    for (let i = 0; i < W * 3; i++) out[rb + i] = (tmp[ra + i] + tmp[rb + i] + tmp[rc + i]) / 9;
  }
  return out;
}

// Mean model confidence over the pixels the model itself calls face skin (256x256 level, before any refinement).
function faceConfidence(probs, n) {
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    let b = 0;
    let bv = probs[0][i];
    for (let k = 1; k < NC; k++) {
      if (probs[k][i] > bv) {
        bv = probs[k][i];
        b = k;
      }
    }
    if (b === CLASS.faceSkin) {
      sum += bv;
      cnt++;
    }
  }
  return cnt ? sum / cnt : 0;
}

// ------------------------------------------------------------------------------------------------------ main entry
function splitOptions(opts) {
  const o = { ...DEFAULTS };
  const files = {};
  for (const k of Object.keys(opts || {})) (k in DEFAULTS ? o : files)[k] = opts[k];
  return { o, files };
}

function checkImage(image) {
  const { width: W, height: H, data } = image || {};
  if (!(W > 0 && H > 0) || !data || data.length < W * H * 4) throw new Error("segment.js: need { width, height, data: RGBA Uint8ClampedArray }");
}

/**
 * Step 1 only: the network. The picture is stretched to 256x256 (the model was trained on stretched frames and takes any
 * aspect ratio) and the six confidence maps come back at 256x256. -> { w, h, probs: Float32Array[6], ms }
 */
export async function segmentProbs(image, opts = {}) {
  checkImage(image);
  await ready(splitOptions(opts).files);
  const t0 = now();
  const small = resizeRGB(image.data, image.width, image.height, 256, 256);
  const rgba = new Uint8ClampedArray(256 * 256 * 4);
  for (let i = 0, j = 0, k = 0; i < 256 * 256; i++, j += 4, k += 3) {
    rgba[j] = small[k];
    rgba[j + 1] = small[k + 1];
    rgba[j + 2] = small[k + 2];
    rgba[j + 3] = 255;
  }
  const t1 = now();
  const m = runModel(rgba);
  return { ...m, ms: { resize: Math.round(t1 - t0), infer: Math.round(now() - t1) } };
}

/**
 * Step 2 only: snap the six maps to the picture's edges, pick a class per pixel, tidy up, measure.
 * Pure JavaScript (no wasm), so it can also be run and tuned in Node on saved maps.
 */
export function refineFromProbs(image, model, opts = {}) {
  checkImage(image);
  const { o } = splitOptions(opts);
  const { width: W, height: H, data } = image;
  const { w: mw, h: mh, probs } = model;
  const area = W * H;
  const d = {}; // timings per step
  let t = now();
  const lap = (k) => {
    const n = now();
    d[k] = Math.round(n - t);
    t = n;
  };

  // 1. class per pixel
  let classes;
  if (o.refine) {
    const s = Math.min(1, o.workSize / Math.max(W, H));
    const w = Math.max(16, Math.round(W * s));
    const h = Math.max(16, Math.round(H * s));
    const guide = resizeRGB(data, W, H, w, h);
    lap("guideResize");
    const coeff = guidedCoefficients(guide, probs, mw, mh, w, h, Math.max(1, Math.round(o.radius)), o.eps);
    lap("guide");
    const full = flatRGB(data, W, H, o.smoothGuide);
    lap("flatten");
    classes = applyCoefficients(coeff, w, h, full, W, H);
    lap("apply");
  } else {
    classes = bilinearArgmax(probs, mw, mh, W, H);
    lap("apply");
  }
  const rawClasses = o.withRaw ? (o.refine ? bilinearArgmax(probs, mw, mh, W, H) : classes.slice()) : undefined;
  if (rawClasses) t = now(); // the comparison copy is not part of the cost
  if (o.modeFilter) modeFilter3(classes, W, H);
  lap("mode");

  // 2. pieces: find the faces, merge specks, drop floating blobs
  const pieces = labelPieces(classes, W, H);
  let faceArea = 0;
  for (let id = 0; id < pieces.n; id++) if (pieces.cls[id] === CLASS.faceSkin && pieces.area[id] > faceArea) faceArea = pieces.area[id];
  const faces = [];
  for (let id = 0; id < pieces.n; id++) {
    if (pieces.cls[id] !== CLASS.faceSkin || pieces.area[id] < faceArea * 0.15 || pieces.area[id] < area * 0.0005) continue;
    faces.push([pieces.x0[id], pieces.y0[id], pieces.x1[id] + 1, pieces.y1[id] + 1]); // x1,y1 exclusive
  }
  const faceBox = faces.length
    ? [Math.min(...faces.map((f) => f[0])), Math.min(...faces.map((f) => f[1])), Math.max(...faces.map((f) => f[2])), Math.max(...faces.map((f) => f[3]))]
    : null;
  const minArea = Math.round(o.minIsland * area);
  if (minArea > 1) mergeSmallPieces(classes, W, H, pieces, minArea);
  lap("pieces");
  if (o.floater > 0) dropFloaters(classes, W, H, o.floater);
  lap("floaters");

  // 3. numbers
  const counts = new Float64Array(NC);
  let sx0 = W;
  let sy0 = H;
  let sx1 = -1;
  let sy1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = classes[y * W + x];
      counts[c]++;
      if (c) {
        if (x < sx0) sx0 = x;
        if (x > sx1) sx1 = x;
        if (y < sy0) sy0 = y;
        sy1 = y;
      }
    }
  }
  const share = {
    hair: counts[1] / area,
    bodySkin: counts[2] / area,
    faceSkin: counts[3] / area,
    clothes: counts[4] / area,
    other: counts[5] / area,
    background: counts[0] / area,
  };
  const faceConf = faceConfidence(probs, mw * mh); // mean model confidence on its own face pixels (256x256 level, before any refinement)
  const out = {
    width: W,
    height: H,
    classes,
    person: faceArea / area >= o.minFace && faceConf >= o.minFaceConf,
    share,
    faceBox,
    faces,
    faceShare: faceArea / area, // biggest face-skin piece / picture (what "person" is decided on)
    faceConf,
    subjectBox: sx1 >= 0 ? [sx0, sy0, sx1 + 1, sy1 + 1] : null, // bounding box of everything that is not background
  };
  lap("stats");
  out.ms = { refine: Object.values(d).reduce((a, b) => a + b, 0), detail: d };
  if (rawClasses) out.rawClasses = rawClasses;
  return out;
}

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} image RGBA, any size (the Digitizer passes up to 1600 px)
 * @param {object} [opts] see DEFAULTS (+ the file options of ready() on the first call)
 * @returns {Promise<{width,height,classes:Uint8Array,person:boolean,share:object,faceBox:number[]|null,ms:{model:number,refine:number,total:number}}>}
 *   classes: width*height values 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 other.
 *   faceBox [x0,y0,x1,y1] in pixels, x1/y1 exclusive. When person is false the class map is not meaningful (animals and
 *   flowers get hair/clothes patches): ignore it.
 */
export async function segmentPicture(image, opts = {}) {
  const t0 = now();
  try {
    const model = await segmentProbs(image, opts);
    const t1 = now();
    const out = refineFromProbs(image, model, opts);
    const t2 = now();
    out.ms = { model: Math.round(t1 - t0), refine: Math.round(t2 - t1), total: Math.round(t2 - t0), detail: { ...model.ms, ...out.ms.detail } };
    if (opts.returnProbs) out.model = { w: model.w, h: model.h, probs: model.probs }; // debugging / tuning only
    return out;
  } catch (e) {
    // Never throws: offline, a missing/blocked wasm or model file, no WebGL2, out of memory ... all end here.
    // The caller treats it as "not a portrait": person is false, every pixel is background, `error` says why.
    // The next call tries to load again (ready() forgets a failed load).
    let W = image && image.width > 0 ? Math.floor(image.width) : 0;
    let H = image && image.height > 0 ? Math.floor(image.height) : 0;
    let classes;
    try {
      classes = new Uint8Array(W * H);
    } catch {
      W = 0;
      H = 0;
      classes = new Uint8Array(0);
    }
    return {
      width: W,
      height: H,
      classes,
      person: false,
      share: { hair: 0, bodySkin: 0, faceSkin: 0, clothes: 0, other: 0, background: W * H ? 1 : 0 },
      faceBox: null,
      faces: [],
      faceShare: 0,
      faceConf: 0,
      subjectBox: null,
      ms: { model: 0, refine: 0, total: Math.round(now() - t0), detail: {} },
      error: e && e.message ? e.message : e && e.target && e.target.src ? "could not load " + e.target.src : String(e),
    };
  }
}
