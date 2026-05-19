import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH;

function initializeAdmin() {
  if (admin.apps.length) return admin.app();
  if (serviceAccountPath) {
    const raw = readFileSync(resolve(serviceAccountPath), "utf-8");
    return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

async function dedupe() {
  initializeAdmin();
  const db = admin.firestore();

  const snap = await db.collection("finance_purchases").get();
  const docs = snap.docs.map((d) => ({ docId: d.id, ...d.data() }));

  console.log(`Found ${docs.length} total purchase documents.`);

  // Group by expenseId — keep the first, delete the rest
  const seen = new Map();
  const toDelete = [];

  for (const doc of docs) {
    const key = doc.expenseId || doc.docId;
    if (seen.has(key)) {
      toDelete.push(doc.docId);
    } else {
      seen.set(key, doc.docId);
    }
  }

  if (toDelete.length === 0) {
    console.log("No duplicates found — collection is clean.");
    return;
  }

  console.log(`Deleting ${toDelete.length} duplicate(s)...`);

  const batch = db.batch();
  for (const docId of toDelete) {
    batch.delete(db.collection("finance_purchases").doc(docId));
  }
  await batch.commit();

  console.log(`Done. ${seen.size} unique purchase records remain.`);
}

dedupe().catch((err) => { console.error(err); process.exit(1); });
