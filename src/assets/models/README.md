# Models

`selfie_multiclass_256x256.tflite` is Google's MediaPipe **selfie multiclass** image segmentation model (256 x 256 input; classes: background, hair,
body skin, face skin, clothes, others). The Digitizer uses it to find the person in a photograph (`src/lib/digitizer/segment.js`), so a portrait can be
split into layers before it is turned into stitches.

- Source: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite
- Licence: Apache License, Version 2.0 (the "Model Card Multiclass Segmentation" says "LICENSED UNDER Apache License, Version 2.0"; the runtime
  `@mediapipe/tasks-vision` is Apache-2.0 too). A copy of the licence is at https://www.apache.org/licenses/LICENSE-2.0
- The model card says it is not meant for decisions that put lives at risk, or where a pixel-perfect mask is needed, and that surveillance and identity
  recognition are out of scope. Here it only decides which colours a stitched picture gets.
- It is hosted with the app (not fetched from Google's bucket at run time) so it works offline and cannot change under us. The file keeps its name: the
  code checks the model's six labels when it loads.

`face_landmarker.task` is MediaPipe's **face landmarker** (Apache-2.0, 3.8 MB): 478 points a face. `src/lib/digitizer/faceFinder.js` runs it in the person
finder's worker, only for a picture that has a person in it, so the eyes, brows and lips of a portrait are kept as their own parts. See NOTICE-mediapipe.txt.
