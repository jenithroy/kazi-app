/**
 * Meta Ads, Activity: two lists side by side. The change log is every real-money edit made from this app (a pause, a resume, a budget
 * change), who made it and when, searchable and filterable by level; the sync history is each time the data was pulled from Meta, how it
 * went, and, when it failed, why and what to do. The Campaigns card's History button lands here with that campaign, ad set or ad filtered.
 *
 * A budget is written in the currency of the account the thing belongs to (the old log wrote every budget in dollars); where that cannot
 * be told (an ad set or ad whose account is not known here) the figure is shown bare rather than with the wrong symbol.
 */
import { useMemo, useState } from "react";
import { Icons } from "../ui";
import { BentoGrid, EmptyNote, Tile } from "../bento/Bento";
import DataTable from "../table/DataTable";
import { FilterChips, SearchBox } from "../table/Bar";
import { LoadError, NONE, Notice, ico, plural } from "./Common";
import useMetaLoad from "../../hooks/useMetaLoad";
import { fetchCampaigns, fetchRecentActions, fetchSyncRuns } from "../../lib/metaAds";
import { SYNC_STATUS, describeAction, duration, errorHint, filterActions, formatDateTime, newestFirst, pagingCapped, timeAgo, whenShort } from "../../lib/metaCalc";

/** The latest changes, or, with an `entityId` (the card's History button), that one thing's own changes asked of the server: picking them out of the latest 50 lost any change older than that. */
async function load(entityId) {
  const [acts, runs, camps] = await Promise.allSettled([fetchRecentActions(entityId ? 200 : 50, entityId), fetchSyncRuns(), fetchCampaigns()]);
  if (acts.status === "rejected" && runs.status === "rejected") throw acts.reason;
  return {
    actions: acts.status === "fulfilled" ? newestFirst(acts.value || [], "createdAt") : [],
    runs: runs.status === "fulfilled" ? newestFirst(runs.value || [], "startedAt") : [],
    campaigns: camps.status === "fulfilled" ? camps.value || [] : [],
    lost: [acts.status === "rejected" && "the change log", runs.status === "rejected" && "the sync history"].filter(Boolean),
  };
}

const LEVELS = [{ value: "all", label: "All" }, { value: "campaign", label: "Campaigns" }, { value: "adset", label: "Ad sets" }, { value: "ad", label: "Ads" }];

