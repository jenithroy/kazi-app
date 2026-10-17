/**
 * Picking a file, shrinking it, and putting it in the `chat-media` bucket.
 *
 * **Why compress at all.** Storage is the bill nobody notices until it
 * arrives: a modern phone camera writes 4–8 MB per photo and 40 MB per ten
 * seconds of 4K, and a shop floor sending "here's the seam" fifty times a day
 * fills a free tier in a fortnight. Everything here is aimed at a fraction of
 * that with the picture still worth looking at.
 *
 * **How much.** Images are resized so the long edge is at most 1920px and
 * re-encoded as JPEG at 75% — roughly a fifth the bytes of a camera original,
 * and still more pixels than the screen it will be looked at on, so a
 * pinch-zoom has real detail to show. This is deliberately gentle: a photo of
 * a seam defect has to survive being examined closely, so the aim is
 * "smaller", not "as small as possible".
 *
 * Video cannot be transcoded in JS, and no Expo module does it, so the export
 * is asked of the OS instead: `videoExportPreset` makes iOS hand back a 720p
 * H.264 render rather than the 4K original, and `quality` does the equivalent
 * on Android. That happens inside the picker, before the file is ever copied.
 *
 * PDFs and other documents are uploaded as they are — re-encoding a document
 * would damage it, and they are small next to media anyway.
 *
 * **Limits** are checked after compression, because that is the number that
 * actually reaches the bucket. They sit under the bucket's own 50 MB ceiling
 * so a refusal is a sentence on screen rather than an opaque storage error.
 */

import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

import type { Attachment, ThreadId } from './types';

/** Post-compression ceilings. Everything is well under the bucket's 50 MB. */
export const LIMITS = {
  image: 8 * 1024 * 1024,
  video: 40 * 1024 * 1024,
  file: 20 * 1024 * 1024,
  // A 2-minute HIGH_QUALITY AAC recording (the recorder's own cap) runs well
  // under 2 MB — this ceiling is generous headroom, not a real-world limit.
  voice: 6 * 1024 * 1024,
} as const;

/**
 * The long edge every photo is brought down to. 1920 is still more pixels
 * than any phone screen shows, so a pinch-zoom in the viewer has real detail;
 * it is roughly a fifth the bytes of a 4032px camera original.
 */
const MAX_EDGE = 1920;
/** JPEG quality. Below about 0.6 the compression starts showing on fabric texture. */
const JPEG_QUALITY = 0.75;

export type PickSource = 'photo' | 'camera' | 'video' | 'file';

/** Thrown for anything the person can fix — a file too big, a permission not granted. */
export class AttachmentError extends Error {}

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

function enforceLimit(kind: Attachment['kind'], size: number, name: string): void {
  const limit = LIMITS[kind];
  if (size <= limit) return;
  const noun = kind === 'video' ? 'videos' : kind === 'voice' ? 'voice notes' : 'files';
  throw new AttachmentError(
    kind === 'image'
      ? `That photo is still ${mb(size)} after compressing — the limit is ${mb(limit)}.`
      : `${name} is ${mb(size)}. The limit for ${noun} is ${mb(limit)}.`,
  );
}

function extensionOf(name: string, mime: string): string {
  const fromName = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (fromName && fromName.length <= 5) return fromName;
  const fromMime = mime.split('/')[1]?.split(';')[0];
  return fromMime && fromMime.length <= 5 ? fromMime : 'bin';
}

