/**
 * Website orders: the plain rules (nothing here draws anything or talks to the database).
 *
 * A customer's order from the website (the quote forms, "Create by design") is an ordinary order: a row of `orders` that `fs_orders` returns
 * with every other (so every page sees it), with `source = 'website'`, the number WEB-nnn, stage "Order Received", no price, no customer and
 * no side, and the details the website sent in `web` (migration 0071; the contract is docs/dashboard-link.md in the website's repo). The
 * team's own orders have `source = 'dashboard'`, or no `source` at all before the migration is applied: that reads the same.
 *
 * Only the Production page keeps the two apart (website orders are hidden there by default; the Filters panel's "Where from" choice):
 * `source` below is that choice,
 *   "team"     only the orders the team entered (the default: the page is exactly what it was before the website sent anything)
 *   "website"  only the orders customers placed on the website
 *   "all"      both
 *
 * Everything in `order.web` was typed by a stranger on the internet. It is shown as text, and an address, a link, a phone number or a
 * file path is only ever used after the checks below say it is what it claims to be.
 */

export const SOURCES = ["team", "website", "all"];

/** An order a customer placed on the website. */
export const isWebsiteOrder = (order) => order?.source === "website";

/** Is this order in the chosen "Where from" scope? */
export function inSource(order, source) {
  if (source === "all") return true;
  return source === "website" ? isWebsiteOrder(order) : !isWebsiteOrder(order);
}

/** The orders in the chosen scope (the same array when it is "all"). */
export const bySource = (orders, source) => (source === "all" ? orders : orders.filter((o) => inSource(o, source)));

/** How many orders each choice would show: { team, website, all }. */
export function sourceCounts(orders) {
  let website = 0;
  for (const o of orders) if (isWebsiteOrder(o)) website += 1;
  return { team: orders.length - website, website, all: orders.length };
}

/**
 * New: nobody has opened it yet. `webSeenAt` is the shared answer (set in the database the first time somebody who can edit opens it);
 * `seen` is this browser's own set of ids (so a person who may only look can clear it for themselves, and so does everyone before the
 * write lands).
 */
export const isUnseenWebsite = (order, seen) => isWebsiteOrder(order) && !order.webSeenAt && !(seen && seen.has(order.id));

/* ── Reading what the website sent ───────────────────────────── */

/** Text from a stranger: only a string, no control characters, trimmed and cut to `max`. */
export function cleanText(value, max = 400) {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

const numberOrNull = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** An http(s) address as the browser parses it, or null. javascript:, data:, a name with no scheme, an address with a password in it: none is a link. */
export function safeUrl(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  // eslint-disable-next-line no-control-regex
  if (!text || text.length > 300 || /[\u0000- \u007f]/.test(text)) return null;
  let url;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || !url.hostname.includes(".")) return null;
  return url.href;
}

