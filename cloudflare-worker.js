// Cloudflare Worker: Meta Messenger & Nabil Bank Webhook with Firestore REST Integration

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

          // Exchange service account key for Google OAuth2 access token
          let accessToken;
          try {
            accessToken = await getGoogleAccessToken(clientEmail, privateKey);
          } catch (authErr) {
            console.error("Failed to authenticate service account:", authErr.message);
            return new Response("Internal Server Error: Database authentication failed", { status: 500 });
          }

          // Format document for Firestore REST API
          const firestoreDoc = {
            fields: {
              date: { stringValue: String(date) },
              type: { stringValue: String(type) },
              amount: { doubleValue: Number(amount) },
              balance: { doubleValue: Number(balance) },
              remarks: { stringValue: String(remarks || "") },
              timestamp: { timestampValue: String(timestamp) },
              createdAt: { timestampValue: new Date().toISOString() }
            }
          };

          const projectId = env.FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID;
          const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/bank_transactions`;

          const dbResponse = await fetch(firestoreUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${accessToken}`
            },
            body: JSON.stringify(firestoreDoc)
          });

          if (!dbResponse.ok) {
            const errorText = await dbResponse.text();
            console.error("Firestore REST API Error response:", errorText);
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

/**
 * Generates a Google OAuth2 access token for the datastore scope
 * using Web Crypto APIs to sign an RS256 JWT assertion.
 */
async function getGoogleAccessToken(clientEmail, privateKey) {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKey
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");

  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: { name: "SHA-256" }
    },
    false,
    ["sign"]
  );

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const base64UrlEncode = (obj) => {
    const str = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(str);
    const binary = String.fromCharCode(...bytes);
    return btoa(binary)
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedClaims = base64UrlEncode(claims);
  const tokenInput = `${encodedHeader}.${encodedClaims}`;

  const inputBytes = new TextEncoder().encode(tokenInput);
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    inputBytes
  );

  const signatureArray = new Uint8Array(signatureBuffer);
  const signatureBinary = String.fromCharCode(...signatureArray);
  const encodedSignature = btoa(signatureBinary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${tokenInput}.${encodedSignature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google OAuth2 token exchange error: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}
