/**
 * Library images — a fabric's swatch, a tech pack's sketches and scanned pages.
 *
 * They live in the public `product-media` bucket alongside the ones the
 * Firestore→Postgres migration carried over, under the same
 * `fabrics/…` / `patterns/…` prefixes, so the web app keeps rendering them from
 * the URLs it already stores. Writing there needs the `library` grant — see
 * migration `0108_product_media_write.sql`; until that landed the bucket had no
 * policy at all and every authenticated upload was refused.
 *
 * Picking and compressing is chat's, unchanged: an 8 MP camera original is
 * ~5 MB and a swatch is looked at on a phone, so the same 1920px / JPEG-75 pass
 * applies here. Only the destination differs.
 *
 * Each upload takes a fresh object name rather than overwriting the old one.
 * A public URL is served by a CDN that has already cached it, so replacing the
 * bytes under a name people have loaded shows them the previous swatch for as
 * long as the cache holds. A new name is a new URL and is right immediately.
 */

import { File } from 'expo-file-system';

import { AttachmentError, pickAttachment, type PickSource } from '@/data/chat/attachments';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

const BUCKET = 'product-media';

/** Where in the bucket an image belongs, matched to the migrated layout. */
export type LibraryFolder = 'fabrics' | 'patterns';

/** Photo library or camera. Documents aren't offered — these fields are images. */
export type LibraryPickSource = Extract<PickSource, 'photo' | 'camera'>;

function objectName(folder: LibraryFolder, tag: string): string {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${folder}/${tag}-${unique}.jpg`;
}

/**
 * Pick one photo and put it in the bucket. Returns its public URL, or null when
 * the person backs out of the picker.
 *
 * `tag` names the object for a human reading the bucket — `swatch`, `front`,
 * `page`. It is not an identity: nothing looks an image up by name, the row's
 * URL column is the only reference to it.
 *
 * Throws {@link AttachmentError} for anything the person can act on (permission
 * refused, still too large after compression) and a plain Error for a refused
 * upload, which on this bucket means the `library` grant.
 */
export async function pickLibraryImage(
  source: LibraryPickSource,
  folder: LibraryFolder,
  tag: string,
): Promise<string | null> {
  const picked = await pickAttachment(source);
  if (!picked) return null;

  // No Supabase (local dev with no `.env`): the local file URI renders in an
  // <Image> perfectly well, so the editor can still be exercised end to end.
  if (!isSupabaseConfigured) return picked.uri;

  const path = objectName(folder, tag);
  const bytes = await new File(picked.uri).arrayBuffer();
  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new AttachmentError(`Upload failed: ${error.message}`);

  const { data } = getSupabase().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export { AttachmentError };
