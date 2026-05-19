import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

const sa = JSON.parse(readFileSync(new URL("../serviceAccountKey.json", import.meta.url)));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// Co-Director (Fin) — Firestore doc ID
const FIN_DOC_ID = "1VeTu8SFQNfUK9rjMjsrHc32dSC2";

async function main() {
  const ref = db.collection("users").doc(FIN_DOC_ID);
  const snap = await ref.get();

  if (!snap.exists) {
    console.error("❌ Doc not found:", FIN_DOC_ID);
    process.exit(1);
  }

  const data = snap.data();
  console.log("Current doc:", JSON.stringify(data, null, 2));

  await ref.update({
    "permissions.tasks": true,
  });

  console.log("✅ permissions.tasks = true set on", FIN_DOC_ID);
}

main().catch(e => { console.error(e); process.exit(1); });
