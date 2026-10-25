/**
 * Saving and deleting a tech pack: the writes behind the editor (components/techpack/Editor.jsx).
 *
 * What goes to the database is always `packPayload(pack)` from lib/techpack.js, so the sheet, the order form and the customer's
 * card read back exactly what the editor meant. This file adds what a payload cannot know:
 *
 *   - every picture that is still only a file on this computer is shrunk and uploaded (three at a time) and its address is put
 *     into the pack FIRST; only then is the row written, once, with everything in it. A picture that cannot be saved therefore leaves
 *     nothing behind: no tech pack without its pictures, and "Nothing has been saved" stays true;
 *   - the answer is read back from the database, because row-level security drops a refused update without an error: if the
 *     `updatedAt` we just wrote is not what comes back, the change was not accepted and we say so;
 *   - a tech pack that somebody else saved (or deleted) while the card was open is noticed before anything is written: a save replaces
 *     the whole row, so it would quietly undo their work. The first Save says so; `force` (a second press) writes anyway;
 *   - a first Save that ended without an answer (the connection dropped after the database had the row) may have made the tech pack
 *     anyway: the next Save LOOKS for it before it makes another, and never makes a second one it cannot rule out;
 *   - the `updatedAt` this card wrote itself is not mistaken for somebody else's change.
 *
 * The functions that only reshape a pack (`prepareForSave`, `applyUploaded`, `pictureJobs`) are plain and exported, so the editor
 * and the tests use the very same ones.
 */
import { deleteRow, fetchAll, fetchOne, insertRow, updateRow } from "./db";
import { PACK_LIST_COLUMNS } from "./packColumns";
import { chartSizes, defaultRefSize, letterFor, packPayload, readPack, sortSizes } from "./techpack";
import { compressFabricImage, uploadImage } from "./inventoryImages";

const str = (v) => (v === null || v === undefined ? "" : String(v));
const list = (v) => (Array.isArray(v) ? v : []);

/* ── Which numbers survive a Save ──────────────────────────────── */

/** Sizes a number was typed for that are not on the pack's list (the sheet draws them as extra columns). */
export const offListSizes = (pack) => chartSizes(pack).filter((s) => !pack.sizes.includes(s));

/**
 * Sizes whose typed numbers a Save would drop: a size taken off the list in this sitting. A size that was already off the list when
 * the pack was opened (an old pack whose "Medium" was never in its size list) is kept, so opening and saving never loses a number.
 * With no sizes chosen at all there is nothing to compare with, so nothing is dropped.
 */
export function droppedSizes(pack, keep = []) {
  if (!list(pack.sizes).length) return [];
  const kept = new Set(keep);
  const out = new Set();
  for (const p of list(pack.points)) {
    for (const [size, v] of Object.entries(p.values || {})) {
      if (str(v).trim() !== "" && !pack.sizes.includes(size) && !kept.has(size)) out.add(size);
    }
  }
  return sortSizes([...out]);
}

/**
 * The pack as it will be written: lines with neither a name nor a number are left out (the sheet would draw a letter that points at
 * nothing), what is left is lettered again from A so the sheet never has a gap, a line on a picture that is not being saved loses
 * its line, and the numbers of a size taken off the list go. `row` is the saved row this pack started from (null for a new one).
 */
export function prepareForSave(pack, row = null) {
  const keep = row ? offListSizes(readPack(row)) : [];
  const kept = new Set(keep);
  const sizes = sortSizes(pack.sizes);
  const live = new Set(list(pack.views).filter((v) => v && (v.url || v.file)).map((v) => v.id));
  const points = list(pack.points)
    .map((p) => ({
      ...p,
      values: Object.fromEntries(
        Object.entries(p.values || {})
          .map(([k, v]) => [k, str(v).trim()])
          .filter(([k, v]) => v !== "" && (!sizes.length || sizes.includes(k) || kept.has(k))),
      ),
    }))
    .filter((p) => str(p.label).trim() || Object.keys(p.values).length)
    .map((p, i) => ({
      ...p,
      letter: letterFor(i),
      view: p.line && live.has(p.view) ? p.view : null,
      line: p.line && live.has(p.view) ? p.line : null,
    }));
  const refSize = sizes.length && !sizes.includes(pack.refSize) && !kept.has(pack.refSize) ? defaultRefSize(sizes) : pack.refSize;
  return { ...pack, sizes, refSize, points };
}

