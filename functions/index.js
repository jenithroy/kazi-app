const { onRequest, onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
  sb, NEXT_STAGE,
  getWorkerProfile, getWorkerSession, setWorkerSession,
  addOrderNote, advanceOrder, assignStage, latestAssignment,
} = require("./supabase");
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

    // B. Authorize against the caller's position — the same matrix the
    // database enforces. This used to read a users/{uid} document that is
    // no longer maintained, so it had begun refusing everyone.
    const { data: person } = await sb
      .from("people").select("id, position_id, status")
      .or(`legacy_firebase_uid.eq.${uid},auth_uid.eq.${uid}`)
      .maybeSingle();

    if (!person || person.status === "Inactive") {
      logger.warn("FORBIDDEN_ACCESS_ATTEMPT: no active staff record", { uid });
      return res.status(403).json({ error: "Forbidden: User profile not found" });
    }

    const { data: msgPerm } = await sb
      .from("position_permissions").select("can_edit")
      .eq("position_id", person.position_id).eq("section_id", "messenger").maybeSingle();
    const role = person.position_id;
    if (!msgPerm?.can_edit) {
      logger.warn("FORBIDDEN_ACCESS_ATTEMPT: position cannot edit messenger", { uid, role });
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

// STAGES / NEXT_STAGE come from ./supabase.js so the pipeline is defined once.
const STAGES = require("./supabase").STAGE_ORDER;
const ACTIVE_STATUSES = ["Cutting", "Stitching", "Finishing & Pressing", "Embellishment", "Quality Check"];

async function tgReply(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

// getWorkerProfile / getWorkerSession / setWorkerSession now live in
// ./supabase.js, alongside the dispatch rules they are used with.

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

    const session = (await getWorkerSession(fromId)) || { state: "idle" };
    const currentOrderId = session.current_order_id || null;

    /** Re-assign a stage and tell everyone who needs to know. */
    const dispatchNext = async (orderId, stage, opts = {}) => {
      const r = await assignStage(orderId, stage, opts);
      if (!r.assigned) return null;
      if (r.worker.telegramId) {
        await tgReply(
          r.worker.telegramId,
          `🧵 New order assigned!\n\nOrder: *${r.order.ref}*\nCustomer: ${r.order.customerName}\nQty: ${r.order.quantity} pcs\nYour stage: *${stage}*\n\nReply *YES* to accept or *SKIP* to pass.`
        );
      }
      return r;
    };

    // Photo → attach to current order
    if (photoArr?.length) {
      if (!currentOrderId) {
        await tgReply(chatId, "Set an active order first with /start <ref>.");
        return;
      }
      const fileId = photoArr[photoArr.length - 1].file_id;
      await addOrderNote(currentOrderId, `Photo via bot (tg:${fileId})`, profile.name);
      await tgReply(chatId, "Photo attached to order ✓");
      return;
    }

    // Awaiting issue description
    if (session.state === "awaiting_issue" && currentOrderId && text) {
      const { data: order } = await sb
        .from("orders").select("order_no, quantity, customer_name").eq("id", currentOrderId).maybeSingle();

      await addOrderNote(currentOrderId, `⚠️ Issue: ${message.text.trim()}`, profile.name);
      await setWorkerSession(fromId, profile.id, { state: "active" });

      if (TELEGRAM_CHAT_ID) {
        const ref = order?.order_no || currentOrderId.slice(0, 8).toUpperCase();
        await tgReply(TELEGRAM_CHAT_ID, `⚠️ *Issue on ${ref}*\n${order?.quantity} pcs · ${order?.customer_name}\nBy ${profile.name}: ${message.text.trim()}`);
      }
      await tgReply(chatId, "Issue logged and management notified. Type /queue to see orders.");
      return;
    }

    // ── Dispatch assignment responses ─────────────────────────
    if (text === "yes" || text === "/yes") {
      const assignment = await latestAssignment(profile.id, ["pending"]);
      if (!assignment) {
        await tgReply(chatId, "No pending assignment found.");
        return;
      }
      await sb.from("order_assignments")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", assignment.id);

      await tgReply(chatId, `✅ Order *${assignment.order_ref}* accepted! Reply *DONE* when your ${assignment.stage} stage is complete.`);
      return;
    }

    if (text === "skip" || text === "/skip") {
      const assignment = await latestAssignment(profile.id, ["pending"]);
      if (!assignment) {
        await tgReply(chatId, "No pending assignment found.");
        return;
      }
      await sb.from("order_assignments").update({ status: "declined" }).eq("id", assignment.id);

      // Hand it to the next least-loaded worker, excluding whoever just passed.
      const next = await dispatchNext(assignment.order_id, assignment.stage, {
        excludePersonId: profile.id,
      });

      if (TELEGRAM_CHAT_ID) {
        await tgReply(TELEGRAM_CHAT_ID,
          `⚠️ Worker ${profile.name} skipped order *${assignment.order_ref}* (${assignment.stage}). ` +
          (next ? `Reassigned to ${next.worker.name}.` : "No one else is configured for this stage — please reassign manually.")
        );
      }
      await tgReply(chatId, next ? "Skipped. Order reassigned." : "Skipped. No other worker is configured for this stage.");
      return;
    }

    if (text === "done" || text === "/done") {
      const assignment = await latestAssignment(profile.id, ["accepted", "in_progress"], "accepted_at");

      if (assignment) {
        await sb.from("order_assignments")
          .update({ status: "done", completed_at: new Date().toISOString() })
          .eq("id", assignment.id);

        const nextStage = NEXT_STAGE[assignment.stage];
        if (!nextStage) {
          await tgReply(chatId, `🎉 Order *${assignment.order_ref}* is complete!`);
          return;
        }

        await advanceOrder(assignment.order_id, nextStage, profile.name);

        let nextWorkerName = null;
        try {
          const r = await dispatchNext(assignment.order_id, nextStage);
          nextWorkerName = r ? r.worker.name : null;
        } catch (dispatchErr) {
          logger.error("DISPATCH_NEXT_STAGE_ERROR", { error: dispatchErr.message });
        }

        if (TELEGRAM_CHAT_ID) {
          await tgReply(TELEGRAM_CHAT_ID, `📋 *${assignment.order_ref}* → *${nextStage}*\n${assignment.quantity} pcs · ${assignment.customer_name}\nBy ${profile.name}`);
        }

        if (nextStage === "Delivered") {
          await tgReply(chatId, `🎉 Order *${assignment.order_ref}* is complete!`);
        } else {
          const assignedTo = nextWorkerName ? ` Assigned to ${nextWorkerName}.` : "";
          await tgReply(chatId, `✅ Stage complete! *${nextStage}* has been assigned.${assignedTo}`);
        }
        return;
      }
      // No dispatch assignment — fall through to the manual /done below.
    }

    // Commands
    if (text === "/in" || text === "in") {
      const { count } = await sb
        .from("orders").select("id", { count: "exact", head: true }).eq("status", "Active");
      await setWorkerSession(fromId, profile.id, { state: "active", checked_in_at: new Date().toISOString() });
      await sb.from("shift_logs").insert({ person_id: profile.id, name: profile.name });
      await tgReply(chatId, `Welcome ${profile.name}! ✓\n${count} active order${count !== 1 ? "s" : ""} in production. Type /queue to see them.`);
      return;
    }

    if (text === "/out" || text === "out") {
      if (session.state === "idle") { await tgReply(chatId, "You're not checked in."); return; }
      const { data: open } = await sb
        .from("shift_logs").select("id").eq("person_id", profile.id).is("checked_out_at", null)
        .order("checked_in_at", { ascending: false }).limit(1).maybeSingle();
      if (open) {
        await sb.from("shift_logs").update({ checked_out_at: new Date().toISOString() }).eq("id", open.id);
      }
      await setWorkerSession(fromId, profile.id, { state: "idle", current_order_id: null, checked_in_at: null });
      await tgReply(chatId, `See you later, ${profile.name}! Good work today.`);
      return;
    }

    if (text === "/queue" || text === "queue") {
      const { data: rows } = await sb
        .from("orders").select("order_no, quantity, customer_name, stage").eq("status", "Active").limit(10);
      if (!rows?.length) { await tgReply(chatId, "No active orders right now."); return; }
      const lines = rows.map((o, i) => `${i + 1}. *${o.order_no}* — ${o.quantity} pcs · ${o.customer_name} [${o.stage}]`);
      await tgReply(chatId, `Active orders:\n\n${lines.join("\n")}\n\nType /start <order ID> to set your active order.`);
      return;
    }

    if (text.startsWith("/start ")) {
      const ref = text.split(" ")[1]?.toUpperCase();
      const { data: order } = await sb
        .from("orders").select("id, order_no, quantity, customer_name, stage")
        .eq("order_no", ref).maybeSingle();
      if (!order) { await tgReply(chatId, `Order ${ref} not found. Type /queue to see active orders.`); return; }
      await setWorkerSession(fromId, profile.id, { state: "active", current_order_id: order.id });
      await tgReply(chatId, `Active order: *${order.order_no}* — ${order.quantity} pcs · ${order.customer_name} [${order.stage}]\n\nType /done when complete, /issue to flag a problem.`);
      return;
    }

    if (text === "/done" || text === "done") {
      if (!currentOrderId) { await tgReply(chatId, "No active order. Type /queue then /start <id>."); return; }
      const { data: order } = await sb
        .from("orders").select("order_no, quantity, customer_name, stage").eq("id", currentOrderId).maybeSingle();
      const nextStage = NEXT_STAGE[order?.stage];
      if (!nextStage) { await tgReply(chatId, `Order is already at final stage: ${order?.stage}.`); return; }

      await advanceOrder(currentOrderId, nextStage, profile.name);
      await setWorkerSession(fromId, profile.id, { current_order_id: null });

      if (TELEGRAM_CHAT_ID) {
        await tgReply(TELEGRAM_CHAT_ID, `📋 *${order.order_no}* → *${nextStage}*\n${order.quantity} pcs · ${order.customer_name}\nBy ${profile.name}`);
      }
      await tgReply(chatId, `Done! ✓ Order moved to *${nextStage}*. Type /queue for next order.`);
      return;
    }

    if (text === "/issue" || text === "issue") {
      if (!currentOrderId) { await tgReply(chatId, "Set an active order first with /start <id>."); return; }
      await setWorkerSession(fromId, profile.id, { state: "awaiting_issue" });
      await tgReply(chatId, "Describe the issue:");
      return;
    }

    // ── Admin-only commands ──────────────────────────────────
    // Seniority comes from the position's tier, the same number the app uses.
    // Tier 2 is manager level and above.
    const isAdmin = profile.tier >= 2;

    if ((text === "/dashboard" || text === "/report" || text === "/d") && isAdmin) {
      await tgReply(chatId, "Fetching dashboard…");
      try {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
        const thisMonth = today.slice(0, 7);

        const [invoicesRes, ordersRes, attRes, tasksRes, inventoryRes, staffRes] = await Promise.all([
          sb.from("fs_invoices").select("*"),
          sb.from("fs_orders").select("*"),
          sb.from("fs_attendance").select("*").eq("date", today),
          sb.from("fs_tasks").select("*"),
          sb.from("fs_inventory").select("*"),
          sb.from("people").select("id", { count: "exact", head: true }).eq("status", "Active"),
        ]);

        const invoices   = invoicesRes.data || [];
        const orders     = ordersRes.data || [];
        const attendance = attRes.data || [];
        const tasks      = tasksRes.data || [];
        const inventory  = inventoryRes.data || [];
        const totalStaff = staffRes.count || 0;

        const overdueInvs = invoices.filter(inv =>
          inv.dueDate && inv.dueDate < today && inv.status !== "Paid" && inv.status !== "Cancelled"
        );
        const overdueAmt = overdueInvs.reduce((s, i) => s + Number(i.totalNPR || 0), 0);
        const revMTD = invoices
          .filter(i => (i.date || "").slice(0, 7) === thisMonth && i.status !== "Cancelled")
          .reduce((s, i) => s + Number(i.totalNPR || 0), 0);

        const activeOrders = orders.filter(o => o.status !== "Completed" && o.status !== "Cancelled");
        const overdueOrders = activeOrders.filter(o => o.deliveryDate && o.deliveryDate < today);

        const present = attendance.filter(r => ["Present", "Late", "Half-day"].includes(r.status)).length;
        const late    = attendance.filter(r => r.status === "Late").length;
        const absent  = attendance.filter(r => r.status === "Absent").length;

        const overdueTasks = tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== "Done");
        const blocked = tasks.filter(t => t.status === "Blocked").length;

        const lowStock = inventory.filter(item => {
          const stock = Number(item.openingStock || 0) + Number(item.stockIn || 0) - Number(item.stockUsed || 0);
          return stock <= Number(item.minLevel || 0);
        });

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
            ? `📦 *Low stock: ${lowStock.length} item${lowStock.length > 1 ? "s" : ""}*\n  ${lowStock.slice(0, 3).map(i => i.item || i.itemId).join(", ")}${lowStock.length > 3 ? ` +${lowStock.length - 3} more` : ""}`
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
      const { data: all } = await sb
        .from("fs_orders").select("*").order("createdAt", { ascending: false });
      const activeOrders = (all || [])
        .filter(o => o.status !== "Completed" && o.status !== "Cancelled")
        .slice(0, 15);

      if (!activeOrders.length) { await tgReply(chatId, "No active orders."); return; }

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
      const lines = activeOrders.map((o, i) => {
        const overdue = o.deliveryDate && o.deliveryDate < today ? " 🔴" : "";
        return `${i + 1}. *${o.orderId || o.id.slice(0, 8)}* — ${o.customerName || "—"} [${o.stage || o.status}]${overdue}`;
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
const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY;

exports.dashboardApi = onRequest({ cors: true }, async (req, res) => {
  // Auth check
  const auth = req.headers["authorization"] || "";
  if (!DASHBOARD_API_KEY) {
    return res.status(503).json({ error: "Dashboard API not configured" });
  }
  if (auth !== `Bearer ${DASHBOARD_API_KEY}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" }); // YYYY-MM-DD in KTM

    // The fs_* views return the same field names this endpoint has always
    // published, so its JSON contract is unchanged.
    const [invoicesRes, ordersRes, attRes, tasksRes, inventoryRes, staffRes] = await Promise.all([
      sb.from("fs_invoices").select("*"),
      sb.from("fs_orders").select("*"),
      sb.from("fs_attendance").select("*").eq("date", today),
      sb.from("fs_tasks").select("*"),
      sb.from("fs_inventory").select("*"),
      sb.from("people").select("id", { count: "exact", head: true }).eq("status", "Active"),
    ]);

    const invoices   = invoicesRes.data || [];
    const orders     = ordersRes.data || [];
    const attendance = attRes.data || [];
    const tasks      = tasksRes.data || [];
    const inventory  = inventoryRes.data || [];
    const totalStaff = staffRes.count || 0;

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
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 10)
      .map(o => ({
        id: o.id,
        ref: o.orderId || o.id,
        customer: o.customerName || "—",
        stage: o.stage || o.status || "—",
        dueDate: o.deliveryDate || null,
        overdue: o.deliveryDate ? o.deliveryDate < today : false,
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
      .map(item => ({ id: item.id, name: item.item || item.itemId, stock: item.closingStock ?? null }));

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

  // Authorised against the caller's position, the same matrix the database
  // enforces — not a `role` string on a user document, which no longer exists
  // and would have rejected everybody. `production` edit is the right test:
  // dispatching is a production action, so whoever runs the floor can do it
  // without also needing to be a system administrator.
  const { data: caller } = await sb
    .from("people")
    .select("id, full_name, position_id, position_permissions:position_id(*)")
    .eq("legacy_firebase_uid", request.auth.uid)
    .maybeSingle();

  const callerPerson = caller || (await sb
    .from("people").select("id, full_name, position_id")
    .eq("auth_uid", request.auth.uid).maybeSingle()).data;

  if (!callerPerson) throw new Error("permission-denied");

  const { data: perm } = await sb
    .from("position_permissions")
    .select("can_edit")
    .eq("position_id", callerPerson.position_id)
    .eq("section_id", "production")
    .maybeSingle();

  if (!perm?.can_edit) throw new Error("permission-denied");

  const { orderId, stage } = request.data;
  if (!orderId || !stage) {
    throw new Error("Missing orderId or stage");
  }

  const result = await assignStage(orderId, stage);
  if (!result.assigned) {
    return { dispatched: false, reason: result.reason };
  }

  if (result.worker.telegramId) {
    await tgReply(
      result.worker.telegramId,
      `🧵 New order assigned!\n\nOrder: *${result.order.ref}*\nCustomer: ${result.order.customerName}\nQty: ${result.order.quantity} pcs\nYour stage: *${stage}*\n\nReply *YES* to accept or *SKIP* to pass.`
    );
  }

  logger.info("DISPATCH_STAGE", {
    orderId, stage, workerId: result.worker.id,
    workerName: result.worker.name, assignmentId: result.assignmentId,
  });
  return {
    dispatched: true,
    workerId: result.worker.id,
    workerName: result.worker.name,
    assignmentId: result.assignmentId,
  };
});

/* ── Timeout checker (scheduled every hour) ──────────────────────────────── */
exports.checkDispatchTimeouts = onSchedule("every 1 hours", async () => {
  const nowIso = new Date().toISOString();

  const { data: stale, error } = await sb
    .from("order_assignments")
    .select("*")
    .in("status", ["pending", "accepted"])
    .lte("timeout_at", nowIso)
    .eq("notified_manager", false);

  if (error) {
    logger.error("CHECK_DISPATCH_TIMEOUTS_ERROR", { error: error.message });
    return;
  }

  for (const a of stale || []) {
    // Marked first, so a failure sending the alert cannot cause the same
    // assignment to be reported hour after hour.
    await sb.from("order_assignments")
      .update({ notified_manager: true, status: "timed_out" })
      .eq("id", a.id);

    if (TELEGRAM_CHAT_ID) {
      await tgReply(TELEGRAM_CHAT_ID,
        `⚠️ *Dispatch timeout*\n\nOrder: *${a.order_ref}*\nStage: ${a.stage}\nAssigned to: ${a.assigned_to}\nNo response after ${a.timeout_hours || 6} hours.\n\nPlease follow up or reassign manually.`
      );
    }
  }

  logger.info("CHECK_DISPATCH_TIMEOUTS", { timedOut: (stale || []).length });
});
