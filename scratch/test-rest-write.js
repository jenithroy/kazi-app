// scratch/test-rest-write.js
const projectId = "kazi-manufacturing";
const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/messages`;

const firestorePayload = {
  fields: {
    senderId: { stringValue: "user_test_999" },
    text: { stringValue: "Test message from diagnostic script" },
    timestamp: { stringValue: new Date().toISOString() }
  }
};

async function testWrite() {
  console.log(`Sending REST request to: ${firestoreUrl}...`);
  try {
    const response = await fetch(firestoreUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(firestorePayload)
    });

    const status = response.status;
    const bodyText = await response.text();

    console.log(`\nResponse Status: ${status} (${response.statusText})`);
    console.log(`Response Body: ${bodyText}`);

    if (response.ok) {
      console.log("\nSuccess: Document written to Firestore messages collection!");
    } else {
      console.error("\nError: Firestore rejected the write operation.");
    }
  } catch (err) {
    console.error("\nFailed to connect to Firestore REST API:", err.message);
  }
}

testWrite();
