/**
 * Vendored html2canvas (1.4.1), read off disk and injected into the document
 * WebView to rasterise the sheet to PNG. It lives in `assets/` as `.txt` so
 * Metro ships it as a file rather than bundling it into the JS — see
 * `metro.config.js`.
 */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

let pending: Promise<string> | null = null;

async function load(): Promise<string> {
  // `Asset.fromModule` takes a Metro module id — a `require` is the only way
  // to name the bundled asset.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const asset = Asset.fromModule(require('../../../assets/html2canvas.min.js.txt'));
  if (!asset.localUri) await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return new File(uri).text();
}

export function html2canvasSource(): Promise<string> {
  if (!pending) pending = load();
  return pending;
}
