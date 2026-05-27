const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkUsers() {
  const usersColl = db.collection("users");
  const snapshot = await usersColl.get();
  
  console.log("Found users in Firestore:");
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(`  Name: ${data.name}`);
    console.log(`  Role: ${data.role}`);
    console.log(`  Permissions:`, data.permissions);
    console.log("-----------------------------------");
  });
}

checkUsers().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
