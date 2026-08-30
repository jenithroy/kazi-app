import admin from "firebase-admin";
import { readFileSync } from "node:fs";

const KEY = "kazi-manufacturing-firebase-adminsdk-fbsvc-70d961c598.json";
const raw = readFileSync(KEY, "utf-8");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");

// Match loosely on name so we don't need to know exact emails up front.
const matches = (u, needle) => (u.name || "").toLowerCase().includes(needle);

async function main() {
  const snap = await db.collection("users").get();
  const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const sarbagya = users.filter(u => matches(u, "sarbagya"));
  const sugam    = users.filter(u => matches(u, "sugam"));

  console.log(`\nSarbagya candidates (${sarbagya.length}):`);
  sarbagya.forEach(u => console.log(`  [${u.id}] ${u.name} <${u.email}> role=${u.role} jobRole=${u.jobRole}`));
  console.log(`\nSugam candidates (${sugam.length}):`);
  sugam.forEach(u => console.log(`  [${u.id}] ${u.name} <${u.email}> role=${u.role} jobRole=${u.jobRole}`));

  if (sarbagya.length !== 1 || sugam.length < 1) {
    console.log("\n⚠️  Expected one Sarbagya and at least one Sugam. Aborting.");
    process.exit(1);
  }

  const src = sarbagya[0];

  const payload = {
    role: src.role ?? null,
    permissions: src.permissions ?? {},
  };
  console.log(`\nSource (Sarbagya) [${src.id}]\n`, JSON.stringify(payload, null, 2));

  for (const dst of sugam) {
    console.log(`\nTarget (Sugam) [${dst.id}] permissions BEFORE:`, JSON.stringify(dst.permissions ?? null));
    if (!APPLY) continue;
    await db.collection("users").doc(dst.id).update(payload);
    console.log(`  ✅  updated [${dst.id}]`);
  }

  if (!APPLY) {
    console.log("\n(dry run — re-run with --apply to write)");
  } else {
    console.log("\n✅  Copied role + permissions from Sarbagya to Sugam.");
  }
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
