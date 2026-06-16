import admin from "firebase-admin";
import { readFileSync } from "node:fs";

// Load service account key
const raw = readFileSync("serviceAccountKey.json", "utf-8");
const credential = admin.credential.cert(JSON.parse(raw));
admin.initializeApp({ credential });

const db = admin.firestore();

async function main() {
  console.log("🔍  Scanning users collection for Sarbagya...");

  const EMAIL = "sarbagyakarkig8@gmail.com";
  const snap = await db.collection("users").get();
  const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const sarbagyaDoc = allUsers.find(u => (u.email || "").toLowerCase() === EMAIL.toLowerCase());

  if (!sarbagyaDoc) {
    console.log(`\n⚠️  No document found for email: ${EMAIL}`);
    console.log("Creating a stub document...");
    const stubId = EMAIL.replace(/[^a-z0-9]/g, "_");
    await db.collection("users").doc(stubId).set({
      name: "Sarbagya Karki",
      role: "nepal_staff",
      jobRole: "Content Editor",
      email: EMAIL,
      location: "nepal",
      isStub: true,
      permissions: {}
    });
    console.log("✅ Created stub document successfully.");
  } else {
    console.log(`\nFound Sarbagya's document: [${sarbagyaDoc.id}]`);
    console.log("Current name:", sarbagyaDoc.name);
    console.log("Current role:", sarbagyaDoc.role);
    console.log("Current jobRole:", sarbagyaDoc.jobRole);

    await db.collection("users").doc(sarbagyaDoc.id).update({
      name: "Sarbagya Karki",
      role: "nepal_staff",
      jobRole: "Content Editor"
    });

    console.log("\n✅  Updated Sarbagya successfully!");
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
