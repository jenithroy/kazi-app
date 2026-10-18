/**
 * Pictures on the Inventory page: fabric swatches, sample photos, tech-pack pages and sketches.
 *
 * A picture is shrunk in the browser first, then saved to the product-media bucket; if the bucket does not
 * answer within three seconds it is kept inline in the row instead (smaller and smaller until it fits), so a
 * slow connection never loses someone's upload. Moved here unchanged from the old Inventory page so the
 * page, its cards and the tech-pack editor share one copy.
 */
import { uploadPublicFileAtPath } from "./storage";

export function compressFabricImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                type: "image/jpeg",
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              reject(new Error("Image compression failed to generate blob."));
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = (err) => reject(err);
      img.src = event.target.result;
    };
    reader.onerror = (err) => reject(err);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Firestore docs max out at 1 MiB — keep inline images comfortably below that.
const INLINE_IMAGE_LIMIT = 700 * 1024;

async function inlineImageFallback(file) {
  for (const [maxWidth, quality] of [[1200, 0.8], [900, 0.7], [640, 0.6], [480, 0.5]]) {
    const small = await compressFabricImage(file, maxWidth, quality);
    const dataUrl = await fileToDataUrl(small);
    if (dataUrl.length <= INLINE_IMAGE_LIMIT) return dataUrl;
  }
  throw new Error("Image is too large to store. Please choose a smaller picture.");
}

export async function uploadImage(path, file) {
  try {
    const storagePromise = uploadPublicFileAtPath("product-media", path, file, { contentType: "image/jpeg" })
      .then(({ url }) => url);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Storage upload timeout")), 3000)
    );

    return await Promise.race([storagePromise, timeoutPromise]);
  } catch (err) {
    console.warn("Storage upload failed or timed out, storing image inline instead:", err);
    return inlineImageFallback(file);
  }
}

export function uploadFabricSwatch(fabricId, file) {
  return uploadImage(`fabrics/swatches/${fabricId}_${Date.now()}.jpg`, file);
}

export function uploadPatternTechPack(patternId, file, idx = 0) {
  return uploadImage(`patterns/techpacks/${patternId}_${Date.now()}_${idx}.jpg`, file);
}

export function uploadPatternSketch(patternId, file, side) {
  return uploadImage(`patterns/sketches/${patternId}_${side}_${Date.now()}.jpg`, file);
}

export function uploadSamplePhoto(sampleId, file) {
  return uploadImage(`samples/photos/${sampleId}_${Date.now()}.jpg`, file);
}

/* ── Tech pack image helpers ──────────────────────────── */
export function isTechPackImageUrl(url) {
  if (!url) return false;
  return url.startsWith("data:image/")
    || /\.(jpe?g|png|webp|gif)($|\?)/i.test(url)
    || url.includes("techpacks");
}

// A tech pack can have multiple pages (tech_pack_images). Older records stored
// a single image in tech_pack_url — merge it in so nothing disappears.
export function getTechPackImages(item) {
  const imgs = Array.isArray(item.tech_pack_images) ? item.tech_pack_images.filter(Boolean) : [];
  if (item.tech_pack_url && isTechPackImageUrl(item.tech_pack_url) && !imgs.includes(item.tech_pack_url)) {
    return [item.tech_pack_url, ...imgs];
  }
  return imgs;
}
