import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const defaultPassword = process.env.SEED_DEFAULT_PASSWORD || "Kazi@12345";
const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH;

function initializeAdmin() {
  if (admin.apps.length) return admin.app();

  if (serviceAccountPath) {
    const raw = readFileSync(resolve(serviceAccountPath), "utf-8");
    const credential = admin.credential.cert(JSON.parse(raw));
    return admin.initializeApp({ credential });
  }

  return admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

initializeAdmin();

const db = admin.firestore();
const auth = admin.auth();
const now = admin.firestore.Timestamp.now();
const today = new Date().toISOString().slice(0, 10);

const teamMembers = [
  { name: "Wilson Saha Kanu", roleTitle: "Executive Manager", location: "nepal", email: "wilson@kazi.com", appRole: "nepal_staff" },
  { name: "Utsav Pokharel", roleTitle: "Operations Manager", location: "nepal", email: "utsav@kazi.com", appRole: "nepal_staff" },
  { name: "Fashion Intern", roleTitle: "Fashion Intern", location: "nepal", email: "fashion.intern@kazi.com", appRole: "nepal_staff" },
  { name: "Operations Intern", roleTitle: "Operations Intern", location: "nepal", email: "operations.intern@kazi.com", appRole: "nepal_staff" },
  { name: "Social Media Presenter", roleTitle: "Social Media Presenter", location: "nepal", email: "social.presenter@kazi.com", appRole: "nepal_staff" },
  { name: "Labour (Cutter)", roleTitle: "Labour", location: "nepal", email: "labour.cutter@kazi.com", appRole: "nepal_staff" },
  { name: "Labour (Stitcher)", roleTitle: "Labour", location: "nepal", email: "labour.stitcher@kazi.com", appRole: "nepal_staff" },
  { name: "Zen", roleTitle: "Director", location: "uk", email: "hi.zenuk@gmail.com", appRole: "uk_admin" },
  { name: "Finn", roleTitle: "Director", location: "uk", email: "finnqrk@gmail.com", appRole: "uk_admin" }
];

async function ensureAuthUser(member) {
  try {
    const existing = await auth.getUserByEmail(member.email);
    return existing;
  } catch {
    return await auth.createUser({
      email: member.email,
      password: defaultPassword,
      displayName: member.name
    });
  }
}

async function upsertUsers() {
  const users = [];

  for (const member of teamMembers) {
    const userRecord = await ensureAuthUser(member);
    users.push(userRecord);

    await db
      .collection("users")
      .doc(userRecord.uid)
      .set(
        {
          uid: userRecord.uid,
          name: member.name,
          role: member.appRole,
          location: member.location,
          email: member.email,
          jobRole: member.roleTitle,
          createdAt: now
        },
        { merge: true }
      );
  }

  return users;
}

async function seedAttendance(users) {
  const nepal = users.filter((user) =>
    teamMembers.find((member) => member.email === user.email)?.appRole === "nepal_staff"
  );

  const batch = db.batch();

  nepal.forEach((userRecord, index) => {
    const member = teamMembers.find((item) => item.email === userRecord.email);
    const ref = db.collection("attendance").doc(`${today}_${userRecord.uid}`);
    batch.set(
      ref,
      {
        date: today,
        staffId: userRecord.uid,
        staffName: member.name,
        role: member.roleTitle,
        status: index % 3 === 0 ? "Late" : "Present",
        hours: index % 3 === 0 ? 7 : 8,
        note: "Seed attendance",
        loggedBy: "Seed Script",
        createdAt: now
      },
      { merge: true }
    );
  });

  await batch.commit();
}

async function seedProduction() {
  const rows = [
    { batchId: "B001", date: today, cut: 240, stitched: 220, passed: 210, rejected: 10, note: "Morning shift", loggedBy: "Wilson Saha Kanu", createdAt: now },
    { batchId: "B002", date: today, cut: 210, stitched: 190, passed: 184, rejected: 6, note: "Evening shift", loggedBy: "Utsav Pokharel", createdAt: now }
  ];

  for (const row of rows) {
    await db.collection("production").doc(row.batchId).set(row, { merge: true });
  }
}

async function seedInventory() {
  const rows = [
    { itemId: "IT001", item: "Cotton Fabric", unit: "meter", openingStock: 1000, stockIn: 250, stockUsed: 820, minLevel: 300, lastUpdated: today, updatedBy: "Seed Script" },
    { itemId: "IT002", item: "Thread Cone", unit: "piece", openingStock: 500, stockIn: 120, stockUsed: 470, minLevel: 120, lastUpdated: today, updatedBy: "Seed Script" },
    { itemId: "IT003", item: "Packaging Box", unit: "piece", openingStock: 300, stockIn: 80, stockUsed: 210, minLevel: 90, lastUpdated: today, updatedBy: "Seed Script" }
  ];

  for (const row of rows) {
    await db.collection("inventory").doc(row.itemId).set(row, { merge: true });
  }
}

async function seedQcLogs() {
  const rows = [
    { qcId: "QC001", batchId: "B001", date: today, inspected: 220, passed: 210, rejected: 10, defectType: "Seam variation", action: "Rework 10 pieces", checkedBy: "Utsav Pokharel", createdAt: now },
    { qcId: "QC002", batchId: "B002", date: today, inspected: 190, passed: 184, rejected: 6, defectType: "Loose thread", action: "Final trim", checkedBy: "Wilson Saha Kanu", createdAt: now }
  ];

  for (const row of rows) {
    await db.collection("qc_logs").doc(row.qcId).set(row, { merge: true });
  }
}

async function seedPayroll() {
  const payrollRows = [
    { staffName: "Wilson Saha Kanu", role: "Executive Manager", salaryNPR: 95000, overtimeNPR: 8000, deductionNPR: 2000 },
    { staffName: "Utsav Pokharel", role: "Operations Manager", salaryNPR: 85000, overtimeNPR: 6500, deductionNPR: 1500 },
    { staffName: "Fashion Intern", role: "Fashion Intern", salaryNPR: 22000, overtimeNPR: 1500, deductionNPR: 0 },
    { staffName: "Operations Intern", role: "Operations Intern", salaryNPR: 22000, overtimeNPR: 1200, deductionNPR: 0 }
  ];

  const month = new Date().toLocaleString("en-US", { month: "long" });
  const year = new Date().getFullYear();

  for (const row of payrollRows) {
    const netNPR = row.salaryNPR + row.overtimeNPR - row.deductionNPR;
    const docId = `${row.staffName.replace(/\s+/g, "_")}_${month}_${year}`;

    await db.collection("finance_payroll").doc(docId).set(
      {
        staffId: docId,
        staffName: row.staffName,
        role: row.role,
        month,
        year,
        salaryNPR: row.salaryNPR,
        overtimeNPR: row.overtimeNPR,
        deductionNPR: row.deductionNPR,
        netNPR,
        createdAt: now
      },
      { merge: true }
    );
  }
}

async function seedExpenses() {
  const rows = [
    { category: "Electricity", amountNPR: 18000, date: today, note: "Factory electricity bill", loggedBy: "Wilson Saha Kanu", createdAt: now },
    { category: "Transport", amountNPR: 9500, date: today, note: "Inbound fabric shipment", loggedBy: "Utsav Pokharel", createdAt: now }
  ];

  for (const row of rows) {
    await db.collection("finance_expenses").add(row);
  }
}

async function seedTasks() {
  const rows = [
    { title: "Prepare weekly line report", assignee: "Utsav Pokharel", priority: "High", status: "To Do", dueDate: today, createdBy: "Zeenn", createdAt: now },
    { title: "Resolve cutter delay issue", assignee: "Wilson Saha Kanu", priority: "High", status: "Blocked", dueDate: today, createdBy: "Zeenn", createdAt: now },
    { title: "Publish launch teaser", assignee: "Social Media Presenter", priority: "Medium", status: "In Progress", dueDate: today, createdBy: "Co-Director", createdAt: now }
  ];

  for (const row of rows) {
    await db.collection("tasks").add(row);
  }
}

async function seedContent() {
  const rows = [
    { date: today, platform: "Instagram", contentType: "Reel", topic: "Factory floor walkthrough", status: "Draft", createdBy: "Social Media Presenter", createdAt: now },
    { date: today, platform: "TikTok", contentType: "Short Video", topic: "Behind the scenes stitching", status: "Pending Approval", createdBy: "Social Media Presenter", createdAt: now }
  ];

  for (const row of rows) {
    await db.collection("content").add(row);
  }
}

async function seedAll() {
  try {
    console.log("Seeding KAZI Firestore...");
    const users = await upsertUsers();
    await seedAttendance(users);
    await seedProduction();
    await seedInventory();
    await seedQcLogs();
    await seedPayroll();
    await seedExpenses();
    await seedTasks();
    await seedContent();

    console.log("Seeding completed successfully.");
    console.log(`Default password for created Auth users: ${defaultPassword}`);
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
}

seedAll();
