import { useCallback, useState } from "react";
import {
  addDoc as firebaseAddDoc,
  collection,
  doc,
  getDocs as firebaseGetDocs,
  orderBy,
  query,
  updateDoc as firebaseUpdateDoc,
  where
} from "firebase/firestore";
import { db } from "../firebase";

export default function useFirestore(collectionName) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getDocs = useCallback(
    async ({ filters = [], orderByField, orderDirection = "desc" } = {}) => {
      setLoading(true);
      setError("");
      try {
        const constraints = [];

        filters.forEach(({ field, op = "==", value }) => {
          constraints.push(where(field, op, value));
        });

        if (orderByField) {
          constraints.push(orderBy(orderByField, orderDirection));
        }

        const q = constraints.length
          ? query(collection(db, collectionName), ...constraints)
          : query(collection(db, collectionName));

        const snapshot = await firebaseGetDocs(q);
        return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      } catch (err) {
        const message = err.message || "Failed to fetch documents";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [collectionName]
  );

  const addDoc = useCallback(
    async (payload) => {
      setLoading(true);
      setError("");
      try {
        return await firebaseAddDoc(collection(db, collectionName), payload);
      } catch (err) {
        const message = err.message || "Failed to create document";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [collectionName]
  );

  const updateDoc = useCallback(
    async (id, payload) => {
      setLoading(true);
      setError("");
      try {
        const ref = doc(db, collectionName, id);
        await firebaseUpdateDoc(ref, payload);
      } catch (err) {
        const message = err.message || "Failed to update document";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [collectionName]
  );

  return { getDocs, addDoc, updateDoc, loading, error };
}
