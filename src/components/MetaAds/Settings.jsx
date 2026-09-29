import { useEffect, useState } from "react";
import { Card, Btn, Pill } from "../ui";
import { asCurrency } from "../../utils/format";
import { fetchAdAccounts, fetchSettings, fetchSyncRuns } from "../../lib/metaAds";
import { insertRow, updateRow } from "../../lib/db";
import { runMetaAdsSync } from "../../lib/metaAdsApi";

const RUN_STATUS_TONE = { success: "mint", partial: "terra", failed: "terra", running: "neutral" };

export default function Settings({ canEdit }) {
  const [accounts, setAccounts] = useState([]);
  const [runs, setRuns] = useState([]);
  const [settings, setSettings] = useState(null);
  const [newAccountId, setNewAccountId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () => {
    fetchAdAccounts().then(setAccounts).catch((e) => setError(e.message));
    fetchSyncRuns().then(setRuns).catch(() => {});
    fetchSettings().then(setSettings).catch(() => {});
  };

  useEffect(load, []);

  async function addAccount(e) {
    e.preventDefault();
    const id = newAccountId.trim();
    if (!id) return;
    setError("");
    try {
      await insertRow("meta_ad_accounts", { id: id.startsWith("act_") ? id : `act_${id}`, isActive: true });
      setNewAccountId("");
      load();
    } catch (e2) {
      setError(e2.message || "Couldn't add that ad account.");
    }
  }

  async function toggleActive(account) {
    try {
      await updateRow("meta_ad_accounts", account.id, { isActive: !account.isActive });
      load();
    } catch (e) {
      setError(e.message || "Couldn't update that account.");
    }
  }

  async function doSync() {
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const res = await runMetaAdsSync();
      setNotice(
        `Synced ${res.campaignsSynced ?? "?"} campaigns, ${res.adsetsSynced ?? "?"} ad sets, ${res.adsSynced ?? "?"} ads.`
      );
      load();
    } catch (e) {
      setError(e.message || "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setError("");
    try {
      await updateRow("meta_ads_settings", "default", {
        budgetCeilingMinor: settings.budgetCeilingMinor,
        budgetCeilingCurrency: settings.budgetCeilingCurrency,
        confirmMultiplier: settings.confirmMultiplier,
      });
      setNotice("Settings saved.");
      load();
    } catch (e2) {
      setError(e2.message || "Couldn't save settings.");
    }
  }

  return (
    <div className="kmkt-settings">
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="kmkt-notice">{notice}</p>}

      <Card title="Ad accounts" sub="Which of your Facebook/Instagram ad accounts to track">
        <table className="ktable">
          <thead>
            <tr><th>Account</th><th>Currency</th><th>Status</th><th>Last synced</th><th></th></tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.name || <span className="kmkt-muted">{a.id} — run a sync to fetch its name</span>}</td>
                <td className="mono">{a.currency || "—"}</td>
                <td><Pill tone={a.isActive ? "mint" : "neutral"}>{a.isActive ? "Tracking" : "Paused"}</Pill></td>
                <td className="mono">{a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleString() : "Never"}</td>
                <td>
                  {canEdit && (
                    <Btn kind="ghost" size="sm" onClick={() => toggleActive(a)}>
                      {a.isActive ? "Stop tracking" : "Resume tracking"}
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr><td colSpan={5} className="kmkt-muted">No ad accounts added yet.</td></tr>
            )}
          </tbody>
        </table>
        {canEdit && (
          <form className="kmkt-add-account" onSubmit={addAccount}>
            <input
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
              placeholder="Ad account id (act_1234567890)"
            />
            <Btn kind="secondary" size="sm" type="submit">Add</Btn>
          </form>
        )}
      </Card>

      <Card
        title="Sync"
        action={canEdit && <Btn kind="primary" size="sm" onClick={doSync} disabled={syncing}>{syncing ? "Syncing…" : "Sync now"}</Btn>}
      >
        <table className="ktable">
          <thead>
            <tr><th>Started</th><th>Trigger</th><th>Status</th><th>Campaigns</th><th>Ad sets</th><th>Ads</th><th>Error</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="mono">{new Date(r.startedAt).toLocaleString()}</td>
                <td>{r.triggerType === "manual" ? (r.triggeredByName || "Manual") : "Scheduled"}</td>
                <td><Pill tone={RUN_STATUS_TONE[r.status] || "neutral"}>{r.status}</Pill></td>
                <td className="mono">{r.campaignsSynced}</td>
                <td className="mono">{r.adsetsSynced}</td>
                <td className="mono">{r.adsSynced}</td>
                <td className="kmkt-muted">{r.errorMessage || ""}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr><td colSpan={7} className="kmkt-muted">No syncs yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {settings && (
        <Card title="Budget guard rails">
          <form className="kmkt-settings-form" onSubmit={saveSettings}>
            <label className="kmkt-field">
              <span>Hard ceiling — no budget edit above this is ever sent to Meta</span>
              <div className="kmkt-inline-fields">
                <input
                  type="number" min="0" step="0.01" disabled={!canEdit}
                  value={settings.budgetCeilingMinor != null ? settings.budgetCeilingMinor / 100 : ""}
                  onChange={(e) => setSettings((s) => ({ ...s, budgetCeilingMinor: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) }))}
                />
                <input
                  value={settings.budgetCeilingCurrency || ""}
                  disabled={!canEdit}
                  placeholder="Currency (e.g. USD)"
                  onChange={(e) => setSettings((s) => ({ ...s, budgetCeilingCurrency: e.target.value.toUpperCase() }))}
                />
              </div>
            </label>
            <label className="kmkt-field">
              <span>Confirm step above this multiple of the current budget</span>
              <input
                type="number" min="1" step="0.5" disabled={!canEdit}
                value={settings.confirmMultiplier}
                onChange={(e) => setSettings((s) => ({ ...s, confirmMultiplier: Number(e.target.value) }))}
              />
            </label>
            {canEdit && <Btn kind="primary" size="sm" type="submit">Save</Btn>}
          </form>
        </Card>
      )}
    </div>
  );
}
