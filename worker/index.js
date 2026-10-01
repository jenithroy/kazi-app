import { AuthError, checkMarketingTabPermission, fetchCallerIdentity } from "./lib/metaAuth.js";
import { metaPost } from "./lib/metaGraph.js";
import { runMetaAdsSync } from "./lib/metaSync.js";
import { select as supabaseSelect } from "./lib/supabaseRest.js";

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // Discord webhook file limit (non-boosted server)
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function buildEmbed({ title, description, reportedBy, severity, pageUrl, section }) {
  return {
    embeds: [{
      title: `🐛 New Admin Bug Report: ${title}`,
      description,
      color: 15158332,
      fields: [
        { name: "Reported By", value: reportedBy || "Unknown", inline: true },
        { name: "Severity", value: severity || "Unspecified", inline: true },
        // Sent when the report was opened from a section's card on Roles &
        // Duties. The page URL is always /bug-report, so on its own it never
        // said which part of the ERP the complaint was about.
        ...(section ? [{ name: "Section", value: section, inline: true }] : []),
        { name: "Page/URL", value: pageUrl || "Unknown", inline: false },
      ],
      footer: { text: "Admin Dashboard Bug Reporter" },
      timestamp: new Date().toISOString(),
    }],
  };
}

async function handleBugReport(request, env) {
  const webhookUrl = env.DISCORD_BUG_REPORT_WEBHOOK_URL;
  if (!webhookUrl) {
    return Response.json({ error: "Bug report webhook is not configured on the server." }, { status: 500 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return Response.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const form = await request.formData();
  const title = (form.get("title") || "").toString().trim();
  const description = (form.get("description") || "").toString().trim();
  const reportedBy = (form.get("reportedBy") || "").toString().trim();
  const severity = (form.get("severity") || "").toString().trim();
  const pageUrl = (form.get("pageUrl") || "").toString().trim();
  const section = (form.get("section") || "").toString().trim();
  const attachment = form.get("attachment");

  if (!title || !description) {
    return Response.json({ error: "Title and description are required." }, { status: 400 });
  }

  const payload = buildEmbed({ title, description, reportedBy, severity, pageUrl, section });

  const hasFile = attachment && typeof attachment === "object" && "size" in attachment && attachment.size > 0;

  if (hasFile) {
    if (!ALLOWED_IMAGE_TYPES.has(attachment.type)) {
      return Response.json({ error: "Attachment must be a PNG, JPG, or WEBP image." }, { status: 400 });
    }
    if (attachment.size > MAX_ATTACHMENT_BYTES) {
      return Response.json({ error: "Attachment exceeds the 8MB limit." }, { status: 400 });
    }

    const discordForm = new FormData();
    discordForm.append("payload_json", JSON.stringify(payload));
    discordForm.append("files[0]", attachment, attachment.name || "attachment");

    const discordRes = await fetch(webhookUrl, { method: "POST", body: discordForm });
    if (!discordRes.ok) {
      const text = await discordRes.text().catch(() => "");
      return Response.json({ error: `Discord webhook failed: ${discordRes.status} ${text}` }, { status: 502 });
    }
  } else {
    const discordRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!discordRes.ok) {
      const text = await discordRes.text().catch(() => "");
      return Response.json({ error: `Discord webhook failed: ${discordRes.status} ${text}` }, { status: 502 });
    }
  }

  return Response.json({ ok: true });
}

// AuthError (401/503, thrown by checkMarketingTabPermission/fetchCallerIdentity
// when there's no valid session) maps straight to its own status; anything
// else is an unexpected 500 — same two-branch shape the bug-report route
// above already uses, just with one more case.
function errorResponse(err) {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return Response.json({ error: err.message || "Unexpected error." }, { status: 500 });
}

async function handleMetaAdsSync(request, env) {
  const permission = await checkMarketingTabPermission(request, env);
  if (!permission.view) {
    return Response.json({ error: "Your role doesn't include Meta Ads." }, { status: 403 });
  }

  // Whoever clicked "Sync now" — stamped onto meta_sync_runs so the run
  // history shows a real person, not just "manual".
  const identity = await fetchCallerIdentity(request, env);

  const summary = await runMetaAdsSync(env, {
    triggerType: "manual",
    triggeredByPersonId: identity?.personId ?? null,
    triggeredByName: identity?.fullName ?? null,
  });
  return Response.json(summary);
}

const PAUSE_RESUME_STATUS = { pause: "PAUSED", resume: "ACTIVE" };
const BUDGET_FIELDS = new Set(["daily_budget", "lifetime_budget"]);

/**
 * Pauses/resumes a campaign/adset/ad, or edits its budget, by calling Meta
 * directly. Deliberately does NOT write to Supabase: a Worker request using
 * the service key can't satisfy meta_ads_actions' app_person_id()-based
 * actor-stamping trigger, so the already-authenticated browser does the
 * meta_campaigns/meta_adsets status/budget update and the meta_ads_actions
 * audit insert itself, right after this call succeeds.
 */
async function handleMetaAdsAction(request, env) {
  const permission = await checkMarketingTabPermission(request, env);
  if (!permission.edit) {
    return Response.json({ error: "Your role can view Meta Ads but not change it." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const { entityLevel, entityId, action, field, valueMinor } = body || {};

  if (!["campaign", "adset", "ad"].includes(entityLevel) || !entityId) {
    return Response.json({ error: "Missing or invalid entityLevel/entityId." }, { status: 400 });
  }

  if (action === "pause" || action === "resume") {
    const result = await metaPost(`/${entityId}`, { status: PAUSE_RESUME_STATUS[action] }, env);
    return Response.json({ ok: true, newState: { ...result, status: PAUSE_RESUME_STATUS[action] } });
  }

  if (action === "budget_edit") {
    if (!BUDGET_FIELDS.has(field) || !Number.isFinite(valueMinor) || valueMinor <= 0) {
      return Response.json({ error: "budget_edit needs a valid field and valueMinor." }, { status: 400 });
    }

    // Server-side hard stop — a client confirm dialog alone is not a real
    // guard on live ad spend.
    const settingsRows = await supabaseSelect(env, "meta_ads_settings", {
      id: "eq.default",
      select: "budget_ceiling_minor",
    });
    const ceiling = settingsRows?.[0]?.budget_ceiling_minor;
    if (ceiling != null && valueMinor > ceiling) {
      return Response.json(
        { error: `That exceeds the budget ceiling (${ceiling} minor units).` },
        { status: 400 }
      );
    }

    const result = await metaPost(`/${entityId}`, { [field]: valueMinor }, env);
    return Response.json({ ok: true, newState: { ...result, [field]: valueMinor } });
  }

  return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/bug-report") {
      try {
        return await handleBugReport(request, env);
      } catch (err) {
        return Response.json({ error: err.message || "Unexpected error." }, { status: 500 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/meta-ads/sync") {
      try {
        return await handleMetaAdsSync(request, env);
      } catch (err) {
        return errorResponse(err);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/meta-ads/action") {
      try {
        return await handleMetaAdsAction(request, env);
      } catch (err) {
        return errorResponse(err);
      }
    }

    return env.ASSETS.fetch(request);
  },

  // Cron trigger (wrangler.jsonc's triggers.crons) — same sync the "Sync
  // now" button runs, just with no signed-in caller to attribute it to.
  // ctx.waitUntil keeps the Worker alive until the sync finishes instead of
  // the isolate being torn down right after this handler returns.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runMetaAdsSync(env, { triggerType: "cron" }).catch((err) => {
        console.error("Meta Ads cron sync failed:", err?.message || err);
      })
    );
  },
};
