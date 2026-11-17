/**
 * The person finder's Web Worker (segment.js, segmentClient.js). The model and the edge refinement take about three seconds of CPU, which must not
 * freeze the page. One message in ({ id, image }), one out ({ id, result, classes, faces, anchors } or { id, error }); the class map goes back as a transferred buffer.
 * The wasm and the models are files of the build: `?url` gives their (hashed, cached for a year, see public/_headers) addresses. This is a MODULE worker,
 * so it needs the module flavour of the wasm loader.
 *
 * The face finder (faceFinder.js, faces.js) runs here too, on the same MediaPipe runtime, and only when the person finder found a person.
 */
import { segmentPicture, ready } from "./segment.js";
import { findFaceLandmarks } from "./faceFinder.js";
import { mainFaces, featureAnchors } from "./faces.js";
import loader from "@mediapipe/tasks-vision/vision_wasm_module_internal.js?url";
import binary from "@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url";
import modelUrl from "../../assets/models/selfie_multiclass_256x256.tflite?url";
import faceModelUrl from "../../assets/models/face_landmarker.task?url";

let loading = null;

self.addEventListener("message", async (ev) => {
  const { id, image } = ev.data;
  try {
    loading = loading || ready({ wasmLoaderUrl: loader, wasmBinaryUrl: binary, modelUrl });
    await loading;
    const { classes, ...result } = await segmentPicture(image, {});
    // Where the eyes, brows and lips are (a 4 MB model, loaded the first time): only for a picture that has a person in it. [] when there is none or the finder fails.
    const faces = result.person ? await findFaceLandmarks(image, { modelUrl: faceModelUrl }) : [];
    // The white of the eyes and of the teeth, measured here where the picture's pixels are (the page does not keep them): the palette of a face never finds them by itself.
    let anchors = [];
    try { anchors = faces.length ? featureAnchors(image, mainFaces(faces, image.width, image.height)) : []; } catch (err) { console.warn("[digitizer] the whites of the face could not be measured:", err); }
    self.postMessage({ id, result, classes, faces, anchors }, [classes.buffer, ...faces.map((f) => f.buffer)]);
  } catch (err) {
    loading = null; // a failed load is tried again with the next picture
    console.warn("[digitizer] the person finder could not run:", err);
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
});