/** Short, unique, and it never leaks the original filename into a URL. */
function objectName(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * What actually gets sent: a local file plus the metadata the message row
 * needs. `path` is filled in by {@link uploadAttachment}.
 */
export interface PendingAttachment {
  kind: Attachment['kind'];
  uri: string;
  name: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
}

// ------------------------------------------------------------ compressing

/**
 * Resize + re-encode one photo.
 *
 * Two passes, because the dimensions are only trustworthy once the image is
 * decoded — a document-picked file has none at all, and an iPhone HEIC
 * reports pre-rotation ones. The first render reads the truth; the second
 * scales, and is skipped entirely when the photo is already small enough.
 * Even then it is re-encoded, since a 900px HEIC is not automatically light.
 */
async function compressImage(uri: string): Promise<{ uri: string; width: number; height: number }> {
  const save = { format: SaveFormat.JPEG, compress: JPEG_QUALITY } as const;

  const source = await ImageManipulator.manipulate(uri).renderAsync();
  const longEdge = Math.max(source.width, source.height);
  if (longEdge <= MAX_EDGE) {
    const saved = await source.saveAsync(save);
    return { uri: saved.uri, width: saved.width, height: saved.height };
  }

  const scale = MAX_EDGE / longEdge;
  const resized = await ImageManipulator.manipulate(source)
    .resize(
      source.width >= source.height
        ? { width: MAX_EDGE, height: Math.round(source.height * scale) }
        : { width: Math.round(source.width * scale), height: MAX_EDGE },
    )
    .renderAsync();
  const saved = await resized.saveAsync(save);
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

// --------------------------------------------------------------- picking

async function requirePermission(granted: boolean, what: string): Promise<void> {
  if (!granted) throw new AttachmentError(`Kazi needs permission to use your ${what}. You can grant it in Settings.`);
}

async function pickImageOrVideo(source: PickSource): Promise<PendingAttachment | null> {
  const wantsVideo = source === 'video';

  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    await requirePermission(perm.granted, 'camera');
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    await requirePermission(perm.granted, 'photo library');
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: wantsVideo ? ['videos'] : ['images'],
    // The picker's own quality is a first pass; `compressImage` does the real
    // work for photos, and for video this IS the compression.
    quality: wantsVideo ? 0.7 : 1,
    // 720p H.264 rather than the 4K original: still clearly readable on a
    // phone, a fraction of the bytes, and rendered by the OS before the file
    // is even copied out of the picker.
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    videoMaxDuration: 180,
    allowsMultipleSelection: false,
  };

  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  if (wantsVideo || asset.type === 'video') {
    const size = asset.fileSize ?? new File(asset.uri).size;
    const name = asset.fileName ?? `clip.${extensionOf(asset.uri, asset.mimeType ?? 'video/mp4')}`;
    enforceLimit('video', size, name);
    return {
      kind: 'video',
      uri: asset.uri,
      name,
      mime: asset.mimeType ?? 'video/mp4',
      size,
      width: asset.width,
      height: asset.height,
      duration: asset.duration ?? undefined,
    };
  }

  const shrunk = await compressImage(asset.uri);
  const size = new File(shrunk.uri).size;
  const name = (asset.fileName ?? 'photo').replace(/\.[^.]+$/, '') + '.jpg';
  enforceLimit('image', size, name);
  return { kind: 'image', uri: shrunk.uri, name, mime: 'image/jpeg', size, width: shrunk.width, height: shrunk.height };
}

async function pickDocument(): Promise<PendingAttachment | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;

  const asset = result.assets?.[0];
  if (!asset) return null;

  const mime = asset.mimeType ?? 'application/octet-stream';
  const size = asset.size ?? new File(asset.uri).size;

  // Someone picking a photo through "File" should still get it compressed.
  if (mime.startsWith('image/')) {
    const shrunk = await compressImage(asset.uri);
    const shrunkSize = new File(shrunk.uri).size;
    const name = asset.name.replace(/\.[^.]+$/, '') + '.jpg';
    enforceLimit('image', shrunkSize, name);
    return { kind: 'image', uri: shrunk.uri, name, mime: 'image/jpeg', size: shrunkSize, width: shrunk.width, height: shrunk.height };
  }

  const kind: Attachment['kind'] = mime.startsWith('video/') ? 'video' : 'file';
  enforceLimit(kind, size, asset.name);
  return { kind, uri: asset.uri, name: asset.name, mime, size };
}

/** Open the right OS picker. Returns null when the person backs out. */
export function pickAttachment(source: PickSource): Promise<PendingAttachment | null> {
  return source === 'file' ? pickDocument() : pickImageOrVideo(source);
}

/**
 * Stage a just-recorded voice note the same way a picked file is staged —
 * there is no OS picker involved, `useVoiceRecorder` hands back a local uri
 * directly once recording stops.
 */
export async function finalizeVoiceNote(uri: string, durationSeconds: number): Promise<PendingAttachment> {
  const ext = uri.split('.').pop()?.toLowerCase() || 'm4a';
  const name = `voice-note.${ext}`;
  const size = new File(uri).size;
  enforceLimit('voice', size, name);
  return { kind: 'voice', uri, name, mime: `audio/${ext}`, size, duration: Math.round(durationSeconds * 1000) };
}

// ------------------------------------------------------------- uploading

/**
 * Put the picked file in `chat-media/<threadId>/<name>.<ext>`.
 *
 * The thread id as the first path segment is not cosmetic — the storage
 * policies read it (`split_part(name, '/', 1)`) to decide whether the caller
 * is in that conversation, so the layout IS the access rule.
 *
 * `arrayBuffer()` rather than a `Blob` or a `FormData`: Hermes has no working
 * `Blob.arrayBuffer`, and the new expo-file-system `File` hands back the bytes
 * directly, so nothing round-trips through base64.
 */
export async function uploadAttachment(threadId: ThreadId, pending: PendingAttachment): Promise<Attachment> {
  const attachment: Attachment = {
    kind: pending.kind,
    path: `${threadId}/${objectName()}.${extensionOf(pending.name, pending.mime)}`,
    name: pending.name,
    mime: pending.mime,
    size: pending.size,
    width: pending.width,
    height: pending.height,
    duration: pending.duration,
  };

  // Without Supabase there is nowhere to put it; the mock still renders the
  // bubble from the local file so the flow can be exercised offline.
  if (!isSupabaseConfigured) return { ...attachment, url: pending.uri };

  const bytes = await new File(pending.uri).arrayBuffer();
  const { error } = await getSupabase()
    .storage.from('chat-media')
    .upload(attachment.path, bytes, { contentType: pending.mime, upsert: false });
  if (error) throw new AttachmentError(`Upload failed: ${error.message}`);

  const { data } = await getSupabase().storage.from('chat-media').createSignedUrl(attachment.path, 3600);
  return { ...attachment, url: data?.signedUrl };
}
