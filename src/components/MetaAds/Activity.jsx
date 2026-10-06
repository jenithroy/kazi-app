import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, Pill, Icons } from "../ui";
import { fetchRecentActions, fetchSyncRuns } from "../../lib/metaAds";
import { moneyMinor } from "./money";
import { timeAgo, formatDateTime } from "./time";
import { SYNC_STATUS_MAP } from "./status";

function formatActionText(a) {
  const person = a.personName || "Staff";
  const entity = a.entityName || a.entityId || "item";

  if (a.action === "pause") {
    return (
      <span>
        <strong>{person}</strong> paused <em>{entity}</em>
      </span>
    );
  }
  if (a.action === "resume") {
    return (
      <span>
        <strong>{person}</strong> resumed <em>{entity}</em>
      </span>
    );
  }
  if (a.action === "budget_edit") {
    const isDaily = a.field === "daily_budget";
    const fieldLabel = isDaily ? "daily budget" : "lifetime budget";
    const beforeVal = a.before?.[a.field] != null ? moneyMinor(a.before[a.field], "USD") : "—";
    const afterVal = a.after?.[a.field] != null ? moneyMinor(a.after[a.field], "USD") : "—";
    const overNotice = a.confirmedOverCeiling ? " · confirmed over multiple" : "";
    return (
      <span>
        <strong>{person}</strong> changed {entity}’s {fieldLabel} {beforeVal} → {afterVal}
        {overNotice && <span style={{ color: "var(--amber-deep)" }}>{overNotice}</span>}
      </span>
    );
  }
  return (
    <span>
      <strong>{person}</strong> updated <em>{entity}</em>
    </span>
  );
}

function formatDuration(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return "—";
  const sec = (ms / 1000).toFixed(1);
  return `${sec}s`;
}

function getErrorHint(msg) {
  if (!msg) return null;
  const lower = msg.toLowerCase();
  if (lower.includes("token") || lower.includes("expire") || lower.includes("190") || lower.includes("oauthexception")) {
    return "Meta access token expired. An admin needs to renew META_ACCESS_TOKEN in Cloudflare worker secrets.";
  }
  if (lower.includes("rate limit") || lower.includes("calls") || lower.includes("17") || lower.includes("613")) {
    return "Meta API rate limit reached. Next sync will resume automatically.";
  }
  return null;
}

