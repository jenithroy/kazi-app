/**
 * The person finder's Web Worker (segment.js, segmentClient.js). The model and the edge refinement take about three seconds of CPU, which must not
 * freeze the page. One message in ({ id, image }), one out ({ id, result, classes } or { id, error }); the class map goes back as a transferred buffer.
 * The wasm and the model are files of the build: `?url` gives their (hashed, cached for a year, see public/_headers) addresses. This is a MODULE worker,
 * so it needs the module flavour of the wasm loader.
 */
import { segmentPicture, ready } from "./segment.js";
import loader from "@mediapipe/tasks-vision/vision_wasm_module_internal.js?url";
import binary from "@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url";
import modelUrl from "../../assets/models/selfie_multiclass_256x256.tflite?url";

let loading = null;

self.addEventListener("message", async (ev) => {
  const { id, image } = ev.data;
  try {
    loading = loading || ready({ wasmLoaderUrl: loader, wasmBinaryUrl: binary, modelUrl });
    await loading;
    const { classes, ...result } = await segmentPicture(image, {});
    self.postMessage({ id, result, classes }, [classes.buffer]);
  } catch (err) {
    loading = null; // a failed load is tried again with the next picture
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
});
