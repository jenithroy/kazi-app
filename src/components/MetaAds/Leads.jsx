import { useEffect, useMemo, useState } from "react";
import { Card, Btn, Pill, Icons } from "../ui";
import { fetchMetaLeads } from "../../lib/metaAds";
import { runMetaLeadsSync } from "../../lib/metaAdsApi";
import { updateRow, insertRow } from "../../lib/db";
import { timeAgo } from "./time";

const STATUS_OPTIONS = [
  { id: "new", label: "New", tone: "mint" },
  { id: "contacted", label: "Contacted", tone: "info" },
  { id: "qualified", label: "Qualified", tone: "accent" },
  { id: "converted", label: "Converted", tone: "emerald" },
  { id: "archived", label: "Archived", tone: "neutral" },
];

function statusMeta(status) {
  const s = (status || "new").toLowerCase();
  return (
    STATUS_OPTIONS.find((o) => o.id === s) || {
      id: s,
      label: s.replace(/^./, (c) => c.toUpperCase()),
      tone: "neutral",
    }
  );
}

function cleanPhoneNumber(phone) {
  if (!phone) return "";
  // Keep digits and leading plus
  let cleaned = phone.replace(/[^\d+]/g, "");
  // If starts with 98 and no country code, add +977 (Nepal)
  if (cleaned.startsWith("98") && cleaned.length === 10) {
    cleaned = `977${cleaned}`;
  }
  return cleaned.replace(/^\+/, "");
}