export default function ActivityView({ core, tick, params, clearEntity }) {
  const entityId = params.get("entityId") || "";
  const { data, status, stale, refreshing, reload } = useMetaLoad(() => load(entityId), `${tick}|${entityId}`, entityId);
  const loading = status === "loading";
  const [text, setText] = useState(() => params.get("entityId") || params.get("entity") || "");
  const [level, setLevel] = useState("all");

  const actions = data?.actions || NONE;
  const runs = data?.runs || NONE;

  // the account a campaign belongs to gives the currency its budget was written in; ad sets and ads are not read here
  const currencyBy = useMemo(() => Object.fromEntries(core.accounts.map((a) => [a.id, a.currency])), [core.accounts]);
  const campaignCurrency = useMemo(() => Object.fromEntries((data?.campaigns || []).map((c) => [c.id, currencyBy[c.adAccountId]])), [data, currencyBy]);
  const only = [...new Set(Object.values(currencyBy).filter(Boolean))];
  const currencyOf = (a) => (a.entityLevel === "campaign" ? campaignCurrency[a.entityId] : "") || (only.length === 1 ? only[0] : "");

  const shown = useMemo(() => filterActions(actions, { text, level }), [actions, text, level]);
  const narrowed = Boolean(text) || level !== "all";

  const logColumns = useMemo(() => [
    {
      id: "when", label: "When", width: 132,
      render: (a) => <span className="dt-two-t"><b>{timeAgo(a.createdAt)}</b><span title={formatDateTime(a.createdAt)}>{whenShort(a.createdAt)}</span></span>,
    },
    { id: "level", label: "Level", width: 92, drop: 2, render: (a) => <span className="kb-tag ma-cap">{a.entityLevel === "adset" ? "Ad set" : a.entityLevel || "item"}</span> },
    {
      id: "what", label: "Activity", grow: true, min: 220, max: 560,
      render: (a) => {
        const d = describeAction(a, currencyOf);
        return (
          <span className="ma-sentence">
            <b>{d.who}</b> {d.verb} <em>{d.what}</em>
            {d.budget && <>’s {d.budget.label} {d.budget.before} → {d.budget.after}{d.budget.over && <span className="ma-over"> · confirmed over the multiple</span>}</>}
          </span>
        );
      },
    },
  ], [campaignCurrency, currencyBy]);                                          // eslint-disable-line react-hooks/exhaustive-deps

  const runColumns = useMemo(() => [
    { id: "when", label: "Started", width: 132, render: (r) => <span className="dt-two-t"><b>{timeAgo(r.startedAt)}</b><span title={formatDateTime(r.startedAt)}>{whenShort(r.startedAt)}</span></span> },
    {
      id: "status", label: "Status", width: 118,
      render: (r) => { const s = SYNC_STATUS[r.status] || { label: r.status, tone: "" }; return <span className={`kb-tag${s.tone ? ` kb-tag--${s.tone}` : ""}`}>{s.label}</span>; },
    },
    {
      id: "note", label: "Notes", grow: true, min: 160, max: 360,
      render: (r) => {
        const hint = errorHint(r.errorMessage);
        return (
          <span className="dt-two-t">
            <b>{r.triggerType === "manual" ? `Manual (${r.triggeredByName || "staff"})` : "Scheduled"}</b>
            {r.errorMessage ? <span className="ma-bad" title={r.errorMessage}>{r.errorMessage}{hint ? ` ${hint}` : ""}</span>
              : pagingCapped(r) ? <span>Hit the paging cap: data may be incomplete</span>
              : <span title="Campaigns, ad sets, ads, insight rows">{r.campaignsSynced}C · {r.adsetsSynced}AS · {r.adsSynced}A{r.insightRowsSynced ? ` · ${r.insightRowsSynced}I` : ""}</span>}
          </span>
        );
      },
    },
    { id: "dur", label: "Took", width: 76, align: "end", drop: 1, render: (r) => <span className="dt-num">{duration(r.startedAt, r.finishedAt)}</span> },
  ], []);

  if (status === "error") return <LoadError what="Activity" onRetry={reload} busy={refreshing} />;

  return (
    <>
      {data?.lost.length > 0 && <Notice tone="warn">Could not load {data.lost.join(" and ")}.</Notice>}
      {stale && <Notice tone="warn" action={{ label: refreshing ? "Trying…" : "Try again", onClick: reload, disabled: refreshing }}>Could not refresh just now. This is what was loaded last.</Notice>}

      <BentoGrid layout="ma-act">
        <Tile area="log" title="Change log" icon={<Icons.Edit {...ico} />} align="top" className="ma-pane" note={loading ? undefined : narrowed ? `${shown.length} of ${actions.length}` : `${actions.length} ${plural(actions.length, "change")}`}>
          <p className="ma-sub">Real-money edits made from this app: pauses, resumes and budget changes.</p>
          <div className="ma-tools">
            <SearchBox value={text} onChange={(v) => { setText(v); if (entityId && v !== entityId) clearEntity(); }} placeholder="Filter by name, id or person" label="Filter the change log by name, id or person" />
            <FilterChips label="Level" value={level} onChange={setLevel} options={LEVELS} />
          </div>
          {!loading && shown.length === 0 ? (
            <div className="dt-empty"><EmptyNote icon={<Icons.Edit size={22} sw={1.5} />}>{actions.length === 0 ? "No real-money edits recorded yet." : "No changes match that."}</EmptyNote></div>
          ) : (
            <DataTable label="Change log" rows={shown} rowKey={(a) => a.id} columns={logColumns} loading={loading} focusBody />
          )}
        </Tile>

        <Tile area="runs" title="Sync history" icon={<Icons.RefreshCw {...ico} />} align="top" className="ma-pane" note={loading ? undefined : `${runs.length} ${plural(runs.length, "run")}`}>
          <p className="ma-sub">Each time the data was pulled from Meta, by schedule or by hand.</p>
          {!loading && runs.length === 0 ? (
            <div className="dt-empty"><EmptyNote icon={<Icons.RefreshCw size={22} sw={1.5} />}>No sync runs recorded yet.</EmptyNote></div>
          ) : (
            <DataTable label="Sync history" rows={runs} rowKey={(r) => r.id} columns={runColumns} loading={loading} focusBody />
          )}
        </Tile>
      </BentoGrid>
    </>
  );
}
