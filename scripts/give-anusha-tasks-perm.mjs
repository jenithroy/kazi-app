import admin from "firebase-admin";
import { readFileSync } from "node:fs";

// Load service account key
const raw = readFileSync("serviceAccountKey.json", "utf-8");
const credential = admin.credential.cert(JSON.parse(raw));
admin.initializeApp({ credential });

const db = admin.firestore();

async function main() {
  console.log("🔍  Scanning users collection via Admin SDK...");

  const ANUSHA_EMAIL = "anushapantaa@gmail.com";
  const ANUSHA_DOC_ID = "UbaLUEVjdqP7O9pnJuzvTfyiX6r1";

  const docRef = db.collection("users").doc(ANUSHA_DOC_ID);
  const snap = await docRef.get();

  if (!snap.exists) {
    console.log(`\n⚠️  No document found for ID: ${ANUSHA_DOC_ID}`);
    // Fallback search by email
    const allUsers = await db.collection("users").get();
    const userDoc = allUsers.docs.find(u => (u.data().email || "").toLowerCase() === ANUSHA_EMAIL.toLowerCase());
    if (userDoc) {
      console.log(`Found Anusha via email: [${userDoc.id}]`);
      await userDoc.ref.update({
        "permissions.tasks": true
      });
      console.log("✅ Updated permissions.tasks = true successfully via email search.");
    } else {
      console.log("❌ Anusha user document not found anywhere.");
    }
  } else {
    console.log(`Found Anusha's document: [${snap.id}]`);
    const data = snap.data();
    console.log("Current role:", data.role);
    console.log("Current permissions:", JSON.stringify(data.permissions, null, 2));

    await docRef.update({
      "permissions.tasks": true
    });

    console.log("\n✅  Set permissions.tasks = true for Anusha successfully!");
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
