const TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID;

const NOTIFY_STAGES = new Set(["Quality Check", "Packing", "Shipped", "Delivered"]);

const STAGE_EMOJI = {
  "Quality Check": "🔍",
  "Packing": "📦",
  "Shipped": "🚚",
  "Delivered": "✅",
};

export async function notifyStageChange({ orderId, customerName, stage, quantity, updatedBy }) {
  if (!NOTIFY_STAGES.has(stage)) return;
  if (!TOKEN || !CHAT_ID) return;

  const emoji = STAGE_EMOJI[stage] ?? "📋";
  const text = `${emoji} *${orderId}* → *${stage}*\n${quantity} pcs · ${customerName}\nBy ${updatedBy}`;

  fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "Markdown" }),
  }).catch(() => {});
}
