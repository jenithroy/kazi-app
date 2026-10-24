/**
 * Meta Ads, Activity: two lists side by side. The change log is every real-money edit made from this app (a pause, a resume, a budget
 * change), who made it and when, with a search and the Filters button (components/filters: level, what was done, who, what was
 * changed, the day, and whether it was confirmed over the limit); the sync history is each time the data was pulled from Meta, how it
 * went, and, when it failed, why and what to do. The Campaigns card's History button lands here with that campaign, ad set or ad filtered.
 *
 * A budget is written in the currency of the account the thing belongs to (the old log wrote every budget in dollars); where that cannot
 * be told (an ad set or ad whose account is not known here) the figure is shown bare rather than with the wrong symbol.
 */
import { useMemo, useState } from "react";
import { Icons } from "../ui";
import { BentoGrid, EmptyNote, Tile } from "../bento/Bento";
import DataTable from "../table/DataTable";
import { FindBar } from "../filters/FilterMenu";
import useFilters from "../filters/useFilters";
import PersonLink from "../profile/PersonLink";
import { LoadError, NONE, Notice, ico, plural } from "./Common";
import useMetaLoad from "../../hooks/useMetaLoad";
import { fetchCampaigns, fetchRecentActions, fetchSyncRuns } from "../../lib/metaAds";
import { kathmanduDate } from "../../utils/date";
import { SYNC_STATUS, describeAction, duration, errorHint, filterActions, fmtShort, formatDateTime, newestFirst, pagingCapped, timeAgo, whenShort } from "../../lib/metaCalc";

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
const DONE = [{ value: "any", label: "Any" }, { value: "pause", label: "Paused" }, { value: "resume", label: "Resumed" }, { value: "budget_edit", label: "Budget changed" }];
/** The office's day (Kathmandu) a change was made, or "" when the log has no time for it. */
const dayMade = (a) => (a.createdAt && !Number.isNaN(Date.parse(a.createdAt)) ? kathmanduDate(a.createdAt) : "");

export default function ActivityView({ core, tick, params, clearEntity }) {
  const entityId = params.get("entityId") || "";
  const { data, status, stale, refreshing, reload } = useMetaLoad(() => load(entityId), `${tick}|${entityId}`, entityId);
  const loading = status === "loading";
  const [text, setText] = useState(() => params.get("entityId") || params.get("entity") || "");

  const actions = data?.actions || NONE;
  const runs = data?.runs || NONE;

  // the account a campaign belongs to gives the currency its budget was written in; ad sets and ads are not read here
  const currencyBy = useMemo(() => Object.fromEntries(core.accounts.map((a) => [a.id, a.currency])), [core.accounts]);
  const campaignCurrency = useMemo(() => Object.fromEntries((data?.campaigns || []).map((c) => [c.id, currencyBy[c.adAccountId]])), [data, currencyBy]);
  const only = [...new Set(Object.values(currencyBy).filter(Boolean))];
  const currencyOf = (a) => (a.entityLevel === "campaign" ? campaignCurrency[a.entityId] : "") || (only.length === 1 ? only[0] : "");

  // The search is this list's own; everything else that narrows the change log is in the Filters panel (components/filters). The level
  // choice narrows exactly as the old chips did.
  const searched = useMemo(() => filterActions(actions, { text, level: "all" }), [actions, text]);
  const filterDefs = useMemo(() => {
    // an older line that carries only a name is the same person as a newer one with their id, unless two people share the name
    const idByName = new Map();
    actions.forEach((a) => { if (a.personId && a.personName) idByName.set(a.personName, idByName.has(a.personName) && idByName.get(a.personName) !== a.personId ? null : a.personId); });
    const who = (a) => a.personId || idByName.get(a.personName) || a.personName || "";
    const names = new Map();
    actions.forEach((a) => { const k = who(a); if (k && !names.get(k)) names.set(k, a.personName || k); });
    const kinds = new Set(actions.map((a) => a.action).filter(Boolean));
    const thing = (a) => a.entityName || a.entityId || "";
    return [
      { id: "level", label: "Level", kind: "chips", test: (a, v) => a.entityLevel === v, options: LEVELS },
      ...(kinds.size > 1 ? [{ id: "done", label: "What was done", kind: "chips", test: (a, v) => a.action === v, options: DONE }] : []),
      ...(names.size > 1 ? [{ id: "who", label: "Who", kind: "select", of: who, nameOf: (k) => names.get(k) || k, any: "Anyone", none: "Not recorded" }] : []),
      // the campaign, ad set or ad itself, named as the log's own sentences name it: everything done to one thing
      ...(new Set(actions.map(thing).filter(Boolean)).size > 1 ? [{ id: "thing", label: "What was changed", kind: "select", of: thing, any: "Anything", none: "Not recorded" }] : []),
      { id: "when", label: "Changed between", kind: "dates", get: dayMade, show: fmtShort, pill: "Changed" },
      { id: "over", label: "Confirmed over the limit", kind: "toggle", pill: "Over the limit", test: (a) => Boolean(a.confirmedOverCeiling) },
    ];
  }, [actions]);
  const tf = useFilters(filterDefs, searched);
  const shown = tf.rows;
  const narrowed = Boolean(text) || tf.count > 0;

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
            <b><PersonLink personId={a.personId || undefined} name={a.personName || undefined}>{d.who}</PersonLink></b> {d.verb} <em>{d.what}</em>
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
            <b>
              {r.triggerType === "manual"
                ? <PersonLink className="kpl--clip" personId={r.triggeredByPersonId || undefined} name={r.triggeredByName || undefined}>{`Manual (${r.triggeredByName || "staff"})`}</PersonLink>
                : "Scheduled"}
            </b>
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
          <div className="ma-tools fn-barrow">
            <FindBar filters={tf} value={text} onChange={(v) => { setText(v); if (entityId && v !== entityId) clearEntity(); }} placeholder="Filter by name, id or person" label="Filter the change log by name, id or person" />
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
