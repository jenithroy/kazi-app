/**
 * Meta Ads, on the same frosted-glass bento frame as the Dashboard and the Calendar: one screen per section, no page scroll.
 *
 * It used to share /marketing with the content calendar behind a switch; it is its own page now, at /marketing/meta-ads, reached from
 * the Marketing menu. The address carries what is chosen, so a link or a refresh lands where it was left:
 *
 *   ?view=overview | campaigns | leads | attribution | activity | settings      (no view: the overview)
 *   ?from=2026-09-19&to=2026-10-19      the date range the overview, campaigns and attribution follow; no `from` and `to` is the last
 *                                       30 days, both empty is all time. (The old address /marketing?tab=meta-ads... comes here.)
 *   ?entityId=…                         the change log filtered to one campaign, ad set or ad
 *
 * This file is the frame: the header (the account, when it last synced, Sync now), the section tabs and the range, the notices, and the
 * view. The views read their own data (components/meta/); what they share is the account list and the latest sync runs, read here.
 * The range stays in this bar, beside the tabs, because it decides which numbers are READ; what only narrows a list that is already
 * loaded (the campaigns, the leads, the change log) is that list's own search and Filters button (components/filters).
 *
 * Meta Ads is its own permission on top of the Marketing section (migration 0049): without it this page is the calendar's. With view
 * but not edit nothing here changes anything, and the page says why. All the sums are in lib/metaCalc.js; the writes, which spend real
 * money, in lib/metaWrites.js.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { marketingTabAllowed, marketingTabCanEdit } from "../utils/permissions";
import { kathmanduDate } from "../utils/date";
import { BentoPage } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import { PageTabs } from "../components/table/Bar";
import RangeControl from "../components/meta/RangeControl";
import { Notice } from "../components/meta/Common";
import OverviewView from "../components/meta/OverviewView";
import CampaignsView from "../components/meta/CampaignsView";
import LeadsView from "../components/meta/LeadsView";
import AttributionView from "../components/meta/AttributionView";
import ActivityView from "../components/meta/ActivityView";
import SettingsView from "../components/meta/SettingsView";
import useMetaLoad from "../hooks/useMetaLoad";
import { fetchAdAccounts, fetchSyncRuns } from "../lib/metaAds";
import { RANGE_VIEWS, VIEWS, accountLabel, newestFirst, rangeOf, syncLine, syncNotice, viewOf } from "../lib/metaCalc";
import { syncAds } from "../lib/metaWrites";
import "../components/meta/meta.css";

/**
 * The account list and the latest sync runs: the header and several views use them, and neither may fail the page. What could not be read
 * is said (`accountsLost`, `runsLost`), because "No accounts configured" and "Never synced" are not what an unread list means, and prices
 * with no account behind them have no currency.
 */
async function loadCore() {
  const [a, r] = await Promise.allSettled([fetchAdAccounts(), fetchSyncRuns()]);
  return {
    accounts: a.status === "fulfilled" ? a.value || [] : [],
    runs: r.status === "fulfilled" ? newestFirst(r.value || [], "startedAt") : [],
    accountsLost: a.status === "rejected",
    runsLost: r.status === "rejected",
  };
}
const EMPTY = { accounts: [], runs: [], accountsLost: false, runsLost: false };

