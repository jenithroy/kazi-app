/**
 * The face finder: MediaPipe's face landmarker (Apache-2.0, a 3.8 MB model in src/assets/models, see NOTICE-mediapipe.txt there) says where the eyes, brows, lips and
 * outline of each face in a picture are (478 points a face). It runs in the person finder's Web Worker (segment.worker.js), on the same MediaPipe runtime the
 * person model was loaded with, and only for a picture the person finder has found a person in, so a logo or a flower never pays for it.
 * What the landmarks become is faces.js (pure functions, also run under node).
 *
 * findFaceLandmarks NEVER throws: on any failure (no model file, no wasm) it resolves to [] and the picture is read as it was before the face finder existed.
 */
import { visionAssets } from "./segment.js";

const MODEL_URL = "/mediapipe/face_landmarker.task";
let landmarker = null;
let loading = null;

async function ensure(modelUrl) {
  if (landmarker) return landmarker;
  const a = visionAssets();
  if (!a) throw new Error("the person finder's runtime is not loaded");
  loading = loading || a.vision.FaceLandmarker.createFromOptions(a.fileset, {
    baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
    runningMode: "IMAGE",
    numFaces: 5,
    minFaceDetectionConfidence: 0.4,
    minFacePresenceConfidence: 0.4,
    outputFaceBlendshapes: false,
  });
  try {
    landmarker = await loading;
  } catch (e) {
    loading = null; // a failed load is tried again with the next picture
    throw e;
  }
  return landmarker;
}

/**
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} image  RGBA
 * @returns {Promise<Float32Array[]>}  one Float32Array of 478 x 3 numbers (x, y, z; x and y as a share of the picture) per face, the biggest not necessarily first
 */
export async function findFaceLandmarks(image, { modelUrl = MODEL_URL } = {}) {
  try {
    const lm = await ensure(modelUrl);
    const res = lm.detect(new ImageData(new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.length), image.width, image.height));
    return (res.faceLandmarks || []).map((face) => {
      const a = new Float32Array(face.length * 3);
      for (let i = 0; i < face.length; i++) { a[i * 3] = face[i].x; a[i * 3 + 1] = face[i].y; a[i * 3 + 2] = face[i].z; }
      return a;
    });
  } catch (err) {
    console.warn("[digitizer] the face finder could not run:", err);
    return [];
  }
}

/** Frees the landmarker (the page is closing, or the person finder was stopped). */
export function disposeFaceFinder() {
  if (landmarker) { try { landmarker.close(); } catch { /* already gone */ } }
  landmarker = null;
  loading = null;
}
