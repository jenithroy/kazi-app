import { useEffect, useMemo, useState } from "react";
import { Card, KPI, Pill, Icons, Btn } from "../ui";
import { roundAmount } from "../../utils/format";
import { fetchCampaignInsights, fetchCampaigns, fetchTopAds, fetchAdAccounts, fetchSyncRuns } from "../../lib/metaAds";
import { runMetaAdsSync } from "../../lib/metaAdsApi";
import { money } from "./money";
import BarList from "./BarList";
import ChartFrame from "./ChartFrame";
import NeedsAttentionBanner from "./NeedsAttentionBanner";

const METRICS = [
  { id: "spend", label: "Spend" },
  { id: "results", label: "Results" },
  { id: "clicks", label: "Clicks" },
  { id: "impressions", label: "Impressions" },
];

function formatShortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function countCampaignResults(actions, objective) {
  if (!actions || !Array.isArray(actions) || actions.length === 0) return 0;
  const obj = (objective || "").toUpperCase();

  let targetTypes = [];
  if (obj.includes("MESSAG") || obj.includes("ENGAGEMENT")) {
    targetTypes = [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
      "messaging_conversation_started_7d",
    ];
  } else if (obj.includes("LEAD")) {
    targetTypes = ["lead", "onsite_conversion.lead_grouped"];
  } else if (obj.includes("TRAFFIC") || obj.includes("LINK_CLICK")) {
    targetTypes = ["link_click"];
  } else if (obj.includes("SALES") || obj.includes("CONVERSION")) {
    targetTypes = ["purchase", "omni_purchase", "lead"];
  } else if (obj.includes("AWARENESS") || obj.includes("REACH")) {
    return 0;
  } else {
    targetTypes = [
      "onsite_conversion.messaging_conversation_started_7d",
      "lead",
      "link_click",
    ];
  }

  for (const t of targetTypes) {
    const act = actions.find((a) => a.action_type === t);
    if (act && Number(act.value) > 0) {
      return Number(act.value);
    }
  }
  return 0;
}

function countLinkClicks(actions) {
  if (!actions || !Array.isArray(actions)) return 0;
  const act = actions.find((a) => a.action_type === "link_click");
  return act ? Number(act.value) || 0 : 0;
}

