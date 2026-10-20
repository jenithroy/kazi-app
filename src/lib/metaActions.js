/**
 * Helpers for extracting and aggregating Meta ad action types:
 * - Messages started (DMs)
 * - Comments
 * - Instant Form Leads
 * - Reactions / Likes
 * - Link clicks
 */

const MESSAGE_ACTION_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "messaging_conversation_started_7d",
  "onsite_conversion.messaging_conversation_started",
  "messaging_conversation_started",
  "onsite_conversion.total_messaging_connection",
  "total_messaging_connection",
  "onsite_conversion.messaging_first_reply",
  "messaging_first_reply",
  "onsite_conversion.messaging_welcome_message_view",
  "onsite_conversion.messaging_user_depth_2_message_send",
  "contact",
  "onsite_conversion.contact",
];

const COMMENT_ACTION_TYPES = ["comment", "post_comment"];

const LEAD_ACTION_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

const REACTION_ACTION_TYPES = ["post_reaction", "like"];

const LINK_CLICK_ACTION_TYPES = ["link_click"];

export function getActionValue(actions, targetTypes) {
  if (!actions) return 0;
  let list = actions;
  if (typeof actions === "string") {
    try {
      list = JSON.parse(actions);
    } catch {
      return 0;
    }
  }
  if (!Array.isArray(list) || list.length === 0) return 0;
  for (const t of targetTypes) {
    const act = list.find((a) => a && a.action_type === t);
    if (act && Number(act.value) > 0) {
      return Number(act.value);
    }
  }
  return 0;
}

export function countMessages(actions) {
  const direct = getActionValue(actions, MESSAGE_ACTION_TYPES);
  if (direct > 0) return direct;

  if (!actions) return 0;
  let list = actions;
  if (typeof actions === "string") {
    try {
      list = JSON.parse(actions);
    } catch {
      return 0;
    }
  }
  if (!Array.isArray(list)) return 0;

  for (const item of list) {
    if (!item || !item.action_type) continue;
    const type = item.action_type.toLowerCase();
    if (
      (type.includes("messaging") || type.includes("conversation_started") || type.includes("contact")) &&
      !type.includes("block") &&
      Number(item.value) > 0
    ) {
      return Number(item.value);
    }
  }
  return 0;
}

export function countComments(actions) {
  return getActionValue(actions, COMMENT_ACTION_TYPES);
}

export function countLeads(actions) {
  return getActionValue(actions, LEAD_ACTION_TYPES);
}

export function countReactions(actions) {
  return getActionValue(actions, REACTION_ACTION_TYPES);
}

export function countLinkClicks(actions) {
  return getActionValue(actions, LINK_CLICK_ACTION_TYPES);
}

/**
 * Roll up all engagement counts and CPAs across an array of insight rows.
 */
export function summarizeEngagement(rows = []) {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let messages = 0;
  let comments = 0;
  let leads = 0;
  let reactions = 0;
  let linkClicks = 0;

  for (const r of rows) {
    spend += Number(r.spend || 0);
    impressions += Number(r.impressions || 0);
    clicks += Number(r.clicks || 0);
    messages += countMessages(r.conversions);
    comments += countComments(r.conversions);
    leads += countLeads(r.conversions);
    reactions += countReactions(r.conversions);
    linkClicks += countLinkClicks(r.conversions);
  }

  const totalInquiries = messages + comments + leads;
  const costPerMessage = messages > 0 ? spend / messages : null;
  const costPerLead = leads > 0 ? spend / leads : null;
  const costPerComment = comments > 0 ? spend / comments : null;
  const costPerInquiry = totalInquiries > 0 ? spend / totalInquiries : null;

  return {
    spend,
    impressions,
    clicks,
    messages,
    comments,
    leads,
    reactions,
    linkClicks,
    totalInquiries,
    costPerMessage,
    costPerLead,
    costPerComment,
    costPerInquiry,
  };
}
