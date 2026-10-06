import { Fragment, useEffect, useState } from "react";
import { Card, Btn, Pill, Icons } from "../ui";
import { fetchAdAccounts, fetchAdsets, fetchAds, fetchCampaigns, fetchSettings } from "../../lib/metaAds";
import { updateRow, insertRow } from "../../lib/db";
import { runMetaAdsAction } from "../../lib/metaAdsApi";
import BudgetEditDialog from "./BudgetEditDialog";
import ConfirmPauseResumeModal from "./ConfirmPauseResumeModal";
import { getMetaStatus } from "./status";
import { moneyMinor } from "./money";

const PAUSED_BY_PARENT = {
  CAMPAIGN_PAUSED: "Paused by campaign",
  ADSET_PAUSED: "Paused by ad set",
};
const COLS = 4;

function money(minor, currency) {
  return moneyMinor(minor, currency);
}

/** One row for a campaign, ad set, or ad — same shape, same controls. */
function EntityRow({
  entity,
  level,
  currency,
  parentHasBudget,
  canEdit,
  depth,
  expanded,
  onToggle,
  hasChildren,
  busy,
  onConfirmPauseResume,
  onEditBudget,
}) {
  const statusInfo = getMetaStatus(entity.effectiveStatus, entity.status);
  const pausedByParent = PAUSED_BY_PARENT[entity.effectiveStatus];
  const isPaused = entity.status === "PAUSED";
  const canToggle = canEdit && !pausedByParent && (entity.status === "ACTIVE" || entity.status === "PAUSED");
  const hasOwnBudget = entity.dailyBudgetMinor != null || entity.lifetimeBudgetMinor != null;

  let budgetDisplay = "—";
  if (entity.dailyBudgetMinor != null) {
    budgetDisplay = `${money(entity.dailyBudgetMinor, currency)} / day`;
  } else if (entity.lifetimeBudgetMinor != null) {
    budgetDisplay = `${money(entity.lifetimeBudgetMinor, currency)} total`;
  } else if (level === "adset" && parentHasBudget) {
    budgetDisplay = <span className="kmkt-budget-inherited">Campaign budget</span>;
  }

  return (
    <tr>
      <td style={{ paddingLeft: 16 + depth * 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {hasChildren ? (
            <button
              type="button"
              className="kmkt-expand"
              onClick={onToggle}
              aria-label={expanded ? "Collapse" : "Expand"}
              aria-expanded={expanded}
            >
              <Icons.ChevronRight
                size={13}
                style={{
                  transform: expanded ? "rotate(90deg)" : "none",
                  transition: "transform 0.15s ease",
                }}
              />
            </button>
          ) : (
            <span style={{ width: 16, display: "inline-block" }} />
          )}

          {level === "ad" && entity.creativeThumbnailUrl && (
            <img
              src={entity.creativeThumbnailUrl}
              alt=""
              style={{
                width: 28,
                height: 28,
                borderRadius: 4,
                objectFit: "cover",
                flexShrink: 0,
                background: "var(--bg-2)",
              }}
            />
          )}

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: level === "campaign" ? 600 : level === "adset" ? 500 : 400,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 420,
              }}
            >
              {entity.name}
            </div>
            {level === "campaign" && entity.objective && (
              <div className="kmkt-entity-sub">
                {entity.objective.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}
              </div>
            )}
          </div>
        </div>
      </td>
      <td>
        <Pill tone={statusInfo.tone} dot>
          {statusInfo.label}
        </Pill>
      </td>
      <td className="mono kmkt-num">{budgetDisplay}</td>
      <td>
        <div className="kmkt-row-actions">
          {canEdit && pausedByParent && (
            <span className="kmkt-muted" style={{ fontSize: 12 }}>
              {pausedByParent}
            </span>
          )}
          {canToggle && (
            <Btn
              kind="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onConfirmPauseResume(entity, level, isPaused ? "resume" : "pause")}
            >
              {isPaused ? "Resume" : "Pause"}
            </Btn>
          )}
          {canEdit && hasOwnBudget && (
            <Btn
              kind="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onEditBudget(entity, level, currency)}
            >
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
    return (
      <tr>
        <td colSpan={COLS} className="kmkt-muted" style={{ paddingLeft: 16 + depth * 22 }}>
          Loading…
        </td>
      </tr>
    );
  }
  if (state === "error") {
    return (
      <tr>
        <td colSpan={COLS} style={{ paddingLeft: 16 + depth * 22 }}>
          <span className="form-error" role="alert">
            Couldn't load these.
          </span>{" "}
          <Btn kind="ghost" size="sm" onClick={onRetry}>
            Retry
          </Btn>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td colSpan={COLS} className="kmkt-muted" style={{ paddingLeft: 16 + depth * 22 }}>
        {emptyText}
      </td>
    </tr>
  );
}

export default function Campaigns({ canEdit }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adsets, setAdsets] = useState({}); // campaignId -> rows
  const [ads, setAds] = useState({}); // adsetId -> rows
  const [childState, setChildState] = useState({}); // id -> "loading" | "error"
  const [currencyByAccount, setCurrencyByAccount] = useState({});
  const [expandedC, setExpandedC] = useState(new Set());
  const [expandedA, setExpandedA] = useState(new Set());
  const [settings, setSettings] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "active" | "paused" | "issues"
  const [showArchived, setShowArchived] = useState(false);

  // Modals
  const [budgetTarget, setBudgetTarget] = useState(null); // { entity, level, currency }
  const [confirmTarget, setConfirmTarget] = useState(null); // { entity, level, action }

  const load = () =>
    fetchCampaigns()
      .then(setCampaigns)
      .catch((e) => setError(e.message || "Couldn't load campaigns."))
      .finally(() => setLoading(false));

  const currencyFor = (entity) => currencyByAccount[entity.adAccountId] || "";

  useEffect(() => {
    load();
    fetchSettings().then(setSettings).catch(() => {});
    fetchAdAccounts()
      .then((rows) => {
        const map = {};
        for (const a of rows) map[a.id] = a.currency;
        setCurrencyByAccount(map);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadChildren(kind, parentId) {
    const fetcher = kind === "adsets" ? fetchAdsets : fetchAds;
    const setter = kind === "adsets" ? setAdsets : setAds;
    setChildState((s) => ({ ...s, [parentId]: "loading" }));
    try {
      const rows = await fetcher(parentId);
      setter((s) => ({ ...s, [parentId]: rows }));
      setChildState((s) => {
        const n = { ...s };
        delete n[parentId];
        return n;
      });
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
      await updateRow(collectionFor(level), entity.id, {
        status: newStatus,
        effectiveStatus: res?.newState?.effective_status || newStatus,
      });
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
      await updateRow(collectionFor(level), entity.id, {
        [field === "daily_budget" ? "dailyBudgetMinor" : "lifetimeBudgetMinor"]: valueMinor,
      });
      await logAction(
        entity,
        level,
        "budget_edit",
        field,
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

  const isArchived = (c) => {
    const s = (c.effectiveStatus || c.status || "").toUpperCase();
    return s === "ARCHIVED" || s === "DELETED";
  };
  const archivedCount = campaigns.filter(isArchived).length;

  const filteredCampaigns = campaigns.filter((c) => {
    if (!showArchived && isArchived(c)) {
      return false;
    }

    const eff = (c.effectiveStatus || c.status || "").toUpperCase();
    if (statusFilter === "active" && eff !== "ACTIVE") {
      return false;
    }
    if (statusFilter === "paused" && eff !== "PAUSED" && eff !== "CAMPAIGN_PAUSED") {
      return false;
    }
    if (statusFilter === "issues") {
      const issueStatuses = ["WITH_ISSUES", "PENDING_BILLING_INFO", "DISAPPROVED"];
      if (!issueStatuses.includes(eff)) {
        return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesName = c.name?.toLowerCase().includes(q);
      const matchesObjective = c.objective?.toLowerCase().includes(q);
      if (!matchesName && !matchesObjective) {
        return false;
      }
    }

    return true;
  });

  const rowProps = (entity, level, parentHasBudget = false) => ({
    entity,
    level,
    currency: currencyFor(entity),
    parentHasBudget,
    canEdit,
    busy: busyId === entity.id,
    onConfirmPauseResume: (ent, lvl, act) => setConfirmTarget({ entity: ent, level: lvl, action: act }),
    onEditBudget: (e, l, currency) => setBudgetTarget({ entity: e, level: l, currency }),
  });

  return (
    <div className="kmkt-campaigns">
      {error && !budgetTarget && !confirmTarget && (
        <p className="form-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}

      {/* Toolbar */}
      <div className="kmkt-campaigns-toolbar">
        <div className="kmkt-campaigns-toolbar-left">
          <div className="kmkt-campaigns-search">
            <Icons.Search size={14} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search campaigns…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: "var(--ink-3)",
                  display: "flex",
                }}
                aria-label="Clear search"
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
              { id: "all", label: "All" },
              { id: "active", label: "Active" },
              { id: "paused", label: "Paused" },
              { id: "issues", label: "Needs attention" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  border: "none",
                  background: statusFilter === tab.id ? "var(--card)" : "transparent",
                  color: statusFilter === tab.id ? "var(--ink)" : "var(--ink-3)",
                  fontWeight: statusFilter === tab.id ? 600 : 500,
                  fontSize: 12.5,
                  padding: "5px 11px",
                  borderRadius: 5,
                  cursor: "pointer",
                  boxShadow: statusFilter === tab.id ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="kmkt-campaigns-toolbar-right">
          <label className="kmkt-archived-toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            <span>Show archived {archivedCount > 0 ? `(${archivedCount})` : ""}</span>
          </label>
        </div>
      </div>

      <Card pad={false}>
        <div className="kmkt-table-scroll">
          <table className="ktable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Delivery</th>
                <th className="kmkt-num">Budget</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredCampaigns.map((c) => {
                const campaignHasBudget = c.dailyBudgetMinor != null || c.lifetimeBudgetMinor != null;
                return (
                  <Fragment key={c.id}>
                    <EntityRow
                      {...rowProps(c, "campaign")}
                      depth={0}
                      expanded={expandedC.has(c.id)}
                      onToggle={() => toggleCampaign(c)}
                      hasChildren
                    />
                    {expandedC.has(c.id) &&
                      (childState[c.id] || (adsets[c.id] || []).length === 0 ? (
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
                              {...rowProps(a, "adset", campaignHasBudget)}
                              depth={1}
                              expanded={expandedA.has(a.id)}
                              onToggle={() => toggleAdset(a)}
                              hasChildren
                            />
                            {expandedA.has(a.id) &&
                              (childState[a.id] || (ads[a.id] || []).length === 0 ? (
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
                              ))}
                          </Fragment>
                        ))
                      ))}
                  </Fragment>
                );
              })}
              {loading && campaigns.length === 0 && (
                <tr>
                  <td colSpan={COLS} className="kmkt-muted" style={{ padding: "20px 16px", textAlign: "center" }}>
                    Loading campaigns…
                  </td>
                </tr>
              )}
              {!loading && !error && filteredCampaigns.length === 0 && (
                <tr>
                  <td colSpan={COLS} className="kmkt-muted" style={{ padding: "24px 16px", textAlign: "center" }}>
                    {campaigns.length === 0
                      ? "No campaigns synced yet — run a sync from Settings."
                      : "No campaigns match your current filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Budget Editor Modal */}
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
          onCancel={() => {
            setBudgetTarget(null);
            setError("");
          }}
          onSubmit={handleBudgetSubmit}
        />
      )}

      {/* Pause / Resume Confirmation Modal */}
      {confirmTarget && (
        <ConfirmPauseResumeModal
          entity={confirmTarget.entity}
          level={confirmTarget.level}
          action={confirmTarget.action}
          busy={busyId === confirmTarget.entity.id}
          onClose={() => setConfirmTarget(null)}
          onConfirm={async (entity, level, action) => {
            await handlePauseResume(entity, level, action);
            setConfirmTarget(null);
          }}
        />
      )}
    </div>
  );
}
