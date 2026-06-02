const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
admin.initializeApp();

const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN || "kazi_messenger_verify_token";
const PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
const PAGE_ID = process.env.MESSENGER_PAGE_ID;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "kazi_tg_secret";

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

/* ── Telegram worker bot ─────────────────────────────────── */

const STAGES = [
  "Order Received", "Fabric Sourcing", "Cutting", "Stitching",
  "Finishing & Pressing", "Quality Check", "Packing", "Shipped", "Delivered"
];
const NEXT_STAGE = Object.fromEntries(STAGES.map((s, i) => [s, STAGES[i + 1]]));
const ACTIVE_STATUSES = ["Cutting", "Stitching", "Finishing & Pressing", "Quality Check"];

async function tgReply(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

async function getWorkerSession(telegramId) {
  const snap = await admin.firestore().collection("worker_sessions").doc(String(telegramId)).get();
  return snap.exists ? snap.data() : null;
}

async function setWorkerSession(telegramId, data) {
  await admin.firestore().collection("worker_sessions").doc(String(telegramId)).set(data, { merge: true });
}

async function getWorkerProfile(telegramId) {
  const snap = await admin.firestore().collection("users")
    .where("telegramId", "==", Number(telegramId)).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

exports.telegramWebhook = onRequest({ cors: false }, async (req, res) => {
  // Verify secret token
  const secret = req.headers["x-telegram-bot-api-secret-token"];
  if (secret !== TELEGRAM_WEBHOOK_SECRET) {
    return res.sendStatus(403);
  }

  res.sendStatus(200); // always return fast

  const message = req.body?.message;
  if (!message) return;

  const chatId   = message.chat?.id;
  const fromId   = message.from?.id;
  const text     = (message.text || "").trim().toLowerCase();
  const photoArr = message.photo;

  try {
    const profile = await getWorkerProfile(fromId);
    if (!profile) {
      await tgReply(chatId, "You're not registered. Ask your manager to link your Telegram ID to your Kazi profile.");
      return;
    }

    const session = await getWorkerSession(fromId) || { state: "idle" };
    const db = admin.firestore();

    // Photo → attach to current order
    if (photoArr?.length) {
      if (!session.currentOrderId) {
        await tgReply(chatId, "Set an active order first with /start <ref>.");
        return;
      }
      const fileId = photoArr[photoArr.length - 1].file_id;
      const orderRef = db.collection("orders").doc(session.currentOrderId);
      const orderSnap = await orderRef.get();
      if (orderSnap.exists) {
        const notesList = orderSnap.data().notesList || [];
        notesList.push({ id: Date.now().toString(), text: "Photo via bot", date: new Date().toISOString().slice(0,10), by: profile.name, imageUrl: `tg:${fileId}` });
        await orderRef.update({ notesList });
      }
      await tgReply(chatId, "Photo attached to order ✓");
      return;
    }

    // Awaiting issue description
    if (session.state === "awaiting_issue" && session.currentOrderId && text) {
      const orderRef = db.collection("orders").doc(session.currentOrderId);
      const orderSnap = await orderRef.get();
      const order = orderSnap.data();
      const notesList = order?.notesList || [];
      notesList.push({ id: Date.now().toString(), text: `⚠️ Issue: ${text}`, date: new Date().toISOString().slice(0,10), by: profile.name });
      await orderRef.update({ notesList });
      await setWorkerSession(fromId, { state: "active" });

      if (TELEGRAM_CHAT_ID) {
        const ref = order?.orderId || session.currentOrderId.slice(0,8).toUpperCase();
        await tgReply(TELEGRAM_CHAT_ID, `⚠️ *Issue on ${ref}*\n${order?.quantity} pcs · ${order?.customerName}\nBy ${profile.name}: ${text}`);
      }
      await tgReply(chatId, "Issue logged and management notified. Type /queue to see orders.");
      return;
    }

    // Commands
    if (text === "/in" || text === "in") {
      const ordersSnap = await db.collection("orders").where("status", "==", "Active").get();
      const count = ordersSnap.size;
      await setWorkerSession(fromId, { state: "active", checkedInAt: new Date().toISOString() });
      await db.collection("shift_logs").add({ profileId: profile.id, name: profile.name, checkedInAt: admin.firestore.FieldValue.serverTimestamp() });
      await tgReply(chatId, `Welcome ${profile.name}! ✓\n${count} active order${count !== 1 ? "s" : ""} in production. Type /queue to see them.`);
      return;
    }

    if (text === "/out" || text === "out") {
      if (session.state === "idle") { await tgReply(chatId, "You're not checked in."); return; }
      const logsSnap = await db.collection("shift_logs")
        .where("profileId", "==", profile.id).where("checkedOutAt", "==", null).limit(1).get();
      if (!logsSnap.empty) await logsSnap.docs[0].ref.update({ checkedOutAt: admin.firestore.FieldValue.serverTimestamp() });
      await setWorkerSession(fromId, { state: "idle", currentOrderId: null, checkedInAt: null });
      await tgReply(chatId, `See you later, ${profile.name}! Good work today.`);
      return;
    }

    if (text === "/queue" || text === "queue") {
      const snap = await db.collection("orders").where("status", "==", "Active").limit(10).get();
      if (snap.empty) { await tgReply(chatId, "No active orders right now."); return; }
      const lines = snap.docs.map((d, i) => {
        const o = d.data();
        return `${i+1}. *${o.orderId}* — ${o.quantity} pcs · ${o.customerName} [${o.stage}]`;
      });
      await tgReply(chatId, `Active orders:\n\n${lines.join("\n")}\n\nType /start <order ID> to set your active order.`);
      return;
    }

    if (text.startsWith("/start ")) {
      const ref = text.split(" ")[1]?.toUpperCase();
      const snap = await db.collection("orders").where("orderId", "==", ref).limit(1).get();
      if (snap.empty) { await tgReply(chatId, `Order ${ref} not found. Type /queue to see active orders.`); return; }
      const order = snap.docs[0].data();
      await setWorkerSession(fromId, { state: "active", currentOrderId: snap.docs[0].id });
      await tgReply(chatId, `Active order: *${order.orderId}* — ${order.quantity} pcs · ${order.customerName} [${order.stage}]\n\nType /done when complete, /issue to flag a problem.`);
      return;
    }

    if (text === "/done" || text === "done") {
      if (!session.currentOrderId) { await tgReply(chatId, "No active order. Type /queue then /start <id>."); return; }
      const orderRef = db.collection("orders").doc(session.currentOrderId);
      const orderSnap = await orderRef.get();
      const order = orderSnap.data();
      const nextStage = NEXT_STAGE[order.stage];
      if (!nextStage) { await tgReply(chatId, `Order is already at final stage: ${order.stage}.`); return; }
      const newStatus = nextStage === "Delivered" ? "Completed" : order.status;
      const history = [...(order.stageHistory || []), { stage: nextStage, date: new Date().toISOString().slice(0,10), by: profile.name }];
      await orderRef.update({ stage: nextStage, status: newStatus, stageHistory: history });
      await setWorkerSession(fromId, { currentOrderId: null });

      if (TELEGRAM_CHAT_ID) {
        await tgReply(TELEGRAM_CHAT_ID, `📋 *${order.orderId}* → *${nextStage}*\n${order.quantity} pcs · ${order.customerName}\nBy ${profile.name}`);
      }
      await tgReply(chatId, `Done! ✓ Order moved to *${nextStage}*. Type /queue for next order.`);
      return;
    }

    if (text === "/issue" || text === "issue") {
      if (!session.currentOrderId) { await tgReply(chatId, "Set an active order first with /start <id>."); return; }
      await setWorkerSession(fromId, { state: "awaiting_issue" });
      await tgReply(chatId, "Describe the issue:");
      return;
    }

    // Help fallback
    await tgReply(chatId,
      `*Kazi Worker Bot*\n\n/in — check in\n/out — check out\n/queue — see active orders\n/start <id> — set active order\n/done — mark stage complete\n/issue — flag a problem\n\nSend a photo to attach to your current order.`
    );
  } catch (err) {
    logger.error("TELEGRAM_BOT_ERROR", { error: err.message });
  }
});
