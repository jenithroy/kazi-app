const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function updateUsers() {
  const users = [
    { id: "yqQuxq7weYZvc9MBVCjfuyueEAD3", name: "Wilson", role: "nepal_admin", email: "wilsonshah98765@gmail.com" },
    { id: "PhiEtcKN2jdRrTTT9cFN168B65L2", name: "Anmol", role: "nepal_admin", email: "basnetanamol21@gmail.com" },
    { id: "UbaLUEVjdqP7O9pnJuzvTfyiX6r1", name: "Anusha", role: "nepal_admin", email: "anushapantaa@gmail.com" }
  ];

  for (const u of users) {
    const docRef = db.collection("users").doc(u.id);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      console.log(`Updating ${u.name}...`);
      const updateData = {
        role: u.role,
        email: u.email,
        "permissions.production": true
      };
      if (u.name === "Anusha") {
        updateData["permissions.tasks"] = true;
      }
      await docRef.update(updateData);
      console.log(`Updated ${u.name} successfully.`);
    } else {
      console.log(`User ${u.name} (ID: ${u.id}) not found!`);
    }
  }
}

updateUsers().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
