// test-webhook.js
// Node.js test script to simulate an incoming Meta Messenger message event.

// 1. Replace with your actual Cloudflare Worker URL (or localhost address during testing)
const CLOUDFLARE_WORKER_URL = "https://kazi-messenger.kattagang1111.workers.dev/";

// 2. Build the Meta Webhook payload matching the standard structure
const payload = {
  object: "page",
  entry: [
    {
      id: "PAGE_ID_123",
      time: Date.now(),
      messaging: [
        {
          sender: {
            id: "user_test_999"
          },
          recipient: {
            id: "PAGE_ID_123"
          },
          timestamp: Date.now(),
          message: {
            mid: `mid.${Date.now()}:randomhash123`,
            text: "Test message from Antigravity!"
          }
        }
      ]
    }
  ]
};

async function runTest() {
  console.log(`Sending mock payload to: ${CLOUDFLARE_WORKER_URL}...`);
  try {
    const response = await fetch(CLOUDFLARE_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const status = response.status;
    const bodyText = await response.text();

    console.log(`\nResponse Status: ${status} (${response.statusText})`);
    console.log(`Response Body: ${bodyText}`);

    if (response.ok) {
      console.log("\nSuccess: Mock event accepted by webhook!");
    } else {
      console.error("\nError: Webhook did not return a successful status code.");
    }
  } catch (err) {
    console.error("\nFailed to connect to Cloudflare Worker:", err.message);
  }
}

runTest();
