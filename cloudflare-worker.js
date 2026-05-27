// Cloudflare Worker: Meta Messenger Webhook with Firestore REST Integration

// Configuration Placeholders - You can set these directly here,
// or configure them as Environment Variables in the Cloudflare Dashboard/wrangler.toml
const MY_VERIFY_TOKEN = "kazi_messenger_verify_token";
const PAGE_ACCESS_TOKEN = "EAAOIc42t2PYBRtZCtZA82ZBycZCrRGOBeFc7lYiOs3IESzCZB1zkKdDItOA5EPNKzbUlrjmyvKbVVt6nLpRqVoH4lYMExaHnVODZAe6WrR5oSyGzhCCzaKTQhwdsfzhZBSzzLxQ2HzbvDEtZBgw3ERKVCpJWI6ZCDQd04AQQRQGojLN9TnybZCDoATbyP5ZBuWAGvYA5u7MT2QZAddvSoxJ72Dxe6TUJ8NvyAujL5blEDMNIhbZBTRgg8w9MRv7mfgvSTeSIA0SaPZCraoD4lM9mbUtdvbBDsZD";
const FIREBASE_PROJECT_ID = "kazi-manufacturing";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. GET Request: Meta Webhook Verification
    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode && token) {
        // Checks the verification token (checks env bindings first, then local fallback)
        const expectedToken = env.MY_VERIFY_TOKEN || MY_VERIFY_TOKEN;
        if (mode === "subscribe" && token === expectedToken) {
          console.log("WEBHOOK_VERIFIED");
          return new Response(challenge, { status: 200 });
        } else {
          return new Response("Forbidden", { status: 403 });
        }
      }
      return new Response("Bad Request", { status: 400 });
    }

    // 2. POST Request: Handle Meta Webhook Events (Incoming Messages)
    if (request.method === "POST") {
      try {
        const body = await request.json();

        if (body.object === "page") {
          // Iterate through incoming event entries
          for (const entry of body.entry || []) {
            const webhookEvent = entry.messaging?.[0];
            if (webhookEvent && webhookEvent.message) {
              const senderId = webhookEvent.sender?.id;
              const messageText = webhookEvent.message?.text;

              // Only process text messages
              if (senderId && messageText) {
                console.log(`Received message from ${senderId}: ${messageText}`);

                // A. Save the message to Firebase Firestore via REST API
                const projectId = env.FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID;
                const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/messages`;

                const firestorePayload = {
                  fields: {
                    senderId: { stringValue: senderId },
                    text: { stringValue: messageText },
                    timestamp: { stringValue: new Date().toISOString() }
                  }
                };

                try {
                  const dbResponse = await fetch(firestoreUrl, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json"
                    },
                    body: JSON.stringify(firestorePayload)
                  });

                  if (!dbResponse.ok) {
                    const errorText = await dbResponse.text();
                    console.error("Firestore REST API Error:", errorText);
                  } else {
                    console.log("Successfully saved message to Firestore.");
                  }
                } catch (dbErr) {
                  console.error("Failed to connect to Firestore REST API:", dbErr.message);
                }

                // B. Send Meta API Auto-Reply back to the user
                const accessToken = env.PAGE_ACCESS_TOKEN || PAGE_ACCESS_TOKEN;
                const metaUrl = `https://graph.facebook.com/v19.0/me/messages?access_token=${accessToken}`;
                const autoReplyPayload = {
                  recipient: { id: senderId },
                  message: { text: "Thank you for writing to Kazi! This is an automated response." }
                };

                try {
                  const metaResponse = await fetch(metaUrl, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json"
                    },
                    body: JSON.stringify(autoReplyPayload)
                  });

                  if (!metaResponse.ok) {
                    const metaError = await metaResponse.text();
                    console.error("Meta Graph API Send Error:", metaError);
                  } else {
                    console.log("Successfully sent auto-reply.");
                  }
                } catch (metaErr) {
                  console.error("Failed to call Meta Send API:", metaErr.message);
                }
              }
            }
          }
          return new Response("EVENT_RECEIVED", { status: 200 });
        }
        return new Response("Not Found", { status: 404 });
      } catch (err) {
        console.error("Error processing POST request:", err.message);
        return new Response("Internal Server Error", { status: 500 });
      }
    }

    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, POST" }
    });
  }
};