export default function Activity() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialEntity = searchParams.get("entityId") || searchParams.get("entity") || "";

  const [actions, setActions] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [filterText, setFilterText] = useState(initialEntity);
  const [levelFilter, setLevelFilter] = useState("all"); // "all" | "campaign" | "adset" | "ad"

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([fetchRecentActions(50), fetchSyncRuns()])
      .then(([acts, rns]) => {
        setActions(acts || []);
        setRuns(rns || []);
      })
      .catch((e) => setError(e.message || "Couldn't load activity history."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filteredActions = actions.filter((a) => {
    if (levelFilter !== "all" && a.entityLevel !== levelFilter) {
      return false;
    }
    if (filterText.trim()) {
      const q = filterText.toLowerCase().trim();
      const matchName = a.entityName?.toLowerCase().includes(q);
      const matchId = a.entityId?.toLowerCase().includes(q);
      const matchPerson = a.personName?.toLowerCase().includes(q);
      if (!matchName && !matchId && !matchPerson) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="kmkt-activity">
      {error && (
        <p className="form-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}

      {/* Change Log Card */}
      <Card
        title="Change log"
        sub="Real-money edits made by team members in this app (pauses, resumes, budget changes)"
      >
        <div className="kmkt-activity-filters">
          <div className="kmkt-activity-search">
            <Icons.Search size={14} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Filter by entity name, ID, or person…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            {filterText && (
              <button
                type="button"
                onClick={() => {
                  setFilterText("");
                  if (searchParams.has("entityId")) {
                    setSearchParams(
                      (prev) => {
                        const next = new URLSearchParams(prev);
                        next.delete("entityId");
                        return next;
                      },
                      { replace: true }
                    );
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: "var(--ink-3)",
                  display: "flex",
                }}
                aria-label="Clear filter"
              >
                <Icons.X size={13} />
              </button>
            )}
          </div>

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
              { id: "all", label: "All levels" },
              { id: "campaign", label: "Campaigns" },
              { id: "adset", label: "Ad sets" },
              { id: "ad", label: "Ads" },
            ].map((lvl) => (
              <button
                key={lvl.id}
                type="button"
                onClick={() => setLevelFilter(lvl.id)}
                style={{
                  border: "none",
                  background: levelFilter === lvl.id ? "var(--card)" : "transparent",
                  color: levelFilter === lvl.id ? "var(--ink)" : "var(--ink-3)",
                  fontWeight: levelFilter === lvl.id ? 600 : 500,
                  fontSize: 12,
                  padding: "4px 9px",
                  borderRadius: 5,
                  cursor: "pointer",
                  boxShadow: levelFilter === lvl.id ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                {lvl.label}
              </button>
            ))}
          </div>
        </div>

        <div className="kmkt-table-scroll">
          <table className="ktable">
            <thead>
              <tr>
                <th>When</th>
                <th>Level</th>
                <th>Activity</th>
              </tr>
            </thead>
            <tbody>
              {filteredActions.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div className="kmkt-sync-when">
                      <span className="mono" style={{ fontSize: 13, fontWeight: 500 }}>
                        {timeAgo(a.createdAt)}
                      </span>
                      <span className="kmkt-sync-subtime">{formatDateTime(a.createdAt)}</span>
                    </div>
                  </td>
                  <td>
                    <Pill tone="neutral">
                      <span style={{ textTransform: "capitalize" }}>{a.entityLevel || "item"}</span>
                    </Pill>
                  </td>
                  <td style={{ fontSize: 13.5 }}>{formatActionText(a)}</td>
                </tr>
              ))}
              {loading && actions.length === 0 && (
                <tr>
                  <td colSpan={3} className="kmkt-muted" style={{ textAlign: "center", padding: "18px 0" }}>
                    Loading change log…
                  </td>
                </tr>
              )}
              {!loading && !error && filteredActions.length === 0 && (
                <tr>
                  <td colSpan={3} className="kmkt-muted" style={{ textAlign: "center", padding: "20px 0" }}>
                    {actions.length === 0
                      ? "No real-money edits recorded yet."
                      : "No changes match your entity filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Sync History Card */}
      <Card
        title="Sync history"
        sub="Background cron and manual data syncs from Meta Graph API"
      >
        <div className="kmkt-table-scroll">
          <table className="ktable">
            <thead>
              <tr>
                <th>Started</th>
                <th>Trigger</th>
                <th>Status</th>
                <th className="kmkt-num">Counts</th>
                <th className="kmkt-num">Duration</th>
                <th>Notes / Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const statusMeta = SYNC_STATUS_MAP[r.status] || { label: r.status, tone: "neutral" };
                const hint = getErrorHint(r.errorMessage);
                const hasPagingCap = r.detail?.pagingCaps;

                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div className="kmkt-sync-when">
                        <span className="mono" style={{ fontSize: 13, fontWeight: 500 }}>
                          {timeAgo(r.startedAt)}
                        </span>
                        <span className="kmkt-sync-subtime">{formatDateTime(r.startedAt)}</span>
                      </div>
                    </td>
                    <td>
                      {r.triggerType === "manual" ? (
                        <span>
                          Manual <small className="kmkt-muted">({r.triggeredByName || "staff"})</small>
                        </span>
                      ) : (
                        <span>Scheduled</span>
                      )}
                    </td>
                    <td>
                      <Pill tone={statusMeta.tone} dot>
                        {statusMeta.label}
                      </Pill>
                    </td>
                    <td className="mono kmkt-num" style={{ fontSize: 12 }}>
                      <span title="Campaigns / Ad sets / Ads / Insight rows">
                        {r.campaignsSynced}C · {r.adsetsSynced}AS · {r.adsSynced}A
                        {r.insightRowsSynced ? ` · ${r.insightRowsSynced}I` : ""}
                      </span>
                    </td>
                    <td className="mono kmkt-num">
                      {formatDuration(r.startedAt, r.finishedAt)}
                    </td>
                    <td style={{ maxWidth: 360 }}>
                      {r.errorMessage && (
                        <div>
                          <span className="form-error" style={{ fontSize: 12 }}>
                            {r.errorMessage}
                          </span>
                          {hint && <span className="kmkt-sync-hint">{hint}</span>}
                        </div>
                      )}
                      {hasPagingCap && (
                        <span className="kmkt-sync-note">
                          <Icons.Alert size={12} />
                          Hit paging cap — data may be incomplete
                        </span>
                      )}
                      {!r.errorMessage && !hasPagingCap && (
                        <span className="kmkt-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {loading && runs.length === 0 && (
                <tr>
                  <td colSpan={6} className="kmkt-muted" style={{ textAlign: "center", padding: "18px 0" }}>
                    Loading sync history…
                  </td>
                </tr>
              )}
              {!loading && !error && runs.length === 0 && (
                <tr>
                  <td colSpan={6} className="kmkt-muted" style={{ textAlign: "center", padding: "20px 0" }}>
                    No sync runs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
