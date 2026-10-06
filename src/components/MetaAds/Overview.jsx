import { useEffect, useMemo, useState } from "react";
import { Card, KPI, Pill } from "../ui";
import { AreaChart, Bars } from "../viz";
import { roundAmount } from "../../utils/format";
import { fetchCampaignInsights, fetchCampaigns, fetchTopAds } from "../../lib/metaAds";
import DateRangePicker, { isoDaysAgo } from "./DateRangePicker";
import { money, currencySymbol } from "./money";

const METRICS = [
  { id: "spend", label: "Spend" },
  { id: "clicks", label: "Clicks" },
  { id: "impressions", label: "Impressions" },
];

/**
 * Objective-based result counting: matches the campaign's stated goal to the
 * right action in Meta's actions array, rather than summing all overlapping
 * events (which double-counted link clicks inside post engagements).
 */
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
    // Awareness campaigns aim for impressions, not a discrete conversion result
    return 0;
  } else {
    // Fallback: search standard high-intent conversion types in priority order
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

export default function Overview({ range: propRange }) {
  const [internalRange, setInternalRange] = useState({ dateFrom: isoDaysAgo(30), dateTo: isoDaysAgo(0) });
  const range = propRange || internalRange;
  const setRange = setInternalRange;
  const [insights, setInsights] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [topAds, setTopAds] = useState([]);
  const [metric, setMetric] = useState("spend");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      fetchCampaignInsights(range.dateFrom, range.dateTo),
      fetchCampaigns(),
      fetchTopAds(range.dateFrom, range.dateTo, 8),
    ])
      .then(([i, c, t]) => {
        if (!alive) return;
        setInsights(i);
        setCampaigns(c);
        setTopAds(t);
      })
      .catch((e) => alive && setError(e.message || "Couldn't load Meta Ads data."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [range.dateFrom, range.dateTo]);

  // Campaign objective map for result attribution
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

  // Ad spend can only ever be summed within one currency — Meta doesn't
  // convert across ad accounts. Group by currency rather than silently
  // blending; in practice there is almost always exactly one group.
  const byCurrency = useMemo(() => {
    const groups = {};
    for (const r of insights) {
      const cur = r.currency || "?";
      (groups[cur] ||= []).push(r);
    }
    return groups;
  }, [insights]);
  const currencies = Object.keys(byCurrency);
  const primaryCurrency = currencies[0] || "USD";

  const totals = useMemo(() => {
    const rows = byCurrency[primaryCurrency] || [];
    return {
      spend: rows.reduce((s, r) => s + Number(r.spend || 0), 0),
      clicks: rows.reduce((s, r) => s + Number(r.clicks || 0), 0),
      impressions: rows.reduce((s, r) => s + Number(r.impressions || 0), 0),
      results: rows.reduce((s, r) => s + countCampaignResults(r.conversions, campaignObjective[r.campaignId]), 0),
    };
  }, [byCurrency, primaryCurrency, campaignObjective]);

  // Per-day trend for the picked metric, zero-filling missing dates evenly.
  const trend = useMemo(() => {
    const rows = byCurrency[primaryCurrency] || [];
    const byDate = {};
    for (const r of rows) byDate[r.date] = (byDate[r.date] || 0) + Number(r[metric] || 0);
    const dateRangeList = getDaysList(range.dateFrom, range.dateTo);
    const dates = dateRangeList.length > 0 ? dateRangeList : Object.keys(byDate).sort();
    return { dates, data: dates.map((d) => byDate[d] || 0) };
  }, [byCurrency, primaryCurrency, metric, range.dateFrom, range.dateTo]);

  // Spend by campaign, primary currency only, top 8.
  const spendByCampaign = useMemo(() => {
    const rows = byCurrency[primaryCurrency] || [];
    const totalsByCampaign = {};
    for (const r of rows) totalsByCampaign[r.campaignId] = (totalsByCampaign[r.campaignId] || 0) + Number(r.spend || 0);
    return Object.entries(totalsByCampaign)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, spend]) => ({ id, name: campaignName[id] || id, spend }));
  }, [byCurrency, primaryCurrency, campaignName]);

  const symbol = currencySymbol(primaryCurrency);

  return (
    <div className="kmkt-overview">
      {(!propRange || currencies.length > 1) && (
        <div className="kmkt-overview-head">
          {!propRange && <DateRangePicker dateFrom={range.dateFrom} dateTo={range.dateTo} onChange={setRange} />}
          {currencies.length > 1 && (
            <Pill tone="terra">
              {currencies.length} currencies in this range — showing {primaryCurrency} only
            </Pill>
          )}
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {loading && insights.length === 0 && (
        <Card>
          <p className="kmkt-muted">Loading overview data…</p>
        </Card>
      )}

      {!loading && insights.length === 0 && !error && (
        <Card>
          <p className="kmkt-muted">
            No synced data for this range yet. Run a sync from the Settings tab, or widen the date range.
          </p>
        </Card>
      )}

      {insights.length > 0 && (
        <>
          <div className="kmkt-kpi-row">
            <KPI label="Spend" value={money(totals.spend, primaryCurrency)} />
            <KPI label="Impressions" value={roundAmount(totals.impressions).toLocaleString()} />
            <KPI label="Clicks" value={roundAmount(totals.clicks).toLocaleString()} />
            <KPI
              label="CTR (all)"
              value={totals.impressions ? ((totals.clicks / totals.impressions) * 100).toFixed(2) + "%" : "—"}
            />
            <KPI
              label="Cost / result"
              value={totals.results > 0 ? money(totals.spend / totals.results, primaryCurrency) : "—"}
              deltaLabel={totals.results > 0 ? `${roundAmount(totals.results).toLocaleString()} results` : undefined}
            />
          </div>

          <Card
            title="Trend"
            action={
              <div className="kmkt-metric-pick">
                {METRICS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={m.id === metric ? "is-on" : ""}
                    onClick={() => setMetric(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            }
          >
            {trend.dates.length > 0 ? (
              <AreaChart
                series={[{ label: METRICS.find((m) => m.id === metric)?.label, data: trend.data, color: "var(--mint-deep)" }]}
                dates={trend.dates}
                valuePrefix={metric === "spend" ? symbol : ""}
              />
            ) : (
              <p className="kmkt-muted">Nothing to chart yet.</p>
            )}
          </Card>

          <Card title="Spend by campaign">
            {spendByCampaign.length > 0 ? (
              <Bars
                data={spendByCampaign.map((c) => roundAmount(c.spend))}
                labels={spendByCampaign.map((c) => c.name)}
              />
            ) : (
              <p className="kmkt-muted">Nothing to chart yet.</p>
            )}
          </Card>

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
                        <td>{a.adName}</td>
                        <td>{a.campaignName}</td>
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