/** How a safe address reads in a link: the host and the path, with no scheme. */
export function urlLabel(href) {
  try {
    const u = new URL(href);
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}`.replace(/\/$/, "");
  } catch { return String(href); }
}

/** An Instagram name (as Instagram allows them), without a leading at-sign; null when it is not one. */
export function instagramHandle(value) {
  const name = cleanText(value, 60).replace(/^@/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(name) ? name : null;
}

/** The mailto: address of an e-mail that is plainly one (no ?, &, %, comma or space: nothing that adds a recipient or a subject), else null. */
export function mailtoHref(value) {
  const mail = cleanText(value, 160);
  return /^[A-Za-z0-9._+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(mail) ? `mailto:${mail}` : null;
}

/** The tel: address of a phone number that is plainly one, else null. */
export function telHref(value) {
  const phone = cleanText(value, 40);
  if (!/^\+?[0-9][0-9 ()./-]{3,24}$/.test(phone)) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 5 ? `tel:${phone.startsWith("+") ? "+" : ""}${digits}` : null;
}

const FILE_KINDS = ["preview", "logo", "design", "artwork"];
export const FILE_KIND_LABEL = { preview: "Design preview", logo: "Customer's logo", design: "Embroidery file", artwork: "Artwork", file: "File" };

/** A storage path the website's Worker could have made: folders and a file name of plain characters. Never an address, never a way up a folder. */
const STORAGE_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}(\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}){1,3}$/;

/** The files the website sent, those with a usable path, each with its kind, name, type and size as text/numbers only. */
export function webFiles(order) {
  const list = Array.isArray(order?.web?.files) ? order.web.files.slice(0, 12) : [];
  const out = [];
  for (const f of list) {
    if (!f || typeof f !== "object" || typeof f.path !== "string" || !STORAGE_PATH.test(f.path)) continue;
    const kind = FILE_KINDS.includes(f.kind) ? f.kind : "file";
    const type = cleanText(f.type, 80).toLowerCase();
    const name = cleanText(f.name, 120) || f.path.split("/").pop();
    out.push({
      kind, name, type, path: f.path,
      bytes: numberOrNull(f.bytes),
      // what can be drawn as a picture
      image: /^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(type),
      // what the machine reads
      stitch: kind === "design" || /\.(dst|pes|exp|jef|vp3|xxx)$/i.test(name),
    });
  }
  return out;
}

const when = (v) => {
  if (typeof v !== "string") return "";
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
};

/**
 * What the order card shows about a website order: `order.web` made safe to draw, with the links already checked.
 * Nothing in it can be anything but text, a number, a checked address or a checked file.
 */
export function webInfo(order) {
  const w = order?.web && typeof order.web === "object" && !Array.isArray(order.web) ? order.web : {};
  const contact = w.contact && typeof w.contact === "object" ? w.contact : {};
  const brand = w.brand && typeof w.brand === "object" ? w.brand : {};
  const design = w.design && typeof w.design === "object" ? w.design : null;
  const files = webFiles(order);
  const website = safeUrl(brand.website);
  const handle = instagramHandle(brand.handle);
  const logoFrom = ["instagram", "website", "upload"].includes(brand.logoFrom) ? brand.logoFrom : "";

  const items = (Array.isArray(w.items) ? w.items.slice(0, 10) : []).filter((i) => i && typeof i === "object").map((i) => {
    const colour = i.colour && typeof i.colour === "object" ? i.colour : null;
    return {
      label: cleanText(i.label, 80) || cleanText(i.garment, 60) || "Item",
      qty: numberOrNull(i.qty),
      colour: colour ? { hex: /^#[0-9a-fA-F]{6}$/.test(String(colour.hex)) ? String(colour.hex) : "", label: cleanText(colour.label, 40) } : null,
    };
  });

  const facts = design ? {
    stitches: numberOrNull(design.stitches), colours: numberOrNull(design.colours),
    widthMm: numberOrNull(design.widthMm), heightMm: numberOrNull(design.heightMm), placement: cleanText(design.placement, 60),
  } : null;
  const hasFacts = facts && (facts.stitches != null || facts.colours != null || facts.widthMm != null || facts.placement);

  const rightsConfirmed = brand.rightsConfirmed === true;
  // A logo is involved when one was sent or looked up, or the brand was named for it, or it is a design order.
  const logoInvolved = files.some((f) => f.kind === "logo") || Boolean(logoFrom) || Boolean(handle || cleanText(brand.handle, 60)) || w.kind === "design";

  return {
    kind: w.kind === "design" || w.kind === "quote" ? w.kind : "",
    receivedAt: when(w.receivedAt),
    contact: { name: cleanText(contact.name, 120), email: cleanText(contact.email, 160), phone: cleanText(contact.phone, 40), company: cleanText(contact.company, 160) },
    brand: {
      handle, handleRaw: cleanText(brand.handle, 60), website, websiteRaw: cleanText(brand.website, 200), logoFrom, rightsConfirmed,
    },
    items,
    service: cleanText(w.service, 60),
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(w.deadline)) ? String(w.deadline) : "",
    message: cleanText(w.message, 4000),
    design: hasFacts ? facts : null,
    files,
    // "Check the logo is theirs before anything is made": whenever a logo is involved and the customer did not say it is theirs
    needsRightsCheck: logoInvolved && !rightsConfirmed,
  };
}
