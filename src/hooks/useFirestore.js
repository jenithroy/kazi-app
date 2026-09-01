import { useCallback, useState } from "react";
import { deleteRow, fetchAll, insertRow, updateRow } from "../lib/db";

/**
 * Per-collection CRUD with loading and error state.
 *
 * Same shape it had when this read Firestore -- the method names are kept so
 * callers do not change -- but every call now goes to Supabase, where RLS
 * decides what comes back and what is allowed through.
 *
 * The `filters` option still takes { field, op, value }; ops are PostgREST's
 * ("eq", "neq", "gt", "gte", "lt", "lte", "like", "in") rather than Firestore's
 * "==", and default to equality.
 */
export default function useFirestore(collectionName) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async (fn, failure) => {
    setLoading(true);
    setError("");
    try {
      return await fn();
    } catch (err) {
      setError(err.message || failure);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getDocs = useCallback(
    ({ filters = [], orderByField, orderDirection = "desc" } = {}) =>
      run(
        () => fetchAll(collectionName, { filters, orderBy: orderByField, orderDir: orderDirection }),
        "Failed to fetch documents"
      ),
    [collectionName, run]
  );

  const addDoc = useCallback(
    (payload) => run(() => insertRow(collectionName, payload), "Failed to create document"),
    [collectionName, run]
  );

  const updateDoc = useCallback(
    (id, payload) => run(() => updateRow(collectionName, id, payload), "Failed to update document"),
    [collectionName, run]
  );

  const removeDoc = useCallback(
    (id) => run(() => deleteRow(collectionName, id), "Failed to delete document"),
    [collectionName, run]
  );

  return { getDocs, addDoc, updateDoc, removeDoc, loading, error };
}
