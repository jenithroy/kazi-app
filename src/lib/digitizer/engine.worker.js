/** The Digitizer's Web Worker: see engineCore.js. One message in ({ id, type, payload }), one message out ({ id, result } or { id, error }). */
import { run } from "./engineCore.js";

self.addEventListener("message", (ev) => {
  const { id, type, payload } = ev.data;
  try {
    const { result, transfer } = run(type, payload);
    self.postMessage({ id, result }, transfer || []);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
});
