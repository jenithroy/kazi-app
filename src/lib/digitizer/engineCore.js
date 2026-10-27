/**
 * The heavy work of the Digitizer, as plain functions of (type, payload): making stitches from a design, and reading a
 * picture into shapes. They run in a Web Worker (engine.worker.js) so the page stays smooth, and directly when there is no
 * worker (the tests). Results are made cheap to send: the stitches travel as one flat Int32Array of x, y, command triples.
 */
import { generate } from "../embroidery/stitch/engine.js";
import { traceImage, quantize } from "../embroidery/trace/index.js";
import { checkStitches, checkMessages } from "../embroidery/stitch/checks.js";
import { flatten } from "./flat.js";

export function run(type, payload) {
  if (type === "generate") {
    const res = generate(payload.design, payload.options || {});
    const flat = flatten(res.pattern.stitches);
    const checks = checkStitches(flat);
    return {
      result: { flat, threads: res.pattern.threads, name: res.pattern.name, warnings: [...res.warnings, ...checkMessages(checks)], checks, runs: res.runs, ms: res.ms },
      transfer: [flat.buffer],
    };
  }
  if (type === "trace") return { result: traceImage(payload.image, payload.options || {}), transfer: [] };
  if (type === "quantize") {
    const q = quantize(payload.image, payload.options || {});
    return { result: q, transfer: q.labels ? [q.labels.buffer] : [] };
  }
  throw new Error(`Unknown job: ${type}`);
}
