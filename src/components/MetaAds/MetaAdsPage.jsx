import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { marketingTabCanEdit } from "../../utils/permissions";
import { fetchAdAccounts, fetchSyncRuns } from "../../lib/metaAds";
import { runMetaAdsSync } from "../../lib/metaAdsApi";
import MetaSectionBar from "./MetaSectionBar";
import Overview from "./Overview";
import Campaigns from "./Campaigns";
import Attribution from "./Attribution";
import Activity from "./Activity";
import Settings from "./Settings";
import { isoDaysAgo } from "./DateRangePicker";
import { Icons } from "../ui";

export default function MetaAdsPage() {
  const { profile } = useAuth();
  const canEdit = marketingTabCanEdit(profile, "meta_ads");
  const [searchParams, setSearchParams] = useSearchParams();

  // Sub-view: overview | campaigns | attribution | activity | settings
  const view = searchParams.get("view") || "overview";

  // Shared date range stored in URL: from & to
  // If not explicitly set in URL, defaults to 30d
  const dateFrom = searchParams.has("from") ? searchParams.get("from") : isoDaysAgo(30);
  const dateTo = searchParams.has("to") ? searchParams.get("to") : isoDaysAgo(0);
  const range = { dateFrom, dateTo };

  const [accounts, setAccounts] = useState([]);
  const [syncRuns, setSyncRuns] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");

  const loadMeta = () => {
    fetchAdAccounts().then(setAccounts).catch(() => {});
    fetchSyncRuns().then(setSyncRuns).catch(() => {});
  };

  useEffect(() => {
    loadMeta();
  }, []);

  const setView = (nextView) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("view", nextView);
        return next;
      },
      { replace: true }
    );
  };

  const setRange = (nextRange) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextRange.dateFrom === "" && nextRange.dateTo === "") {
          next.set("from", "");
          next.set("to", "");
        } else {
          next.set("from", nextRange.dateFrom || "");
          next.set("to", nextRange.dateTo || "");
        }
        return next;
      },
      { replace: true }
    );
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncError("");
    try {
      await runMetaAdsSync();
      loadMeta();
    } catch (e) {
      setSyncError(e.message || "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="kmkt-metaads">
      <MetaSectionBar
        accounts={accounts}
        latestSync={syncRuns[0] || null}
        view={view}
        onViewChange={setView}
        range={range}
        onRangeChange={setRange}
        syncing={syncing}
        onSync={handleSync}
      />

      {syncError && (
        <p className="form-error" role="alert" style={{ margin: "8px 28px 0" }}>
          {syncError}
        </p>
      )}

      {!canEdit && (
        <div className="kmkt-banner kmkt-banner--viewonly">
          <Icons.Info size={16} />
          <span>
            You can see Meta Ads but not change it. Ask an admin for Edit on Meta Ads (Admin Panel → Roles).
          </span>
        </div>
      )}

      <div className="kmkt-metaads-body">
        {view === "overview" && <Overview range={range} onViewChange={setView} />}
        {view === "campaigns" && <Campaigns canEdit={canEdit} range={range} />}
        {view === "attribution" && <Attribution range={range} />}
        {view === "activity" && <Activity />}
        {view === "settings" && <Settings canEdit={canEdit} onSyncComplete={loadMeta} />}
      </div>
    </div>
  );
}
