/**
 * One-time script: remove duplicate Wilson user docs from Firestore.
 *
 * What it does:
 *  1. Deletes the old stub doc  "wilson_kazi_com"  (created from wilson@kazi.com)
 *  2. Finds Wilson's real doc   (email: wilsonshah98765@gmail.com)
 *  3. Upgrades it to nepal_admin with default permissions so he can log in correctly
 *
 * Run with:  node scripts/cleanup-wilson.mjs
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyCTQur3QQtoD9Ji6my9WpW-MtI0xBAmRng",
  authDomain:        "kazi-manufacturing.firebaseapp.com",
  projectId:         "kazi-manufacturing",
  storageBucket:     "kazi-manufacturing.firebasestorage.app",
  messagingSenderId: "587869032874",
  appId:             "1:587869032874:web:18d9f44ec05a09dcd39bd3",
};

const DEFAULT_PERMISSIONS = {
  tasks:      true,
  attendance: true,
  production: true,
  inventory:  true,
  qc:         true,
  billing:    true,
  employees:  true,
  budget:     true,
  finance: {
    expenses:     true,
    payroll:      true,
    purchases:    true,
    vatBills:     true,
    journal:      true,
    ledger:       true,
    pl:           true,
    balanceSheet: true,
  },
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

async function main() {
  console.log("🔍  Scanning users collection...\n");

  const snap = await getDocs(collection(db, "users"));
  const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`   Found ${allDocs.length} documents total`);
  allDocs.forEach(u => console.log(`   • [${u.id}]  ${u.name || "?"}  <${u.email || "no email"}>  role=${u.role}`));
  console.log();

  // ── 1. Delete old stub ──────────────────────────────────
  const OLD_STUB_ID = "wilson_kazi_com";
  const stubDoc = allDocs.find(u => u.id === OLD_STUB_ID);
  if (stubDoc) {
    await deleteDoc(doc(db, "users", OLD_STUB_ID));
    console.log(`✅  Deleted old stub  "${OLD_STUB_ID}"`);
  } else {
    console.log(`ℹ️   Stub "${OLD_STUB_ID}" not found — already clean`);
  }

  // ── 2. Find Wilson's real doc by Gmail ──────────────────
  const WILSON_EMAIL = "wilsonshah98765@gmail.com";
  const realDoc = allDocs.find(u =>
    (u.email || "").toLowerCase() === WILSON_EMAIL.toLowerCase()
  );

  if (!realDoc) {
    console.log(`\n⚠️   No doc found for ${WILSON_EMAIL} — Wilson hasn't logged in yet.`);
    console.log(`    That's fine — when he logs in, constants.js now maps him to nepal_admin.`);
  } else {
    // Upgrade role + grant default permissions
    await updateDoc(doc(db, "users", realDoc.id), {
      name:        "Wilson",
      role:        "nepal_admin",
      jobRole:     "Operations Head",
      location:    "nepal",
      email:       WILSON_EMAIL,
      permissions: realDoc.permissions ?? DEFAULT_PERMISSIONS,
    });
    console.log(`✅  Upgraded  [${realDoc.id}]  to  nepal_admin`);
  }

  console.log("\n✔  Done — only one Wilson doc remains.");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
