import { Fragment, useEffect, useState } from "react";
import { Card, Btn, Pill, Icons } from "../ui";
import { fetchAdAccounts, fetchAdsets, fetchAds, fetchCampaigns, fetchSettings } from "../../lib/metaAds";
import { updateRow, insertRow } from "../../lib/db";
import { runMetaAdsAction } from "../../lib/metaAdsApi";
import BudgetEditDialog from "./BudgetEditDialog";
import { moneyMinor } from "./money";

const STATUS_TONE = { ACTIVE: "mint", PAUSED: "terra" };
// Paused because a parent is paused — the entity's own status may still be
// ACTIVE, so its own Pause/Resume button would be misleading.
const PAUSED_BY_PARENT = { CAMPAIGN_PAUSED: "Paused by its campaign", ADSET_PAUSED: "Paused by its ad set" };
const COLS = 5;

function money(minor, currency) {
  return moneyMinor(minor, currency);
}

function statusLabel(s) {
  if (!s) return "—";
  const t = s.toLowerCase().replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** One row for a campaign, ad set, or ad — same shape, same controls. */
function EntityRow({ entity, level, currency, canEdit, depth, expanded, onToggle, hasChildren, busy, onPauseResume, onEditBudget }) {
  const status = entity.effectiveStatus || entity.status;
  const pausedByParent = PAUSED_BY_PARENT[entity.effectiveStatus];
  const isPaused = entity.status === "PAUSED";
  const canToggle = canEdit && !pausedByParent && (entity.status === "ACTIVE" || entity.status === "PAUSED");
  return (
    <tr>
      <td style={{ paddingLeft: 16 + depth * 20 }}>
        {hasChildren && (
          <button type="button" className="kmkt-expand" onClick={onToggle} aria-label={expanded ? "Collapse" : "Expand"} aria-expanded={expanded}>
            <Icons.ChevronRight size={13} style={{ transform: expanded ? "rotate(90deg)" : "none" }} />
          </button>
        )}
        {entity.name}
      </td>
      <td><Pill tone={STATUS_TONE[status] || "neutral"}>{statusLabel(status)}</Pill></td>
      <td className="mono kmkt-num">{money(entity.dailyBudgetMinor, currency)}{entity.dailyBudgetMinor != null ? "/day" : ""}</td>
      <td className="mono kmkt-num">{money(entity.lifetimeBudgetMinor, currency)}</td>
      <td>
        <div className="kmkt-row-actions">
          {canEdit && pausedByParent && <span className="kmkt-muted">{pausedByParent}</span>}
          {canToggle && (
            <Btn kind="ghost" size="sm" disabled={busy}
              onClick={() => onPauseResume(entity, level, isPaused ? "resume" : "pause")}>
              {isPaused ? "Resume" : "Pause"}
            </Btn>
          )}
          {canEdit && (entity.dailyBudgetMinor != null || entity.lifetimeBudgetMinor != null) && (
            <Btn kind="ghost" size="sm" disabled={busy} onClick={() => onEditBudget(entity, level, currency)}>
              Edit budget
            </Btn>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Loading / error / empty row shown under an expanded parent. */
function ChildStateRow({ depth, state, emptyText, onRetry }) {
  if (state === "loading") {
    return <tr><td colSpan={COLS} className="kmkt-muted" style={{ paddingLeft: 16 + depth * 20 }}>Loading…</td></tr>;
  }
  if (state === "error") {
    return (
      <tr>
        <td colSpan={COLS} style={{ paddingLeft: 16 + depth * 20 }}>
          <span className="form-error" role="alert">Couldn't load these.</span>{" "}
          <Btn kind="ghost" size="sm" onClick={onRetry}>Retry</Btn>
        </td>
      </tr>
    );
  }
  return <tr><td colSpan={COLS} className="kmkt-muted" style={{ paddingLeft: 16 + depth * 20 }}>{emptyText}</td></tr>;
}

export default function Campaigns({ canEdit }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adsets, setAdsets] = useState({});   // campaignId -> rows
  const [ads, setAds] = useState({});         // adsetId -> rows
  const [childState, setChildState] = useState({}); // id -> "loading" | "error"
  const [currencyByAccount, setCurrencyByAccount] = useState({});
  const [expandedC, setExpandedC] = useState(new Set());
  const [expandedA, setExpandedA] = useState(new Set());
  const [settings, setSettings] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [budgetTarget, setBudgetTarget] = useState(null); // {entity, level, currency}

  const load = () =>
    fetchCampaigns()
      .then(setCampaigns)
      .catch((e) => setError(e.message || "Couldn't load campaigns."))
      .finally(() => setLoading(false));
  const currencyFor = (entity) => currencyByAccount[entity.adAccountId] || "";

  useEffect(() => {
    load();
    fetchSettings().then(setSettings).catch(() => {});
    fetchAdAccounts().then((rows) => {
      const map = {};
      for (const a of rows) map[a.id] = a.currency;
      setCurrencyByAccount(map);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadChildren(kind, parentId) {
    const fetcher = kind === "adsets" ? fetchAdsets : fetchAds;
    const setter = kind === "adsets" ? setAdsets : setAds;
    setChildState((s) => ({ ...s, [parentId]: "loading" }));
    try {
      const rows = await fetcher(parentId);
      setter((s) => ({ ...s, [parentId]: rows }));
      setChildState((s) => { const n = { ...s }; delete n[parentId]; return n; });
    } catch {
      setChildState((s) => ({ ...s, [parentId]: "error" }));
    }
  }

  function toggleCampaign(c) {
    const next = new Set(expandedC);
    if (next.has(c.id)) {
      next.delete(c.id);
    } else {
      next.add(c.id);
      if (!adsets[c.id]) loadChildren("adsets", c.id);
    }
    setExpandedC(next);
  }

  function toggleAdset(a) {
    const next = new Set(expandedA);
    if (next.has(a.id)) {
      next.delete(a.id);
    } else {
      next.add(a.id);
      if (!ads[a.id]) loadChildren("ads", a.id);
    }
    setExpandedA(next);
  }

  /** Pausing a parent changes its children's effective status — re-fetch everything already loaded. */
  function refreshLoadedChildren() {
    for (const id of Object.keys(adsets)) loadChildren("adsets", id);
    for (const id of Object.keys(ads)) loadChildren("ads", id);
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
      refreshLoadedChildren();
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
      refreshLoadedChildren();
    } catch (e) {
      setError(e.message || "That didn't work.");
    } finally {
      setBusyId(null);
    }
  }

  const rowProps = (entity, level) => ({
    entity,
    level,
    currency: currencyFor(entity),
    canEdit,
    busy: busyId === entity.id,
    onPauseResume: handlePauseResume,
    onEditBudget: (e, l, currency) => setBudgetTarget({ entity: e, level: l, currency }),
  });

  return (
    <div className="kmkt-campaigns">
      {error && !budgetTarget && <p className="form-error" role="alert">{error}</p>}
      <Card pad={false}>
        <div className="kmkt-table-scroll">
          <table className="ktable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th className="kmkt-num">Daily budget</th>
                <th className="kmkt-num">Lifetime budget</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <Fragment key={c.id}>
                  <EntityRow
                    {...rowProps(c, "campaign")}
                    depth={0}
                    expanded={expandedC.has(c.id)}
                    onToggle={() => toggleCampaign(c)}
                    hasChildren
                  />
                  {expandedC.has(c.id) && (
                    childState[c.id] || (adsets[c.id] || []).length === 0 ? (
                      <ChildStateRow
                        depth={1}
                        state={childState[c.id]}
                        emptyText="No ad sets synced for this campaign."
                        onRetry={() => loadChildren("adsets", c.id)}
                      />
                    ) : (
                      adsets[c.id].map((a) => (
                        <Fragment key={a.id}>
                          <EntityRow
                            {...rowProps(a, "adset")}
                            depth={1}
                            expanded={expandedA.has(a.id)}
                            onToggle={() => toggleAdset(a)}
                            hasChildren
                          />
                          {expandedA.has(a.id) && (
                            childState[a.id] || (ads[a.id] || []).length === 0 ? (
                              <ChildStateRow
                                depth={2}
                                state={childState[a.id]}
                                emptyText="No ads synced for this ad set."
                                onRetry={() => loadChildren("ads", a.id)}
                              />
                            ) : (
                              ads[a.id].map((ad) => (
                                <EntityRow
                                  key={ad.id}
                                  {...rowProps(ad, "ad")}
                                  depth={2}
                                  expanded={false}
                                  onToggle={() => {}}
                                  hasChildren={false}
                                />
                              ))
                            )
                          )}
                        </Fragment>
                      ))
                    )
                  )}
                </Fragment>
              ))}
              {loading && campaigns.length === 0 && (
                <tr><td colSpan={COLS} className="kmkt-muted">Loading campaigns…</td></tr>
              )}
              {!loading && !error && campaigns.length === 0 && (
                <tr><td colSpan={COLS} className="kmkt-muted">No campaigns synced yet — run a sync from Settings.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {budgetTarget && (
        <BudgetEditDialog
          entity={budgetTarget.entity}
          level={budgetTarget.level}
          currency={budgetTarget.currency}
          confirmMultiplier={settings?.confirmMultiplier}
          ceilingMinor={settings?.budgetCeilingMinor}
          ceilingCurrency={settings?.budgetCeilingCurrency}
          serverError={error}
          busy={busyId === budgetTarget.entity.id}
          onCancel={() => { setBudgetTarget(null); setError(""); }}
          onSubmit={handleBudgetSubmit}
        />
      )}
    </div>
  );
}
