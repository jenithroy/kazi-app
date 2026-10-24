import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import PageHeader from "../components/PageHeader";
import { Avatar, Btn, Card, Icons, KPI, Pill } from "../components/ui";
import PersonLink from "../components/profile/PersonLink";
import { FindBar } from "../components/filters/FilterMenu";
import useFilters from "../components/filters/useFilters";
import {
  fetchActivityFeed,
  fetchUsageDaily,
  sinceDays,
  subscribeActivity,
} from "../lib/activity";

/**
 * Usage & Activity — what the ERP itself is used for.
 *
 * Every other page reports on the business. This one reports on the software:
 * who signs in, which modules earn their place, who does the work, and what
 * happened when. It reads two things and nothing else:
 *
 *   activity_usage_daily  rolled up per person / page / day, which is what the
 *                         charts and tables are built from. A year of it is a
 *                         few hundred rows, so the range picker can be honest
 *                         about "all time" without the browser pulling a year
 *                         of individual events.
 *
 *   activity_feed         the individual events, newest first and capped,
 *                         because that is a feed and nobody scrolls a year.
 *
 * Both are gated by the `usage_analytics` permission in the database, so a
 * position that has not been granted the page gets empty results even if it
 * somehow reaches the route.
 *
 * Nothing on this page writes anything. It is a mirror, and a mirror with a
 * Delete button would not be one.
 *
 * One Filters button (components/filters) holds every choice: the period (which decides what
 * is READ, so changing it asks the database again), the person and the page (they narrow the
 * numbers, the charts and the feed), and what the activity list shows (it and the search in
 * the bar narrow only that list). A line beside the button says the period, the person and the
 * page in words.
 */

/* ── Range ──────────────────────────────────────────────── */
const RANGES = [
  { key: "1d",  label: "24 hours", days: 1 },
  { key: "7d",  label: "7 days",   days: 7 },
  { key: "30d", label: "30 days",  days: 30 },
  { key: "90d", label: "90 days",  days: 90 },
  { key: "all", label: "All time", days: null },
];

/* Categorical colours, assigned by rank so the biggest share is always the
   brand green and the chart reads the same way every time. Drawn from the
   design tokens rather than a generic chart palette, so a pie sitting next to
   a Kazi card does not look like it was pasted in from somewhere else. */
const PALETTE = [
  "#1f6e4c", "#5ab98a", "#5688b0", "#d4a04a", "#c4654a",
  "#7c6bb0", "#3f9e8f", "#8aa74e", "#a0567e", "#8a978f",
];
const colorAt = (i) => PALETTE[i % PALETTE.length];

/* ── Formatting ─────────────────────────────────────────── */
const KTM = "Asia/Kathmandu";

function humanDuration(ms) {
  if (!ms || ms < 1000) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function relativeTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs < 45) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  if (secs < 7 * 86400) return `${Math.round(secs / 86400)}d ago`;
  return new Date(t).toLocaleDateString("en-GB", { timeZone: KTM, day: "numeric", month: "short" });
}

const clockOf = (iso) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: KTM, hour: "2-digit", minute: "2-digit" });

const dayKeyOf = (iso) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: KTM }); // YYYY-MM-DD

function dayLabel(key) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: KTM });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: KTM });
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function hueFromName(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h % 360;
}

/* ── What each logged verb reads as ─────────────────────── */
const VERBS = {
  view:    "opened",
  sign_in: "signed in",
  create:  "created",
  update:  "updated",
  save:    "saved",
  delete:  "deleted",
};

const ACTION_TONES = {
  view: "neutral", sign_in: "blue", create: "mint",
  update: "amber", save: "mint", delete: "terra",
};

const ACTION_FILTERS = [
  { key: "all",   label: "Everything" },
  { key: "view",  label: "Page opens" },
  { key: "write", label: "Changes" },
  { key: "sign_in", label: "Sign-ins" },
];

const isWrite = (a) => a === "create" || a === "update" || a === "save" || a === "delete";

/** Does an event of this kind belong under one of the activity list's choices? */
const actionOk = (action, key) => (key === "view" ? action === "view" : key === "sign_in" ? action === "sign_in" : key === "write" ? isWrite(action) : true);

/* The period in words, for the line beside the Filters button. */
const RANGE_WORDS = { "1d": "the last 24 hours", "7d": "the last 7 days", "30d": "the last 30 days", "90d": "the last 90 days", all: "all time" };

