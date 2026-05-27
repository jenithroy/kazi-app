const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
admin.initializeApp();

const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN || "kazi_messenger_verify_token";
const PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
const PAGE_ID = process.env.MESSENGER_PAGE_ID;

// 1. Webhook callback endpoint (publicly accessible by Facebook)
exports.messengerWebhook = onRequest({
  cors: true,
}, (req, res) => {
  // GET Request - Webhook Verification
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        logger.info("WEBHOOK_VERIFIED_SUCCESSFULLY");
        res.status(200).send(challenge);
      } else {
        logger.warn("WEBHOOK_VERIFICATION_FAILED: Tokens do not match.", {
          receivedToken: token,
        });
        res.sendStatus(403);
      }
    } else {
      res.sendStatus(400);
    }
  }
  // POST Request - Event Handler (Incoming messages from customers)
  else if (req.method === "POST") {
    const body = req.body;

    if (body.object === "page") {
      body.entry?.forEach((entry) => {
        const webhookEvent = entry.messaging?.[0];
        if (webhookEvent) {
          logger.info("WEBHOOK_EVENT_RECEIVED", { event: webhookEvent });

          const senderId = webhookEvent.sender?.id;
          const recipientId = webhookEvent.recipient?.id;
          const message = webhookEvent.message;

          if (message) {
            logger.info(`Received message from ${senderId}:`, {
              text: message.text,
              attachments: message.attachments,
            });
          }
        }
      });

      res.status(200).send("EVENT_RECEIVED");
    } else {
      res.sendStatus(404);
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.sendStatus(405);
  }
});

// 2. Secure Backend Proxy API for the React frontend
exports.messengerApi = onRequest({
  cors: true, // Allow CORS so client React app can call this function
}, async (req, res) => {
  try {
    // A. Authenticate User (Verify Firebase ID Token)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("UNAUTHORIZED_ACCESS_ATTEMPT: Missing or invalid Authorization header");
      return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
    }

    const idToken = authHeader.split("Bearer ")[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (authErr) {
      logger.warn("UNAUTHORIZED_ACCESS_ATTEMPT: Failed to verify ID token", { error: authErr.message });
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    const uid = decodedToken.uid;

    // B. Authorize User (Verify role in Firestore)
    const userSnap = await admin.firestore().collection("users").doc(uid).get();
    if (!userSnap.exists) {
      logger.warn("FORBIDDEN_ACCESS_ATTEMPT: User document does not exist in Firestore", { uid });
      return res.status(403).json({ error: "Forbidden: User profile not found" });
    }

    const profile = userSnap.data();
    const role = profile?.role;
    if (role !== "nepal_admin" && role !== "uk_admin" && role !== "super_admin") {
      logger.warn("FORBIDDEN_ACCESS_ATTEMPT: User does not have admin/director role", { uid, role });
      return res.status(403).json({ error: "Forbidden: Insufficient privileges" });
    }

    // C. Verify Meta Credentials configuration
    if (!PAGE_ACCESS_TOKEN) {
      logger.error("BACKEND_CONFIGURATION_ERROR: MESSENGER_PAGE_ACCESS_TOKEN is not configured on the server.");
      return res.status(500).json({ error: "Internal Server Error: Meta credentials not configured on the server." });
    }

    // D. Route Actions
    const { action } = req.body;
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ error: "Method Not Allowed. Only POST requests are supported." });
    }

    if (!action) {
      return res.status(400).json({ error: "Bad Request: Missing 'action' parameter" });
    }

    switch (action) {
      case "fetchThreads": {
        if (!PAGE_ID) {
          return res.status(400).json({ error: "Bad Request: MESSENGER_PAGE_ID is not configured on the server." });
        }
        const url = `https://graph.facebook.com/v19.0/${PAGE_ID}/conversations?fields=id,participants,unread_count,updated_time,messages.limit(1){message}&access_token=${PAGE_ACCESS_TOKEN}`;
        const response = await fetch(url);
        if (!response.ok) {
          const errData = await response.text();
          logger.error("META_API_ERROR (fetchThreads)", { status: response.statusText, details: errData });
          return res.status(response.status).json({ error: `Meta API Error: ${response.statusText}`, details: errData });
        }
        const data = await response.json();
        return res.status(200).json(data);
      }

      case "fetchMessages": {
        const { threadId } = req.body;
        if (!threadId) {
          return res.status(400).json({ error: "Bad Request: Missing 'threadId' parameter" });
        }
        const url = `https://graph.facebook.com/v19.0/${threadId}?fields=messages.limit(50){id,message,from,created_time}&access_token=${PAGE_ACCESS_TOKEN}`;
        const response = await fetch(url);
        if (!response.ok) {
          const errData = await response.text();
          logger.error("META_API_ERROR (fetchMessages)", { status: response.statusText, details: errData });
          return res.status(response.status).json({ error: `Meta API Error: ${response.statusText}`, details: errData });
        }
        const data = await response.json();
        return res.status(200).json(data);
      }

      case "sendMessage": {
        const { recipientPsid, messageText } = req.body;
        if (!recipientPsid || !messageText) {
          return res.status(400).json({ error: "Bad Request: Missing 'recipientPsid' or 'messageText' parameter" });
        }
        const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: recipientPsid },
            message: { text: messageText },
          }),
        });
        if (!response.ok) {
          const errData = await response.text();
          logger.error("META_API_ERROR (sendMessage)", { status: response.statusText, details: errData });
          return res.status(response.status).json({ error: `Meta API Error: ${response.statusText}`, details: errData });
        }
        const data = await response.json();
        return res.status(200).json(data);
      }

      default:
        return res.status(400).json({ error: `Bad Request: Unknown action '${action}'` });
    }
  } catch (err) {
    logger.error("SERVER_EXCEPTION_ERROR", { error: err.message, stack: err.stack });
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});
