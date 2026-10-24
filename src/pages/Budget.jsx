/**
 * Budget & Requirements, on the same frosted-glass bento frame as the Dashboard, Sales and Finance: one screen, no page
 * scroll, the list scrolls inside its pane.
 *
 * It is where the directors see what the office is asking for and say yes or no, so the page opens on what is waiting:
 *
 *   top row   what is waiting and what it asks for, how much of it is urgent, how long the longest has waited, and
 *             what has been approved (each also sets the list's filter)
 *   below     the requests: a search and ONE Filters button (components/filters) that holds the side of the business,
 *             Waiting | Approved | Rejected | All, urgency, type, category, who asked, who decided, amount, when it was
 *             asked and decided, and a few switches. It opens on Waiting. Waiting ones come first, the most urgent on
 *             top, then the one that has waited longest. A row opens that request's card; on a waiting one, Reject and
 *             Approve are one press, with an Undo
 *
 * The old page had two tabs (budget requests and requirements) and opened on the one with nothing waiting; the dashboard
 * counts both. Here they are one list. The sums and rules are in lib/budget.js, the writes in lib/budgetWrites.js (each reads
 * the row back: row-level security drops a refused update without an error), the reads in hooks/useBudgetData.js.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRegion } from "../context/RegionContext";
import { useCurrency } from "../context/CurrencyContext";
import { countUntagged, filterByRegion } from "../utils/region";
import { sectionCanEdit } from "../utils/permissions";
import { kathmanduDate } from "../utils/date";
import { fromNPR } from "../utils/currency";
import useMedia from "../hooks/useMedia";
import useShowAll from "../hooks/useShowAll";
import { BentoGrid, BentoPage } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import useFilters from "../components/filters/useFilters";
import useBudgetData from "../hooks/useBudgetData";
import RequestsPane from "../components/budget/RequestsPane";
import RequestCard from "../components/budget/RequestCard";
import NewRequestCard from "../components/budget/NewRequestCard";
import { ApprovedTile, LongestTile, UrgentTile, WaitingTile } from "../components/budget/Tiles";
import { useStrip } from "../components/budget/parts";
import { decide, undo } from "../lib/budgetWrites";
import {
  DECIDER_ROLES, URGENCIES, ageDays, askedDay, countRequests, decidedDay, filterRequests, fmtDay, isWaiting, leadFollow, orderRequests, plural,
  requestAmount, summarise,
} from "../lib/budget";
import "../components/budget/budget.css";

const PHONE_ROWS = 8;     // a phone's page scrolls, so the list shows this many until "Show all" is pressed

export default function Budget() {
  const { profile } = useAuth();
  const role = profile?.appRole || profile?.role || "employee";
  // Who is offered Approve and Reject: the old page's rule (admins), and only with Edit on Budget, which is what the
  // database checks: pressing the button without it could only fail.
  const canDecide = DECIDER_ROLES.includes(role) && sectionCanEdit(profile, "budget");
  const reviewer = profile?.name || "Admin";
  const { region, label: regionLabel } = useRegion();
  const { currency, ratesVersion } = useCurrency();
  const phone = useMedia("(max-width: 768px)");
  const { rows, state, stale, reload, patch } = useBudgetData();
  const ready = state === "ready";

  // "today" is the office's date (Kathmandu), and moves on at midnight without a reload
  const [today, setToday] = useState(() => kathmanduDate());
  useEffect(() => {
    const id = setInterval(() => setToday(kathmanduDate()), 60000);
    return () => clearInterval(id);
  }, []);

  const [status, setStatus] = useState("waiting");     // the page's main view (it opens on what is waiting), so the panel only mirrors it
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);          // the request whose card is open
  const [creating, setCreating] = useState(false);     // the new-request card
  const [busy, setBusy] = useState(null);              // { id, status } while a decision from a row is being written
  const [banner, setBanner] = useState("");            // a failure from a row's button (a card shows its own)
  const [strip, offer, clearStrip] = useStrip();
  const busyRef = useRef(null);
  const refocus = useRef(null);                        // after a decision from a row: which row of the list gets the cursor
  const openRef = useRef(null);                        // which card is open now, for a write that finishes after the person has moved on

  /* ── what is on screen ─────────────────────────────────── */

  const regionRows = useMemo(() => filterByRegion(rows, region), [rows, region]);
  const counts = useMemo(() => countRequests(regionRows), [regionRows]);
  // ratesVersion: rupees and pounds are converted at the live rate, so new rates mean new sums
  const sum = useMemo(() => summarise(regionRows, today, currency), [regionRows, today, currency, ratesVersion]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Which requests are listed: the view (Waiting | Approved | Rejected | All) and the search are the page's own (lib/budget.js
  // `filterRequests`); everything else is in the Filters panel. Urgency and type ask `filterRequests` about one request at a time, so the
  // rules are the old ones.
  const searched = useMemo(() => filterRequests(regionRows, { status, query }), [regionRows, status, query]);
  const me = profile?.personId ? String(profile.personId) : "";
  const filterDefs = useMemo(() => {
    const is = (r, opts) => filterRequests([r], opts).length > 0;
    // the amount as the page shows it (its lead figure, in the page's currency), to the penny, so a range typed from what is on screen matches
    const shown = (r) => {
      const a = requestAmount(r);
      return a ? Math.round(fromNPR(leadFollow(a, currency)[0], currency) * 100) / 100 : null;
    };
    const myName = String(profile?.name || "").trim().toLowerCase();
    const mine = (r) => (r.requested_by_id ? String(r.requested_by_id) === me : Boolean(myName) && String(r.requestedBy || "").trim().toLowerCase() === myName);
    return [
      // the page's main view: it narrows through `searched`, not here
      {
        id: "view", label: "Which requests", kind: "chips", controlled: { value: status, set: setStatus },
        options: [
          { value: "waiting", label: "Waiting", count: counts.waiting, tone: counts.waiting > 0 ? "warn" : undefined },
          { value: "approved", label: "Approved", count: counts.approved },
          { value: "rejected", label: "Rejected", count: counts.rejected },
          { value: "all", label: "All", count: counts.all },
        ],
      },
      {
        id: "urgency", label: "Urgency", kind: "chips", test: (r, v) => is(r, { urgency: v }),
        options: [{ value: "", label: "Any" }, ...URGENCIES.slice().reverse().map((u) => ({ value: u, label: u, tone: u === "High" ? "bad" : undefined }))],
      },
      {
        id: "kind", label: "Type", kind: "chips", test: (r, v) => is(r, { kind: v }),
        options: [{ value: "", label: "All" }, { value: "requirement", label: "Requirements" }, { value: "budget", label: "Budget requests" }],
      },
      { id: "category", label: "Category", kind: "select", of: (r) => r.category, any: "Any category", none: "No category" },
      { id: "by", label: "Asked by", kind: "select", of: (r) => r.requestedBy, any: "Anyone", none: "Not said" },
      { id: "decider", label: "Decided by", kind: "select", of: (r) => r.reviewedBy, any: "Anyone", none: "Not decided yet" },
      { id: "amount", label: "Amount", kind: "range", get: shown, unit: currency, pill: "Amount" },
      { id: "asked", label: "Asked between", kind: "dates", get: askedDay, show: fmtDay, pill: "Asked" },
      { id: "decidedOn", label: "Decided between", kind: "dates", get: decidedDay, show: fmtDay, pill: "Decided" },
      { id: "old", label: "Waiting a week or more", kind: "toggle", text: "Waiting 7 days or more", pill: "Waiting 7+ days", test: (r) => isWaiting(r) && (ageDays(r, today) ?? 0) >= 7 },
      { id: "noAmount", label: "No amount named", kind: "toggle", text: "No amount named", pill: "No amount", test: (r) => !requestAmount(r) },
      { id: "mine", label: "Asked by me", kind: "toggle", text: "Asked by me", pill: "Asked by me", test: mine },
    ];
  }, [status, counts, currency, ratesVersion, today, me, profile?.name]);    // eslint-disable-line react-hooks/exhaustive-deps
  const tf = useFilters(filterDefs, searched);
  const { clear: clearFilters } = tf;
  const filtered = Boolean(query) || tf.count > 0;
  const list = useMemo(() => orderRequests(tf.rows), [tf.rows]);
  // a phone shows eight rows until "Show all" is pressed; narrowing the list by anything puts the cap back (as it always did)
  const [showAll, showAllNow] = useShowAll(`${status}|${query}|${JSON.stringify(tf.values)}`);

  const openRow = openId ? regionRows.find((r) => r.id === openId) || null : null;
  openRef.current = openId;
  // a request that is gone (or filed on the other side of the switch) closes its card
  useEffect(() => { if (openId && ready && !openRow) setOpenId(null); }, [openId, ready, openRow]);

  // the list has caught up with a decision made from a row: the cursor goes to the row that took its place
  // (unless a card has been opened over it since: the cursor stays in the card)
  useEffect(() => {
    if (refocus.current == null) return;
    const at = refocus.current;
    refocus.current = null;
    if (document.querySelector(".kmodal")) return;
    const hits = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('[data-tile="list"] .dt-hit'));
    hits[Math.min(at, hits.length - 1)]?.focus({ preventScroll: true });
  }, [list]);

  /* ── the filter, and the tiles that set it ─────────────── */

  function show(next) {
    setStatus(next.status);
    clearFilters();                                       // a tile shows what it counts: every other filter goes back to "any"
    if (next.urgency) tf.set("urgency", next.urgency);
    setQuery("");
    // a phone's page scrolls: bring the list to the top of the screen
    if (phone) {
      const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document.querySelector('[data-tile="list"]')?.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
    }
  }

  /* ── writes ────────────────────────────────────────────── */

  // after a decision: the list takes what was written at once, then looks again; say what happened and offer to take it back
  const afterDecision = useCallback(async (row, next, saved) => {
    patch(saved);
    await reload();
    offer(`${next} “${row.title || "request"}”.`, async () => {
      const res = await undo(row, next);
      if (res.ok) patch(res.row);
      else setBanner(res.message);
      await reload();
    });
  }, [patch, reload, offer]);

  // from a row: a failure has no card to be said in, so it is the page's banner. `at` is where the row was in the list:
  // once it has gone the cursor goes to whatever took its place, so the next one can be decided without starting again
  const decideFromRow = useCallback(async (row, next, at = 0) => {
    if (busyRef.current) return;
    busyRef.current = { id: row.id, status: next };
    setBusy(busyRef.current);
    setBanner("");
    try {
      const res = await decide(row, next, reviewer);
      if (res.ok) {
        refocus.current = at;
        await afterDecision(row, next, res.row);
      } else {
        setBanner(res.message);
        if (res.settled || res.gone) await reload();      // somebody got there first: show what is true now
      }
    } finally {
      refocus.current = null;                            // (the list has taken it by now; this is for a read that never came)
      busyRef.current = null;                            // whatever happened, the buttons come back
      setBusy(null);
    }
  }, [reviewer, afterDecision, reload]);

  // from the card: the card says why it did not work, and closes when it did. The card can be closed while this is being
  // written (Close, Escape and the X stay live), so what happens next is judged by whether it is still the card on screen:
  // a failure nobody will see on the card is said on the page, and a success must not close a different card opened since.
  const decideFromCard = useCallback(async (row, next) => {
    const res = await decide(row, next, reviewer);
    const stillOpen = openRef.current === row.id;
    if (res.ok) {
      if (stillOpen) {
        // the card's request is the list's highlighted row: once it has gone the cursor goes to whatever took its place
        const mine = document.querySelector('[data-tile="list"] .dt-row.is-active');
        refocus.current = mine ? [...mine.parentElement.children].indexOf(mine) : 0;
        setOpenId(null);
      }
      await afterDecision(row, next, res.row);
    } else {
      if (!stillOpen || res.gone) setBanner(res.message);
      if (res.settled || res.gone) await reload();
    }
    return res;
  }, [reviewer, afterDecision, reload]);

  // a request has been sent: show it where it will be found, and say so
  const afterSent = useCallback(async (row) => {
    setStatus("waiting");
    clearFilters();
    setQuery("");
    await reload();
    offer(`Sent “${row?.title || "your request"}” to the directors.`);
  }, [reload, offer, clearFilters]);

  const openCard = useCallback((id) => setOpenId(id), []);

  /* ── the page ──────────────────────────────────────────── */

  const waiting = counts.waiting;
  // what is on screen, in words (the view and the side of the business are in the Filters panel), then what waits for a decision
  const sub = ready
    ? (
      <>
        <span>{{ waiting: "Waiting requests", approved: "Approved requests", rejected: "Rejected requests", all: "All requests" }[status]} · {regionLabel}</span>
        <span>{waiting > 0 ? `${waiting} ${plural(waiting, "request")} waiting for sign-off` : "Nothing waiting for sign-off"}</span>
      </>
    )
    : state === "error" ? null : <span>Loading…</span>;
  const loading = !ready;

  return (
    <BentoPage className="bd-page">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Budget &amp; Requirements</h1>
          <p className="kb-head-sub">{sub}</p>
        </div>
        <div className="kb-head-r">
          {/* off until the list is in: a budget request is numbered from the ones already there, so sending one from an empty page would repeat a number */}
          <button type="button" className="kb-btn kb-btn--primary bd-newbtn kb-head-act" data-tour="new-budget-request" disabled={!ready} onClick={() => setCreating(true)}>
            <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> New request
          </button>
        </div>
      </header>

      {banner && (
        <div className="bd-banner bd-banner--bad" role="alert">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>{banner}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setBanner("")}><Icons.X size={14} sw={2} aria-hidden="true" /></button>
        </div>
      )}
      {ready && stale && (
        <div className="bd-banner" role="status">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>{stale}</span>
        </div>
      )}

      {state === "error" ? (
        <div className="kb-error" role="alert">
          <p>The requests could not load. Check your connection and try again.</p>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={reload}>Try again</button>
        </div>
      ) : (
        <BentoGrid layout="budget">
          <WaitingTile sum={sum} loading={loading} onOpen={() => show({ status: "waiting" })} />
          <UrgentTile sum={sum} loading={loading} onOpen={() => show({ status: "waiting", urgency: "High" })} />
          <LongestTile oldest={sum.oldest} loading={loading} onOpen={(row) => openCard(row.id)} />
          <ApprovedTile sum={sum} loading={loading} onOpen={() => show({ status: "approved" })} />
          <RequestsPane
            rows={list} counts={counts}
            status={status} filters={tf} filtered={filtered} untagged={countUntagged(rows)}
            query={query} onQuery={setQuery}
            today={today} canDecide={canDecide} busy={busy} onDecide={decideFromRow}
            onOpen={openCard} activeId={openId || undefined} loading={loading}
            strip={strip} onStripClose={clearStrip}
            capped={phone ? PHONE_ROWS : 0} showAll={showAll} onShowAll={showAllNow}
          />
        </BentoGrid>
      )}

      {openRow && (
        <RequestCard key={openRow.id} row={openRow} today={today} canDecide={canDecide} onDecide={decideFromCard} onClose={() => setOpenId(null)} />
      )}

      {creating && (
        <NewRequestCard rows={rows} region={region} profile={profile} onClose={() => setCreating(false)} onSent={afterSent} />
      )}
    </BentoPage>
  );
}
