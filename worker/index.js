const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // Discord webhook file limit (non-boosted server)
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function buildEmbed({ title, description, reportedBy, severity, pageUrl }) {
  return {
    embeds: [{
      title: `🐛 New Admin Bug Report: ${title}`,
      description,
      color: 15158332,
      fields: [
        { name: "Reported By", value: reportedBy || "Unknown", inline: true },
        { name: "Severity", value: severity || "Unspecified", inline: true },
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
  const attachment = form.get("attachment");

  if (!title || !description) {
    return Response.json({ error: "Title and description are required." }, { status: 400 });
  }

  const payload = buildEmbed({ title, description, reportedBy, severity, pageUrl });

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

    return env.ASSETS.fetch(request);
  },
};
