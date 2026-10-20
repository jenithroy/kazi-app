/**
 * Meta Ads, Overview: what was spent, what it got, and where the money went, for the date range, on one screen.
 *
 *   top row   spend, results, cost per result, click-through rate
 *   left      a daily trend of one metric at a time (spend, messages, comments, leads, clicks, impressions, all results) and,
 *             under it, what people did (messages, comments, instant-form leads, reactions) with what each cost
 *   right     the campaigns that took the most, and the top ads with their pictures
 *
 * Amounts are in the ad account's own currency, exactly (a $0.42 cost per result must not round to a dollar); where the rows are in
 * more than one currency a switch above the grid picks which is shown, since they cannot be added together. The sums are lib/metaCalc.js;
 * this view reads, keeps what is chosen and draws.
 */
import { useMemo, useState } from "react";
import { Icons } from "../ui";
import { BentoGrid, EmptyNote, Tile } from "../bento/Bento";
import { Trend } from "../bento/charts";
import { Layers, TrendUp } from "../bento/icons";
import Select from "../Select";
import { Seg } from "../EditCard";
import { Kpi, LoadError, NONE, Notice, Thumb, ico, num } from "./Common";
import useMetaLoad from "../../hooks/useMetaLoad";
import { fetchCampaignInsights, fetchCampaigns, fetchTopAds } from "../../lib/metaAds";
import { money } from "../../lib/metaMoney";
import {
  METRICS, attentionOf, ctrOf, dataStarts, earliestDate, fmtShort, groupByCurrency, pickCurrency, rangeWords, spendByCampaign, summarizeEngagement, totalsOf, trendOf,
} from "../../lib/metaCalc";

/** The three reads the view needs. The insights are the page; the other two may fail without taking it down (what failed is said). */
async function load(range) {
  const from = range.dateFrom || null;
  const to = range.dateTo || null;
  const [ins, camps, top] = await Promise.allSettled([fetchCampaignInsights(from, to), fetchCampaigns(), fetchTopAds(from, to, 8)]);
  if (ins.status === "rejected") throw ins.reason;
  const lost = [];
  if (camps.status === "rejected") lost.push("the campaigns");
  if (top.status === "rejected") lost.push("the top ads");
  return {
    insights: ins.value || [],
    campaigns: camps.status === "fulfilled" ? camps.value || [] : [],
    topAds: top.status === "fulfilled" ? top.value || [] : [],
    lost,
  };
}

