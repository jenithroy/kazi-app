/**
 * Profile pictures: shrinking a chosen photo to a small square, and saving it.
 *
 * The picture is stored in the public `avatars` bucket under a folder named for the
 * person, and the link is kept in `person_avatars` (migration 0056). Every upload is
 * a new file, so a changed picture is a new URL and nothing keeps showing the old one;
 * the old files are removed once the new one is safely recorded.
 *
 * The photo is cropped and resized in the browser before it goes anywhere: a
 * 256px square JPEG is about 20 KB, which is what lets a face appear next to every
 * task and message without anyone waiting for it.
 */
import { supabase } from "../supabase";

const BUCKET = "avatars";

/** Side of the square a picture is saved at. */
export const AVATAR_PX = 256;
/** The biggest file we will try to read; a phone camera's photo is well under this. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * Read a chosen file into an image. The caller owns the returned object URL and
 * should revoke it when done (`URL.revokeObjectURL(url)`).
 */
export function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type).startsWith("image/")) {
      reject(new Error("Choose a picture (JPG, PNG or WebP)."));
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      reject(new Error("That photo is too big. Pick one under 25 MB."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that picture. Try a JPG or PNG."));
    };
    img.src = url;
  });
}

/**
 * Which part of the photo is in the circle.
 *
 * `zoom` 1 is the biggest square that fits; `cx` and `cy` (0..1) say where its centre
 * is on the photo. The preview and the saved picture both use this, so what you see is
 * exactly what you get. Returns the side and top-left corner in the photo's own pixels.
 */
export function cropGeometry(width, height, zoom = 1, cx = 0.5, cy = 0.5) {
  const side = Math.min(width, height) / Math.max(1, zoom);
  const sx = clamp(cx * width - side / 2, 0, width - side);
  const sy = clamp(cy * height - side / 2, 0, height - side);
  return { side, sx, sy };
}

/** Draw the chosen part of the photo as a small square JPEG. */
export function cropSquare(img, { zoom = 1, cx = 0.5, cy = 0.5 } = {}) {
  const { side, sx, sy } = cropGeometry(img.naturalWidth, img.naturalHeight, zoom, cx, cy);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";   // a transparent PNG would otherwise turn black as a JPEG
  ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare that photo."))),
      "image/jpeg",
      0.9,
    );
  });
}

/** Every file in a person's folder, as full storage paths. */
async function filesOf(personId) {
  const { data } = await supabase.storage.from(BUCKET).list(personId, { limit: 100 });
  return (data || []).filter((f) => f.name).map((f) => `${personId}/${f.name}`);
}

/**
 * Save a new picture for `personId`: upload it, record the link, then clear the old
 * files. If recording the link fails the new file is removed again, so a failed save
 * leaves things exactly as they were.
 */
export async function saveAvatar(personId, blob) {
  const path = `${personId}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = data.publicUrl;

  const { error } = await supabase
    .from("person_avatars")
    .upsert({ person_id: personId, url, updated_at: new Date().toISOString() }, { onConflict: "person_id" });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }

  try {
    const old = (await filesOf(personId)).filter((p) => p !== path);
    if (old.length) await supabase.storage.from(BUCKET).remove(old);
  } catch {
    // A leftover file costs a few kilobytes; it is not worth failing a saved picture over.
  }
  return { url };
}

/** Remove a person's picture, so their initials show again. */
export async function removeAvatar(personId) {
  const { error } = await supabase.from("person_avatars").delete().eq("person_id", personId);
  if (error) throw error;
  try {
    const files = await filesOf(personId);
    if (files.length) await supabase.storage.from(BUCKET).remove(files);
  } catch {
    // The picture is already gone from the app; the file is just clutter.
  }
}

/** Turn the database's wording into something a person can act on. */
export function friendlyPhotoError(err) {
  const text = String(err?.message || err || "");
  if (/bucket not found|not found/i.test(text) && /bucket|avatars/i.test(text)) {
    return "Photos aren't set up on the database yet (migration 0056). Ask whoever looks after it to run it.";
  }
  if (/person_avatars|schema cache|does not exist/i.test(text)) {
    return "Photos aren't set up on the database yet (migration 0056). Ask whoever looks after it to run it.";
  }
  if (/row-level security|violates|policy|not authorized|permission/i.test(text)) {
    return "You can only change your own photo.";
  }
  if (/payload too large|exceeded|too big|size/i.test(text)) {
    return "That photo is too big. Pick a smaller one.";
  }
  return text || "Couldn't save the photo. Try again.";
}
