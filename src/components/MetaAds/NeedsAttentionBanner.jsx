import { Icons, Btn } from "../ui";

export default function NeedsAttentionBanner({
  campaigns = [],
  accounts = [],
  latestSync = null,
  onReview,
}) {
  const issues = [];

  // 1. Campaign issues
  const troubledCampaigns = campaigns.filter((c) =>
    ["DISAPPROVED", "WITH_ISSUES", "PENDING_BILLING_INFO"].includes(c.effectiveStatus)
  );
  if (troubledCampaigns.length > 0) {
    const label = troubledCampaigns.length === 1 ? "1 campaign has issues" : `${troubledCampaigns.length} campaigns have issues`;
    issues.push(label);
  }

  // 2. Sync failure
  if (latestSync && (latestSync.status === "failed" || latestSync.status === "partial")) {
    issues.push(`Last sync ${latestSync.status}`);
  }

  // 3. Stale account sync (> 2h past last sync)
  const staleAccounts = accounts.filter(
    (a) => a.isActive && a.lastSyncedAt && Date.now() - new Date(a.lastSyncedAt).getTime() > 2 * 3600 * 1000
  );
  if (staleAccounts.length > 0) {
    issues.push("Account sync overdue (>2h)");
  }

  if (issues.length === 0) return null;

  return (
    <div className="kmkt-attention-banner">
      <div className="kmkt-attention-content">
        <Icons.AlertTriangle size={16} className="kmkt-attention-icon" />
        <span className="kmkt-attention-text">
          <strong>Needs attention:</strong> {issues.join(" · ")}
        </span>
      </div>
      {onReview && (
        <Btn kind="ghost" size="sm" onClick={() => onReview("campaigns")}>
          Review →
        </Btn>
      )}
    </div>
  );
}