/* ── Pictures ──────────────────────────────────────────────────── */

const PICTURE_LISTS = ["views", "details", "construction", "labelling", "prints"];

/** Every picture that is still only a file: `{ target: { list, id }, file }`. The brand logo is `list: "logo"`. */
export function pictureJobs(pack) {
  const jobs = [];
  for (const name of PICTURE_LISTS) for (const item of list(pack[name])) if (item && item.file) jobs.push({ target: { list: name, id: item.id }, file: item.file });
  for (const m of list(pack.materials)) if (m && m.swatchFile) jobs.push({ target: { list: "materials", id: m.id }, file: m.swatchFile });
  if (pack.brandLogoFile) jobs.push({ target: { list: "logo", id: "logo" }, file: pack.brandLogoFile });
  return jobs;
}

/** The pack with the address of an uploaded picture put in and its file let go (so a second Save does not send it again). */
export function applyUploaded(pack, target, url) {
  const { list: name, id } = target;
  if (name === "logo") return { ...pack, brandLogoUrl: url, brandLogoFile: null };
  if (name === "materials") return { ...pack, materials: list(pack.materials).map((m) => (m.id === id ? { ...m, swatchUrl: url, swatchFile: null } : m)) };
  return { ...pack, [name]: list(pack[name]).map((p) => (p.id === id ? { ...p, url, file: null } : p)) };
}

const KIND_IN_PATH = { views: "view", details: "detail", construction: "construction", labelling: "label", prints: "print", materials: "swatch", logo: "logo" };

/** Where a picture goes in the `product-media` bucket: one folder per tech pack, a new name every time so nothing is overwritten. */
export const pathFor = (patternId, target) =>
  `patterns/sheet/${patternId}/${KIND_IN_PATH[target.list] || "picture"}-${str(target.id).replace(/[^A-Za-z0-9_-]/g, "") || "x"}-${Date.now()}.jpg`;

/** Run `worker` over `jobs`, `size` at a time. After the first failure nothing new starts; what was running finishes, then it throws. */
async function runPool(jobs, size, worker) {
  let next = 0;
  let failure = null;
  const lanes = Array.from({ length: Math.min(size, jobs.length) }, async () => {
    while (!failure && next < jobs.length) {
      const job = jobs[next];
      next += 1;
      try { await worker(job); } catch (err) { if (!failure) failure = err; }
    }
  });
  await Promise.all(lanes);
  if (failure) throw failure;
}

/** Which picture, in words a person can find on the card ("view 2", "close-up 3", "the swatch of Lining"). */
function whereIs(pack, target) {
  const at = (items) => list(items).findIndex((x) => x && x.id === target.id) + 1;
  switch (target.list) {
    case "views": return `view ${at(pack.views)}`;
    case "details": return `close-up ${at(pack.details)}`;
    case "construction": return `construction picture ${at(pack.construction)}`;
    case "labelling": return `label picture ${at(pack.labelling)}`;
    case "prints": return `the picture of print ${at(pack.prints)}`;
    case "materials": {
      const m = list(pack.materials).find((x) => x && x.id === target.id);
      return `the swatch of ${str(m?.name).trim() || `material ${at(pack.materials)}`}`;
    }
    case "logo": return "the brand logo";
    default: return "a picture";
  }
}

/* ── Plain words for what went wrong ───────────────────────────── */

/** Whether the database refused outright (row-level security, a rule): then nothing was written. */
const isRefusal = (err) => /row-level security|permission denied|42501/i.test(str(err?.message || err)) || err?.code === "42501";

/**
 * Did an earlier try make this tech pack? A row with the name and reference that try was writing, made since it began and written as a
 * sheet (two minutes of slack, for a clock that is a little off). Returns the row, null (looked, it is not there) or undefined (could not look).
 */
async function findMade({ startedAt, name, styleNo }) {
  try {
    const rows = await fetchAll("patterns", { filters: [{ field: "name", value: name }], orderBy: "createdAt", orderDir: "desc", limit: 5, columns: PACK_LIST_COLUMNS });
    return rows.find((r) => Number(r.sheetFormat) === 2 && str(r.styleNo) === styleNo && Date.parse(r.createdAt) >= startedAt - 120000) || null;
  } catch {
    return undefined;
  }
}

