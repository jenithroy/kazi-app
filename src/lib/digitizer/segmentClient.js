/**
 * The page's door to the person finder (segment.worker.js). `findPerson(image)` says where the person is in a picture, as a region map for the tracer
 * (src/lib/embroidery/trace/regions.js): `{ regions: { width, height, data }, share, faceBox, ms }`, or null when there is no person in it, the picture
 * has transparency of its own (a cut-out sticker: the colours behind its see-through part mean nothing), or the finder could not run (offline, no Worker,
 * a blocked file): the picture is then traced as it is, so this never makes a conversion fail.
 *
 * The first call loads about 30 MB (the model and the wasm; the browser keeps them for a year) and takes several seconds; later ones about three.
 * One picture at a time, in the order asked. A picture that takes over a minute (three on the first load) is given up on and the worker is started afresh.
 */
const FIRST_LIMIT_MS = 180000;
const LIMIT_MS = 60000;

let worker = null;
let loaded = false; // the model has been used once: later pictures are quicker
let seq = 0;
let last = Promise.resolve();
const pending = new Map(); // id -> { resolve, timer }

function stop(why) {
  if (worker) { worker.terminate(); worker = null; }
  loaded = false;
  for (const [id, p] of pending) { clearTimeout(p.timer); pending.delete(id); p.resolve({ error: why }); }
}

function start() {
  if (worker) return worker;
  const mine = new Worker(new URL("./segment.worker.js", import.meta.url), { type: "module" });
  mine.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(data.id);
    p.resolve(data);
  };
  mine.onerror = (ev) => { if (worker === mine) stop(ev.message || "the person finder stopped"); };
  worker = mine;
  return mine;
}

/** A picture with real see-through parts says nothing about what lies behind them. */
function hasTransparency(image) {
  const d = image.data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] < 250) clear++;
  return clear * 4 >= Math.max(1, (d.length / 4) * 0.0005);
}

function run(image) {
  return new Promise((resolve) => {
    const id = ++seq;
    const timer = setTimeout(() => stop("the person finder took too long"), loaded ? LIMIT_MS : FIRST_LIMIT_MS);
    pending.set(id, { resolve, timer });
    try {
      start().postMessage({ id, image }, [image.data.buffer]);
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ error: String((err && err.message) || err) });
    }
  });
}

/**
 * @param {{ width, height, data }} image  RGBA, up to 1600 px on its long side. Its pixels are handed to the worker (the caller must not use them afterwards).
 * @returns {Promise<null | { regions: { width, height, data: Uint8Array }, share: object, faceBox: number[] | null, ms: object }>}
 */
export function findPerson(image) {
  if (typeof Worker === "undefined" || globalThis.__DIGITIZER_INLINE__ === true) return Promise.resolve(null);
  if (hasTransparency(image)) return Promise.resolve(null);
  const job = last.then(() => run(image));
  last = job.catch(() => {});
  return job.then((out) => {
    if (!out || out.error || !out.result || !out.result.person) return null;
    loaded = true;
    return { regions: { width: out.result.width, height: out.result.height, data: new Uint8Array(out.classes) }, share: out.result.share, faceBox: out.result.faceBox, ms: out.result.ms };
  });
}

/** Stop the worker (the page is closing, or the picture has gone). */
export function disposePersonFinder() {
  stop("closed");
}
