/**
 * Meta Ads, Campaigns: every campaign with its delivery status, budget and what it did in the date range, and the ad sets and ads
 * under it. One table in one pane: a campaign opens (chevron) into its ad sets and an ad set into its ads, and a row opens a card
 * where the real-money actions are (pause or resume it, change its budget), each asking for its own confirmation.
 *
 * The search and the Filters button (components/filters) narrow the campaigns: delivery, objective, ad account, daily budget, spend,
 * cost per inquiry, "has leads", "spent but no inquiries", and whether archived ones are listed at all. The date range is not one of
 * them: it decides which numbers are read, so it stays in the page's bar (pages/MetaAds.jsx), and the spend filters follow it.
 *
 * What was different in the old page and is deliberate here:
 *   - the numbers of an ad set or an ad are read afresh each time its parent is opened or the range changes, never added onto what was
 *     there (the old page added every re-read to the last, so after any pause or budget change the ad sets and ads showed doubled spend);
 *   - an action on Meta that went through but could not be saved or logged here is reported as done with a warning, not as a failure;
 *   - budgets cannot be changed while the budget limits (the ceiling and the confirm multiple) or the account's currency could not be read;
 *   - numbers read for one date range are never shown under another's label, and a read of the numbers that failed says so instead of
 *     showing the rows as if they had spent nothing;
 *   - switching an ad set or ad on under a campaign (or ad set) that is off shows "Paused by campaign", not "Active".
 *
 * The rules are lib/metaCalc.js, the reads lib/metaAds.js and the writes lib/metaWrites.js. This view keeps what is chosen and open.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icons, cn } from "../ui";
import { BentoGrid, EmptyNote, Tile } from "../bento/Bento";
import DataTable, { TwoLine } from "../table/DataTable";
import { FindBar } from "../filters/FilterMenu";
import useFilters from "../filters/useFilters";
import EntityCard from "./EntityCard";
import { BudgetDialog, PauseDialog } from "./ActionDialogs";
import { LoadError, Notice, StatusTag, Thumb, ico, num, plural } from "./Common";
import useMetaLoad from "../../hooks/useMetaLoad";
import {
  fetchAds, fetchAdsets, fetchCampaignInsights, fetchCampaigns, fetchEntityInsights, fetchSettings,
} from "../../lib/metaAds";
import { money, moneyMinor } from "../../lib/metaMoney";
import { campaignCounts, filterCampaigns, hasOwnBudget, metricsBy, objectiveWords, parentHold, statusOf } from "../../lib/metaCalc";
import { editBudget, pauseResume } from "../../lib/metaWrites";

const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" });

/** The reads the view starts with. The campaigns are the page; the budget limits and the numbers may fail without taking it down. */
async function loadBase(range) {
  const [camps, sets, ins] = await Promise.allSettled([fetchCampaigns(), fetchSettings(), fetchCampaignInsights(range.dateFrom || null, range.dateTo || null)]);
  if (camps.status === "rejected") throw camps.reason;
  return {
    campaigns: camps.value || [],
    settings: sets.status === "fulfilled" ? sets.value : undefined,          // undefined: could not be read (null is "there are none")
    settingsLost: sets.status === "rejected",
    insights: ins.status === "fulfilled" ? ins.value || [] : [],
    numbersLost: ins.status === "rejected",
  };
}

const KIDS = { adsets: { fetch: fetchAdsets, level: "adset", next: "ads" }, ads: { fetch: fetchAds, level: "ad" } };

