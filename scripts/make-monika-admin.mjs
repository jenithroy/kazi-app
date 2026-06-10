import admin from "firebase-admin";
import { readFileSync } from "node:fs";

// Load service account key
const raw = readFileSync("serviceAccountKey.json", "utf-8");
const credential = admin.credential.cert(JSON.parse(raw));
admin.initializeApp({ credential });

const db = admin.firestore();

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
    bank:         true,
    orderPl:      true,
  },
};

async function main() {
  console.log("🔍  Scanning users collection via Admin SDK...");

  const snap = await db.collection("users").get();
  const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const MONIKA_EMAIL = "bhusal.monika14@gmail.com";
  const monikaDoc = allDocs.find(u =>
    (u.email || "").toLowerCase() === MONIKA_EMAIL.toLowerCase()
  );

  if (!monikaDoc) {
    console.log(`\n⚠️  No document found for email: ${MONIKA_EMAIL}`);
    console.log("   Monika has probably not logged in yet. That is fine,");
    console.log("   when she logs in she will be upgraded automatically via AuthContext sync.");
  } else {
    console.log(`\nFound Monika's document: [${monikaDoc.id}]`);
    console.log("Current role:", monikaDoc.role);
    console.log("Current permissions:", JSON.stringify(monikaDoc.permissions, null, 2));

    const existingPerms = monikaDoc.permissions || {};
    const mergedPerms = { ...existingPerms };

    // Merge default nepal_admin permissions
    Object.keys(DEFAULT_PERMISSIONS).forEach(key => {
      if (key === "finance") {
        mergedPerms.finance = {
          ...DEFAULT_PERMISSIONS.finance,
          ...(existingPerms.finance || {})
        };
      } else if (existingPerms[key] === undefined) {
        mergedPerms[key] = DEFAULT_PERMISSIONS[key];
      }
    });

    console.log("\nUpgrading role to: nepal_admin");
    console.log("Merged permissions to write:", JSON.stringify(mergedPerms, null, 2));

    await db.collection("users").doc(monikaDoc.id).update({
      role: "nepal_admin",
      jobRole: "Marketing Co-ordinator",
      permissions: mergedPerms,
    });

    console.log("\n✅  Upgraded Monika successfully!");
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
