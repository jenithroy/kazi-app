/**
 * Delivery status mapping and tones according to REDESIGN §4.3.
 */

export const META_STATUS_MAP = {
  ACTIVE: { label: "Active", tone: "mint" },
  PAUSED: { label: "Paused", tone: "neutral" },
  CAMPAIGN_PAUSED: { label: "Paused by campaign", tone: "neutral" },
  ADSET_PAUSED: { label: "Paused by ad set", tone: "neutral" },
  PENDING_REVIEW: { label: "In review", tone: "blue" },
  IN_PROCESS: { label: "Processing", tone: "blue" },
  WITH_ISSUES: { label: "Has issues", tone: "amber" },
  PENDING_BILLING_INFO: { label: "Billing needed", tone: "amber" },
  DISAPPROVED: { label: "Disapproved", tone: "terra" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
  DELETED: { label: "Deleted", tone: "neutral" },
};

export const SYNC_STATUS_MAP = {
  success: { label: "Synced", tone: "mint" },
  partial: { label: "Partly synced", tone: "amber" },
  failed: { label: "Failed", tone: "terra" },
  running: { label: "Syncing", tone: "blue" },
};

export function getMetaStatus(effectiveStatus, status) {
  const key = effectiveStatus || status;
  if (!key) return { label: "—", tone: "neutral" };
  if (META_STATUS_MAP[key]) return META_STATUS_MAP[key];
  const formatted = key.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return { label: formatted, tone: "neutral" };
}
