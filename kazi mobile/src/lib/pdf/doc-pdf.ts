/**
 * Turning a billing document into a file, and getting that file off the phone.
 *
 *   PDF  → `expo-print` renders the same HTML the viewer shows
 *   PNG  → the viewer's own WebView rasterises the sheet (see `doc-viewer.tsx`)
 *
 *   share → the OS share sheet (WhatsApp, mail, Drive …), via `expo-sharing`
 *   save  → the user picks a folder and the file is written into it
 *
 * `expo-print` names its output with a random temp filename, so every file is
 * renamed to `<cache>/documents/<DOC NUMBER>.<ext>` first — that name is what
 * the share sheet shows and what lands in the chosen folder.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { letterheadDataUri } from './letterhead';
import { buildDocHtml, type DocData, type DocType } from './doc-template';
import { docNumberOf } from './doc-data';

export type DocFormat = 'pdf' | 'png';

const MIME: Record<DocFormat, string> = { pdf: 'application/pdf', png: 'image/png' };
const UTI: Record<DocFormat, string> = { pdf: 'com.adobe.pdf', png: 'public.png' };

function documentsDir(): Directory {
  const dir = new Directory(Paths.cache, 'documents');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function emptyFile(name: string): File {
  const file = new File(documentsDir(), name);
  if (file.exists) file.delete();
  return file;
}

/** Renders the document as a PDF named after its document number. */
export async function generateDocPdf(data: DocData, docType: DocType): Promise<File> {
  const letterhead = await letterheadDataUri();
  const html = buildDocHtml(data, docType, { letterhead });
  const { uri } = await Print.printToFileAsync({ html });

  const printed = new File(uri);
  try {
    const named = emptyFile(`${docNumberOf(data)}.pdf`);
    await printed.move(named);
    return named;
  } catch {
    // Renaming is a nicety — never lose the document over it.
    return printed;
  }
}

/** Writes base64 PNG bytes (from the WebView rasteriser) to a named file. */
export function writeDocPng(data: DocData, base64: string): File {
  const file = emptyFile(`${docNumberOf(data)}.png`);
  file.create();
  file.write(base64, { encoding: 'base64' });
  return file;
}

/** True when the file reached the share sheet; false when sharing is unavailable. */
export async function shareFile(file: File, format: DocFormat): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, {
    mimeType: MIME[format],
    UTI: UTI[format],
    dialogTitle: file.name,
  });
  return true;
}

/**
 * Asks for a destination folder and writes the file into it.
 * Returns the folder's display name, or `null` if the picker was dismissed.
 */
export async function saveFileToFolder(file: File, format: DocFormat): Promise<string | null> {
  let target: Directory;
  try {
    target = await Directory.pickDirectoryAsync();
  } catch {
    // The picker throws rather than resolving when the user backs out of it.
    return null;
  }

  // On Android the picked folder is a SAF `content://` tree, where a file has
  // to be created through the directory itself before it can be written.
  if (Platform.OS === 'android') {
    const created = target.createFile(file.name, MIME[format]);
    created.write(await file.bytes());
  } else {
    const dest = new File(target, file.name);
    if (dest.exists) dest.delete();
    await file.copy(dest);
  }

  const label = decodeURIComponent(target.uri.replace(/\/$/, '').split(/[/:]/).pop() ?? 'folder');
  return label || 'folder';
}
