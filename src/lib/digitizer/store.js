/**
 * Where the last design is kept on this computer, so that a closed tab does not lose the work.
 *
 * A design is text (JSON), and a big one (a detailed picture on a big hoop) is megabytes of it: more than the 5 MB or so a page may keep in
 * localStorage, which then refused it ("storage is full") and the design could not be brought back. So it is kept in IndexedDB, which allows
 * hundreds of megabytes and is written without holding up the page. localStorage keeps only a small marker (`"idb"`), so the page knows at
 * once, without waiting for the database, that there is a design to bring back, and it is the fallback where IndexedDB is not there (some
 * private windows). Before this, localStorage held the design itself under the same key: that copy is still read, and replaced on the next save.
 */

const KEY = "kazi.digitizer.autosave";
const DB = "kazi-digitizer";
const STORE = "kv";
const ID = "autosave";
const MARK = "idb";

/** One transaction on the object store; resolves to what `fn` asked for (a read's result). */
function run(mode, fn) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB is not available")); return; }
    let req;
    try { req = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onerror = () => reject(req.error || new Error("IndexedDB could not be opened"));
    req.onblocked = () => reject(new Error("IndexedDB is blocked"));
    req.onsuccess = () => {
      const db = req.result;
      let out;
      try {
        const tx = db.transaction(STORE, mode);
        tx.oncomplete = () => { db.close(); resolve(out && "result" in out ? out.result : undefined); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error("IndexedDB transaction failed")); };
        out = fn(tx.objectStore(STORE));
      } catch (e) { try { db.close(); } catch { /* already closed */ } reject(e); }
    };
  });
}

const local = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(KEY, v); return true; } catch { return false; } },
  del: () => { try { localStorage.removeItem(KEY); } catch { /* blocked */ } },
};

/** Is there a design to bring back? Known at once (the marker, or the old copy in localStorage); `peekAutosave` also asks the database. */
export const hasAutosave = () => !!local.get();

/** The same, asking IndexedDB too (the marker may be missing where localStorage is blocked). */
export async function peekAutosave() {
  if (hasAutosave()) return true;
  try { return (await run("readonly", (s) => s.count(ID))) > 0; } catch { return false; }
}

/**
 * Keep this design (JSON text). Resolves to true when it is kept, false when nowhere would take it (then the caller says so).
 * IndexedDB first, the marker after it; without IndexedDB, localStorage itself, for what fits.
 */
export async function saveAutosave(text) {
  try {
    await run("readwrite", (s) => s.put(text, ID));
    if (local.get() !== MARK) local.set(MARK); // (if even this is refused, `peekAutosave` still finds the design in the database)
    return true;
  } catch {
    return local.set(text);
  }
}

/** The last design as JSON text, or null. */
export async function loadAutosave() {
  const mark = local.get();
  if (mark && mark !== MARK) return mark; // a copy made before IndexedDB was used: the design itself
  try { return (await run("readonly", (s) => s.get(ID))) ?? null; } catch { return null; }
}

/** Forget the last design (an old one must not come back as "your last design" after a save that failed). */
export async function clearAutosave() {
  local.del();
  try { await run("readwrite", (s) => s.delete(ID)); } catch { /* none, or no IndexedDB */ }
}