function getDaysList(fromStr, toStr) {
  if (!fromStr || !toStr) return [];
  const list = [];
  const cur = new Date(fromStr + "T00:00:00");
  const end = new Date(toStr + "T00:00:00");
  while (cur <= end) {
    list.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return list;
}

export default function Overview({ range = {}, onViewChange }) {
  const [insights, setInsights] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [topAds, setTopAds] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [syncRuns, setSyncRuns] = useState([]);
  const [metric, setMetric] = useState("spend");
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const loadData = () => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.allSettled([
      fetchCampaignInsights(range.dateFrom || null, range.dateTo || null),
      fetchCampaigns(),
      fetchTopAds(range.dateFrom || null, range.dateTo || null, 8),
      fetchAdAccounts(),
      fetchSyncRuns(),
    ])
      .then(([iRes, cRes, tRes, aRes, rRes]) => {
        if (!alive) return;
        if (iRes.status === "fulfilled") setInsights(iRes.value || []);
        if (cRes.status === "fulfilled") setCampaigns(cRes.value || []);
        if (tRes.status === "fulfilled") setTopAds(tRes.value || []);
        if (aRes.status === "fulfilled") setAccounts(aRes.value || []);
        if (rRes.status === "fulfilled") setSyncRuns(rRes.value || []);

        const failed = [iRes, cRes, tRes, aRes, rRes].find((r) => r.status === "rejected");
        if (failed && iRes.status === "rejected") {
          setError(failed.reason?.message || "Couldn't load insights data.");
        }
      })
      .catch((e) => alive && setError(e.message || "Couldn't load Meta Ads data."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  };

  useEffect(loadData, [range.dateFrom, range.dateTo]);

  // Campaign objective map
  const campaignObjective = useMemo(() => {
    const map = {};
    for (const c of campaigns) map[c.id] = c.objective;
    return map;
  }, [campaigns]);

  const campaignName = useMemo(() => {
    const map = {};
    for (const c of campaigns) map[c.id] = c.name;
    return map;
  }, [campaigns]);

  // Group rows by currency
  const byCurrency = useMemo(() => {
    const groups = {};
    for (const r of insights) {
      const cur = r.currency || "?";
      (groups[cur] ||= []).push(r);
    }
    return groups;
  }, [insights]);
  const currencies = Object.keys(byCurrency);
  const activeCurrency = selectedCurrency && currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0] || "USD";

  const totals = useMemo(() => {
    const rows = byCurrency[activeCurrency] || [];
    const linkClicks = rows.reduce((s, r) => s + countLinkClicks(r.conversions), 0);
    const impressions = rows.reduce((s, r) => s + Number(r.impressions || 0), 0);
    return {
      spend: rows.reduce((s, r) => s + Number(r.spend || 0), 0),
      clicks: rows.reduce((s, r) => s + Number(r.clicks || 0), 0),
      linkClicks,
      impressions,
      results: rows.reduce((s, r) => s + countCampaignResults(r.conversions, campaignObjective[r.campaignId]), 0),
    };
  }, [byCurrency, activeCurrency, campaignObjective]);

  // Earliest date check for "Data starts..." indicator
  const earliestInsightDate = useMemo(() => {
    if (!insights.length) return null;
    const sorted = [...insights].map((r) => r.date).filter(Boolean).sort();
    return sorted[0] || null;
  }, [insights]);

  const dataStartsNotice = useMemo(() => {
    if (!earliestInsightDate || !range.dateFrom) return null;
    if (earliestInsightDate > range.dateFrom) {
      return `Data starts ${formatShortDate(earliestInsightDate)}`;
    }
    return null;
  }, [earliestInsightDate, range.dateFrom]);

  // Trend data
  const trend = useMemo(() => {
    const rows = byCurrency[activeCurrency] || [];
    const byDate = {};
    for (const r of rows) {
      let val = 0;
      if (metric === "spend") val = Number(r.spend || 0);
      else if (metric === "clicks") val = Number(r.clicks || 0);
      else if (metric === "impressions") val = Number(r.impressions || 0);
      else if (metric === "results") val = countCampaignResults(r.conversions, campaignObjective[r.campaignId]);
      byDate[r.date] = (byDate[r.date] || 0) + val;
    }
    const dateRangeList = getDaysList(range.dateFrom, range.dateTo);
    const dates = dateRangeList.length > 0 ? dateRangeList : Object.keys(byDate).sort();
    return { dates, data: dates.map((d) => byDate[d] || 0) };
  }, [byCurrency, activeCurrency, metric, range.dateFrom, range.dateTo, campaignObjective]);

  // Spend by campaign
  const spendByCampaignRows = useMemo(() => {
    const rows = byCurrency[activeCurrency] || [];
    const totalsByCampaign = {};
    for (const r of rows) totalsByCampaign[r.campaignId] = (totalsByCampaign[r.campaignId] || 0) + Number(r.spend || 0);
    return Object.entries(totalsByCampaign)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, spend]) => ({
        key: id,
        label: campaignName[id] || id,
        fullLabel: campaignName[id] || id,
        value: spend,
        display: money(spend, activeCurrency),
      }));
  }, [byCurrency, activeCurrency, campaignName]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await runMetaAdsSync();
      loadData();
    } catch {
      // Handled in loadData
    } finally {
      setSyncing(false);
    }
  };

  const hasLinkClicks = totals.linkClicks > 0;
  const ctrLabel = hasLinkClicks ? "CTR (link)" : "CTR (all)";
  const ctrValue = totals.impressions
    ? `${(((hasLinkClicks ? totals.linkClicks : totals.clicks) / totals.impressions) * 100).toFixed(2)}%`
    : "—";

  return (
    <div className="kmkt-overview">
      {/* 1. Needs Attention Banner */}
      <NeedsAttentionBanner
        campaigns={campaigns}
        accounts={accounts}
        latestSync={syncRuns[0] || null}
        onReview={onViewChange}
      />

      {/* 2. Multi-currency selector if more than 1 currency */}
      {currencies.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 6px" }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-3)" }}>Currency:</span>
          <div className="kmkt-segmented" role="tablist" aria-label="Currencies">
            {currencies.map((c) => (
              <button
                key={c}
                type="button"
                className={`kmkt-segmented-btn ${activeCurrency === c ? "is-active" : ""}`}
                onClick={() => setSelectedCurrency(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {/* 3. Loading Skeletons */}
      {loading && insights.length === 0 && (
        <>
          <div className="kmkt-kpi-row">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="kmkt-skel-kpi">
                <div className="kmkt-skel-bar" style={{ width: "45%", height: 10 }} />
                <div className="kmkt-skel-bar" style={{ width: "75%", height: 22 }} />
              </div>
            ))}
          </div>
          <Card>
            <div style={{ padding: "40px 0", textAlign: "center" }} className="kmkt-muted">
              Loading Meta Ads overview…
            </div>
          </Card>
        </>
      )}

      {/* 4. Unified Honest Empty State */}
      {!loading && insights.length === 0 && (
        <Card>
          <div style={{ textAlign: "center", padding: "24px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)" }}>
              No Meta Ads data for {range.dateFrom ? `${formatShortDate(range.dateFrom)} – ${formatShortDate(range.dateTo)}` : "the selected range"}.
              {dataStartsNotice ? ` (${dataStartsNotice})` : ""}
            </p>
            <Btn kind="outline" size="sm" onClick={handleSyncNow} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync now"}
            </Btn>
          </div>
        </Card>
      )}

      {/* 5. Loaded Content */}
      {insights.length > 0 && (
        <>
          {/* StatStrip KPI Row */}
          <div className="kmkt-kpi-row">
            <KPI label="Spend" value={money(totals.spend, activeCurrency)} />
            <KPI
              label="Results"
              value={roundAmount(totals.results).toLocaleString()}
              deltaLabel={totals.results > 0 ? "per campaign objective" : undefined}
            />
            <KPI
              label="Cost / result"
              value={totals.results > 0 ? money(totals.spend / totals.results, activeCurrency) : "—"}
            />
            <KPI
              label={hasLinkClicks ? "Link clicks" : "Clicks"}
              value={roundAmount(hasLinkClicks ? totals.linkClicks : totals.clicks).toLocaleString()}
            />
            <KPI label={ctrLabel} value={ctrValue} />
            <KPI label="Impressions" value={roundAmount(totals.impressions).toLocaleString()} />
          </div>

          {/* 2-Column Grid on Desktop: Daily spend & Spend by campaign */}
          <div className="kmkt-grid-charts">
            <Card pad={true}>
              <ChartFrame
                title="Daily spend"
                metrics={METRICS}
                metric={metric}
                onMetricChange={setMetric}
                dates={trend.dates}
                data={trend.data}
                currency={activeCurrency}
                dataStartsNotice={dataStartsNotice}
              />
            </Card>

            <Card title="Spend by campaign" pad={true}>
              <BarList
                rows={spendByCampaignRows}
                rank
                empty="No campaign spend in this range."
              />
            </Card>
          </div>

          {/* Top Ads with Creative Thumbnails */}
          <Card title="Top ads" sub="Ranked by spend in this range">
            {topAds.length > 0 ? (
              <div className="kmkt-table-scroll">
                <table className="ktable">
                  <thead>
                    <tr>
                      <th>Ad</th>
                      <th>Campaign</th>
                      <th className="kmkt-num">Spend</th>
                      <th className="kmkt-num">Clicks</th>
                      <th className="kmkt-num">Impressions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topAds.map((a) => (
                      <tr key={a.adId}>
                        <td>
                          <div className="kmkt-topad-cell">
                            {a.creativeThumbnailUrl ? (
                              <img
                                src={a.creativeThumbnailUrl}
                                alt=""
                                className="kmkt-ad-thumb"
                                loading="lazy"
                              />
                            ) : (
                              <div className="kmkt-ad-thumb-placeholder">
                                <Icons.Image size={15} />
                              </div>
                            )}
                            <span className="kmkt-topad-name" title={a.adName}>
                              {a.adName}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="kmkt-topad-campaign" title={a.campaignName}>
                            {a.campaignName}
                          </span>
                        </td>
                        <td className="mono kmkt-num">{money(a.spend, a.currency)}</td>
                        <td className="mono kmkt-num">{roundAmount(a.clicks).toLocaleString()}</td>
                        <td className="mono kmkt-num">{roundAmount(a.impressions).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="kmkt-muted">Nothing synced for this range yet.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
