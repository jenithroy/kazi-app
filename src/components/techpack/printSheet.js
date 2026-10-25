/**
 * Print a tech pack's sheet: a new window that holds only the sheet (the app is not loaded in it), then the browser's print dialog.
 *
 *   const { ok, message } = await printSheet({ pack, customer })
 *
 * The window is opened first, straight from the press, before anything is waited for: a browser only lets a pop-up open right after a
 * click, and the sheet's code (the sheet and its stylesheet as text) is fetched on the first Print. `ok: false` with a plain `message`
 * means the browser blocked it.
 *
 * The page is the same TechSheet the viewer draws (mode "print"), drawn once in a detached box and written out as markup (not with
 * react-dom/server: this app's chunking puts every react-dom module in the first download, and that one is 70 KB nobody else needs),
 * with sheet.css inline, A4 landscape with no margin, a page break after each sheet, colours exact. The window does not have the app's
 * font, so Geist is declared in it from the same files the app serves (same origin); if that fails the sheet falls back to Segoe UI /
 * Arial and still fits, every region being fixed. The dialog opens once every picture has loaded (or failed, which hides it, or 8
 * seconds have gone by).
 */
import { createElement } from "react";
import { sheetTitle } from "./sheetPlan";

export const BLOCKED = "Your browser blocked the print window. Allow pop-ups for this site and press Print again.";

const FONT_RANGES = {
  latin: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  "latin-ext": "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
};

/** The app's own font, by absolute address (the window is blank, so a root-relative one has nothing to be relative to). */
export function fontFaces(origin) {
  return Object.entries(FONT_RANGES).map(([name, range]) => (
    `@font-face{font-family:'Geist';font-style:normal;font-weight:400 700;font-display:block;src:url(${origin}/fonts/v5/geist-${name}.woff2) format('woff2');unicode-range:${range}}`
  )).join("\n");
}

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The whole document the window shows: the sheet's markup and its stylesheet, nothing else. */
export function sheetDocument({ markup, css, title, origin }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
${fontFaces(origin)}
@page { size: A4 landscape; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
@media screen { html, body { background: #cfd5d2; } .ts-sheet { margin: 0 auto; } .ts-page { margin: 0 auto 8px; } }
${css}
</style></head><body>${markup}</body></html>`;
}

/** Resolves when every picture in `doc` has loaded or failed (a failed one is hidden: its caption stays) and the fonts are ready. */
function settle(doc, ms = 8000) {
  const imgs = Array.from(doc.images || []);
  const done = imgs.map((img) => new Promise((resolve) => {
    const hide = () => { img.style.visibility = "hidden"; };
    if (img.complete) { if (!img.naturalWidth) hide(); resolve(); return; }
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => { hide(); resolve(); }, { once: true });
  }));
  const fonts = doc.fonts && doc.fonts.ready ? doc.fonts.ready.catch(() => {}) : Promise.resolve();
  return Promise.race([Promise.all([...done, fonts]), new Promise((resolve) => setTimeout(resolve, ms))]);
}

export async function printSheet({ pack, customer = null }) {
  const win = window.open("", "_blank");
  if (!win) return { ok: false, message: BLOCKED };
  try {
    win.document.open();
    win.document.write("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Tech pack</title></head><body style=\"margin:0;font:14px Arial,sans-serif;color:#333;padding:24px\">Getting the sheet ready&hellip;</body></html>");
    win.document.close();

    const [{ createRoot }, { flushSync }, { default: TechSheet }, { default: css }] = await Promise.all([
      import("react-dom/client"),
      import("react-dom"),
      import("./TechSheet"),
      import("./sheet.css?raw"),
    ]);
    const box = document.createElement("div");                // never attached to the page: only its markup is wanted
    const root = createRoot(box);
    let markup;
    try {
      flushSync(() => root.render(createElement(TechSheet, { pack, customer, mode: "print" })));
      markup = box.innerHTML;
    } finally {
      root.unmount();
    }
    const html = sheetDocument({ markup, css, title: sheetTitle(pack), origin: window.location.origin });

    win.document.open();
    win.document.write(html);
    win.document.close();

    await settle(win.document);
    if (win.closed) return { ok: true };                    // the window was closed before it was ready: nothing to print
    win.focus();
    win.print();
    return { ok: true };
  } catch (err) {
    console.error("Could not prepare the tech pack for printing:", err);
    try { win.close(); } catch { /* already gone */ }
    return { ok: false, message: "The sheet could not be got ready to print. Try again." };
  }
}