/** Modal showing all questions and custom answers submitted in the form */
function FormAnswersModal({ lead, onClose }) {
  if (!lead) return null;
  const rawData = lead.rawData || {};
  const entries = Object.entries(rawData);

  return (
    <div className="kmodal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="kmodal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, width: "100%" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>
              Form Responses: {lead.fullName || "Lead"}
            </h3>
            <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
              {lead.campaignName || "Meta Lead Ad"} {lead.adName ? `· ${lead.adName}` : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)" }}
          >
            <Icons.X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "65vh", overflowY: "auto" }}>
          {entries.length === 0 ? (
            <p className="kmkt-muted" style={{ textAlign: "center" }}>No custom questionnaire fields.</p>
          ) : (
            entries.map(([key, value]) => {
              const displayKey = key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
              const displayVal = typeof value === "object" ? JSON.stringify(value) : String(value || "—");
              return (
                <div
                  key={key}
                  style={{
                    background: "var(--bg-2)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    border: "1px solid var(--line)",
                  }}
                >
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    {displayKey}
                  </div>
                  <div style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 500 }}>
                    {displayVal}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <Btn kind="ghost" size="sm" onClick={onClose}>
            Close
          </Btn>
        </div>
      </div>
    </div>
  );
}

/** Webhook connection guide dialog */
function WebhookGuideModal({ onClose }) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const webhookUrl = "https://kazimfg.com.np/api/meta-ads/webhook";
  const verifyToken = "kazi_meta_leads_verify";

  const copy = (text, setFn) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  return (
    <div className="kmodal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="kmodal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, width: "100%" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>
              Meta Instant Leads Webhook
            </h3>
            <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
              Real-time Facebook & Instagram form submission listener
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)" }}
          >
            <Icons.X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13, color: "var(--ink-2)" }}>
          <p style={{ margin: 0 }}>
            Connect this webhook inside your <strong>Meta App Dashboard</strong> under <strong>Webhooks → Page → leadgen</strong> to receive instant inquiries the moment someone fills out your ad form.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase" }}>
              Callback URL
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                readOnly
                value={webhookUrl}
                style={{
                  flex: 1,
                  background: "var(--bg-2)",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 6,
                  padding: "7px 10px",
                  fontSize: 12.5,
                  fontFamily: "monospace",
                }}
              />
              <Btn kind="ghost" size="sm" onClick={() => copy(webhookUrl, setCopiedUrl)}>
                {copiedUrl ? "Copied!" : "Copy"}
              </Btn>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase" }}>
              Verify Token
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                readOnly
                value={verifyToken}
                style={{
                  flex: 1,
                  background: "var(--bg-2)",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 6,
                  padding: "7px 10px",
                  fontSize: 12.5,
                  fontFamily: "monospace",
                }}
              />
              <Btn kind="ghost" size="sm" onClick={() => copy(verifyToken, setCopiedToken)}>
                {copiedToken ? "Copied!" : "Copy"}
              </Btn>
            </div>
          </div>

          <div
            style={{
              background: "color-mix(in srgb, var(--mint) 10%, transparent)",
              border: "1px solid var(--mint-soft)",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 12.5,
            }}
          >
            <strong>Note:</strong> You can also click <strong>"Sync Leads from Meta"</strong> at any time to backfill or pull leads from active ads without waiting for a webhook event.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <Btn kind="primary" size="sm" onClick={onClose}>
            Got it
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default function Leads({ canEdit }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [activeFormDataLead, setActiveFormDataLead] = useState(null);
  const [showWebhookModal, setShowWebhookModal] = useState(false);

  const loadLeads = () => {
    setLoading(true);
    setError("");
    fetchMetaLeads()
      .then((data) => setLeads(data || []))
      .catch((e) => setError(e.message || "Could not load leads."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const handleSyncLeads = async () => {
    setSyncing(true);
    setError("");
    try {
      const res = await runMetaLeadsSync();
      setSuccessMsg(
        res.syncedCount > 0
          ? `Synced ${res.syncedCount} lead(s) from active lead ads.`
          : "Sync complete — no new leads found on Meta."
      );
      setTimeout(() => setSuccessMsg(""), 4000);
      loadLeads();
    } catch (e) {
      setError(e.message || "Failed to sync leads from Meta.");
    } finally {
      setSyncing(false);
    }
  };

  const handleStatusChange = async (lead, newStatus) => {
    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, status: newStatus } : l))
    );
    try {
      await updateRow("meta_leads", lead.id, { status: newStatus });
    } catch (e) {
      setError(e.message || "Could not update lead status.");
      loadLeads();
    }
  };

  const handleConvertToCustomer = async (lead) => {
    if (!canEdit) return;
    try {
      // Create customer in Kazi ERP
      const newCust = await insertRow("customers", {
        name: lead.fullName || "Meta Ad Lead",
        phone: lead.phoneNumber || "",
        email: lead.email || "",
        city: lead.city || "",
        sourceCampaignId: lead.campaignId || null,
        sourceNote: `Meta Lead Form: ${lead.campaignName || "Ad"} · ${new Date().toLocaleDateString()}`,
        notes: lead.notes || "",
      });

      // Update lead with customer link
      await updateRow("meta_leads", lead.id, {
        customerId: newCust?.id || null,
        status: "converted",
      });

      setSuccessMsg(`Created customer "${lead.fullName || "Lead"}" in Kazi ERP!`);
      setTimeout(() => setSuccessMsg(""), 4000);
      loadLeads();
    } catch (e) {
      setError(e.message || "Failed to convert lead to customer.");
    }
  };

  const exportCSV = () => {
    if (leads.length === 0) return;
    const headers = [
      "ID",
      "Full Name",
      "Phone",
      "Email",
      "City",
      "Status",
      "Campaign Name",
      "Ad Name",
      "Date Received",
    ];
    const rows = filteredLeads.map((l) => [
      `"${l.id}"`,
      `"${l.fullName || ""}"`,
      `"${l.phoneNumber || ""}"`,
      `"${l.email || ""}"`,
      `"${l.city || ""}"`,
      `"${l.status || "new"}"`,
      `"${l.campaignName || ""}"`,
      `"${l.adName || ""}"`,
      `"${l.leadCreatedAt || l.createdAt || ""}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `meta_leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (statusFilter !== "all" && (l.status || "new") !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = l.fullName?.toLowerCase().includes(q);
        const matchesPhone = l.phoneNumber?.includes(q);
        const matchesEmail = l.email?.toLowerCase().includes(q);
        const matchesCampaign = l.campaignName?.toLowerCase().includes(q);
        const matchesCity = l.city?.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesEmail && !matchesCampaign && !matchesCity) {
          return false;
        }
      }
      return true;
    });
  }, [leads, statusFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = leads.length;
    const newLeads = leads.filter((l) => (l.status || "new") === "new").length;
    const contacted = leads.filter((l) => l.status === "contacted" || l.status === "qualified").length;
    const converted = leads.filter((l) => l.status === "converted").length;
    const convRate = total > 0 ? ((converted / total) * 100).toFixed(1) : "0.0";
    return { total, newLeads, contacted, converted, convRate };
  }, [leads]);

  return (
    <div className="kmkt-leads-tab">
      {error && (
        <p className="form-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}
      {successMsg && (
        <div
          style={{
            background: "color-mix(in srgb, var(--mint) 12%, transparent)",
            border: "1px solid var(--mint-soft)",
            color: "var(--mint-deep)",
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            marginBottom: 12,
          }}
        >
          {successMsg}
        </div>
      )}

      {/* KPI Cards */}
      <div className="kmkt-leads-row" style={{ marginBottom: 14 }}>
        <div className="kmkt-lead-card">
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".08em" }}>
            Total Inquiries
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)" }}>
            {stats.total.toLocaleString()}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
            All captured Instant Form leads
          </div>
        </div>

        <div className="kmkt-lead-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".08em" }}>
              🟢 New / Uncontacted
            </span>
            {stats.newLeads > 0 && <Pill tone="mint" size="sm">Action needed</Pill>}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)" }}>
            {stats.newLeads.toLocaleString()}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
            Awaiting sales follow-up
          </div>
        </div>

        <div className="kmkt-lead-card">
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".08em" }}>
            📞 In Follow-Up
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)" }}>
            {stats.contacted.toLocaleString()}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
            Contacted or qualified prospects
          </div>
        </div>

        <div className="kmkt-lead-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".08em" }}>
              🏆 Converted Customers
            </span>
            <Pill tone="emerald" size="sm">{stats.convRate}% rate</Pill>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)" }}>
            {stats.converted.toLocaleString()}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
            Turned into active ERP customers
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="kmkt-campaigns-toolbar">
        <div className="kmkt-campaigns-toolbar-left">
          {/* Search */}
          <div className="kmkt-campaigns-search">
            <Icons.Search size={14} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search by name, phone, email, campaign…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", padding: 0 }}
              >
                <Icons.X size={13} />
              </button>
            )}
          </div>

          {/* Status Tabs */}
          <div
            style={{
              display: "inline-flex",
              background: "var(--bg-2)",
              padding: 2,
              borderRadius: "var(--r-sm, 7px)",
              gap: 2,
            }}
          >
            {[
              { id: "all", label: "All" },
              { id: "new", label: "New" },
              { id: "contacted", label: "Contacted" },
              { id: "qualified", label: "Qualified" },
              { id: "converted", label: "Converted" },
              { id: "archived", label: "Archived" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  border: "none",
                  background: statusFilter === tab.id ? "var(--card)" : "transparent",
                  color: statusFilter === tab.id ? "var(--ink)" : "var(--ink-3)",
                  fontWeight: statusFilter === tab.id ? 600 : 500,
                  fontSize: 12.5,
                  padding: "5px 11px",
                  borderRadius: 5,
                  cursor: "pointer",
                  boxShadow: statusFilter === tab.id ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="kmkt-campaigns-toolbar-right" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Btn kind="ghost" size="sm" onClick={() => setShowWebhookModal(true)}>
            <Icons.Info size={13} />
            <span>Webhook URL</span>
          </Btn>
          <Btn kind="ghost" size="sm" onClick={exportCSV} disabled={filteredLeads.length === 0}>
            <Icons.Download size={13} />
            <span>Export CSV</span>
          </Btn>
          <Btn kind="primary" size="sm" onClick={handleSyncLeads} disabled={syncing}>
            {syncing ? "Syncing Leads…" : "Sync Leads from Meta"}
          </Btn>
        </div>
      </div>

      {/* Leads Table */}
      <Card pad={false}>
        <div className="kmkt-table-scroll">
          <table className="ktable">
            <thead>
              <tr>
                <th>Lead Contact</th>
                <th>Campaign & Ad</th>
                <th>Form Details</th>
                <th>Received</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => {
                const cleanPhone = cleanPhoneNumber(lead.phoneNumber);
                const hasAnswers = lead.rawData && Object.keys(lead.rawData).length > 0;
                const statusObj = statusMeta(lead.status);

                return (
                  <tr key={lead.id}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontWeight: 600, color: "var(--ink)", fontSize: 13.5 }}>
                          {lead.fullName || "Unnamed Lead"}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {lead.phoneNumber && (
                            <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                              {lead.phoneNumber}
                            </span>
                          )}
                          {cleanPhone && (
                            <a
                              href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                                `Hello ${lead.fullName || ""}, thank you for contacting Kazi Manufacturing!`
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#16a34a",
                                background: "rgba(22, 163, 74, 0.08)",
                                padding: "2px 6px",
                                borderRadius: 4,
                                textDecoration: "none",
                              }}
                              title="Chat on WhatsApp"
                            >
                              💬 WhatsApp
                            </a>
                          )}
                          {cleanPhone && (
                            <a
                              href={`tel:${cleanPhone}`}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                fontSize: 11,
                                fontWeight: 500,
                                color: "var(--ink-3)",
                                textDecoration: "none",
                              }}
                              title="Call Phone"
                            >
                              📞 Call
                            </a>
                          )}
                        </div>
                        {lead.email && (
                          <a
                            href={`mailto:${lead.email}`}
                            style={{ fontSize: 11.5, color: "var(--ink-4)", textDecoration: "none" }}
                          >
                            {lead.email}
                          </a>
                        )}
                        {lead.city && (
                          <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
                            📍 {lead.city}
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontWeight: 500, color: "var(--ink)", fontSize: 13 }}>
                          {lead.campaignName || "Meta Campaign"}
                        </span>
                        {lead.adName && (
                          <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                            Ad: {lead.adName}
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      {hasAnswers ? (
                        <Btn
                          kind="ghost"
                          size="sm"
                          onClick={() => setActiveFormDataLead(lead)}
                          style={{ fontSize: 11.5, padding: "3px 8px" }}
                        >
                          View Answers ({Object.keys(lead.rawData).length})
                        </Btn>
                      ) : (
                        <span className="kmkt-muted" style={{ padding: 0 }}>—</span>
                      )}
                    </td>

                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 12, color: "var(--ink)" }}>
                          {timeAgo(lead.leadCreatedAt || lead.createdAt)}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
                          {new Date(lead.leadCreatedAt || lead.createdAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </td>

                    <td>
                      <select
                        value={lead.status || "new"}
                        onChange={(e) => handleStatusChange(lead, e.target.value)}
                        disabled={!canEdit}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--line-strong)",
                          background: "var(--bg)",
                          color: "var(--ink)",
                          cursor: canEdit ? "pointer" : "default",
                        }}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                        {!lead.customerId && lead.status !== "converted" ? (
                          <Btn
                            kind="ghost"
                            size="sm"
                            disabled={!canEdit}
                            onClick={() => handleConvertToCustomer(lead)}
                            title="Create as Customer in Kazi ERP"
                          >
                            + Customer
                          </Btn>
                        ) : (
                          <Pill tone="emerald" size="sm">
                            Customer ✓
                          </Pill>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {loading && leads.length === 0 && (
                <tr>
                  <td colSpan={6} className="kmkt-muted" style={{ textAlign: "center", padding: "28px 16px" }}>
                    Loading leads…
                  </td>
                </tr>
              )}

              {!loading && !error && filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={6} className="kmkt-muted" style={{ textAlign: "center", padding: "32px 16px" }}>
                    {leads.length === 0
                      ? "No leads captured yet. Run a lead ad on Facebook/Instagram or click 'Sync Leads from Meta' to pull existing leads."
                      : "No leads match your current filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Form Answers Modal */}
      {activeFormDataLead && (
        <FormAnswersModal
          lead={activeFormDataLead}
          onClose={() => setActiveFormDataLead(null)}
        />
      )}

      {/* Webhook Guide Modal */}
      {showWebhookModal && (
        <WebhookGuideModal onClose={() => setShowWebhookModal(false)} />
      )}
    </div>
  );
}
