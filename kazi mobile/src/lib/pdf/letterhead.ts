/**
 * The company letterhead (the same file the website serves at
 * `/letterhead.jpg`) as a `data:` URI, so one HTML string carries the whole
 * document — no file:// plumbing in the WebView, no missing background in the
 * printed PDF.
 *
 * The source asset is A4 at 300dpi (2481×3508, ~1.4 MB), which base64-encodes
 * to just under 2 MB — right at the length where a `url(data:…)` stops being
 * safe inside a WebView, and heavy to hand across the bridge on every open. It
 * is downscaled once to 1240px wide (≈150dpi for A4, plenty for a background
 * wash both on screen and in print) and memoised for the session.
 */
import { Asset } from 'expo-asset';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const TARGET_WIDTH = 1240;

let pending: Promise<string | undefined> | null = null;

async function load(): Promise<string | undefined> {
  try {
    const asset = Asset.fromModule(require('../../../assets/letterhead.jpg'));
    if (!asset.localUri) await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) return undefined;

    const rendered = await ImageManipulator.manipulate(uri).resize({ width: TARGET_WIDTH }).renderAsync();
    const { base64 } = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82, base64: true });
    return base64 ? `data:image/jpeg;base64,${base64}` : undefined;
  } catch {
    // A missing letterhead must not stop the document rendering — the sheet
    // falls back to plain white, which is still a valid printable invoice.
    return undefined;
  }
}

export function letterheadDataUri(): Promise<string | undefined> {
  if (!pending) pending = load();
  return pending;
}
