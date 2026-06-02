import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Load multiple Firestore collections in parallel using Promise.allSettled.
 * Each value in collectionsMap is a collection name string.
 * Returns an object keyed by the same keys, where each value is an array of
 * { id, ...data } objects. Collections that fail (e.g. permission denied)
 * return an empty array so a single bad collection never crashes the caller.
 *
 * Example:
 *   const { attendance, orders } = await loadCollections({ attendance: "attendance", orders: "orders" });
 */
export async function loadCollections(collectionsMap) {
  const keys = Object.keys(collectionsMap);
  const results = await Promise.allSettled(
    keys.map(k => getDocs(collection(db, collectionsMap[k])))
  );
  const out = {};
  keys.forEach((k, i) => {
    const result = results[i];
    if (result.status === "fulfilled") {
      out[k] = result.value.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      console.warn(`loadCollections: failed to load "${collectionsMap[k]}":`, result.reason);
      out[k] = [];
    }
  });
  return out;
}
