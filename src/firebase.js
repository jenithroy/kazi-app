import { initializeApp } from "firebase/app";
import { browserSessionPersistence, getAuth, setPersistence } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

/**
 * What Firebase is still for.
 *
 * Auth — as a fallback, so anyone who has not set a Supabase password yet can
 * still sign in with their old one. Storage — file uploads (VAT bills, tech
 * packs, swatches) still live in a Firebase bucket. Messaging — push tokens.
 *
 * NOT Firestore. All data reads and writes go to Supabase; nothing imports a
 * Firestore handle any more, and the SDK is deliberately not initialised here.
 * That matters beyond tidiness: when a Firestore listener fails it throws out
 * of its own async queue, which React cannot catch, so a single denied read
 * unmounted the entire app. Leaving it initialised would keep that failure mode
 * available for no benefit.
 */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

/**
 * Firebase sessions last for the tab, not forever.
 *
 * Firebase is no longer where anyone lives — it is the fallback that lets
 * someone who has not set a Supabase password yet sign in with their old one.
 * Its default (browserLocalPersistence) keeps a session in localStorage
 * indefinitely, which meant a login from *before* the migration silently
 * signed people straight through to the dashboard without ever showing the
 * login screen.
 *
 * Session persistence keeps that path working for anyone who types their old
 * password — reloads are fine — while making sure a leftover session from a
 * previous browser session does not count as being signed in. The durable
 * "stay logged in" session is Supabase's, which is where everyone is heading.
 *
 * Awaited by the login form before it calls signInWithEmailAndPassword, so the
 * setting is always in place before a session is created.
 */
const firebasePersistenceReady = setPersistence(auth, browserSessionPersistence)
  .catch(err => console.warn("Could not set Firebase session persistence:", err));

export { app, auth, storage, firebaseConfig, firebasePersistenceReady };
