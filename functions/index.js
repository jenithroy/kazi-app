const { onRequest, onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
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

    // ── Dispatch assignment responses ─────────────────────────
    if (text === "yes" || text === "/yes") {
      // Find most recent pending assignment for this worker
      const assignSnap = await db.collection("order_assignments")
        .where("workerId", "==", profile.id)
        .where("status", "==", "pending")
        .orderBy("assignedAt", "desc")
        .limit(1)
        .get();

      if (assignSnap.empty) {
        await tgReply(chatId, "No pending assignment found.");
        return;
      }

      const assignDoc = assignSnap.docs[0];
      const assignment = assignDoc.data();
      await assignDoc.ref.update({
        status: "accepted",
        acceptedAt: admin.firestore.Timestamp.now(),
      });

      await tgReply(chatId, `✅ Order *${assignment.orderRef}* accepted! Reply *DONE* when your ${assignment.stage} stage is complete.`);
      return;
    }

    if (text === "skip" || text === "/skip") {
      // Find most recent pending assignment for this worker
      const assignSnap = await db.collection("order_assignments")
        .where("workerId", "==", profile.id)
        .where("status", "==", "pending")
        .orderBy("assignedAt", "desc")
        .limit(1)
        .get();

      if (assignSnap.empty) {
        await tgReply(chatId, "No pending assignment found.");
        return;
      }

      const assignDoc = assignSnap.docs[0];
      const assignment = assignDoc.data();
      await assignDoc.ref.update({ status: "declined" });

      // Find next worker in stage_config with next-lowest backlog
      const stageConfigSnap = await db.collection("stage_config").doc(assignment.stage).get();
      if (stageConfigSnap.exists) {
        const stageConfig = stageConfigSnap.data();
        const workerUids = (stageConfig.workerUids || []).filter(uid => uid !== profile.id);

        if (workerUids.length > 0) {
          // Count active backlog for remaining workers
          const activeSnap = await db.collection("order_assignments")
            .where("stage", "==", assignment.stage)
            .where("status", "in", ["pending", "accepted", "in_progress"])
            .get();

          const backlog = {};
          for (const uid of workerUids) backlog[uid] = 0;
          for (const doc of activeSnap.docs) {
            const wid = doc.data().workerId;
            if (wid in backlog) backlog[wid]++;
          }

          let chosenUid = workerUids[0];
          let minCount = backlog[workerUids[0]];
          for (let i = 1; i < workerUids.length; i++) {
            if (backlog[workerUids[i]] < minCount) {
              minCount = backlog[workerUids[i]];
              chosenUid = workerUids[i];
            }
          }

          const workerIndex = (stageConfig.workerUids || []).indexOf(chosenUid);
          const workerName = (stageConfig.workerNames || [])[workerIndex] || chosenUid;

          const workerDocSnap = await db.collection("users").doc(chosenUid).get();
          const workerTelegramId = workerDocSnap.exists ? (workerDocSnap.data().telegramId || null) : null;

          const now = admin.firestore.Timestamp.now();
          const timeoutHours = stageConfig.timeoutHours || 6;
          const timeoutAt = admin.firestore.Timestamp.fromMillis(
            now.toMillis() + timeoutHours * 60 * 60 * 1000
          );

          await db.collection("order_assignments").add({
            orderId: assignment.orderId,
            orderRef: assignment.orderRef,
            customerName: assignment.customerName,
            quantity: assignment.quantity,
            stage: assignment.stage,
            workerId: chosenUid,
            workerName,
            workerTelegramId,
            status: "pending",
            assignedAt: now,
            acceptedAt: null,
            completedAt: null,
            timeoutAt,
            notifiedManager: false,
          });

          if (workerTelegramId) {
            await tgReply(
              workerTelegramId,
              `🧵 New order assigned!\n\nOrder: *${assignment.orderRef}*\nCustomer: ${assignment.customerName}\nQty: ${assignment.quantity} pcs\nYour stage: *${assignment.stage}*\n\nReply *YES* to accept or *SKIP* to pass.`
            );
          }
        }
      }

      await tgReply(chatId, "Skipped. Order reassigned.");
      return;
    }

    if (text === "done" || text === "/done") {
      // Check for an accepted or in_progress dispatch assignment first
      const assignSnap = await db.collection("order_assignments")
        .where("workerId", "==", profile.id)
        .where("status", "in", ["accepted", "in_progress"])
        .orderBy("acceptedAt", "desc")
        .limit(1)
        .get();

      if (!assignSnap.empty) {
        const assignDoc = assignSnap.docs[0];
        const assignment = assignDoc.data();

        await assignDoc.ref.update({
          status: "done",
          completedAt: admin.firestore.Timestamp.now(),
        });

        // Also advance the order stage in Firestore
        const orderDocRef = db.collection("orders").doc(assignment.orderId);
        const orderDocSnap = await orderDocRef.get();
        let nextStageForReply = null;
        let nextWorkerName = null;

        if (orderDocSnap.exists) {
          const orderData = orderDocSnap.data();
          const nextStage = NEXT_STAGE[assignment.stage];
          if (nextStage) {
            const newStatus = nextStage === "Delivered" ? "Completed" : orderData.status;
            const history = [...(orderData.stageHistory || []), {
              stage: nextStage,
              date: new Date().toISOString().slice(0, 10),
              by: profile.name,
            }];
            await orderDocRef.update({ stage: nextStage, status: newStatus, stageHistory: history });

            // Dispatch the next stage
            try {
              const dispatchResult = await (async () => {
                const stageConfigSnap = await db.collection("stage_config").doc(nextStage).get();
                if (!stageConfigSnap.exists || !stageConfigSnap.data().enabled) return null;
                const sc = stageConfigSnap.data();
                const workerUids = sc.workerUids || [];
                if (workerUids.length === 0) return null;

                const activeSnap = await db.collection("order_assignments")
                  .where("stage", "==", nextStage)
                  .where("status", "in", ["pending", "accepted", "in_progress"])
                  .get();
                const backlog = {};
                for (const uid of workerUids) backlog[uid] = 0;
                for (const doc of activeSnap.docs) {
                  const wid = doc.data().workerId;
                  if (wid in backlog) backlog[wid]++;
                }
                let chosenUid = workerUids[0];
                let minCount = backlog[workerUids[0]];
                for (let i = 1; i < workerUids.length; i++) {
                  if (backlog[workerUids[i]] < minCount) {
                    minCount = backlog[workerUids[i]];
                    chosenUid = workerUids[i];
                  }
                }
                const wIdx = workerUids.indexOf(chosenUid);
                const wName = (sc.workerNames || [])[wIdx] || chosenUid;
                const wDocSnap = await db.collection("users").doc(chosenUid).get();
                const wTgId = wDocSnap.exists ? (wDocSnap.data().telegramId || null) : null;

                const now = admin.firestore.Timestamp.now();
                const timeoutHours = sc.timeoutHours || 6;
                const timeoutAt = admin.firestore.Timestamp.fromMillis(
                  now.toMillis() + timeoutHours * 60 * 60 * 1000
                );

                await db.collection("order_assignments").add({
                  orderId: assignment.orderId,
                  orderRef: assignment.orderRef,
                  customerName: assignment.customerName,
                  quantity: assignment.quantity,
                  stage: nextStage,
                  workerId: chosenUid,
                  workerName: wName,
                  workerTelegramId: wTgId,
                  status: "pending",
                  assignedAt: now,
                  acceptedAt: null,
                  completedAt: null,
                  timeoutAt,
                  notifiedManager: false,
                });

                if (wTgId) {
                  await tgReply(
                    wTgId,
                    `🧵 New order assigned!\n\nOrder: *${assignment.orderRef}*\nCustomer: ${assignment.customerName}\nQty: ${assignment.quantity} pcs\nYour stage: *${nextStage}*\n\nReply *YES* to accept or *SKIP* to pass.`
                  );
                }

                return { workerName: wName };
              })();

              nextStageForReply = nextStage;
              nextWorkerName = dispatchResult ? dispatchResult.workerName : null;
            } catch (dispatchErr) {
              logger.error("DISPATCH_NEXT_STAGE_ERROR", { error: dispatchErr.message });
            }

            if (TELEGRAM_CHAT_ID) {
              await tgReply(TELEGRAM_CHAT_ID, `📋 *${assignment.orderRef}* → *${nextStage}*\n${assignment.quantity} pcs · ${assignment.customerName}\nBy ${profile.name}`);
            }

            if (nextStage === "Delivered") {
              await tgReply(chatId, `🎉 Order *${assignment.orderRef}* is complete!`);
            } else {
              const assignedTo = nextWorkerName ? ` Assigned to ${nextWorkerName}.` : "";
              await tgReply(chatId, `✅ Stage complete! *${nextStage}* has been assigned.${assignedTo}`);
            }
          } else {
            await tgReply(chatId, `🎉 Order *${assignment.orderRef}* is complete!`);
          }
        } else {
          await tgReply(chatId, `✅ Stage *${assignment.stage}* marked complete.`);
        }
        return;
      }
      // No dispatch assignment found — fall through to existing /done logic below
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

    // ── Admin-only commands ──────────────────────────────────
    const isAdmin = ["uk_admin", "nepal_admin", "super_admin"].includes(profile.role) ||
                    ["uk_admin", "nepal_admin", "super_admin"].includes(profile.appRole);

    if ((text === "/dashboard" || text === "/report" || text === "/d") && isAdmin) {
      await tgReply(chatId, "Fetching dashboard…");
      try {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
        const thisMonth = today.slice(0, 7);

        const [invoicesSnap, ordersSnap, attSnap, tasksSnap, inventorySnap, usersSnap] = await Promise.all([
          db.collection("invoices").get(),
          db.collection("orders").get(),
          db.collection("attendance").where("date", "==", today).get(),
          db.collection("tasks").get(),
          db.collection("inventory").get(),
          db.collection("users").where("role", "in", ["nepal_admin", "employee", "nepal_staff"]).get(),
        ]);

        const invoices   = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const orders     = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const attendance = attSnap.docs.map(d => d.data());
        const tasks      = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const inventory  = inventorySnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const totalStaff = usersSnap.size;

        // Invoices
        const overdueInvs = invoices.filter(inv =>
          inv.dueDate && inv.dueDate < today && inv.status !== "Paid" && inv.status !== "Cancelled"
        );
        const overdueAmt = overdueInvs.reduce((s, i) => s + Number(i.totalNPR || 0), 0);
        const revMTD = invoices
          .filter(i => (i.date || "").slice(0, 7) === thisMonth && i.status !== "Cancelled")
          .reduce((s, i) => s + Number(i.totalNPR || 0), 0);

        // Orders
        const activeOrders = orders.filter(o => o.status !== "Completed" && o.status !== "Cancelled");
        const overdueOrders = activeOrders.filter(o => o.dueDate && o.dueDate < today);

        // Attendance
        const present = attendance.filter(r => ["Present", "Late", "Half-day"].includes(r.status)).length;
        const late    = attendance.filter(r => r.status === "Late").length;
        const absent  = attendance.filter(r => r.status === "Absent").length;

        // Tasks
        const overdueTasks = tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== "Done");
        const blocked = tasks.filter(t => t.status === "Blocked").length;

        // Inventory
        const lowStock = inventory.filter(item => {
          const stock = Number(item.openingStock || 0) + Number(item.stockIn || 0) - Number(item.stockUsed || 0);
          return stock <= Number(item.minLevel || 0);
        });

        // Format message
        const GBP_RATE = 200;
        const gbp = n => `£${(n / GBP_RATE).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        const flag = (n, warn = 1) => n >= warn ? "🔴" : "🟢";

        const lines = [
          `📊 *Kazi Dashboard* — ${today}`,
          ``,
          `💰 *Revenue*`,
          `  MTD: *${gbp(revMTD)}*`,
          overdueInvs.length
            ? `  ${flag(overdueInvs.length)} Overdue invoices: *${overdueInvs.length}* (${gbp(overdueAmt)})`
            : `  🟢 No overdue invoices`,
          ``,
          `🏭 *Production*`,
          `  Active orders: *${activeOrders.length}*`,
          overdueOrders.length
            ? `  🔴 Overdue orders: *${overdueOrders.length}*`
            : `  🟢 All orders on track`,
          ``,
          `👥 *Attendance today*`,
          `  Present: *${present}/${totalStaff}* · Late: ${late} · Absent: ${absent}`,
          ``,
          `✅ *Tasks*`,
          overdueTasks.length ? `  🔴 Overdue: *${overdueTasks.length}*` : `  🟢 No overdue tasks`,
          blocked ? `  ⚠️ Blocked: *${blocked}*` : null,
          ``,
          lowStock.length
            ? `📦 *Low stock: ${lowStock.length} item${lowStock.length > 1 ? "s" : ""}*\n  ${lowStock.slice(0, 3).map(i => i.name || i.itemName || i.id).join(", ")}${lowStock.length > 3 ? ` +${lowStock.length - 3} more` : ""}`
            : `📦 *Stock:* all OK`,
          ``,
          `_Reply /orders for active order list_`,
        ].filter(l => l !== null).join("\n");

        await tgReply(chatId, lines);
      } catch (err) {
        logger.error("DASHBOARD_CMD_ERROR", { error: err.message });
        await tgReply(chatId, "Failed to load dashboard. Try again in a moment.");
      }
      return;
    }

    if (text === "/orders" && isAdmin) {
      const activeOrders = (await db.collection("orders").get()).docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(o => o.status !== "Completed" && o.status !== "Cancelled")
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 15);

      if (!activeOrders.length) { await tgReply(chatId, "No active orders."); return; }

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
      const lines = activeOrders.map((o, i) => {
        const overdue = o.dueDate && o.dueDate < today ? " 🔴" : "";
        return `${i + 1}. *${o.orderId || o.id.slice(0,8)}* — ${o.customerName || "—"} [${o.stage || o.status}]${overdue}`;
      });
      await tgReply(chatId, `*Active Orders (${activeOrders.length})*\n\n${lines.join("\n")}`);
      return;
    }

    if ((text === "/dashboard" || text === "/report" || text === "/orders") && !isAdmin) {
      await tgReply(chatId, "This command is for admins only.");
      return;
    }

    // Help fallback
    const adminHelp = isAdmin ? `\n/dashboard — ops snapshot\n/orders — active order list` : "";
    await tgReply(chatId,
      `*Kazi Worker Bot*\n\n/in — check in\n/out — check out\n/queue — see active orders\n/start <id> — set active order\n/done — mark stage complete\n/issue — flag a problem${adminHelp}\n\nSend a photo to attach to your current order.`
    );
  } catch (err) {
    logger.error("TELEGRAM_BOT_ERROR", { error: err.message });
  }
});

/* ── Dashboard API ────────────────────────────────────────────────────────────
   GET https://<region>-kazi-manufacturing.cloudfunctions.net/dashboardApi
   Header: Authorization: Bearer <DASHBOARD_API_KEY>
   Returns a JSON ops snapshot for Finn's dashboard integrations.
──────────────────────────────────────────────────────────────────────────── */
const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY || "kazi-dash-2026";

exports.dashboardApi = onRequest({ cors: true }, async (req, res) => {
  // Auth check
  const auth = req.headers["authorization"] || "";
  if (auth !== `Bearer ${DASHBOARD_API_KEY}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db = admin.firestore();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" }); // YYYY-MM-DD in KTM

    // Fetch all collections in parallel
    const [invoicesSnap, ordersSnap, attSnap, tasksSnap, inventorySnap, usersSnap] = await Promise.all([
      db.collection("invoices").get(),
      db.collection("orders").get(),
      db.collection("attendance").where("date", "==", today).get(),
      db.collection("tasks").get(),
      db.collection("inventory").get(),
      db.collection("users").where("role", "in", ["nepal_admin", "employee", "nepal_staff"]).get(),
    ]);

    const invoices  = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const orders    = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const attendance = attSnap.docs.map(d => d.data());
    const tasks     = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const inventory = inventorySnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const totalStaff = usersSnap.size;

    // ── Invoices ──
    const overdueInvoices = invoices.filter(inv =>
      inv.dueDate && inv.dueDate < today && inv.status !== "Paid" && inv.status !== "Cancelled"
    );
    const unpaidTotal = overdueInvoices.reduce((s, inv) => s + Number(inv.totalNPR || 0), 0);
    const thisMonth = today.slice(0, 7);
    const revenueThisMonth = invoices
      .filter(inv => (inv.date || "").slice(0, 7) === thisMonth && inv.status !== "Cancelled")
      .reduce((s, inv) => s + Number(inv.totalNPR || 0), 0);

    // ── Orders ──
    const activeOrders = orders
      .filter(o => o.status !== "Completed" && o.status !== "Cancelled")
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 10)
      .map(o => ({
        id: o.id,
        ref: o.orderRef || o.id,
        customer: o.customerName || o.clientName || "—",
        stage: o.stage || o.status || "—",
        dueDate: o.dueDate || null,
        overdue: o.dueDate ? o.dueDate < today : false,
        quantity: o.quantity || null,
      }));

    // ── Attendance ──
    const present = attendance.filter(r => ["Present", "Late", "Half-day"].includes(r.status)).length;
    const late    = attendance.filter(r => r.status === "Late").length;
    const absent  = attendance.filter(r => r.status === "Absent").length;
    const onLeave = attendance.filter(r => r.status === "Leave").length;

    // ── Tasks ──
    const overdueTasks = tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== "Done");
    const tasksByStatus = {
      todo:        tasks.filter(t => t.status === "To Do").length,
      in_progress: tasks.filter(t => t.status === "In Progress").length,
      blocked:     tasks.filter(t => t.status === "Blocked").length,
      done:        tasks.filter(t => t.status === "Done").length,
    };

    // ── Inventory ──
    const lowStockItems = inventory
      .filter(item => {
        const stock = Number(item.openingStock || 0) + Number(item.stockIn || 0) - Number(item.stockUsed || 0);
        return stock <= Number(item.minLevel || 0);
      })
      .map(item => ({ id: item.id, name: item.name || item.itemName, stock: item.closingStock ?? null }));

    const GBP_RATE = 200;
    res.json({
      generatedAt: new Date().toISOString(),
      todayKTM: today,
      invoices: {
        overdueCount: overdueInvoices.length,
        overdueAmountNPR: unpaidTotal,
        overdueAmountGBP: +(unpaidTotal / GBP_RATE).toFixed(2),
        revenueThisMonthNPR: revenueThisMonth,
        revenueThisMonthGBP: +(revenueThisMonth / GBP_RATE).toFixed(2),
        overdue: overdueInvoices.map(inv => ({
          id: inv.id,
          client: inv.clientName || inv.customerName,
          amountNPR: inv.totalNPR,
          dueDate: inv.dueDate,
          status: inv.status,
        })),
      },
      orders: {
        activeCount: activeOrders.length,
        items: activeOrders,
      },
      attendance: {
        date: today,
        totalStaff,
        present,
        late,
        absent,
        onLeave,
      },
      tasks: {
        overdueCount: overdueTasks.length,
        byStatus: tasksByStatus,
        overdue: overdueTasks.slice(0, 10).map(t => ({
          id: t.id,
          title: t.title,
          assignee: t.assignee,
          dueDate: t.dueDate,
        })),
      },
      inventory: {
        lowStockCount: lowStockItems.length,
        lowStockItems,
      },
    });
  } catch (err) {
    logger.error("DASHBOARD_API_ERROR", { error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── Dispatch Stage (callable) ───────────────────────────────────────────────
   Called from the React frontend or other Cloud Functions to assign a stage
   to the least-loaded available worker.
──────────────────────────────────────────────────────────────────────────── */
exports.dispatchStage = onCall(async (request) => {
  if (!request.auth) {
    throw new Error("unauthenticated");
  }
  // Only admins can trigger dispatch
  const callerSnap = await admin.firestore().collection("users").doc(request.auth.uid).get();
  const callerRole = callerSnap.data()?.role || callerSnap.data()?.appRole;
  if (!["nepal_admin", "uk_admin", "super_admin"].includes(callerRole)) {
    throw new Error("permission-denied");
  }

  const { orderId, stage } = request.data;
  if (!orderId || !stage) {
    throw new Error("Missing orderId or stage");
  }

  const db = admin.firestore();

  // 1. Get order from Firestore
  const orderSnap = await db.collection("orders").doc(orderId).get();
  if (!orderSnap.exists) {
    return { dispatched: false, reason: "Order not found" };
  }
  const order = orderSnap.data();

  // 2. Get stage_config for this stage
  const stageConfigSnap = await db.collection("stage_config").doc(stage).get();
  if (!stageConfigSnap.exists) {
    return { dispatched: false, reason: `No stage_config for stage: ${stage}` };
  }
  const stageConfig = stageConfigSnap.data();

  // 3. Check enabled and workers
  if (!stageConfig.enabled) {
    return { dispatched: false, reason: `Stage "${stage}" is disabled` };
  }
  const workerUids = stageConfig.workerUids || [];
  if (workerUids.length === 0) {
    return { dispatched: false, reason: `No workers configured for stage "${stage}"` };
  }

  // 4. Count active assignments per worker
  const activeSnap = await db.collection("order_assignments")
    .where("stage", "==", stage)
    .where("status", "in", ["pending", "accepted", "in_progress"])
    .get();

  const backlog = {};
  for (const uid of workerUids) backlog[uid] = 0;
  for (const doc of activeSnap.docs) {
    const wid = doc.data().workerId;
    if (wid in backlog) backlog[wid]++;
  }

  // 5. Pick worker with minimum count (first on tie)
  let chosenUid = workerUids[0];
  let minCount = backlog[workerUids[0]];
  for (let i = 1; i < workerUids.length; i++) {
    if (backlog[workerUids[i]] < minCount) {
      minCount = backlog[workerUids[i]];
      chosenUid = workerUids[i];
    }
  }

  const workerIndex = workerUids.indexOf(chosenUid);
  const workerName = (stageConfig.workerNames || [])[workerIndex] || chosenUid;

  // Look up the worker's Telegram ID from the users collection
  const workerSnap = await db.collection("users").doc(chosenUid).get();
  const workerTelegramId = workerSnap.exists ? (workerSnap.data().telegramId || null) : null;

  // 6. Create order_assignments doc
  const now = admin.firestore.Timestamp.now();
  const timeoutHours = stageConfig.timeoutHours || 6;
  const timeoutAt = admin.firestore.Timestamp.fromMillis(
    now.toMillis() + timeoutHours * 60 * 60 * 1000
  );

  const assignmentRef = await db.collection("order_assignments").add({
    orderId,
    orderRef: order.orderRef || order.orderId || orderId,
    customerName: order.customerName || order.clientName || "",
    quantity: order.quantity || 0,
    stage,
    workerId: chosenUid,
    workerName,
    workerTelegramId,
    status: "pending",
    assignedAt: now,
    acceptedAt: null,
    completedAt: null,
    timeoutAt,
    notifiedManager: false,
  });

  // 7. Send Telegram message to worker
  if (workerTelegramId) {
    const orderRef = order.orderRef || order.orderId || orderId;
    await tgReply(
      workerTelegramId,
      `🧵 New order assigned!\n\nOrder: *${orderRef}*\nCustomer: ${order.customerName || order.clientName || ""}\nQty: ${order.quantity || 0} pcs\nYour stage: *${stage}*\n\nReply *YES* to accept or *SKIP* to pass.`
    );
  }

  logger.info("DISPATCH_STAGE", { orderId, stage, workerId: chosenUid, workerName, assignmentId: assignmentRef.id });
  return { dispatched: true, workerId: chosenUid, workerName, assignmentId: assignmentRef.id };
});

/* ── Timeout checker (scheduled every hour) ──────────────────────────────── */
exports.checkDispatchTimeouts = onSchedule("every 1 hours", async () => {
  const now = admin.firestore.Timestamp.now();
  const db = admin.firestore();

  // Find all pending/accepted assignments past their timeoutAt
  const snap = await db.collection("order_assignments")
    .where("status", "in", ["pending", "accepted"])
    .where("timeoutAt", "<=", now)
    .where("notifiedManager", "==", false)
    .get();

  for (const doc of snap.docs) {
    const a = doc.data();
    await doc.ref.update({ notifiedManager: true, status: "timed_out" });

    // Alert manager via Telegram
    if (TELEGRAM_CHAT_ID) {
      await tgReply(TELEGRAM_CHAT_ID,
        `⚠️ *Dispatch timeout*\n\nOrder: *${a.orderRef}*\nStage: ${a.stage}\nAssigned to: ${a.workerName}\nNo response after ${a.timeoutHours || 6} hours.\n\nPlease follow up or reassign manually.`
      );
    }
  }

  logger.info("CHECK_DISPATCH_TIMEOUTS", { timedOut: snap.size });
});
