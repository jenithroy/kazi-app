import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Btn, Pill, Icons } from "../ui";
import { fetchAdAccounts, fetchSettings, fetchSyncRuns } from "../../lib/metaAds";
import { updateRow } from "../../lib/db";
import { runMetaAdsSync } from "../../lib/metaAdsApi";
import { supabase } from "../../supabase";
import { timeAgo } from "./time";
import { SYNC_STATUS_MAP } from "./status";

export default function Settings({ canEdit, onSyncComplete }) {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [latestSync, setLatestSync] = useState(null);
  const [settings, setSettings] = useState(null);

  // Add Account State
  const [newAccountId, setNewAccountId] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);
  const [addAccountError, setAddAccountError] = useState("");

  // Guard Rails Draft State
  const [draftCeiling, setDraftCeiling] = useState("");
  const [draftCurrency, setDraftCurrency] = useState("USD");
  const [draftMultiplier, setDraftMultiplier] = useState("3");
  const [savingSettings, setSavingSettings] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () => {
    fetchAdAccounts()
      .then((accs) => {
        setAccounts(accs || []);
      })
      .catch((e) => setError(e.message || "Couldn't load ad accounts."));

    fetchSyncRuns()
      .then((runs) => setLatestSync(runs?.[0] || null))
      .catch(() => {});

    fetchSettings()
      .then((s) => {
        setSettings(s);
        if (s) {
          setDraftCeiling(s.budgetCeilingMinor != null ? (s.budgetCeilingMinor / 100).toString() : "");
          setDraftCurrency(s.budgetCeilingCurrency || "USD");
          setDraftMultiplier((s.confirmMultiplier ?? 3).toString());
        }
      })
      .catch(() => {});
  };

  useEffect(load, []);

  // Compute tracked currencies for the select
  const trackedCurrencies = [
    ...new Set(accounts.filter((a) => a.isActive).map((a) => a.currency).filter(Boolean)),
  ];
  const availableCurrencies =
    trackedCurrencies.length > 0 ? trackedCurrencies : ["USD", "GBP", "EUR", "NPR"];

  // Normalize ad account id input: only digits after 'act_'
  const handleAccountIdChange = (e) => {
    setAddAccountError("");
    const rawDigits = e.target.value.replace(/[^0-9]/g, "");
    setNewAccountId(rawDigits ? `act_${rawDigits}` : "");
  };

  async function addAccount(e) {
    e.preventDefault();
    const id = newAccountId.trim();
    if (!id || id === "act_") return;
    setAddAccountError("");
    setAddingAccount(true);

    try {
      const { error: err } = await supabase
        .from("meta_ad_accounts")
        .insert({ id, is_active: true });

      if (err) {
        if (
          err.code === "23505" ||
          err.message?.includes("duplicate") ||
          err.message?.includes("already exists")
        ) {
          throw new Error("That account is already added.");
        }
        throw err;
      }

      setNewAccountId("");
      setNotice(`Added account ${id}. Run a sync to fetch its campaigns.`);
      load();
    } catch (e2) {
      setAddAccountError(e2.message || "Couldn't add that ad account.");
    } finally {
      setAddingAccount(false);
    }
  }

  async function toggleActive(account) {
    setError("");
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
    setSyncNotice("");
    try {
      const res = await runMetaAdsSync();
      setSyncNotice(
        `Synced ${res.campaignsSynced ?? "?"} campaigns, ${res.adsetsSynced ?? "?"} ad sets, ${res.adsSynced ?? "?"} ads.`
      );
      load();
      if (typeof onSyncComplete === "function") onSyncComplete();
    } catch (e) {
      setError(e.message || "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  // Dirty check for guard rails
  const savedCeilingStr =
    settings?.budgetCeilingMinor != null ? (settings.budgetCeilingMinor / 100).toString() : "";
  const savedCurrencyStr = settings?.budgetCeilingCurrency || "USD";
  const savedMultiplierStr = (settings?.confirmMultiplier ?? 3).toString();

  const isDirty =
    draftCeiling !== savedCeilingStr ||
    draftCurrency !== savedCurrencyStr ||
    draftMultiplier !== savedMultiplierStr;

  function resetDraft() {
    setDraftCeiling(savedCeilingStr);
    setDraftCurrency(savedCurrencyStr);
    setDraftMultiplier(savedMultiplierStr);
    setError("");
  }

  async function saveGuardRails(e) {
    e.preventDefault();
    setError("");
    setNotice("");

    const mult = Number(draftMultiplier);
    if (!Number.isFinite(mult) || mult < 1) {
      setError("The confirm multiple has to be 1 or more.");
      return;
    }

    let ceilingMinor = null;
    if (draftCeiling.trim() !== "") {
      const cNum = Number(draftCeiling);
      if (!Number.isFinite(cNum) || cNum <= 0) {
        setError("The ceiling has to be more than zero, or left blank for no ceiling.");
        return;
      }
      ceilingMinor = Math.round(cNum * 100);
    }

    setSavingSettings(true);
    try {
      await updateRow("meta_ads_settings", "default", {
        budgetCeilingMinor: ceilingMinor,
        budgetCeilingCurrency: ceilingMinor != null ? draftCurrency : null,
        confirmMultiplier: mult,
      });
      setNotice("Budget guard rails saved successfully.");
      load();
    } catch (e2) {
      setError(e2.message || "Couldn't save settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="kmkt-settings">
      {error && (
        <p className="form-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}
      {notice && (
        <p className="kmkt-notice" style={{ marginBottom: 12 }}>
          {notice}
        </p>
      )}

      {/* Ad Accounts Card */}
      <Card
        title="Ad accounts"
        sub="Connected Facebook & Instagram ad accounts for this organisation"
      >
        <div className="kmkt-table-scroll">
          <table className="ktable">
            <thead>
              <tr>
                <th>Account</th>
                <th>Account ID</th>
                <th>Currency</th>
                <th>Time zone</th>
                <th>Status</th>
                <th>Last synced</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 500 }}>
                    {a.name || <span className="kmkt-muted">{a.id} (name pending sync)</span>}
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {a.id}
                  </td>
                  <td className="mono">{a.currency || "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-2)" }}>{a.timezoneName || "—"}</td>
                  <td>
                    <Pill tone={a.isActive ? "mint" : "neutral"} dot>
                      {a.isActive ? "Tracking" : "Paused"}
                    </Pill>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {timeAgo(a.lastSyncedAt)}
                  </td>
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
                <tr>
                  <td colSpan={7} className="kmkt-muted" style={{ textAlign: "center", padding: "18px 0" }}>
                    No ad accounts added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <form className="kmkt-add-account" onSubmit={addAccount}>
            <div style={{ flex: 1 }}>
              <input
                value={newAccountId}
                onChange={handleAccountIdChange}
                placeholder="Add account: enter digits or act_123456789"
                disabled={addingAccount}
              />
              {addAccountError && (
                <span className="form-error" style={{ display: "block", marginTop: 4, fontSize: 12 }}>
                  {addAccountError}
                </span>
              )}
            </div>
            <Btn kind="primary" size="sm" type="submit" disabled={addingAccount || !newAccountId || newAccountId === "act_"}>
              {addingAccount ? "Adding…" : "Add account"}
            </Btn>
          </form>
        )}
      </Card>

      {/* Sync Card */}
      <Card
        title="Sync status"
        sub="Latest background sync with Meta Graph API"
        action={
          canEdit && (
            <Btn kind="ghost" size="sm" onClick={doSync} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync now"}
            </Btn>
          )
        }
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: "4px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {latestSync ? (
              <>
                <Pill tone={SYNC_STATUS_MAP[latestSync.status]?.tone || "neutral"} dot>
                  {SYNC_STATUS_MAP[latestSync.status]?.label || latestSync.status}
                </Pill>
                <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  Last run: <strong>{timeAgo(latestSync.startedAt)}</strong> (
                  {latestSync.campaignsSynced} campaigns, {latestSync.adsetsSynced} ad sets, {latestSync.adsSynced} ads)
                </span>
              </>
            ) : (
              <span className="kmkt-muted">No sync runs recorded yet.</span>
            )}
          </div>
          <button
            type="button"
            className="kmkt-attr-link"
            onClick={() => {
              navigate({ search: "?tab=meta-ads&view=activity" });
            }}
          >
            View full sync history in Activity →
          </button>
        </div>
        {syncNotice && (
          <p className="kmkt-notice" style={{ marginTop: 8 }}>
            {syncNotice}
          </p>
        )}
      </Card>

      {/* Budget Guard Rails Card */}
      <Card
        title="Budget guard rails"
        sub="Protections against accidental overspending on real money ad edits"
      >
        <form className="kmkt-settings-form" onSubmit={saveGuardRails}>
          <div className="kmkt-field">
            <span>Hard ceiling</span>
            <div className="kmkt-inline-fields">
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={!canEdit}
                value={draftCeiling}
                placeholder="e.g. 50.00"
                onChange={(e) => setDraftCeiling(e.target.value)}
              />
              <select
                className="kmkt-field-select"
                disabled={!canEdit || !draftCeiling}
                value={draftCurrency}
                onChange={(e) => setDraftCurrency(e.target.value)}
              >
                {availableCurrencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <span className="kmkt-field-helper">
              No budget above this is ever sent to Meta, whoever asks. Restricted to currencies used by your tracked accounts.
            </span>
          </div>

          <div className="kmkt-field">
            <span>Ask to confirm above multiple</span>
            <div className="kmkt-inline-fields">
              <input
                type="number"
                min="1"
                step="0.5"
                disabled={!canEdit}
                value={draftMultiplier}
                placeholder="3"
                onChange={(e) => setDraftMultiplier(e.target.value)}
              />
              <span style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}>× current budget</span>
            </div>
            <span className="kmkt-field-helper">
              e.g. at 3×, raising a $10/day budget to more than $30/day prompts an amber confirmation step before sending.
            </span>
          </div>

          {canEdit && isDirty && (
            <div className="kmkt-savebar">
              <span className="kmkt-savebar-text">You have unsaved changes to guard rails.</span>
              <div className="kmkt-savebar-actions">
                <Btn kind="ghost" size="sm" type="button" onClick={resetDraft} disabled={savingSettings}>
                  Reset
                </Btn>
                <Btn kind="primary" size="sm" type="submit" disabled={savingSettings}>
                  {savingSettings ? "Saving…" : "Save changes"}
                </Btn>
              </div>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