export default function MetaAds() {
  const { profile } = useAuth();
  const allowed = marketingTabAllowed(profile, "meta_ads");
  const canEdit = marketingTabCanEdit(profile, "meta_ads");
  const [params, setParams] = useSearchParams();

  // "today" is the office's date, and moves on at midnight without a reload
  const [today, setToday] = useState(() => kathmanduDate());
  useEffect(() => {
    const id = setInterval(() => setToday(kathmanduDate()), 60000);
    return () => clearInterval(id);
  }, []);

  const view = viewOf(params.get("view"));
  const range = useMemo(() => rangeOf(params, today), [params, today]);
  const [tick, setTick] = useState(0);                         // goes up after a sync, so every view reads again
  const [syncing, setSyncing] = useState(false);
  const syncOnce = useRef(false);                              // a second press in the same instant must not start a second sync
  const [notice, setNotice] = useState(null);                  // { tone, text }
  const core = useMetaLoad(loadCore, `${tick}`);
  const { accounts, runs, accountsLost, runsLost } = core.data || EMPTY;

  const change = useCallback((edit) => setParams((prev) => { const next = new URLSearchParams(prev); edit(next); return next; }, { replace: true }), [setParams]);
  const setView = (id) => change((n) => { n.set("view", id); n.delete("entityId"); });
  /** Go to a section, with extra address parts (the change log filtered to one thing). */
  const go = (id, extra = {}) => change((n) => { n.set("view", id); n.delete("entityId"); Object.entries(extra).forEach(([k, v]) => n.set(k, v)); });
  const setRange = (r) => change((n) => { n.set("from", r.dateFrom || ""); n.set("to", r.dateTo || ""); });
  const notify = useCallback((tone, text) => setNotice(text ? { tone, text } : null), []);

  async function sync() {
    if (syncOnce.current) return;
    syncOnce.current = true;
    setSyncing(true);
    setNotice(null);
    const res = await syncAds();
    syncOnce.current = false;
    setSyncing(false);
    if (!res.ok) { setNotice({ tone: "bad", text: res.message }); return; }
    setNotice(syncNotice(res.res));            // the Worker answers 200 even when Meta refused: the run's own status says how it went
    setTick((t) => t + 1);
  }

  if (!allowed) return <Navigate to="/marketing" replace />;

  const latest = runs[0] || null;
  const syncedAt = latest?.finishedAt || latest?.startedAt;
  const loaded = core.status !== "loading";
  const props = { canEdit, range, today, core: { accounts, runs, accountsLost, runsLost }, tick, go, notify, onSync: sync, syncing };

  return (
    <BentoPage className="ma-page">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Meta Ads</h1>
          <p className="kb-head-sub">
            {loaded ? (
              <>
                <span>{accountsLost ? "Couldn't read the accounts" : accountLabel(accounts)}</span>
                <span title={syncedAt ? new Date(syncedAt).toLocaleString() : undefined}>{syncing ? "Syncing…" : runsLost ? "Couldn't read the sync history" : syncLine(latest)}</span>
              </>
            ) : <span>Loading…</span>}
          </p>
        </div>
        <div className="kb-head-r">
          <button type="button" className="kb-btn kb-btn--primary ma-sync kb-head-act" onClick={sync} disabled={syncing}>
            <Icons.RefreshCw size={13} sw={2} className={syncing ? "kspin" : ""} aria-hidden="true" /> {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </header>

      <div className="ma-bar">
        <PageTabs label="Meta Ads sections" tabs={VIEWS} value={view} onChange={setView} />
        {RANGE_VIEWS.includes(view) && <RangeControl range={range} today={today} onChange={setRange} />}
      </div>

      {!canEdit && (
        <Notice tone="info">You can see Meta Ads but not change it. Ask an admin for Edit on Meta Ads (Admin Panel → Roles).</Notice>
      )}
      {notice && (
        <Notice tone={notice.tone === "bad" ? "bad" : notice.tone === "warn" ? "warn" : "info"} role={notice.tone === "info" ? "status" : "alert"} action={{ label: "Dismiss", onClick: () => setNotice(null) }}>{notice.text}</Notice>
      )}

      {view === "overview" && <OverviewView {...props} />}
      {view === "campaigns" && <CampaignsView {...props} />}
      {view === "leads" && <LeadsView {...props} />}
      {view === "attribution" && <AttributionView {...props} />}
      {view === "activity" && <ActivityView {...props} params={params} clearEntity={() => change((n) => n.delete("entityId"))} />}
      {view === "settings" && <SettingsView {...props} reloadCore={core.reload} />}
    </BentoPage>
  );
}
