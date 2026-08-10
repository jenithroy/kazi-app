import fs from "node:fs";
import admin from "firebase-admin";

const cfgPath = process.env.USERPROFILE + "/.config/configstore/firebase-tools.json";
const raw = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const refreshToken = raw.tokens.refresh_token;

// Firebase CLI's public OAuth client (embedded in firebase-tools source, not a secret).
const refreshTokenCred = {
  type: "authorized_user",
  client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
  client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
  refresh_token: refreshToken,
};

const tmpCredPath = process.env.TEMP + "/_kazi_adc_cred.json";
fs.writeFileSync(tmpCredPath, JSON.stringify(refreshTokenCred));
process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpCredPath;

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "kazi-manufacturing",
});

const db = admin.firestore();

const counterSnap = await db.collection("counters").doc("billing").get();
console.log("counters/billing:", JSON.stringify(counterSnap.data()));

const invSnap = await db.collection("invoices").get();
const invoices = invSnap.docs.map(d => ({
  id: d.id,
  invoiceNumber: d.data().invoiceNumber,
  status: d.data().status,
  createdAt: d.data().createdAt ? d.data().createdAt.toDate().toISOString() : null,
}));
invoices.sort((a, b) => (a.invoiceNumber || "").localeCompare(b.invoiceNumber || ""));
console.log(`Total invoices: ${invoices.length}`);
invoices.forEach(i => console.log(`${i.invoiceNumber}\t${i.status}\t${i.id}\t${i.createdAt}`));