export default function CampaignsView({ canEdit, range, core, tick, go, notify }) {
  const about = `${range.dateFrom}|${range.dateTo}`;                 // the numbers are about this range; the key also moves on after a sync
  const key = `${about}|${tick}`;
  const base = useMetaLoad(() => loadBase(range), key, about);
  const loading = base.status === "loading";
  const ready = base.status === "ready";

  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);              // archived campaigns are left out of the list unless asked for
  const [openC, setOpenC] = useState(() => new Set());          // campaigns opened into their ad sets
  const [openA, setOpenA] = useState(() => new Set());          // ad sets opened into their ads
  const [kids, setKids] = useState({});                         // "adsets:<campaignId>" | "ads:<adsetId>" -> { status, rows, metrics }
  const [patches, setPatches] = useState({});                   // what an action just changed, shown until the next read says the same
  const [target, setTarget] = useState(null);                   // the open card: { level, id }
  const [dialog, setDialog] = useState(null);                   // { kind: "pause" | "budget", level, id, action? }
  const [retrying, setRetrying] = useState(false);
  const seq = useRef({});
  const kidsRef = useRef(kids);
  kidsRef.current = kids;

  const currencyBy = useMemo(() => Object.fromEntries(core.accounts.map((a) => [a.id, a.currency])), [core.accounts]);
  const currencyOf = (e) => currencyBy[e.adAccountId] || "";
  const settings = base.data?.settings;
  const budgetsOpen = ready && !base.data.settingsLost;

  // what an action changed stays shown until a sync reads everything again (not when the range changes: a status has nothing to do with it):
  // where Meta did it but this page's copy could not be saved, the next read still says the old state, and showing that would invite
  // pressing the button a second time
  useEffect(() => { setPatches({}); }, [tick]);
  const withPatch = useCallback((e) => (patches[e.id] ? { ...e, ...patches[e.id] } : e), [patches]);
  const patch = (id, partial) => setPatches((p) => ({ ...p, [id]: { ...p[id], ...partial } }));

  /* ── ad sets and ads, read when their parent is opened ───── */

  // each entry remembers which range its numbers are for (`about`) and whether it could not be read in full (`lost`); one for another range
  // is read again and, until then, drawn as loading rather than under this range's label
  const loadKids = useCallback(async (kind, parentId) => {
    const id = `${kind}:${parentId}`;
    const mine = (seq.current[id] = (seq.current[id] || 0) + 1);
    setKids((k) => (k[id]?.rows?.length && k[id].about === about ? k : { ...k, [id]: { status: "loading", rows: k[id]?.rows || [], metrics: {}, about, lost: false } }));
    try {
      const rows = await KIDS[kind].fetch(parentId);
      let metrics = {};
      let lost = false;
      if (rows.length > 0) {
        try {
          const ins = await fetchEntityInsights(KIDS[kind].level, rows.map((r) => r.id), range.dateFrom || null, range.dateTo || null);
          metrics = metricsBy(ins, "entity_id");
        } catch (err) {
          console.error("Meta Ads: could not read the numbers of", id, err);
          lost = true;                       // the rows show, and the page says their numbers are missing (blank is not "spent nothing")
        }
      }
      if (mine !== seq.current[id]) return;
      setKids((k) => ({ ...k, [id]: { status: "ready", rows, metrics, about, lost } }));
    } catch (err) {
      console.error("Meta Ads: could not load", id, err);
      if (mine !== seq.current[id]) return;
      setKids((k) => ({ ...k, [id]: k[id]?.rows?.length && k[id].about === about ? { ...k[id], status: "ready", lost: true } : { status: "error", rows: [], metrics: {}, about, lost: false } }));
    }
  }, [range.dateFrom, range.dateTo, about]);

  const refreshKids = useCallback(() => {
    Object.keys(kidsRef.current).forEach((id) => { const [kind, parent] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)]; loadKids(kind, parent); });
  }, [loadKids]);

  // a new range (or a sync) re-reads what is open; the first render has nothing open
  const mounted = useRef(false);
  useEffect(() => { if (mounted.current) refreshKids(); mounted.current = true; }, [key]);          // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(kind, id) {
    const [set, setSet] = kind === "adsets" ? [openC, setOpenC] : [openA, setOpenA];
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else { next.add(id); if (!kids[`${kind}:${id}`]) loadKids(kind, id); }
    setSet(next);
  }

  /* ── what is on screen ─────────────────────────────────── */

  const campaigns = useMemo(() => (base.data?.campaigns || []).map(withPatch), [base.data, withPatch]);
  const cm = useMemo(() => metricsBy(base.data?.insights || [], "campaignId"), [base.data]);
  const counts = useMemo(() => campaignCounts(campaigns, archived), [campaigns, archived]);

  // What narrows the list: the search and whether archived ones are listed at all are this view's own; everything else is in the Filters
  // panel (components/filters). The delivery choice narrows exactly as the old chips did, through filterCampaigns.
  const searched = useMemo(() => filterCampaigns(campaigns, { query, status: "all", archived }), [campaigns, query, archived]);
  const filterDefs = useMemo(() => {
    const numbers = ready && !base.data.numbersLost;                      // spend and results are filtered only when they were read: blank numbers are not "nothing"
    const accountIds = new Set(campaigns.map((c) => c.adAccountId).filter(Boolean));
    const currencies = new Set([...accountIds].map((id) => currencyBy[id]).filter(Boolean));
    const unit = currencies.size === 1 ? [...currencies][0] : "";           // an amount range means one thing only when every account spends in one currency
    const choice = (get) => new Set(campaigns.map(get).filter(Boolean)).size > 1;       // a dropdown is offered only when there is something to choose
    const total = (id) => cm[id]?.totalInquiries || 0;
    return [
      // whether archived campaigns are listed: the view keeps it (it widens the list, so it is never a pill)
      ...(counts.archived > 0 || archived ? [{
        id: "archived", label: "Archived campaigns", kind: "chips", controlled: { value: archived ? "show" : "hide", set: (v) => setArchived(v === "show") },
        options: [
          { value: "hide", label: "Hide", count: campaignCounts(campaigns, false).all },
          { value: "show", label: "Show", count: campaignCounts(campaigns, true).all },
        ],
      }] : []),
      {
        id: "status", label: "Delivery", kind: "chips", test: (c, v) => filterCampaigns([c], { status: v, archived: true }).length > 0,
        options: [
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
          { value: "paused", label: "Paused" },
          { value: "issues", label: "Needs attention", tone: counts.issues > 0 ? "warn" : undefined },
        ],
      },
      ...(choice((c) => objectiveWords(c.objective)) ? [{ id: "objective", label: "Objective", kind: "select", of: (c) => objectiveWords(c.objective), any: "Any objective", none: "No objective" }] : []),
      ...(accountIds.size > 1 ? [{
        id: "account", label: "Ad account", kind: "select", of: (c) => c.adAccountId, nameOf: (id) => core.accounts.find((a) => a.id === id)?.name || id, any: "Any account", none: "No account",
      }] : []),
      // three amounts in one currency: each pill names itself ("Spend: USD from 30"), or they would look alike
      ...(unit ? [{ id: "budget", label: "Daily budget", kind: "range", unit, pill: "Daily budget", get: (c) => (c.dailyBudgetMinor != null ? Number(c.dailyBudgetMinor) / 100 : null) }] : []),
      ...(numbers && unit ? [
        { id: "spend", label: "Spend in this range", kind: "range", unit, pill: "Spend", get: (c) => (cm[c.id] ? cm[c.id].spend : null) },
        { id: "cpi", label: "Cost per inquiry", kind: "range", unit, pill: "Cost per inquiry", get: (c) => cm[c.id]?.costPerInquiry ?? null },
      ] : []),
      ...(numbers ? [
        { id: "leads", label: "Has leads", kind: "toggle", test: (c) => (cm[c.id]?.leads || 0) > 0 },
        { id: "nothing", label: "Spent, no inquiries", kind: "toggle", text: "Spent but no inquiries", pill: "No inquiries", test: (c) => (cm[c.id]?.spend || 0) > 0 && total(c.id) === 0 },
      ] : []),
    ];
  }, [campaigns, counts, archived, ready, base.data, currencyBy, core.accounts, cm]);
  const tf = useFilters(filterDefs, searched);
  const shown = useMemo(
    () => [...tf.rows].sort((a, b) => ((cm[b.id]?.spend || 0) - (cm[a.id]?.spend || 0)) || byName(a, b)),
    [tf.rows, cm],
  );

  const rows = useMemo(() => {
    const out = [];
    const note = (k, depth, label) => out.push({ key: k, kind: "group", label: <span className="ma-note" style={{ "--d": depth }}>{label}</span> });
    const budgetOf = (e, parentHasBudget) => {
      if (e.dailyBudgetMinor != null) return `${moneyMinor(e.dailyBudgetMinor, currencyOf(e))} / day`;
      if (e.lifetimeBudgetMinor != null) return `${moneyMinor(e.lifetimeBudgetMinor, currencyOf(e))} total`;
      return parentHasBudget ? <span className="dt-dim">Campaign budget</span> : "—";
    };
    for (const c of shown) {
      const cOpen = openC.has(c.id);
      out.push({ key: `campaign:${c.id}`, level: "campaign", entity: c, depth: 0, hasChildren: true, expanded: cOpen, toggle: () => toggle("adsets", c.id), metrics: cm[c.id], currency: currencyOf(c), budget: budgetOf(c, false) });
      if (!cOpen) continue;
      const k = kids[`adsets:${c.id}`];
      if (!k || k.status === "loading" || k.about !== about) { note(`n:${c.id}`, 1, "Loading…"); continue; }
      if (k.status === "error") { note(`n:${c.id}`, 1, <>Couldn't load these. <button type="button" className="ma-linkbtn dt-act" onClick={() => loadKids("adsets", c.id)}>Retry</button></>); continue; }
      if (k.rows.length === 0) { note(`n:${c.id}`, 1, "No ad sets synced for this campaign."); continue; }
      for (const a of k.rows.map(withPatch).sort(byName)) {
        const aOpen = openA.has(a.id);
        out.push({ key: `adset:${a.id}`, level: "adset", entity: a, depth: 1, hasChildren: true, expanded: aOpen, toggle: () => toggle("ads", a.id), metrics: k.metrics[a.id], currency: currencyOf(a), budget: budgetOf(a, hasOwnBudget(c)), parent: c.id });
        if (!aOpen) continue;
        const ak = kids[`ads:${a.id}`];
        if (!ak || ak.status === "loading" || ak.about !== about) { note(`n:${a.id}`, 2, "Loading…"); continue; }
        if (ak.status === "error") { note(`n:${a.id}`, 2, <>Couldn't load these. <button type="button" className="ma-linkbtn dt-act" onClick={() => loadKids("ads", a.id)}>Retry</button></>); continue; }
        if (ak.rows.length === 0) { note(`n:${a.id}`, 2, "No ads synced for this ad set."); continue; }
        for (const ad of ak.rows.map(withPatch).sort(byName)) {
          out.push({ key: `ad:${ad.id}`, level: "ad", entity: ad, depth: 2, hasChildren: false, metrics: ak.metrics[ad.id], currency: currencyOf(ad), budget: budgetOf(ad, false), parent: a.id });
        }
      }
    }
    return out;
  }, [shown, openC, openA, kids, cm, currencyBy, withPatch, loadKids, about]);              // eslint-disable-line react-hooks/exhaustive-deps

  /* ── the card and the two dialogs ──────────────────────── */

  // a card's thing may be hidden by a filter or by closing its parent while it is open: look in everything read, not only in the rows drawn
  const lookup = (level, id) => {
    if (level === "campaign") {
      const c = campaigns.find((x) => x.id === id);
      return c ? { entity: c, metrics: cm[id], currency: currencyOf(c), parentHasBudget: false, hold: null } : null;
    }
    const prefix = level === "adset" ? "adsets:" : "ads:";
    for (const [k, v] of Object.entries(kids)) {
      if (!k.startsWith(prefix)) continue;
      const hit = v.rows.find((r) => r.id === id);
      if (!hit) continue;
      const e = withPatch(hit);
      const parent = level === "adset" ? campaigns.find((c) => c.id === k.slice(prefix.length)) : null;
      // what the parents would hold it with once it is switched on: an ad's ad set is the row whose ads these are
      const adset = level === "ad" ? Object.entries(kids).filter(([kk]) => kk.startsWith("adsets:")).flatMap(([, vv]) => vv.rows).map(withPatch).find((r) => r.id === k.slice(prefix.length)) || null : null;
      const campaign = level === "adset" ? parent : adset ? campaigns.find((c) => c.id === adset.campaignId) || null : null;
      return {
        entity: e, metrics: v.about === about ? v.metrics[id] : undefined, currency: currencyOf(e),
        parentHasBudget: Boolean(parent && hasOwnBudget(parent)), hold: parentHold(level, { campaign, adset }),
      };
    }
    return null;
  };
  const open = target ? lookup(target.level, target.id) : null;
  const acting = dialog ? lookup(dialog.level, dialog.id) : null;

  // a thing that is no longer there (a sync took it away) closes its card and any dialog about it
  useEffect(() => {
    if (ready && target && !open) { setTarget(null); setDialog(null); }
  }, [ready, target, open]);

  async function confirmPause({ entity, level, action, hold }) {
    const res = await pauseResume(entity, level, action, hold);
    if (res.ok) {
      patch(entity.id, { status: res.status, effectiveStatus: res.effectiveStatus });
      setDialog(null);
      notify(res.warning ? "warn" : "info", res.warning || `${action === "pause" ? "Paused" : "Resumed"} “${entity.name}”.${action === "resume" && hold ? ` It will not run until its ${hold === "ADSET_PAUSED" ? "ad set" : "campaign"} is resumed too.` : ""}`);
      base.reload();
      refreshKids();                    // pausing a parent changes what its children are, so everything already read is read again
    }
    return res;
  }

  async function confirmBudget({ entity, level, field, valueMinor, confirmedOverCeiling }) {
    const res = await editBudget({ entity, level, field, valueMinor, confirmedOverCeiling });
    if (res.ok) {
      patch(entity.id, { [res.key]: res.valueMinor });
      setDialog(null);
      notify(res.warning ? "warn" : "info", res.warning || `Changed the budget of “${entity.name}” to ${moneyMinor(res.valueMinor, currencyOf(entity))}${field === "daily_budget" ? " / day" : ""}.`);
      base.reload();
      refreshKids();
    }
    return res;
  }

  const kidsLost = Object.values(kids).some((v) => v.lost && v.about === about);
  const retry = async () => { setRetrying(true); try { await base.reload(); } finally { setRetrying(false); } };
  const narrowed = Boolean(query) || tf.count > 0;
  const withArchived = archived && counts.archived > 0 ? `, ${counts.archived} archived` : "";          // the choice is behind the Filters button, so the count says it

  /* ── the table ─────────────────────────────────────────── */

  const columns = useMemo(() => [
    {
      id: "name", label: "Name", grow: true, min: 200, max: 460,
      render: (r, { dropped }) => {
        const e = r.entity;
        const sub = [
          r.level === "campaign" ? objectiveWords(e.objective) : r.level === "adset" ? "Ad set" : "Ad",
          dropped.has("status") ? statusOf(e.effectiveStatus, e.status).label : "",
          dropped.has("spend") && r.metrics?.spend ? `${money(r.metrics.spend, r.currency)} spent` : "",
        ].filter(Boolean).join(" · ");
        return (
          <span className="ma-name" style={{ "--d": r.depth }}>
            {r.hasChildren ? (
              <button
                type="button" className={cn("dt-act ma-chev", r.expanded && "is-open")} aria-expanded={r.expanded}
                aria-label={`${r.expanded ? "Hide" : "Show"} the ${r.level === "campaign" ? "ad sets" : "ads"} of ${e.name}`} onClick={r.toggle}
              >
                <Icons.ChevronRight size={13} sw={2} />
              </button>
            ) : <span className="ma-chev ma-chev--none" aria-hidden="true" />}
            {r.level === "ad" && <Thumb url={e.creativeThumbnailUrl} size={26} />}
            <TwoLine main={e.name} sub={sub} />
          </span>
        );
      },
    },
    { id: "status", label: "Delivery", width: 138, drop: 2, render: (r) => <StatusTag effectiveStatus={r.entity.effectiveStatus} status={r.entity.status} /> },
    { id: "budget", label: "Budget", width: 128, align: "end", drop: 3, render: (r) => <span className="dt-num">{r.budget}</span> },
    { id: "spend", label: "Spend", width: 104, align: "end", drop: 1, render: (r) => (r.metrics?.spend ? <span className="dt-num dt-strong">{money(r.metrics.spend, r.currency)}</span> : <span className="dt-dim">—</span>) },
    { id: "msgs", label: "Messages", width: 90, align: "end", drop: 5, render: (r) => (r.metrics?.messages > 0 ? <span className="dt-num">{num(r.metrics.messages)}</span> : <span className="dt-dim">—</span>) },
    { id: "comments", label: "Comments", width: 92, align: "end", drop: 7, render: (r) => (r.metrics?.comments > 0 ? <span className="dt-num">{num(r.metrics.comments)}</span> : <span className="dt-dim">—</span>) },
    { id: "leads", label: "Leads", width: 70, align: "end", drop: 6, render: (r) => (r.metrics?.leads > 0 ? <span className="dt-num">{num(r.metrics.leads)}</span> : <span className="dt-dim">—</span>) },
    { id: "cpi", label: "Cost / inquiry", width: 120, align: "end", drop: 4, render: (r) => (r.metrics?.costPerInquiry ? <span className="dt-num">{money(r.metrics.costPerInquiry, r.currency)}</span> : <span className="dt-dim">—</span>) },
  ], []);

  if (base.status === "error") return <LoadError what="Campaigns" onRetry={retry} busy={retrying} />;

  return (
    <>
      {base.data?.numbersLost && <Notice tone="warn">Could not read the numbers for this range, so spend and results are blank.</Notice>}
      {kidsLost && <Notice tone="warn" action={{ label: "Try again", onClick: refreshKids }}>Some ad sets or ads could not be read in full just now, so their numbers may be blank or out of date.</Notice>}
      {base.data?.settingsLost && canEdit && <Notice tone="warn">The budget limits could not be read, so budgets cannot be changed until they can.</Notice>}
      {base.stale && <Notice tone="warn" action={{ label: base.refreshing ? "Trying…" : "Try again", onClick: base.reload, disabled: base.refreshing }}>Could not refresh just now. This is what was loaded last.</Notice>}

      <BentoGrid layout="ma-plain">
        <Tile
          area="main" title="Campaigns" icon={<Icons.Marketing {...ico} />} align="top" className="ma-pane"
          note={loading ? undefined : narrowed ? `${shown.length} of ${counts.all}${withArchived}` : `${counts.all} ${plural(counts.all, "campaign")}${withArchived}`}
        >
          <div className="ma-tools fn-barrow">
            <FindBar filters={tf} value={query} onChange={setQuery} placeholder="Search campaigns" label="Search campaigns by name or objective" />
          </div>

          {!loading && shown.length === 0 ? (
            <div className="dt-empty">
              <EmptyNote icon={<Icons.Marketing size={22} sw={1.5} />}>
                {campaigns.length === 0
                  ? "No campaigns synced yet. Press Sync now to bring them in."
                  : <>No campaigns match. <button type="button" className="ma-linkbtn" onClick={() => { setQuery(""); tf.clear(); }}>Show them all</button></>}
              </EmptyNote>
            </div>
          ) : (
            <DataTable
              label="Campaigns" rows={rows} rowKey={(r) => r.key} columns={columns} kindOf={(r) => r.kind}
              onOpen={(r) => setTarget({ level: r.level, id: r.entity.id })}
              rowLabel={(r) => `Open ${r.entity.name}, ${r.level === "adset" ? "ad set" : r.level}, ${statusOf(r.entity.effectiveStatus, r.entity.status).label}`}
              activeKey={target ? `${target.level}:${target.id}` : undefined}
              loading={loading}
            />
          )}
        </Tile>
      </BentoGrid>

      {open && (
        <EntityCard
          key={`${target.level}:${target.id}`}
          entity={open.entity} level={target.level} currency={open.currency} metrics={open.metrics} range={range}
          canEdit={canEdit} budgetOpen={budgetsOpen && Boolean(open.currency)} parentHasBudget={open.parentHasBudget}
          budgetWhy={!budgetsOpen ? "The budget limits could not be read, so budgets cannot be changed right now." : "This ad account's currency could not be read, so budgets cannot be changed right now."}
          onPause={(action) => setDialog({ kind: "pause", level: target.level, id: target.id, action })}
          onBudget={() => setDialog({ kind: "budget", level: target.level, id: target.id })}
          onHistory={() => go("activity", { entityId: target.id })}
          onClose={() => setTarget((cur) => (cur === target ? null : cur))}
        />
      )}

      {acting && dialog.kind === "pause" && (
        <PauseDialog entity={acting.entity} level={dialog.level} action={dialog.action} hold={acting.hold} onClose={() => setDialog(null)} onConfirm={confirmPause} />
      )}
      {acting && dialog.kind === "budget" && (
        <BudgetDialog entity={acting.entity} level={dialog.level} currency={acting.currency} settings={settings} onClose={() => setDialog(null)} onConfirm={confirmBudget} />
      )}
    </>
  );
}

