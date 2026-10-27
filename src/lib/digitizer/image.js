/**
 * Pictures in and out of the Digitizer: reading a file into a canvas, taking a part of it as pixels for the tracer, and
 * writing a canvas out as a file. Browser only (canvas, Image, Blob).
 */

/** Files the page accepts as a picture (SVG too: it is drawn big, so its edges are crisp). */
export const PICTURE_TYPES = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg";

/**
 * Read a picture file into a canvas.
 * @returns {Promise<{ canvas: HTMLCanvasElement, width: number, height: number, name: string }>}
 */
export async function loadPicture(file, maxSide = 3200) {
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("This file could not be read as a picture. Try a PNG, JPG or SVG."));
      im.src = url;
    });
    let w = img.naturalWidth || img.width || 1000;
    let h = img.naturalHeight || img.height || 1000;
    // A vector picture has no pixels of its own: draw it large so its curves are smooth.
    const target = isSvg ? 2200 : Math.max(w, h);
    const s = Math.min(maxSide / Math.max(w, h), isSvg ? target / Math.max(w, h) : 1);
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas, width: w, height: h, name: file.name.replace(/\.[^.]+$/, "") };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * A part of a canvas as pixels for the tracer, reduced so its long side is at most `maxSide`.
 * @param {{ x, y, w, h }} crop  the part, in the canvas's own pixels
 * @returns {{ image: { width, height, data: Uint8ClampedArray }, scale: number }}  scale = output pixels per canvas pixel
 */
export function extractImage(canvas, crop, maxSide = 1600) {
  const cw = Math.max(1, Math.round(crop.w)), ch = Math.max(1, Math.round(crop.h));
  const scale = Math.min(1, maxSide / Math.max(cw, ch));
  const w = Math.max(1, Math.round(cw * scale)), h = Math.max(1, Math.round(ch * scale));
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, Math.round(crop.x), Math.round(crop.y), cw, ch, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  return { image: { width: w, height: h, data: data.data }, scale: w / cw };
}

export function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture could not be made."))), type, quality));
}

/** Hand a Blob to the browser as a download. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Some browsers lose the file when the link is let go at once.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** A name safe to use as a file name on any computer. */
export function fileSafe(name, fallback = "design") {
  const n = String(name || "").trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return n || fallback;
}
