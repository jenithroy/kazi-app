import { useState } from "react";
import { Btn, Icons } from "../ui";
import DateRangePicker from "./DateRangePicker";
import { timeAgo } from "./time";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "campaigns", label: "Campaigns" },
  { id: "attribution", label: "Attribution" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

export default function MetaSectionBar({
  accounts = [],
  latestSync = null,
  view = "overview",
  onViewChange,
  range,
  onRangeChange,
  syncing = false,
  onSync,
}) {
  const activeAccounts = accounts.filter((a) => a.isActive);
  const accountLabel =
    activeAccounts.length === 1
      ? `${activeAccounts[0].name || activeAccounts[0].id} · ${activeAccounts[0].currency || "USD"}`
      : activeAccounts.length > 1
      ? `${activeAccounts.length} accounts active`
      : accounts.length > 0
      ? "Accounts paused"
      : "No accounts configured";

  const syncLabel = syncing
    ? "Syncing…"
    : latestSync
    ? `Synced ${timeAgo(latestSync.finishedAt || latestSync.startedAt)}`
    : "Never synced";

  const syncTitle = latestSync?.finishedAt
    ? `Completed ${new Date(latestSync.finishedAt).toLocaleString()}`
    : latestSync?.startedAt
    ? `Started ${new Date(latestSync.startedAt).toLocaleString()}`
    : undefined;

  return (
    <div className="kmkt-section-bar">
      <div className="kmkt-section-bar-top">
        <div className="kmkt-section-meta">
          <span className="kmkt-section-meta-title">Meta Ads</span>
          <span className="kmkt-section-meta-sep">──</span>
          <span className="kmkt-section-meta-sub">{accountLabel}</span>
        </div>
        <div className="kmkt-section-bar-actions">
          <span className="kmkt-section-sync-time" title={syncTitle}>
            {syncLabel}
          </span>
          <Btn
            kind="primary"
            size="sm"
            disabled={syncing}
            onClick={onSync}
            icon={<Icons.RefreshCw size={13} className={syncing ? "kspin" : ""} />}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </Btn>
        </div>
      </div>

      <div className="kmkt-section-bar-bottom">
        <div className="kmkt-segmented" role="tablist" aria-label="Meta Ads Views">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={view === t.id}
              className={`kmkt-segmented-btn ${view === t.id ? "is-active" : ""}`}
              onClick={() => onViewChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <DateRangePicker
          dateFrom={range.dateFrom}
          dateTo={range.dateTo}
          onChange={onRangeChange}
          allowAll
        />
      </div>
    </div>
  );
}
