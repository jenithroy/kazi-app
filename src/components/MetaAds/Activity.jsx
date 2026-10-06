import { useEffect, useState } from "react";
import { Card, Pill, Btn } from "../ui";
import { fetchRecentActions, fetchSyncRuns } from "../../lib/metaAds";
import { moneyMinor } from "./money";
import { timeAgo } from "./time";

const RUN_STATUS_TONE = { success: "mint", partial: "terra", failed: "terra", running: "neutral" };

function formatActionDetail(a) {
  if (a.action === "pause") return "Paused";
  if (a.action === "resume") return "Resumed";
  if (a.action === "budget_edit") {
    const fieldLabel = a.field === "daily_budget" ? "daily budget" : "lifetime budget";
    const beforeVal = a.before?.[a.field] != null ? moneyMinor(a.before[a.field], "USD") : "—";
    const afterVal = a.after?.[a.field] != null ? moneyMinor(a.after[a.field], "USD") : "—";
    const overNotice = a.confirmedOverCeiling ? " · confirmed over multiple" : "";
    return `Changed ${fieldLabel} ${beforeVal} → ${afterVal}${overNotice}`;
  }
  return a.action || "Updated";
}

export default function Activity() {
  const [actions, setActions] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([fetchRecentActions(50), fetchSyncRuns()])
      .then(([acts, rns]) => {
        setActions(acts);
        setRuns(rns);
      })
      .catch((e) => setError(e.message || "Couldn't load activity history."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="kmkt-activity">
      {error && <p className="form-error" role="alert">{error}</p>}

      <Card title="Change log" sub="Real-money edits made by team members in this app">
        <div className="kmkt-table-scroll">
          <table className="ktable">
            <thead>
              <tr>
                <th>When</th>
                <th>Person</th>
                <th>Entity</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id}>
                  <td className="mono" title={new Date(a.createdAt).toLocaleString()}>
                    {timeAgo(a.createdAt)}
                  </td>
                  <td>{a.personName || "Staff"}</td>
                  <td>
                    <span className="mono" style={{ textTransform: "capitalize", marginRight: 6 }}>
                      {a.entityLevel}:
                    </span>
                    <strong>{a.entityName || a.entityId}</strong>
                  </td>
                  <td>{formatActionDetail(a)}</td>
                </tr>
              ))}
              {loading && actions.length === 0 && (
                <tr>
                  <td colSpan={4} className="kmkt-muted">Loading change log…</td>
                </tr>
              )}
              {!loading && !error && actions.length === 0 && (
                <tr>
                  <td colSpan={4} className="kmkt-muted">No edits recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Sync history" sub="Background and manual data pulls from Meta Graph API">
        <div className="kmkt-table-scroll">
          <table className="ktable">
            <thead>
              <tr>
                <th>Started</th>
                <th>Trigger</th>
                <th>Status</th>
                <th className="kmkt-num">Campaigns</th>
                <th className="kmkt-num">Ad sets</th>
                <th className="kmkt-num">Ads</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="mono" title={new Date(r.startedAt).toLocaleString()}>
                    {timeAgo(r.startedAt)}
                  </td>
                  <td>{r.triggerType === "manual" ? (r.triggeredByName || "Manual") : "Scheduled"}</td>
                  <td>
                    <Pill tone={RUN_STATUS_TONE[r.status] || "neutral"}>{r.status}</Pill>
                  </td>
                  <td className="mono kmkt-num">{r.campaignsSynced}</td>
                  <td className="mono kmkt-num">{r.adsetsSynced}</td>
                  <td className="mono kmkt-num">{r.adsSynced}</td>
                  <td className="kmkt-muted">{r.errorMessage || "—"}</td>
                </tr>
              ))}
              {loading && runs.length === 0 && (
                <tr>
                  <td colSpan={7} className="kmkt-muted">Loading sync history…</td>
                </tr>
              )}
              {!loading && !error && runs.length === 0 && (
                <tr>
                  <td colSpan={7} className="kmkt-muted">No sync runs recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
