/*
 * The help's clips, and getting them early. A clip is small (50 to 260 KB) but choosing one starts a download, which is a wait on a slow
 * connection. So once a clip is playing, the next two are fetched quietly, one after the other, and kept in memory (an object URL): choosing
 * one of those starts at once, with no network at all. A clip that has not been fetched streams as it always did, and so does one that is
 * chosen while it is still on its way (the fetches under way are stopped, so the stream has the connection to itself): the worst case is
 * the old behaviour. The clips stay for the life of the page, so opening the help again costs nothing (about 2 MB if all 13 were fetched).
 * Nothing is fetched where the visitor has asked to save data.
 *
 * (A module of its own, not part of Help.jsx: a component file that also exports functions is reloaded whole by the dev server's fast refresh.)
 */
import { HELP_ITEMS } from "./helpContent";

/**
 * Whether the help has a video for each feature. The website's clips show the website's own screens, so they are not used here: the help is
 * its words only until the clips are recorded from this page (the website's recorder is scripts/digitizer-help in jenithroy/kazi-platform).
 * Set to true when public/videos/digitizer/<id>.webm|.mp4|.jpg exist.
 */
export const HAS_CLIPS = false;

export const VIDEOS = "/videos/digitizer"; // <id>.webm, <id>.mp4 and <id>.jpg (the first frame) are in here

export const clips = new Map(); // id -> an object URL of the clip's bytes, once they are in
const fetching = new Map();     // id -> { done, stop } while the bytes are on their way

// webm (VP9) where the browser plays it, as it is the first <source>; otherwise the mp4
const clipType = () => { try { return document.createElement("video").canPlayType('video/webm; codecs="vp9"') ? "webm" : "mp4"; } catch { return "mp4"; } };

/** Fetch a clip into memory. Resolves to true once it is there, and to false if it could not be fetched or was stopped. */
export function warmClip(id) {
  if (clips.has(id)) return Promise.resolve(true);
  if (fetching.has(id)) return fetching.get(id).done;
  if (typeof navigator !== "undefined" && navigator.connection?.saveData) return Promise.resolve(false);
  const ctl = new AbortController();
  const done = fetch(`${VIDEOS}/${id}.${clipType()}`, { priority: "low", signal: ctl.signal })
    .then((r) => (r.ok && /^video\//.test(r.headers.get("content-type") || "") ? r.blob() : null))
    .then((blob) => { if (blob) clips.set(id, URL.createObjectURL(blob)); return clips.has(id); })
    .catch(() => false) // (the clip then streams when it is chosen, as it would have)
    .finally(() => fetching.delete(id));
  fetching.set(id, { done, stop: () => ctl.abort() });
  return done;
}

/** Stop the quiet fetches that are under way (a clip is about to stream and should have the connection to itself). */
export function stopWarming() {
  for (const f of fetching.values()) f.stop();
}

/** The first clip, fetched while the pointer is on the "?" so that the help opens on a moving picture. */
export const warmHelp = () => { if (HAS_CLIPS) warmClip(HELP_ITEMS[0].id); };

/** Have the clips after this one ready, one after the other (a visitor mostly goes down the list). */
export function warmAfter(id) {
  if (!HAS_CLIPS) return;
  const k = HELP_ITEMS.findIndex((i) => i.id === id);
  const [a, b] = HELP_ITEMS.slice(k + 1, k + 3);
  if (a) warmClip(a.id).then((ok) => { if (ok && b) warmClip(b.id); });
}
