/**
 * Upload helpers for the public Supabase Storage buckets: product-media
 * (fabrics/patterns, pre-existing) and finance-attachments /
 * production-attachments (migration 0043).
 *
 * All three are public buckets, so a file's URL is a plain, durable string
 * from the moment it's uploaded -- no signed-URL refresh needed on the way
 * back out, which is what every caller here already assumed when Firebase's
 * getDownloadURL() played the same role. See migration 0043 for why that
 * fits these features (and why chat.js's attachments, which are private, do
 * it differently).
 */
import { supabase } from "../supabase";

function safeName(name) {
  return (name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Upload a file to an exact path in `bucket` and return its public URL. */
export async function uploadPublicFileAtPath(bucket, path, file, { contentType } = {}) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: contentType || file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Upload a file to `<folder>/<timestamp>_<name>` in `bucket` and return its
 * public URL and storage path -- the path is what a later delete needs.
 */
export function uploadPublicFile(bucket, folder, file, opts = {}) {
  return uploadPublicFileAtPath(bucket, `${folder}/${Date.now()}_${safeName(file.name)}`, file, opts);
}

/**
 * Delete a previously uploaded file. Swallows its own failures -- the
 * database row is the source of truth, and a leftover orphaned object is a
 * smaller problem than a delete the person clicked failing to complete.
 */
export async function deletePublicFile(bucket, path) {
  if (!path) return;
  try {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) throw error;
  } catch (err) {
    console.warn(`Could not delete ${bucket}/${path}:`, err?.message || err);
  }
}
