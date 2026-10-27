/**
 * The page's door to the engine. Jobs go to a Web Worker and come back as promises; a job that has been overtaken (a newer one
 * of the same `key` was sent) is thrown away, so the screen never shows an old answer after a new one. For a `key` only one
 * job is ever with the worker: a newer one waits its turn, and only the newest waits, so dragging a slider that starts a job
 * at every step costs one job in flight plus the last one, not one for every step.
 * A job that runs for over a minute is given up on: the worker is stopped (it may be stuck) and a fresh one starts with the
 * next job, so the page never waits for ever.
 * Where there is no Worker (the tests, very old browsers) the same functions run on the page's own thread.
 */
const JOB_LIMIT_MS = 60000;

export function createEngine({ limitMs = JOB_LIMIT_MS } = {}) {
  let worker = null;
  let seq = 0;
  const pending = new Map(); // id -> { resolve, reject, key, timer } for the jobs the worker has
  const latest = new Map(); // key -> the id of the newest job sent with it
  const lanes = new Map(); // key -> { busy, next } : whether the worker has a job of this key, and the one job waiting behind it
  let inline = null;

  const useInline = () => typeof Worker === "undefined" || globalThis.__DIGITIZER_INLINE__ === true;
  const stale = () => Object.assign(new Error("A newer job replaced this one."), { stale: true });

  /** Stop the worker and fail everything that was waiting for it. The next job starts a fresh worker. */
  function failAll(err) {
    if (worker) { worker.terminate(); worker = null; }
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(err); }
    pending.clear();
    for (const lane of lanes.values()) { if (lane.next) lane.next.reject(err); }
    lanes.clear();
  }

  /** Give the worker a job (the lane of its key, if it has one, is busy until the answer is back). */
  function post(job) {
    const timer = setTimeout(() => failAll(new Error("That took too long and was stopped. Try a smaller picture, or fewer, larger and less dense shapes.")), limitMs);
    pending.set(job.id, { resolve: job.resolve, reject: job.reject, key: job.key, timer });
    try {
      ensure().postMessage({ id: job.id, type: job.type, payload: job.payload }, job.transfer);
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

  function ensure() {
    if (worker) return worker;
    const mine = new Worker(new URL("./engine.worker.js", import.meta.url), { type: "module" });
    worker = mine;
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
      // A crash in the worker fails everything waiting; the next job starts a fresh one.
      if (worker === mine) failAll(new Error(ev.message || "The stitch engine stopped."));
    };
    return mine;
  }

  /** Run a job. With `key`, an older job of that key still on its way is ignored (its promise rejects with { stale: true }). */
  function call(type, payload, { transfer = [], key } = {}) {
    const id = ++seq;
    if (key) latest.set(key, id);
    const settle = (value) => (key && latest.get(key) !== id ? Promise.reject(stale()) : Promise.resolve(value));

    if (useInline()) {
      inline = inline || import("./engineCore.js");
      return inline.then((core) => settle(core.run(type, payload).result));
    }
    return new Promise((resolve, reject) => {
      const job = {
        id, type, payload, transfer, key,
        resolve: (v) => (key && latest.get(key) !== id ? reject(stale()) : resolve(v)),
        reject,
      };
      if (!key) { post(job); return; }
      let lane = lanes.get(key);
      if (!lane) { lane = { busy: false, next: null }; lanes.set(key, lane); }
      if (!lane.busy) { lane.busy = true; post(job); return; }
      if (lane.next) lane.next.reject(stale()); // an older job that never got to start
      lane.next = job;
    });
  }

  return {
    generate: (design, options) => call("generate", { design, options }, { key: "generate" }),
    /** `key` names what the trace is for (the picture, or one text object), so tracing one does not throw away another's answer. */
    trace: (image, options, key = "trace") => call("trace", { image, options }, { transfer: [image.data.buffer], key }),
    quantize: (image, options) => call("quantize", { image, options }, { transfer: [image.data.buffer], key: "quantize" }),
    dispose() { failAll(Object.assign(new Error("closed"), { stale: true })); },
  };
}