/* Who and which page a row belongs to. The roll-up and the feed say it the same way, so one choice narrows both. An event that names no
   page (a sign-in) is filed under "Elsewhere", which is what the charts call it. */
const ELSEWHERE = "__elsewhere__";
const personKey = (r) => r.person_id || r.person_name || "unknown";
const pageKey = (r) => r.section_id || ELSEWHERE;

/* The panel counts a person or a page by the actions logged (what "Actions logged" says once it is chosen), not by the roll-up rows the
   log is kept in: a count of rows would be a number nobody can see anywhere on the page. */
function countedInActions(sections, daily, person, page) {
  return sections.map((s) => {
    if (s.kind !== "select") return s;
    const [keyOf, others] = s.id === "person"
      ? [personKey, (r) => !page || pageKey(r) === page]
      : [pageKey, (r) => !person || personKey(r) === person];
    const events = new Map();
    for (const r of daily) if (others(r)) events.set(keyOf(r), (events.get(keyOf(r)) || 0) + (Number(r.events) || 0));
    return { ...s, options: s.options.map((o) => (o.value === "" ? o : { ...o, hint: (events.get(o.value) || 0).toLocaleString() })) };
  });
}

/* Somebody flipping between two pages for ten minutes is one thing they did, not forty. Runs of the same event by the same person
   collapse into a single line with a count, which keeps the feed readable without throwing away the underlying rows -- the charts
   still count every one. */
function collapseFeed(events) {
  const out = [];
  for (const e of events) {
    const last = out[out.length - 1];
    const sameThing =
      last &&
      last.person_id === e.person_id &&
      last.action === e.action &&
      last.section_id === e.section_id &&
      (last.target || "") === (e.target || "") &&
      Date.parse(last.oldestAt) - Date.parse(e.created_at) < 15 * 60 * 1000;

    if (sameThing) {
      last.count += 1;
      last.oldestAt = e.created_at;
      last.duration_ms = (last.duration_ms || 0) + (e.duration_ms || 0);
    } else {
      out.push({ ...e, count: 1, oldestAt: e.created_at });
    }
  }
  return out;
}

/* A person in the log opens their profile. The log knows who by `person_id`, so there is a link only where it has one:
   somebody who has since been removed stays plain text (never looked up by name, a newer person might share it). */
function WhoLink({ id, name, decor, children }) {
  return id ? <PersonLink decor={decor} personId={id} name={name}>{children}</PersonLink> : <>{children}</>;
}

