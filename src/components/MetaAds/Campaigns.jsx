import { Fragment, useEffect, useState } from "react";
import { Card, Btn, Pill, Icons } from "../ui";
import { asCurrency } from "../../utils/format";
import { fetchAdAccounts, fetchAdsets, fetchAds, fetchCampaigns, fetchSettings } from "../../lib/metaAds";
import { updateRow, insertRow } from "../../lib/db";
import { runMetaAdsAction } from "../../lib/metaAdsApi";
import BudgetEditDialog from "./BudgetEditDialog";

const STATUS_TONE = { ACTIVE: "mint", PAUSED: "terra" };

function money(minor, currency) {
  if (minor == null) return "—";
  return asCurrency(minor / 100, currency || "USD");
}

/** One row for a campaign, ad set, or ad — same shape, same controls. */
function EntityRow({ entity, level, currency, canEdit, depth, expanded, onToggle, hasChildren, busy, onPauseResume, onEditBudget }) {
  const isPaused = entity.status === "PAUSED";
  return (
    <tr>
      <td style={{ paddingLeft: 16 + depth * 20 }}>
        {hasChildren && (
          <button type="button" className="kmkt-expand" onClick={onToggle} aria-label="Expand">
            <Icons.ChevronRight size={13} style={{ transform: expanded ? "rotate(90deg)" : "none" }} />
          </button>
        )}
        {entity.name}
      </td>
      <td><Pill tone={STATUS_TONE[entity.effectiveStatus || entity.status] || "neutral"}>{entity.effectiveStatus || entity.status}</Pill></td>
      <td className="mono">{money(entity.dailyBudgetMinor, currency)}{entity.dailyBudgetMinor != null ? "/day" : ""}</td>
      <td className="mono">{money(entity.lifetimeBudgetMinor, currency)}</td>
      <td>
        {canEdit && (entity.status === "ACTIVE" || entity.status === "PAUSED") && (
          <div className="kmkt-row-actions">
            <Btn kind="ghost" size="sm" disabled={busy}
              onClick={() => onPauseResume(entity, level, isPaused ? "resume" : "pause")}>
              {isPaused ? "Resume" : "Pause"}
            </Btn>
            {(entity.dailyBudgetMinor != null || entity.lifetimeBudgetMinor != null) && (
              <Btn kind="ghost" size="sm" disabled={busy} onClick={() => onEditBudget(entity, level, currency)}>
                Edit budget
              </Btn>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export default function Campaigns({ canEdit }) {
  const [campaigns, setCampaigns] = useState([]);
  const [adsets, setAdsets] = useState({});   // campaignId -> rows
  const [ads, setAds] = useState({});         // adsetId -> rows
  const [currencyByAccount, setCurrencyByAccount] = useState({});
  const [expandedC, setExpandedC] = useState(new Set());
  const [expandedA, setExpandedA] = useState(new Set());
  const [settings, setSettings] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [budgetTarget, setBudgetTarget] = useState(null); // {entity, level, currency}

  const load = () => fetchCampaigns().then(setCampaigns).catch((e) => setError(e.message));
  const currencyFor = (entity) => currencyByAccount[entity.adAccountId] || "USD";

  useEffect(() => {
    load();
    fetchSettings().then(setSettings).catch(() => {});
    fetchAdAccounts().then((rows) => {
      const map = {};
      for (const a of rows) map[a.id] = a.currency;
      setCurrencyByAccount(map);
    }).catch(() => {});
  }, []);

  async function toggleCampaign(c) {
    const next = new Set(expandedC);
    if (next.has(c.id)) {
      next.delete(c.id);
    } else {
      next.add(c.id);
      if (!adsets[c.id]) {
        const rows = await fetchAdsets(c.id);
        setAdsets((s) => ({ ...s, [c.id]: rows }));
      }
    }
    setExpandedC(next);
  }

  async function toggleAdset(a) {
    const next = new Set(expandedA);
    if (next.has(a.id)) {
      next.delete(a.id);
    } else {
      next.add(a.id);
      if (!ads[a.id]) {
        const rows = await fetchAds(a.id);
        setAds((s) => ({ ...s, [a.id]: rows }));
      }
    }
    setExpandedA(next);
  }

  function collectionFor(level) {
    return level === "campaign" ? "meta_campaigns" : level === "adset" ? "meta_adsets" : "meta_ads";
  }

  async function logAction(entity, level, action, field, before, after, confirmedOverCeiling = false) {
    await insertRow("meta_ads_actions", {
      entityLevel: level,
      entityId: entity.id,
      entityName: entity.name,
      action,
      field: field || null,
      before,
      after,
      confirmedOverCeiling,
    });
  }

  async function handlePauseResume(entity, level, action) {
    setError("");
    setBusyId(entity.id);
    try {
      const res = await runMetaAdsAction({ entityLevel: level, entityId: entity.id, action });
      const newStatus = action === "pause" ? "PAUSED" : "ACTIVE";
      await updateRow(collectionFor(level), entity.id, { status: newStatus, effectiveStatus: res?.newState?.effective_status || newStatus });
      await logAction(entity, level, action, null, { status: entity.status }, { status: newStatus });
      load();
      if (level === "campaign") setAdsets((s) => ({ ...s })); // no-op refresh trigger; children re-fetch on next expand
    } catch (e) {
      setError(e.message || "That didn't work.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleBudgetSubmit({ entity, level, field, valueMinor, confirmedOverCeiling }) {
    setError("");
    setBusyId(entity.id);
    try {
      await runMetaAdsAction({ entityLevel: level, entityId: entity.id, action: "budget_edit", field, valueMinor });
      await updateRow(collectionFor(level), entity.id, { [field === "daily_budget" ? "dailyBudgetMinor" : "lifetimeBudgetMinor"]: valueMinor });
      await logAction(
        entity, level, "budget_edit", field,
        { [field]: field === "daily_budget" ? entity.dailyBudgetMinor : entity.lifetimeBudgetMinor },
        { [field]: valueMinor },
        confirmedOverCeiling
      );
      setBudgetTarget(null);
      load();
    } catch (e) {
      setError(e.message || "That didn't work.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="kmkt-campaigns">
      {error && <p className="form-error">{error}</p>}
      <Card pad={false}>
        <table className="ktable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Daily budget</th>
              <th>Lifetime budget</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <Fragment key={c.id}>
                <EntityRow
                  key={c.id}
                  entity={c}
                  level="campaign"
                  currency={currencyFor(c)}
                  canEdit={canEdit}
                  depth={0}
                  expanded={expandedC.has(c.id)}
                  onToggle={() => toggleCampaign(c)}
                  hasChildren
                  busy={busyId === c.id}
                  onPauseResume={handlePauseResume}
                  onEditBudget={(entity, level, currency) => setBudgetTarget({ entity, level, currency })}
                />
                {expandedC.has(c.id) && (adsets[c.id] || []).map((a) => (
                  <Fragment key={a.id}>
                    <EntityRow
                      key={a.id}
                      entity={a}
                      level="adset"
                      currency={currencyFor(a)}
                      canEdit={canEdit}
                      depth={1}
                      expanded={expandedA.has(a.id)}
                      onToggle={() => toggleAdset(a)}
                      hasChildren
                      busy={busyId === a.id}
                      onPauseResume={handlePauseResume}
                      onEditBudget={(entity, level, currency) => setBudgetTarget({ entity, level, currency })}
                    />
                    {expandedA.has(a.id) && (ads[a.id] || []).map((ad) => (
                      <EntityRow
                        key={ad.id}
                        entity={ad}
                        level="ad"
                        currency={currencyFor(ad)}
                        canEdit={canEdit}
                        depth={2}
                        expanded={false}
                        onToggle={() => {}}
                        hasChildren={false}
                        busy={busyId === ad.id}
                        onPauseResume={handlePauseResume}
                        onEditBudget={(entity, level, currency) => setBudgetTarget({ entity, level, currency })}
                      />
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
            {campaigns.length === 0 && (
              <tr><td colSpan={5} className="kmkt-muted">No campaigns synced yet — run a sync from Settings.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {budgetTarget && (
        <BudgetEditDialog
          entity={budgetTarget.entity}
          level={budgetTarget.level}
          currency={budgetTarget.currency}
          confirmMultiplier={settings?.confirmMultiplier || 3}
          ceilingMinor={settings?.budgetCeilingMinor}
          busy={busyId === budgetTarget.entity.id}
          onCancel={() => setBudgetTarget(null)}
          onSubmit={handleBudgetSubmit}
        />
      )}
    </div>
  );
}
