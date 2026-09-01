// Cloudflare Worker: Meta Messenger & Nabil Bank Webhook (Supabase REST)
//
// NOTE: this file is not referenced by wrangler.jsonc (which deploys
// worker/index.js) nor by bank-webhook-worker/wrangler.toml. Its bank half
// duplicates bank-webhook-worker/src/index.js. Kept in step so no code here
// still writes to Firestore, but it is a candidate for deletion.

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

    // 2. POST Request
    if (request.method === "POST") {
      // 2a. Handle Nabil Bank Webhook Route
      if (url.pathname === "/bank-webhook") {
        const authHeader = request.headers.get("authorization");
        const secretKey = env.WEBHOOK_SECRET_KEY || "WEBHOOK_SECRET_KEY";
        const expectedToken = `Bearer ${secretKey}`;

        if (!authHeader || authHeader !== expectedToken) {
          console.warn("Unauthorized bank webhook access attempt");
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const payload = await request.json();
          const { date, type, amount, balance, remarks, timestamp } = payload || {};

          if (!date || !type || amount === undefined || balance === undefined || !timestamp) {
            console.warn("Bank webhook request body missing required fields", payload);
            return new Response("Bad Request: Missing required fields", { status: 400 });
          }

          const clientEmail = env.FIREBASE_CLIENT_EMAIL;
          const privateKey = env.FIREBASE_PRIVATE_KEY;

          if (!clientEmail || !privateKey) {
            console.error("Missing FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY bindings.");
            return new Response("Internal Server Error: Missing server credentials", { status: 500 });
          }

          // A plain row and a static key — no JWT signing or OAuth exchange.
          const row = {
            txn_date_text: String(date),
            txn_at: new Date(timestamp).toISOString(),
            // Constrained to exactly Credit/Debit; the bank's casing varies.
            type: /^cr/i.test(String(type)) ? "Credit" : "Debit",
            amount: Number(amount),
            balance: Number(balance),
            remarks: String(remarks || ""),
            description: String(remarks || ""),
          };

          const dbResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/bank_transactions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: env.SUPABASE_SERVICE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              Prefer: "return=minimal",
            },
            body: JSON.stringify(row)
          });

          if (!dbResponse.ok) {
            const errorText = await dbResponse.text();
            console.error("Supabase REST error response:", errorText);
            return new Response("Internal Server Error: Database write failed", { status: 500 });
          }

          console.log(`Successfully saved bank transaction. Balance: NPR ${balance}`);
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });

        } catch (err) {
          console.error("Failed to process bank webhook:", err.message);
          return new Response("Internal Server Error", { status: 500 });
        }
      }

      // 2b. Handle Meta Messenger Webhook Route
      try {
        const body = await request.json();

        if (body.object === "page") {
          for (const entry of body.entry || []) {
            const webhookEvent = entry.messaging?.[0];
            if (webhookEvent && webhookEvent.message) {
              const senderId = webhookEvent.sender?.id;
              const messageText = webhookEvent.message?.text;

              if (senderId && messageText) {
                console.log(`Received message from ${senderId}: ${messageText}`);

                // legacy_sender_id, not sender_id: the sender is a Meta psid,
                // not a member of staff, and sender_id is a foreign key into
                // people. thread_id groups the conversation.
                const row = {
                  legacy_sender_id: senderId,
                  thread_id: senderId,
                  text: messageText,
                  sent_at: new Date().toISOString(),
                };

                try {
                  const dbResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/messages`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      apikey: env.SUPABASE_SERVICE_KEY,
                      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                      Prefer: "return=minimal",
                    },
                    body: JSON.stringify(row)
                  });

                  if (!dbResponse.ok) {
                    const errorText = await dbResponse.text();
                    console.error("Supabase REST error:", errorText);
                  } else {
                    console.log("Saved inbound message.");
                  }
                } catch (dbErr) {
                  console.error("Failed to reach Supabase:", dbErr.message);
                }

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

// The Google service-account JWT signing helper that used to live here is
// gone with Firestore. Supabase authenticates with a static key, so there is
// no token exchange to perform and no private key for this worker to hold.