export default function OverviewView({ range, core, tick, go, onSync, syncing }) {
  const about = `${range.dateFrom}|${range.dateTo}`;
  const { data, status, error, stale, refreshing, reload } = useMetaLoad(() => load(range), `${about}|${tick}`, about);
  const [metric, setMetric] = useState("spend");
  const [chosen, setChosen] = useState(null);
  const loading = status === "loading";

  const insights = data?.insights || NONE;
  const campaigns = data?.campaigns || NONE;
  const topAds = data?.topAds || NONE;

  const objective = useMemo(() => Object.fromEntries(campaigns.map((c) => [c.id, c.objective])), [campaigns]);
  const names = useMemo(() => Object.fromEntries(campaigns.map((c) => [c.id, c.name])), [campaigns]);
  const groups = useMemo(() => groupByCurrency(insights), [insights]);
  const currencies = Object.keys(groups);
  const cur = pickCurrency(groups, chosen);
  const rows = groups[cur] || NONE;

  const totals = useMemo(() => totalsOf(rows, objective), [rows, objective]);
  const ctr = ctrOf(totals);
  const engagement = useMemo(() => summarizeEngagement(rows), [rows]);
  const starts = dataStarts(earliestDate(insights), range.dateFrom);
  const trend = useMemo(() => trendOf(rows, metric, range, objective), [rows, metric, range, objective]);
  const shares = useMemo(() => spendByCampaign(rows, names, 8), [rows, names]);
  const shareMax = Math.max(1, ...shares.map((s) => s.spend));
  const issues = useMemo(() => attentionOf({ campaigns, accounts: core.accounts, latestSync: core.runs[0] || null }), [campaigns, core.accounts, core.runs]);

  const fmtMetric = (v) => (metric === "spend" ? money(v, cur) : num(v));
  const metricLabel = METRICS.find((m) => m.id === metric)?.label || metric;

  if (status === "error") return <LoadError what="Meta Ads" onRetry={reload} busy={refreshing} />;

  // nothing in this range at all: say so, and offer the one thing that can fix it
  if (!loading && insights.length === 0) {
    return (
      <>
        {issues.length > 0 && <Notice tone="warn" action={{ label: "Review →", onClick: () => go("campaigns") }}><b>Needs attention:</b> {issues.join(" · ")}</Notice>}
        <BentoGrid layout="ma-one">
          <Tile area="one" title="Overview" icon={<Icons.Marketing {...ico} />} align="center">
            <EmptyNote icon={<Icons.Marketing size={22} sw={1.5} />}>
              No Meta Ads data for {range.dateFrom ? rangeWords(range) : "the selected range"}.{starts ? ` (${starts})` : ""}
            </EmptyNote>
            <div className="ma-empty-act">
              <button type="button" className="kb-btn kb-btn--ghost" onClick={onSync} disabled={syncing}>{syncing ? "Syncing…" : "Sync now"}</button>
            </div>
          </Tile>
        </BentoGrid>
      </>
    );
  }

  return (
    <>
      {issues.length > 0 && <Notice tone="warn" action={{ label: "Review →", onClick: () => go("campaigns") }}><b>Needs attention:</b> {issues.join(" · ")}</Notice>}
      {data?.lost.length > 0 && <Notice tone="warn">Could not load {data.lost.join(" and ")}, so {data.lost.length > 1 ? "they are" : "it is"} missing below.</Notice>}
      {stale && <Notice tone="warn" action={{ label: refreshing ? "Trying…" : "Try again", onClick: reload, disabled: refreshing }}>Could not refresh just now. This is what was loaded last.</Notice>}
      {currencies.length > 1 && (
        <div className="ma-cur">
          <span>Currency</span>
          <Seg value={cur} onChange={setChosen} options={currencies.map((c) => [c, c])} label="Currency shown" />
        </div>
      )}

      <BentoGrid layout="ma-over">
        <Kpi area="sp" title="Spend" icon={<Icons.Wallet {...ico} />} loading={loading} value={money(totals.spend, cur)} sub={`${rangeWords(range)}${starts ? ` · ${starts}` : ""}`} />
        <Kpi area="res" title="Results" icon={<Icons.Check {...ico} />} loading={loading} value={num(totals.results)} sub={totals.results > 0 ? "per campaign objective" : "none in this range"} />
        <Kpi area="cpr" title="Cost per result" icon={<Icons.Alert {...ico} />} loading={loading} value={totals.results > 0 ? money(totals.spend / totals.results, cur) : "—"} sub={totals.results > 0 ? "spend ÷ results" : "no results yet"} />
        <Kpi area="ctr" title={ctr.label} icon={<Icons.Pulse {...ico} />} loading={loading} value={ctr.value} sub={`${num(ctr.link ? totals.linkClicks : totals.clicks)} ${ctr.link ? "link clicks" : "clicks"} · ${num(totals.impressions)} seen`} />

        <Tile
          area="trd" title="Daily trend" icon={<TrendUp {...ico} />} loading={loading} align="top" className="ma-trend"
          note={<Select variant="pill" value={metric} onChange={setMetric} label="Metric shown" searchable={false} align="end" options={METRICS.map((m) => ({ value: m.id, label: m.label }))} />}
        >
          <Trend values={trend.values} labels={trend.dates.map(fmtShort)} format={fmtMetric} empty="Not enough days to draw a line." />
          <p className="ma-sr" role="status">{metricLabel}, {trend.dates.length} days.</p>
        </Tile>

        <Tile area="brt" title="What people did" icon={<Icons.Message {...ico} />} loading={loading} align="top" className="ma-brought">
          <dl className="ma-fig4">
            <div><dt>Messages</dt><dd><b>{num(engagement.messages)}</b><small>{engagement.costPerMessage ? `${money(engagement.costPerMessage, cur)} each` : "direct chats"}</small></dd></div>
            <div><dt>Comments</dt><dd><b>{num(engagement.comments)}</b><small>{engagement.costPerComment ? `${money(engagement.costPerComment, cur)} each` : "on ad posts"}</small></dd></div>
            <div><dt>Leads</dt><dd><b>{num(engagement.leads)}</b><small>{engagement.costPerLead ? `${money(engagement.costPerLead, cur)} each` : "instant forms"}</small></dd></div>
            <div><dt>Reactions</dt><dd><b>{num(engagement.reactions)}</b><small>likes and loves</small></dd></div>
          </dl>
        </Tile>

        <Tile area="camp" title="Spend by campaign" icon={<Layers {...ico} />} loading={loading} align="top" onOpen={() => go("campaigns")} label="Open Campaigns" className="ma-shares-tile">
          {shares.length > 0 ? (
            <ul className="kb-list kb-fill ma-shares">
              {shares.map((s) => (
                <li key={s.id} style={{ "--p": `${(s.spend / shareMax) * 100}%` }}>
                  <span title={s.name}>{s.name}</span>
                  <b>{money(s.spend, cur)}</b>
                </li>
              ))}
            </ul>
          ) : <EmptyNote icon={<Layers size={20} sw={1.5} />}>No campaign spend in this range.</EmptyNote>}
        </Tile>

        <Tile area="top" title="Top ads" icon={<Icons.Image {...ico} />} note="by spend" loading={loading} align="top" className="ma-ads-tile">
          {topAds.length > 0 ? (
            <ul className="kb-list kb-fill ma-ads">
              {topAds.map((a) => (
                <li key={a.adId}>
                  <Thumb url={a.creativeThumbnailUrl} />
                  <span className="ma-ad-t"><b title={a.adName}>{a.adName}</b><span title={a.campaignName}>{a.campaignName}</span></span>
                  <span className="ma-ad-n"><b>{money(a.spend, a.currency)}</b><span>{num(a.clicks)} clicks</span></span>
                </li>
              ))}
            </ul>
          ) : <EmptyNote icon={<Icons.Image size={20} sw={1.5} />}>{data?.lost.includes("the top ads") ? "Top ads could not be read." : "Nothing synced for this range yet."}</EmptyNote>}
        </Tile>
      </BentoGrid>
      {error && !stale && <p className="ma-sr" role="alert">{error}</p>}
    </>
  );
}
