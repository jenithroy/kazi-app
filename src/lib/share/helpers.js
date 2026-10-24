/**
 * Small tools the record adapters share: reading a file or a picture from its address, file names, money, the time stamp on a
 * snapshot. Nothing heavy is imported here (the PDF maker is fetched by the adapters that need it, in pdfKit.jsx).
 */

/** A file or picture from its address, as a Blob. Says why in words when it cannot be had. */
export async function fetchBlob(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("The file could not be reached. Check the connection and try again.");
  }
  if (!res.ok) throw new Error(`The file could not be read (${res.status}).`);
  return res.blob();
}

/** A name that is safe in every file system, with the extension kept. */
export function safeFileName(base, ext) {
  const NOT_ALLOWED = "\\/:*?\"<>|";
  let clean = "";
  for (const ch of String(base || "file")) clean += NOT_ALLOWED.includes(ch) || ch.charCodeAt(0) < 32 ? " " : ch;
  clean = clean.split(/\s+/).filter(Boolean).join(" ").slice(0, 100) || "file";
  const e = ext ? `.${String(ext).replace(/^\./, "").toLowerCase()}` : "";
  return clean + e;
}

const MIME_EXT = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** The extension a file should have: the one in its name, or the one its type says. */
export function extOf(name, mime) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || ""));
  if (m) return m[1].toLowerCase();
  return MIME_EXT[mime] || "bin";
}

/**
 * A picture as a JPEG data address no bigger than `maxSide` on its longest side. The PDF maker draws JPEG and PNG only, so this turns
 * a WebP (or anything else the browser can read) into a JPEG, puts a white sheet under a transparent one, and turns a phone photo
 * the right way up.
 */
export async function pictureAsJpeg(url, maxSide = 2000) {
  const blob = await fetchBlob(url);
  let bmp;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    throw new Error("A picture could not be read.");
  }
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const width = Math.max(1, Math.round(bmp.width * scale));
  const height = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.9), width, height };
}

/** The same, for a picture that may not be there: a missing one is `null`, not a failure. */
export async function pictureOrNull(url, maxSide) {
  if (!url) return null;
  try {
    return await pictureAsJpeg(url, maxSide);
  } catch {
    return null;
  }
}

/** Money as the PDF's font can draw it (the rupee sign is not in it). */
export const rs = (n) => `Rs ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** When the snapshot was taken, in the office's time: "22 Oct 2026, 14:32". */
export function takenAt(now = new Date()) {
  return now.toLocaleString("en-GB", { timeZone: "Asia/Kathmandu", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "412 KB", "1.3 MB" */
export function sizeLabel(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The logo for a header, as a data address; `null` when it cannot be had (a snapshot without a logo is still a snapshot).
 * The site's logo file is WHITE on a clear background (it is drawn on the dark top bar, and the light theme inverts it), so on a white
 * PDF page it would be invisible: it is drawn small (400px wide is plenty for a header and keeps each PDF small) and painted in the ink.
 */
export async function logoDataUrl() {
  try {
    const bmp = await createImageBitmap(await fetchBlob(`${window.location.origin}/kazi-logo-trimmed.png`));
    const width = Math.min(400, bmp.width);
    const height = Math.max(1, Math.round((bmp.height * width) / bmp.width));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, width, height);
    ctx.globalCompositeOperation = "source-in";           // keep the shape, replace the colour
    ctx.fillStyle = "#0a1c14";
    ctx.fillRect(0, 0, width, height);
    bmp.close?.();
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Characters the PDF's built-in font (WinAnsi) can draw beyond plain ASCII and Latin-1: typographic quotes, dashes, a bullet, an ellipsis, the euro. */
const DRAWABLE_EXTRA = new Set([0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2022, 0x2026, 0x20ac]);
/** What the font cannot draw but means something: the rupee sign is written "Rs", arrows as "->", ticks are dropped. */
const SWAP = new Map([[0x20a8, "Rs "], [0x2192, "->"], [0x2794, "->"], [0x2713, ""], [0x2714, ""]]);

/** Text the PDF's built-in font can draw: what it cannot is shown as "?" rather than as a blank box that looks like a bug. */
export function pdfText(value) {
  let out = "";
  for (const ch of String(value ?? "")) {
    const c = ch.codePointAt(0);
    if (SWAP.has(c)) out += SWAP.get(c);
    else if (c === 9 || c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || DRAWABLE_EXTRA.has(c)) out += ch;
    else out += "?";
  }
  return out;
}
