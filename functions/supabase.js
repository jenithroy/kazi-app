/**
 * Supabase access for the Cloud Functions, plus the dispatch rules themselves.
 *
 * The functions run as trusted server code with the service key, so they
 * bypass row level security — the same footing they had with the Firebase Admin
 * SDK. Nothing here should ever be reachable from a browser.
 *
 * The worker-picking logic lives here because the original had it written out
 * three times: once in dispatchStage, once when a worker skips, and once when a
 * stage completes and the next one is dispatched. Three copies of a rule is
 * three places for it to drift, and they had already begun to — the skip path
 * looked up the worker's name against a filtered list while the others used the
 * unfiltered one, so a name could be reported against the wrong worker.
 */
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  // Thrown at module load so a misconfigured deploy fails loudly rather than
  // silently writing nowhere.
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set on the functions environment");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Order stages, in order. Mirrors src/constants/enums.js. */
const STAGE_ORDER = [
  "Order Received", "Fabric Sourcing", "Cutting", "Stitching",
  "Finishing & Pressing", "Embellishment", "Quality Check",
  "Packing", "Shipped", "Delivered",
];

const NEXT_STAGE = Object.fromEntries(
  STAGE_ORDER.slice(0, -1).map((s, i) => [s, STAGE_ORDER[i + 1]])
);

/** The person behind an inbound Telegram message, or null. */
async function getWorkerProfile(telegramId) {
  const { data, error } = await sb
    .from("people")
    .select("id, full_name, position_id, telegram_id, status, positions(tier)")
    .eq("telegram_id", Number(telegramId))
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status === "Inactive") return null;
  return {
    id: data.id,
    name: data.full_name,
    positionId: data.position_id,
    tier: data.positions?.tier ?? -1,
  };
}

async function getWorkerSession(telegramId) {
  const { data, error } = await sb
    .from("worker_sessions").select("*").eq("telegram_id", Number(telegramId)).maybeSingle();
  if (error) throw error;
  return data;
}

async function setWorkerSession(telegramId, personId, patch) {
  const { error } = await sb.from("worker_sessions").upsert({
    telegram_id: Number(telegramId),
    person_id: personId,
    ...patch,
    updated_at: new Date().toISOString(),
  }, { onConflict: "telegram_id" });
  if (error) throw error;
}

/** Append a note to an order. Notes are their own rows now, not a JSON array. */
async function addOrderNote(orderId, text, author) {
  const { error } = await sb.from("order_notes").insert({ order_id: orderId, text, author });
  if (error) throw error;
}

/**
 * Move an order to a stage and record it in the history.
 *
 * The history used to be a JSON array read, appended to, and written back — a
 * lost update whenever two people advanced stages at once. It is a table now,
 * so this is an insert and concurrent advances cannot overwrite each other.
 */
async function advanceOrder(orderId, nextStage, byName) {
  const { data: order } = await sb
    .from("orders").select("status").eq("id", orderId).maybeSingle();

  const status = nextStage === "Delivered" ? "Completed" : (order?.status ?? "Active");
  const { error } = await sb.from("orders").update({ stage: nextStage, status }).eq("id", orderId);
  if (error) throw error;

  const { data: last } = await sb
    .from("order_stage_history").select("seq").eq("order_id", orderId)
    .order("seq", { ascending: false }).limit(1).maybeSingle();

  await sb.from("order_stage_history").insert({
    order_id: orderId,
    stage: nextStage,
    changed_at: new Date().toISOString().slice(0, 10),
    changed_by: byName,
    seq: (last?.seq ?? -1) + 1,
  });
}

/**
 * Assign a stage of an order to whichever configured worker has the least on.
 *
 * Returns { assigned, worker, reason }. `excludePersonId` is for a re-assign
 * after somebody skips, so the same person is not handed it straight back.
 */
async function assignStage(orderId, stage, { excludePersonId = null } = {}) {
  const { data: order } = await sb
    .from("orders")
    .select("id, order_no, customer_name, quantity")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { assigned: false, reason: "Order not found" };

  const { data: config } = await sb
    .from("stage_config").select("*").eq("stage", stage).maybeSingle();
  if (!config) return { assigned: false, reason: `No stage_config for stage: ${stage}` };
  if (!config.enabled) return { assigned: false, reason: `Stage "${stage}" is disabled` };

  const candidates = (config.worker_uids || []).filter(id => id && id !== excludePersonId);
  if (candidates.length === 0) {
    return { assigned: false, reason: `No workers configured for stage "${stage}"` };
  }

  // Open work per candidate. Counting only this stage matches how the queue is
  // actually worked — someone busy on Cutting is not busy for Packing.
  const { data: openWork } = await sb
    .from("order_assignments")
    .select("person_id")
    .eq("stage", stage)
    .in("status", ["pending", "accepted", "in_progress"]);

  const backlog = Object.fromEntries(candidates.map(id => [id, 0]));
  for (const row of openWork || []) {
    if (row.person_id in backlog) backlog[row.person_id]++;
  }

  // Least loaded; ties go to whoever is listed first, which keeps the choice
  // predictable rather than depending on row order.
  let chosen = candidates[0];
  for (const id of candidates) {
    if (backlog[id] < backlog[chosen]) chosen = id;
  }

  const { data: worker } = await sb
    .from("people").select("id, full_name, telegram_id").eq("id", chosen).maybeSingle();
  if (!worker) return { assigned: false, reason: "Assigned worker no longer exists" };

  const timeoutHours = config.timeout_hours || 6;
  const { data: assignment, error } = await sb.from("order_assignments").insert({
    order_id: order.id,
    order_ref: order.order_no || order.id,
    customer_name: order.customer_name || "",
    quantity: order.quantity || 0,
    stage,
    person_id: worker.id,
    assigned_to: worker.full_name,
    worker_telegram_id: worker.telegram_id,
    status: "pending",
    assigned_at: new Date().toISOString(),
    timeout_at: new Date(Date.now() + timeoutHours * 3600 * 1000).toISOString(),
    timeout_hours: timeoutHours,
    notified_manager: false,
  }).select("id").single();
  if (error) throw error;

  return {
    assigned: true,
    assignmentId: assignment.id,
    worker: {
      id: worker.id,
      name: worker.full_name,
      telegramId: worker.telegram_id,
    },
    order: {
      ref: order.order_no || order.id,
      customerName: order.customer_name || "",
      quantity: order.quantity || 0,
    },
    stage,
  };
}

/** The newest assignment for a worker in any of the given states. */
async function latestAssignment(personId, statuses, orderBy = "assigned_at") {
  const { data } = await sb
    .from("order_assignments")
    .select("*")
    .eq("person_id", personId)
    .in("status", statuses)
    .order(orderBy, { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

module.exports = {
  sb,
  STAGE_ORDER,
  NEXT_STAGE,
  getWorkerProfile,
  getWorkerSession,
  setWorkerSession,
  addOrderNote,
  advanceOrder,
  assignStage,
  latestAssignment,
};