/* ── A donut with its own legend ────────────────────────── */
function SharePie({ data, total, unit = "actions", empty }) {
  if (!data.length) return <div className="kusg-empty-sm">{empty}</div>;

  return (
    <div className="kusg-pie">
      <div className="kusg-pie-chart">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={84}
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="var(--card)"
              strokeWidth={2}
            >
              {data.map((d, i) => <Cell key={d.key} fill={colorAt(i)} />)}
            </Pie>
            <Tooltip
              formatter={(v, n) => [`${Number(v).toLocaleString()} ${unit}`, n]}
              contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="kusg-pie-center">
          <span className="num-xl">{total.toLocaleString()}</span>
          <span>{unit}</span>
        </div>
      </div>

      <ul className="kusg-legend">
        {data.slice(0, 7).map((d, i) => (
          <li key={d.key}>
            <span className="kusg-legend-dot" style={{ background: colorAt(i) }} />
            <span className="kusg-legend-name" title={d.name}>{d.name}</span>
            <span className="kusg-legend-pct mono">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
        {data.length > 7 && (
          <li className="kusg-legend-more">+{data.length - 7} more</li>
        )}
      </ul>
    </div>
  );
}

/* ── Ranked list with a share bar ───────────────────────── */
function RankedBar({ rows, max }) {
  return (
    <ul className="kusg-rank">
      {rows.map((r, i) => (
        <li key={r.key}>
          <span className="kusg-rank-n mono">{i + 1}</span>
          <span className="kusg-rank-label" title={r.name}>{r.name}</span>
          <span className="kusg-rank-track">
            <span
              className="kusg-rank-fill"
              style={{ width: `${max ? (r.value / max) * 100 : 0}%`, background: colorAt(i) }}
            />
          </span>
          <span className="kusg-rank-v mono">{r.value.toLocaleString()}</span>
          {r.meta && <span className="kusg-rank-meta">{r.meta}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ── Page ───────────────────────────────────────────────── */
export default function Usage() {
  const [range, setRange]     = useState("30d");      // how much is read (it asks the database for that period): a choice in the Filters panel
  const [query, setQuery]     = useState("");         // searches the activity list only
  const [shown, setShown]     = useState(60);

  const [daily, setDaily] = useState([]);
  const [feed, setFeed]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [live, setLive]       = useState(false);

  const days = RANGES.find((r) => r.key === range)?.days ?? null;

  const load = useCallback(async () => {
    setError("");
    try {
      const since = sinceDays(days);
      const [d, f] = await Promise.all([
        fetchUsageDaily({ since }),
        fetchActivityFeed({ since, limit: 600 }),
      ]);
      setDaily(d);
      setFeed(f);
    } catch (err) {
      console.error("Usage: could not load activity:", err);
      setError(err.message || "Could not load activity.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // New events arrive over realtime. Rather than splice a raw table row into a
  // list built from a joined view -- and get a half-labelled entry -- this
  // refetches, coalescing bursts so a busy minute is one request, not thirty.
  const pending = useRef(null);
  useEffect(() => {
    const stop = subscribeActivity(() => {
      setLive(true);
      if (pending.current) return;
      pending.current = setTimeout(() => { pending.current = null; load(); }, 4000);
    });
    return () => {
      stop();
      if (pending.current) clearTimeout(pending.current);
      pending.current = null;
    };
  }, [load]);

  /* Who and what appear in the pickers — taken from the data itself, so the
     lists only ever offer something that would actually show a result. */
  const people = useMemo(() => {
    const m = new Map();
    for (const r of daily) {
      const key = r.person_id || r.person_name || "unknown";
      if (!m.has(key)) m.set(key, r.person_name || "Removed user");
    }
    return [...m].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [daily]);

  const sections = useMemo(() => {
    const m = new Map();
    for (const r of daily) {
      if (!r.section_id) continue;
      if (!m.has(r.section_id)) m.set(r.section_id, r.section_label || r.section_id);
    }
    return [...m].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [daily]);

  // Names of everyone and every page seen so far, not just in the period on screen: a person chosen in one period who has nothing in a
  // shorter one stays chosen (and on the list, with nothing under them), and must keep their name.
  const seen = useRef({ people: new Map(), pages: new Map() });
  const personNames = useMemo(() => { people.forEach((p) => seen.current.people.set(p.key, p.name)); return new Map(seen.current.people); }, [people]);
  const pageNames = useMemo(() => { sections.forEach((s) => seen.current.pages.set(s.key, s.name)); return new Map(seen.current.pages); }, [sections]);
  const pageName = useCallback((key) => (key === ELSEWHERE ? "Elsewhere" : pageNames.get(key) || key), [pageNames]);

  /* ── The Filters panel (components/filters) ──────────────────────────────────────────────────────────────────────────────
     One button for the page. The period is a choice the page keeps (it decides what is read, so it is never a pill). Person and page
     narrow everything: the charts, the numbers and the feed. The activity list has two of its own, the search and what was done,
     which narrow only that list; they are told apart in the panel by their heading. */
  const dailyDefs = useMemo(() => [
    {
      id: "range", label: "Period", kind: "chips", controlled: { value: range, set: setRange },
      options: RANGES.map((r) => ({ value: r.key, label: r.label })),
    },
    { id: "person", label: "Person", kind: "select", of: personKey, nameOf: (k) => personNames.get(k) || k, any: "Everyone" },
    { id: "page", label: "Page", kind: "select", of: pageKey, nameOf: pageName, any: "Every page" },
  ], [range, personNames, pageName]);
  const dailyTf = useFilters(dailyDefs, daily);
  const person = dailyTf.values.person || "";             // "" is everyone
  const page = dailyTf.values.page || "";                 // "" is every page
  const scopedDaily = dailyTf.rows;

  const totals = useMemo(() => {
    let events = 0, activeMs = 0, views = 0, writes = 0;
    const seenPeople = new Set();
    const seenDays = new Set();
    for (const r of scopedDaily) {
      events   += Number(r.events) || 0;
      views    += Number(r.views) || 0;
      writes   += Number(r.writes) || 0;
      activeMs += Number(r.active_ms) || 0;
      seenPeople.add(r.person_id || r.person_name || "unknown");
      seenDays.add(r.day);
    }
    return { events, activeMs, views, writes, people: seenPeople.size, days: seenDays.size };
  }, [scopedDaily]);

  const bySection = useMemo(() => {
    const m = new Map();
    for (const r of scopedDaily) {
      const key = r.section_id || "other";
      const cur = m.get(key) || {
        key, name: r.section_label || r.section_id || "Elsewhere",
        value: 0, activeMs: 0, people: new Set(), writes: 0,
      };
      cur.value    += Number(r.events) || 0;
      cur.writes   += Number(r.writes) || 0;
      cur.activeMs += Number(r.active_ms) || 0;
      cur.people.add(r.person_id || r.person_name || "unknown");
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  }, [scopedDaily]);

  const byPerson = useMemo(() => {
    const m = new Map();
    for (const r of scopedDaily) {
      const key = r.person_id || r.person_name || "unknown";
      const cur = m.get(key) || {
        key, personId: r.person_id || null, name: r.person_name || "Removed user",
        value: 0, activeMs: 0, writes: 0, lastAt: null, sections: new Map(),
      };
      cur.value    += Number(r.events) || 0;
      cur.writes   += Number(r.writes) || 0;
      cur.activeMs += Number(r.active_ms) || 0;
      if (!cur.lastAt || (r.last_at && r.last_at > cur.lastAt)) cur.lastAt = r.last_at;
      const label = r.section_label || r.section_id || "Elsewhere";
      cur.sections.set(label, (cur.sections.get(label) || 0) + (Number(r.events) || 0));
      m.set(key, cur);
    }
    return [...m.values()]
      .map((p) => ({
        ...p,
        top: [...p.sections.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—",
      }))
      .sort((a, b) => b.value - a.value);
  }, [scopedDaily]);

  /* Every day in the range, including the quiet ones -- a bar chart that skips
     empty days flatters the numbers by hiding the gaps. */
  const byDay = useMemo(() => {
    const m = new Map();
    for (const r of scopedDaily) {
      m.set(r.day, (m.get(r.day) || 0) + (Number(r.events) || 0));
    }
    if (!m.size) return [];
    const keys = [...m.keys()].sort();
    const span = days || Math.max(
      1,
      Math.round((Date.parse(`${keys[keys.length - 1]}T12:00:00Z`) - Date.parse(`${keys[0]}T12:00:00Z`)) / 86400000) + 1
    );
    const out = [];
    for (let i = Math.min(span, 90) - 1; i >= 0; i--) {
      const key = new Date(Date.now() - i * 86400000).toLocaleDateString("en-CA", { timeZone: KTM });
      out.push({ day: key, events: m.get(key) || 0 });
    }
    return out;
  }, [scopedDaily, days]);

  const busiestDay = useMemo(
    () => byDay.reduce((best, d) => (d.events > (best?.events || 0) ? d : best), null),
    [byDay]
  );

  /* ── The feed ─────────────────────────────────────────── */
  // the chosen person and page, then the search...
  const searchedFeed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feed.filter((e) => {
      if (person && personKey(e) !== person) return false;
      if (page && pageKey(e) !== page) return false;
      if (q) {
        const hay = `${e.person_name} ${e.section_label} ${e.action} ${e.target || ""} ${e.path || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [feed, person, page, query]);

  // ...then what was done. The list shows runs (see collapseFeed), so each choice is counted in runs: "Changes 12" is the 12 lines it shows.
  const feedDefs = useMemo(() => [{
    id: "action", label: "In the activity list", kind: "chips", test: (e, v) => actionOk(e.action, v),
    options: ACTION_FILTERS.map((f) => ({ value: f.key, label: f.label, count: collapseFeed(searchedFeed.filter((e) => actionOk(e.action, f.key))).length })),
  }], [searchedFeed]);
  const feedTf = useFilters(feedDefs, searchedFeed);
  const filteredFeed = feedTf.rows;
  const action = feedTf.values.action;

  const collapsedFeed = useMemo(() => collapseFeed(filteredFeed), [filteredFeed]);

  // what the one button shows: the page's choices, then the list's own
  const filters = useMemo(() => ({
    sections: [...countedInActions(dailyTf.sections, daily, person, page), ...feedTf.sections],
    active: [...dailyTf.active, ...feedTf.active],
    count: dailyTf.count + feedTf.count,
    clear: () => { dailyTf.clear(); feedTf.clear(); },
  }), [dailyTf, feedTf, daily, person, page]);

  const feedDays = useMemo(() => {
    const groups = [];
    for (const e of collapsedFeed.slice(0, shown)) {
      const key = dayKeyOf(e.created_at);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(e);
      else groups.push({ key, items: [e] });
    }
    return groups;
  }, [collapsedFeed, shown]);

  useEffect(() => { setShown(60); }, [person, page, action, query, range]);

  const nothingYet = !loading && !error && daily.length === 0;
  // what is on screen, in words (the choices are behind the Filters button)
  const showing = `Showing ${RANGE_WORDS[range]} · ${person ? personNames.get(person) || "one person" : "everyone"} · ${page ? pageName(page) : "every page"}`;

  return (
    <div className="kusg">
      <PageHeader
        title="Usage & Activity"
        description="Who is using the ERP, how much, and what for. Recorded as people work — page opens, saves and sign-ins."
        action={
          <div className="kusg-hdr-actions">
            {live && <Pill tone="mint" dot>Live</Pill>}
            <Btn kind="ghost" size="sm" icon={<Icons.Clock size={14} />} onClick={() => { setLoading(true); load(); }}>
              Refresh
            </Btn>
          </div>
        }
      />

      {/* ── Scope: one Filters button (period, person, page, and what the activity list shows), and what it comes to in words ── */}
      <div className="kusg-scope fn-barrow">
        <FindBar
          filters={filters} value={query} onChange={setQuery}
          placeholder="Search activity…" label="Search the activity list by person, page or what was done"
        />
        <p className="kusg-now">{showing}</p>
      </div>

      {error && <div className="kusg-error">{error}</div>}

      {loading ? (
        <div className="kusg-empty">Loading activity…</div>
      ) : nothingYet ? (
        <Card title="Nothing recorded yet">
          <p className="kusg-empty-body">
            The activity log starts from the moment this page went live, so it has
            nothing to show for the period before that. As people open pages and
            save work, their activity appears here within a few seconds.
          </p>
        </Card>
      ) : (
        <>
          {/* ── Headline numbers ── */}
          <div className="kusg-kpis">
            <KPI
              label="People active"
              value={totals.people}
              deltaLabel={`of ${people.length} who have ever used it`}
              icon={<Icons.Users size={16} />}
            />
            <KPI
              label="Actions logged"
              value={totals.events.toLocaleString()}
              deltaLabel={`${totals.views.toLocaleString()} opens · ${totals.writes.toLocaleString()} changes`}
              icon={<Icons.Pulse size={16} />}
            />
            <KPI
              label="Time in the ERP"
              value={humanDuration(totals.activeMs)}
              deltaLabel="hands-on, idle time excluded"
              icon={<Icons.Clock size={16} />}
            />
            <KPI
              label="Busiest page"
              value={bySection[0]?.name || "—"}
              deltaLabel={bySection[0] ? `${bySection[0].value.toLocaleString()} actions` : ""}
              icon={<Icons.Crosshair size={16} />}
            />
          </div>

          {/* ── The pies ── */}
          <div className="kusg-charts">
            <Card title="What the ERP is used for" sub="Share of everything logged, by page">
              <SharePie
                data={bySection}
                total={totals.events}
                empty="No page activity in this period."
              />
            </Card>

            <Card title="Who is using it" sub="Share of everything logged, by person">
              <SharePie
                data={byPerson}
                total={totals.events}
                empty="Nobody was active in this period."
              />
            </Card>

            <Card
              title="Activity by day"
              sub={busiestDay?.events ? `Busiest: ${dayLabel(busiestDay.day)}, ${busiestDay.events.toLocaleString()} actions` : "Day by day"}
            >
              {byDay.length ? (
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={byDay} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10, fill: "var(--ink-4)" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      minTickGap={24}
                      tickFormatter={(d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "var(--ink-4)" }} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
                    <Tooltip
                      cursor={{ fill: "rgba(15,46,34,.05)" }}
                      labelFormatter={(d) => dayLabel(d)}
                      formatter={(v) => [`${Number(v).toLocaleString()} actions`, ""]}
                      contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }}
                    />
                    <Bar dataKey="events" fill="var(--mint-2)" radius={[3, 3, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="kusg-empty-sm">No activity in this period.</div>
              )}
            </Card>
          </div>

          {/* ── Leaderboards ── */}
          <div className="kusg-cols">
            <Card title="Most used features" sub="Pages ranked by everything done on them">
              {bySection.length ? (
                <RankedBar
                  rows={bySection.slice(0, 10).map((s) => ({
                    key: s.key,
                    name: s.name,
                    value: s.value,
                    meta: `${s.people.size} ${s.people.size === 1 ? "person" : "people"} · ${humanDuration(s.activeMs)}`,
                  }))}
                  max={bySection[0]?.value || 1}
                />
              ) : (
                <div className="kusg-empty-sm">Nothing to rank yet.</div>
              )}
            </Card>

            <Card title="People" sub="What each person does, and where they spend the time">
              {byPerson.length ? (
                <div className="kusg-table-wrap">
                  <table className="kusg-table">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th className="ta-r">Actions</th>
                        <th className="ta-r">Changes</th>
                        <th className="ta-r">Time</th>
                        <th>Uses most</th>
                        <th className="ta-r">Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byPerson.map((p) => (
                        <tr key={p.key}>
                          <td>
                            <span className="kusg-who">
                              <WhoLink decor id={p.personId} name={p.name}>
                                <Avatar name={p.name} personId={p.personId || undefined} hue={hueFromName(p.name)} size={26} />
                              </WhoLink>
                              <span className="kusg-who-name"><WhoLink id={p.personId} name={p.name}>{p.name}</WhoLink></span>
                            </span>
                          </td>
                          <td className="ta-r mono">{p.value.toLocaleString()}</td>
                          <td className="ta-r mono">{p.writes.toLocaleString()}</td>
                          <td className="ta-r mono">{humanDuration(p.activeMs)}</td>
                          <td><span className="kusg-tag">{p.top}</span></td>
                          <td className="ta-r kusg-dim">{p.lastAt ? relativeTime(p.lastAt) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="kusg-empty-sm">Nobody was active in this period.</div>
              )}
            </Card>
          </div>

          {/* ── The feed ── */}
          <Card
            title="Activity"
            sub={`${collapsedFeed.length.toLocaleString()} entries${feed.length >= 600 ? " (most recent 600 events)" : ""}`}
          >
            {feedDays.length === 0 ? (
              <div className="kusg-empty-sm">Nothing matches those filters.</div>
            ) : (
              <>
                {feedDays.map((g) => (
                  <div key={g.key} className="kusg-day">
                    <div className="kusg-day-h">{dayLabel(g.key)}</div>
                    <ul className="kusg-events">
                      {g.items.map((e) => (
                        <li key={e.id} className="kusg-event">
                          <WhoLink decor id={e.person_id} name={e.person_name}>
                            <Avatar name={e.person_name || "?"} personId={e.person_id || undefined} hue={hueFromName(e.person_name || "")} size={28} />
                          </WhoLink>
                          <div className="kusg-event-body">
                            <p className="kusg-event-line">
                              <strong><WhoLink id={e.person_id} name={e.person_name}>{e.person_name || "Removed user"}</WhoLink></strong>
                              {" "}
                              <span className="kusg-verb">{VERBS[e.action] || e.action}</span>
                              {e.action === "view" ? (
                                <> <span className="kusg-tag">{e.section_label}</span></>
                              ) : e.target ? (
                                <>
                                  {" "}<span className="kusg-tag">{e.target}</span>
                                  {e.section_label && <span className="kusg-dim"> in {e.section_label}</span>}
                                </>
                              ) : null}
                              {e.count > 1 && <span className="kusg-count">×{e.count}</span>}
                            </p>
                            <p className="kusg-event-meta">
                              {e.position_label && <span>{e.position_label}</span>}
                              {e.duration_ms > 0 && <span>{humanDuration(e.duration_ms)} on the page</span>}
                              {e.path && <span className="mono">{e.path}</span>}
                            </p>
                          </div>
                          <div className="kusg-event-when">
                            <Pill tone={ACTION_TONES[e.action] || "neutral"}>{VERBS[e.action] || e.action}</Pill>
                            <span className="mono" title={new Date(e.created_at).toLocaleString("en-GB", { timeZone: KTM })}>
                              {clockOf(e.created_at)}
                            </span>
                            <span className="kusg-dim">{relativeTime(e.created_at)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {collapsedFeed.length > shown && (
                  <div className="kusg-more">
                    <Btn kind="ghost" size="sm" onClick={() => setShown((n) => n + 60)}>
                      Show more ({(collapsedFeed.length - shown).toLocaleString()} left)
                    </Btn>
                  </div>
                )}
              </>
            )}
          </Card>

          <p className="kusg-foot">
            Times are Kathmandu. Time on a page counts only while the tab is in
            front of somebody and there has been some sign of life in the last
            five minutes, so it reads as hands-on use rather than tabs left open.
            The log is append-only — it cannot be edited or deleted from the app.
          </p>
        </>
      )}
    </div>
  );
}
