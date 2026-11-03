/**
 * The page's door to the engine. Jobs go to a Web Worker and come back as promises; a job that has been overtaken (a newer one
 * of the same `key` was sent) is thrown away, so the screen never shows an old answer after a new one. For a `key` only one
 * job is ever with the worker: a newer one waits its turn, and only the newest waits, so dragging a slider that starts a job
 * at every step costs one job in flight plus the last one, not one for every step.
 * A job that runs for over two minutes is given up on: the worker that has it is stopped (it may be stuck) and a fresh one starts
 * with the next job, so the page never waits for ever. The other worker, and the jobs it has, are left alone.
 * Where there is no Worker (the tests, very old browsers) the same functions run on the page's own thread.
 * There are two Workers: one makes stitches (`generate`), the other does everything else.
 *
 * Reading a picture: `trace` with a `keep` token leaves the tracer's answer in the worker (the page gets a summary of it), and
 * `shapes` makes the design's objects from that answer for the colours chosen (see engineCore.js). `release` lets answers go.
 * The outlines of a design go to the worker, and the shapes come back, as typed arrays (packRings.js): they are handed over, not copied.
 */
import { packObjects, unpackObjectsAsync } from "./packRings.js";

const JOB_LIMIT_MS = 120000;

export function createEngine({ limitMs = JOB_LIMIT_MS } = {}) {
  let worker = null; // reads pictures: it keeps the tracer's answers and makes the shapes from them
  let stitchWorker = null; // makes the stitches, so that a long stitch job never makes a colour switch wait behind it
  let seq = 0;
  const pending = new Map(); // id -> { resolve, reject, key, timer, side } for the jobs the workers have
  const latest = new Map(); // key -> the id of the newest job sent with it
  const lanes = new Map(); // key -> { busy, next, side } : whether a worker has a job of this key, and the one job waiting behind it
  let inline = null;

  const useInline = () => typeof Worker === "undefined" || globalThis.__DIGITIZER_INLINE__ === true;
  const stale = () => Object.assign(new Error("A newer job replaced this one."), { stale: true });

  /** Which of the two workers does this kind of job go to? */
  const sideOf = (type) => (type === "generate" ? "stitch" : "read");

  /** Stop one worker ("read" or "stitch") and fail everything that was waiting for it; the other goes on. The next job for it starts a fresh one. */
  function failSide(side, err) {
    if (side === "stitch") { if (stitchWorker) { stitchWorker.terminate(); stitchWorker = null; } }
    else if (worker) { worker.terminate(); worker = null; }
    for (const [id, p] of pending) {
      if (p.side !== side) continue;
      clearTimeout(p.timer);
      pending.delete(id);
      p.reject(err);
    }
    for (const [key, lane] of lanes) {
      if (lane.side !== side) continue;
      if (lane.next) lane.next.reject(err);
      lanes.delete(key);
    }
  }
  const failAll = (err) => { failSide("read", err); failSide("stitch", err); };

  /** Give the worker a job (the lane of its key, if it has one, is busy until the answer is back). */
  function post(job) {
    const side = sideOf(job.type);
    const timer = setTimeout(() => failSide(side, new Error("That took too long and was stopped. Try a smaller picture, or fewer, larger and less dense shapes.")), limitMs);
    pending.set(job.id, { resolve: job.resolve, reject: job.reject, key: job.key, timer, side });
    try {
      ensure(job.type).postMessage({ id: job.id, type: job.type, payload: job.payload }, job.transfer);
    } catch (err) {
      clearTimeout(timer);
      pending.delete(job.id);
      release(job.key);
      job.reject(err);
    }
  }

  /** The worker is done with a job of this key: start the one waiting behind it. */
  function release(key) {
    const lane = key && lanes.get(key);
    if (!lane) return;
    const next = lane.next;
    lane.next = null;
    lane.busy = !!next;
    if (next) post(next);
  }

  function ensure(type) {
    const stitches = type === "generate";
    if (stitches ? stitchWorker : worker) return stitches ? stitchWorker : worker;
    const mine = new Worker(new URL("./engine.worker.js", import.meta.url), { type: "module" });
    if (stitches) stitchWorker = mine; else worker = mine;
    mine.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error));
      else p.resolve(data.result);
      release(p.key);
    };
    mine.onerror = (ev) => {
      // A crash in a worker fails what was waiting for THAT worker (the other goes on); the next job for it starts a fresh one.
      if ((stitches ? stitchWorker : worker) === mine) failSide(stitches ? "stitch" : "read", new Error(ev.message || "The stitch engine stopped."));
    };
    return mine;
  }

  /** Let the worker forget tracer answers kept for the page (best effort: it forgets the oldest on its own). */
  function forget(tokens) {
    if (tokens.length) call("release", { tokens }).catch(() => {});
  }

  /**
   * Run a job. With `key`, an older job of that key still on its way is ignored (its promise rejects with { stale: true }).
   * With `pack`, the outlines of the `payload.design` go to a Worker as typed arrays (on the page's own thread the design is used as it is).
   */
  function call(type, payload, { transfer = [], key, pack = false } = {}) {
    const id = ++seq;
    if (key) latest.set(key, id);
    const overtaken = () => {
      if (!key || latest.get(key) === id) return false;
      if (payload && payload.keep != null) forget([payload.keep]); // an answer nobody will use must not stay in the worker
      return true;
    };
    const settle = (value) => (overtaken() ? Promise.reject(stale()) : Promise.resolve(value));

    if (useInline()) {
      inline = inline || import("./engineCore.js");
      return inline.then((core) => settle(core.run(type, payload).result));
    }
    if (type === "release" && !worker) return Promise.resolve(true); // no worker yet: nothing is kept
    let sent = payload, handed = transfer;
    if (pack) {
      const packed = packObjects(payload.design.objects);
      sent = { design: { ...payload.design, objects: [] }, packed, options: payload.options };
      handed = [packed.ringCounts.buffer, packed.ringLens.buffer, packed.coords.buffer];
    }
    return new Promise((resolve, reject) => {
      const job = {
        id, type, payload: sent, transfer: handed, key,
        resolve: (v) => (overtaken() ? reject(stale()) : resolve(v)),
        reject,
      };
      if (!key) { post(job); return; }
      let lane = lanes.get(key);
      if (!lane) { lane = { busy: false, next: null, side: sideOf(type) }; lanes.set(key, lane); }
      if (!lane.busy) { lane.busy = true; post(job); return; }
      if (lane.next) lane.next.reject(stale()); // an older job that never got to start
      lane.next = job;
    });
  }

  return {
    generate: (design, options) => call("generate", { design, options }, { key: "generate", pack: true }),
    /**
     * `key` names what the trace is for (the picture, or one text object), so tracing one does not throw away another's answer.
     * `keep` (a token the caller makes up) leaves the answer in the worker for `shapes` and returns a summary of it without the outlines.
     */
    trace: (image, options, key = "trace", keep) => call("trace", { image, options, keep }, { transfer: [image.data.buffer], key }),
    /**
     * The design's objects made from a kept tracer answer: { objects, palette, rank, details } (rank: [colour, place] pairs; details: how many fine lines and
     * dots went in, or null), or { gone: true } when the worker no longer has the answer.
     * job: { token, skip, include, snap, fabric, originX, originY, mmPerPx, before, fresh, maxColors, detailThick } (see convert.js objectsFromTrace).
     */
    shapes: async (job) => {
      const out = await call("shapes", job, { key: "shapes" });
      if (out.gone) return out;
      return { objects: await unpackObjectsAsync(out.packed), palette: out.palette, rank: out.rank, details: out.details || null };
    },
    release: (tokens) => forget(tokens),
    quantize: (image, options) => call("quantize", { image, options }, { transfer: [image.data.buffer], key: "quantize" }),
    dispose() { failAll(Object.assign(new Error("closed"), { stale: true })); },
  };
}
