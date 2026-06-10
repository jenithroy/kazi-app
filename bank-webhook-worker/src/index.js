/**
 * Cloudflare Worker: Bank Webhook Receiver
 * Parses and validates incoming webhook POST requests from Nabil Bank (via Google Apps Script)
 * and stores them in Firestore via native REST API using service account OAuth2 token authentication.
 */

export default {
  async fetch(request, env, ctx) {
    // 1. Only accept POST requests
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST" }
      });
    }

    // 2. Validate Authorization header Bearer token
    const authHeader = request.headers.get("authorization");
    const secretKey = env.WEBHOOK_SECRET_KEY || "WEBHOOK_SECRET_KEY";
    const expectedToken = `Bearer ${secretKey}`;

    if (!authHeader || authHeader !== expectedToken) {
      console.warn("Unauthorized webhook access attempt");
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      // 3. Parse incoming JSON payload
      const payload = await request.json();
      const { date, type, amount, balance, remarks, timestamp } = payload || {};

      if (!date || !type || amount === undefined || balance === undefined || !timestamp) {
        console.warn("Webhook request body missing required fields", payload);
        return new Response("Bad Request: Missing required fields", { status: 400 });
      }

      // Check for Firestore REST authentication bindings
      const clientEmail = env.FIREBASE_CLIENT_EMAIL;
      const privateKey = env.FIREBASE_PRIVATE_KEY;

      if (!clientEmail || !privateKey) {
        console.error("Missing FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY bindings.");
        return new Response("Internal Server Error: Missing server credentials", { status: 500 });
      }

      // 4. Authenticate to Google APIs using Service Account JWT Exchange
      let accessToken;
      try {
        accessToken = await getGoogleAccessToken(clientEmail, privateKey);
      } catch (authErr) {
        console.error("Failed to authenticate service account:", authErr.message);
        return new Response("Internal Server Error: Database authentication failed", { status: 500 });
      }

      // 5. Format payload according to Firestore REST API rules
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

      // 6. Make REST API POST request to Firestore database
      const projectId = env.FIREBASE_PROJECT_ID || "kazi-manufacturing";
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
      console.error("Failed to process webhook:", err.message);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
};

/**
 * Generates a Google OAuth2 access token for the datastore scope
 * using Web Crypto APIs to sign an RS256 JWT assertion.
 */
async function getGoogleAccessToken(clientEmail, privateKey) {
  // Parse private key string (handles newlines correctly)
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

  // Import private key in pkcs8 format
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

  // Sign JWT input
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

  // Exchange JWT assertion for access token
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
