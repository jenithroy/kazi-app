import admin from "firebase-admin";
import { readFileSync } from "node:fs";

const raw = readFileSync("serviceAccountKey.json", "utf-8");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();

const WORKING_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]; // Sun–Fri, Sat off

// name-match target → schedule
const TARGETS = [
  { match: "monika",          scheduleStart: "12:00", scheduleEnd: "19:00" },
  { match: "sarbagya",        scheduleStart: "11:00", scheduleEnd: "18:00" },
  { match: "sunam deepa",     scheduleStart: "10:30", scheduleEnd: "18:00" },
  { match: "aakansha poudel", scheduleStart: "10:00", scheduleEnd: "18:30" },
  { match: "anmol",           scheduleStart: "09:30", scheduleEnd: "17:00",
    scheduleDayOverrides: { Tue: { start: "09:30", end: "15:30" } } },
];

async function main() {
  const snap = await db.collection("employees").get();
  const emps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`employees collection: ${emps.length} docs\n`);

  for (const t of TARGETS) {
    const m = t.match.toLowerCase();
    const hit =
      emps.find(e => (e.name || "").toLowerCase() === m) ||
      emps.find(e => (e.name || "").toLowerCase().startsWith(m.split(" ")[0])) ||
      emps.find(e => (e.name || "").toLowerCase().includes(m.split(" ")[0]));

    if (!hit) {
      console.log(`❌  no employee doc matched "${t.match}" — SKIPPED`);
      continue;
    }

    const update = {
      scheduleStart: t.scheduleStart,
      scheduleEnd: t.scheduleEnd,
      scheduleWorkingDays: WORKING_DAYS,
      scheduleDayOverrides: t.scheduleDayOverrides || {},
      updatedBy: "schedule script",
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await db.collection("employees").doc(hit.id).update(update);
    const ovr = t.scheduleDayOverrides
      ? "  [" + Object.entries(t.scheduleDayOverrides).map(([d, v]) => `${d} ${v.start}–${v.end}`).join(", ") + "]"
      : "";
    console.log(`✅  ${hit.name}  →  ${t.scheduleStart}–${t.scheduleEnd}  (Sun–Fri)${ovr}`);
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
