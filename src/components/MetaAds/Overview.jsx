import { useEffect, useMemo, useState } from "react";
import { Card, KPI, Pill } from "../ui";
import { AreaChart, Bars } from "../viz";
import { asCurrency, roundAmount } from "../../utils/format";
import { fetchCampaignInsights, fetchCampaigns, fetchTopAds } from "../../lib/metaAds";
import DateRangePicker, { isoDaysAgo } from "./DateRangePicker";

const METRICS = [
  { id: "spend", label: "Spend" },
  { id: "clicks", label: "Clicks" },
  { id: "impressions", label: "Impressions" },
  { id: "reach", label: "Reach" },
];

const CURRENCY_SYMBOL = (code) => {
  try {
    return (0).toLocaleString(undefined, { style: "currency", currency: code, minimumFractionDigits: 0 }).replace(/\d/g, "").trim() || code;
  } catch {
    return code;
  }
};

function sumConversions(rows) {
  let total = 0;
  for (const r of rows) {
    for (const a of r.conversions || []) total += Number(a.value) || 0;
  }
  return total;
}

export default function Overview() {
  const [range, setRange] = useState({ dateFrom: isoDaysAgo(30), dateTo: isoDaysAgo(0) });
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
      reach: rows.reduce((s, r) => s + Number(r.reach || 0), 0),
      conversions: sumConversions(rows),
    };
  }, [byCurrency, primaryCurrency]);

  const campaignName = useMemo(() => {
    const map = {};
    for (const c of campaigns) map[c.id] = c.name;
    return map;
  }, [campaigns]);

  // Per-day trend for the picked metric, primary currency only.
  const trend = useMemo(() => {
    const rows = byCurrency[primaryCurrency] || [];
    const byDate = {};
    for (const r of rows) byDate[r.date] = (byDate[r.date] || 0) + Number(r[metric] || 0);
    const dates = Object.keys(byDate).sort();
    return { dates, data: dates.map((d) => byDate[d]) };
  }, [byCurrency, primaryCurrency, metric]);

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

  const symbol = CURRENCY_SYMBOL(primaryCurrency);

  return (
    <div className="kmkt-overview">
      <div className="kmkt-overview-head">
        <DateRangePicker dateFrom={range.dateFrom} dateTo={range.dateTo} onChange={setRange} />
        {currencies.length > 1 && (
          <Pill tone="terra">
            {currencies.length} currencies in this range — showing {primaryCurrency} only
          </Pill>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {!loading && insights.length === 0 && !error && (
        <Card>
          <p className="kmkt-muted">
            No synced data for this range yet. Run a sync from the Settings tab, or widen the date range.
          </p>
        </Card>
      )}

      <div className="kmkt-kpi-row">
        <KPI label="Spend" value={asCurrency(totals.spend, primaryCurrency)} />
        <KPI label="Impressions" value={roundAmount(totals.impressions).toLocaleString()} />
        <KPI label="Clicks" value={roundAmount(totals.clicks).toLocaleString()} />
        <KPI
          label="CTR"
          value={totals.impressions ? ((totals.clicks / totals.impressions) * 100).toFixed(2) + "%" : "—"}
        />
        <KPI label="Reach" value={roundAmount(totals.reach).toLocaleString()} />
        <KPI
          label="Cost / result"
          value={totals.conversions ? asCurrency(totals.spend / totals.conversions, primaryCurrency) : "—"}
          deltaLabel={`${roundAmount(totals.conversions).toLocaleString()} results (all actions)`}
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
          <table className="ktable">
            <thead>
              <tr>
                <th>Ad</th>
                <th>Campaign</th>
                <th>Spend</th>
                <th>Clicks</th>
                <th>Impressions</th>
              </tr>
            </thead>
            <tbody>
              {topAds.map((a) => (
                <tr key={a.adId}>
                  <td>{a.adName}</td>
                  <td>{a.campaignName}</td>
                  <td className="mono">{asCurrency(a.spend, a.currency)}</td>
                  <td className="mono">{roundAmount(a.clicks).toLocaleString()}</td>
                  <td className="mono">{roundAmount(a.impressions).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="kmkt-muted">Nothing synced for this range yet.</p>
        )}
      </Card>
    </div>
  );
}
