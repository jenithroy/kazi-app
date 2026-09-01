/**
 * Kept as a re-export so the pages that import `loadCollections` from here
 * carry on working. The implementation moved to lib/db.js when the data moved
 * to Supabase; the contract is unchanged -- pass a map of key -> collection
 * name, get back a map of key -> array, and a collection that fails comes back
 * empty rather than taking the page down.
 *
 * New code should import from "../lib/db" directly.
 */
export { loadCollections } from "../lib/db";