/** The folder a NEW pack's pictures are kept in until it has an id of its own. */
const newFolder = () => `new-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function why(err) {
  const m = str(err?.message || err).trim();
  if (/row-level security|permission denied|not allowed|42501/i.test(m)) return "you may not be allowed to change tech packs";
  if (/Failed to fetch|NetworkError|network|timeout|timed out|load failed/i.test(m)) return "the connection dropped";
  if (/too large/i.test(m)) return "a picture is too large to keep: choose a smaller one";
  return m && !/^\[object /.test(m) ? m : "something went wrong";
}

/* ── Saving ────────────────────────────────────────────────────── */

const sameInstant = (a, b) => {
  const x = Date.parse(a);
  return Number.isFinite(x) && x === Date.parse(b);
};

/** "14:32", the time on this computer (the same clock the rest of the app shows times by). */
const clock = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "a moment ago" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

/**
 * Save a pack and give back the row as the database now holds it.
 *
 *   pack        the editor's pack (readPack's shape, plus `file` / `preview` on a picture that is not saved yet)
 *   row         the saved row this pack came from; null for a new pack
 *   region      "uk" | "nepal" | "": written beside `market` (empty leaves the row's region alone)
 *   profileName accepted for callers that have it; the tech pack has no "made by" column, so it is not written
 *   onUploaded  (target, url) one picture is saved: the editor keeps the address and lets go of the file
 *   onProgress  ({ done, total }) pictures saved so far
 *   onInserted  (row) a new pack's row now exists
 *   attempt     { startedAt, name, styleNo } of an earlier try at making the row that ended without an answer (null when there was none)
 *   onAttempt   (attempt | null) a try is about to make the row / that try is known not to have made it
 *   ownStamps   the `updatedAt` values this card already tried to write: a change carrying one of them is our own, not someone else's
 *   onStamp     (stamp) an update with this `updatedAt` is about to be sent
 *   force       write over a change somebody else made since `row` was read (the person has been told and pressed Save again)
 *
 * The order is pictures first, row after. A picture that cannot be saved stops everything before anything is written, so a failed Save
 * leaves nothing behind and "Nothing has been saved" stays true; the pictures that did go up keep their addresses (`onUploaded`) and
 * are not sent again. A new pack's pictures are kept in their own `new-…` folder, because its row (and so its id) does not exist yet.
 *
 * Throws an Error whose message is plain enough to show as it is. `error.conflict` says someone else changed the pack first;
 * `error.gone` says they deleted it.
 */
export async function saveTechPack({
  pack, row = null, region = "", profileName = "", onInserted, attempt = null, onAttempt, ownStamps = [], onStamp, onUploaded, onProgress, force = false,
} = {}) {
  void profileName;
  if (!str(pack?.name).trim()) throw new Error("Give the tech pack a name first.");
  const prepared = prepareForSave(pack, row);
  const regionKey = region ? { region } : {};

  // an existing tech pack: has someone else changed or deleted it since this card read it? (A failed look does not stop the save:
  // the update below says plainly if the database cannot be reached.)
  if (row?.id && !force) {
    let now;
    let looked = true;
    try { now = await fetchOne("patterns", String(row.id)); } catch { looked = false; }
    if (looked && !now) throw Object.assign(new Error("This tech pack is not there any more: someone deleted it while you were editing. Copy what you need, then close this card."), { gone: true });
    if (looked && now.updatedAt && row.updatedAt && !sameInstant(now.updatedAt, row.updatedAt) && !ownStamps.some((s) => sameInstant(now.updatedAt, s))) {
      throw Object.assign(
        new Error(`Someone else saved this tech pack at ${clock(now.updatedAt)} while you were editing it. Press Save again to replace their changes with yours, or Cancel to keep theirs.`),
        { conflict: true },
      );
    }
  }

  let id = row?.id ? String(row.id) : "";

  // 1. the pictures that are still only files
  let work = prepared;
  const jobs = pictureJobs(work);
  onProgress?.({ done: 0, total: jobs.length });
  const folder = id || newFolder();
  let done = 0;
  try {
    await runPool(jobs, 3, async (job) => {
      try {
        let small;
        try { small = await compressFabricImage(job.file); } catch { throw Object.assign(new Error("unreadable"), { unreadable: true }); }
        const url = await uploadImage(pathFor(folder, job.target), small);
        work = applyUploaded(work, job.target, url);            // `work` is read when the picture lands, so three at a time cannot undo each other
        onUploaded?.(job.target, url);
        done += 1;
        onProgress?.({ done, total: jobs.length });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(why(err));
        e.place = whereIs(prepared, job.target);
        throw e;
      }
    });
  } catch (err) {
    const tail = id ? "Nothing was changed yet. " : "Nothing was saved yet. ";
    if (err?.unreadable) throw new Error(`A picture could not be read (${err.place}): it may be damaged. ${tail}Take it out and add it again, then press Save.`);
    throw new Error(`A picture could not be saved (${err?.place || "one of them"}): ${why(err)}. ${tail}Press Save to try again; what you typed is kept.`);
  }

  // 2. a new pack: the row is made now, once, with every picture's address in it
  if (!id) {
    // an earlier try may have made it without telling us (the answer was lost on the way back): look for it before making another
    if (attempt?.startedAt) {
      const found = await findMade(attempt);
      if (found === undefined) {
        throw new Error("The first Save may already have made this tech pack, and the list could not be read to check. Look in the Tech packs list: if it is there, close this card and open that one. If it is not there, press Save again.");
      }
      if (found) {
        id = String(found.id);
        onInserted?.(found);
      }
    }
  }
  if (!id) {
    onAttempt?.({ startedAt: Date.now(), name: str(work.name).trim(), styleNo: str(work.styleNo).trim() });
    let made;
    try {
      made = await insertRow("patterns", { ...packPayload(work), ...regionKey });
    } catch (err) {
      const refused = isRefusal(err);
      if (refused) onAttempt?.(null);                           // the database said no outright: nothing was made, so there is nothing to look for
      throw new Error(`The tech pack could not be saved: ${why(err)}. ${refused ? "" : "It may have been made anyway: the next Save looks for it first. "}Press Save to try again; what you typed is kept.`);
    }
    if (!made?.id) throw new Error("The database did not create the tech pack. You may not be allowed to add tech packs.");
    onInserted?.(made);
    return made;
  }

  // 3. a tech pack that exists: the row is updated once with everything
  const stamp = new Date().toISOString();
  onStamp?.(stamp);
  let fresh;
  try {
    fresh = await updateRow("patterns", id, { ...packPayload(work), ...regionKey, updatedAt: stamp });
  } catch (err) {
    throw new Error(`The tech pack could not be saved: ${why(err)}. Press Save to try again; what you typed is kept.`);
  }
  // row-level security quietly drops an update it refuses: the row that comes back is then the old one
  if (!fresh || !sameInstant(fresh.updatedAt, stamp)) {
    throw new Error("The database did not accept the change. You may not be allowed to edit tech packs.");
  }
  return fresh;
}

/* ── Deleting ──────────────────────────────────────────────────── */

/** How many orders were made from a tech pack, or null when that could not be read (the card then speaks of "any orders"). */
export async function ordersMadeFrom(patternId) {
  try {
    return (await fetchAll("orders", { filters: [{ field: "patternId", value: patternId }] })).length;
  } catch {
    return null;
  }
}

/**
 * Delete a tech pack. The orders made from it stay: the database sets their `pattern_id` to null. Pictures stay in storage.
 * Returns `{ ok: true, ordersUnlinked }` (null when the orders could not be counted) or throws.
 */
export async function deleteTechPack(row) {
  if (!row?.id) throw new Error("This tech pack was never saved, so there is nothing to delete.");
  const ordersUnlinked = await ordersMadeFrom(row.id);
  try {
    await deleteRow("patterns", row.id);
  } catch (err) {
    throw new Error(`Could not delete it: ${why(err)}.`);
  }
  // a delete that row-level security refuses removes nothing and says nothing: look again
  const still = await fetchOne("patterns", row.id).catch(() => null);
  if (still) throw new Error("The database did not delete it. You may not be allowed to delete tech packs.");
  return { ok: true, ordersUnlinked };
}
