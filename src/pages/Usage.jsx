import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import PageHeader from "../components/PageHeader";
import { Avatar, Btn, Card, Icons, KPI, Pill, cn } from "../components/ui";
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
  const [range, setRange]     = useState("30d");
  const [person, setPerson]   = useState("all");
  const [section, setSection] = useState("all");
  const [action, setAction]   = useState("all");
  const [query, setQuery]     = useState("");
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

  /* Person and page narrow everything; the feed's own search and verb filter
     narrow only the feed. */
  const scopedDaily = useMemo(() => daily.filter((r) => {
    if (person !== "all" && (r.person_id || r.person_name || "unknown") !== person) return false;
    if (section !== "all" && r.section_id !== section) return false;
    return true;
  }), [daily, person, section]);

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
        key, name: r.person_name || "Removed user",
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
  const filteredFeed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feed.filter((e) => {
      if (person !== "all" && (e.person_id || e.person_name || "unknown") !== person) return false;
      if (section !== "all" && e.section_id !== section) return false;
      if (action === "view" && e.action !== "view") return false;
      if (action === "sign_in" && e.action !== "sign_in") return false;
      if (action === "write" && !isWrite(e.action)) return false;
      if (q) {
        const hay = `${e.person_name} ${e.section_label} ${e.action} ${e.target || ""} ${e.path || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [feed, person, section, action, query]);

  /* Somebody flipping between two pages for ten minutes is one thing they did,
     not forty. Runs of the same event by the same person collapse into a
     single line with a count, which keeps the feed readable without throwing
     away the underlying rows -- the charts still count every one. */
  const collapsedFeed = useMemo(() => {
    const out = [];
    for (const e of filteredFeed) {
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
  }, [filteredFeed]);

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

  useEffect(() => { setShown(60); }, [person, section, action, query, range]);

  const scoped = person !== "all" || section !== "all";
  const nothingYet = !loading && !error && daily.length === 0;

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

      {/* ── Scope ── */}
      <div className="kusg-scope">
        <div className="kusg-chips" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={cn("kusg-chip", range === r.key && "is-on")}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="kusg-selects">
          <label className="kusg-select">
            <Icons.Users size={13} />
            <select value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="all">Everyone</option>
              {people.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </label>
          <label className="kusg-select">
            <Icons.Dashboard size={13} />
            <select value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="all">Every page</option>
              {sections.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </label>
          {scoped && (
            <button type="button" className="kusg-clear" onClick={() => { setPerson("all"); setSection("all"); }}>
              <Icons.X size={12} /> Clear
            </button>
          )}
        </div>
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
                              <Avatar name={p.name} hue={hueFromName(p.name)} size={26} />
                              <span className="kusg-who-name">{p.name}</span>
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
            action={
              <div className="kusg-feed-filters">
                <label className="kusg-search">
                  <Icons.Search size={13} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search activity…"
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                      <Icons.X size={12} />
                    </button>
                  )}
                </label>
                <div className="kusg-chips kusg-chips--sm">
                  {ACTION_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      className={cn("kusg-chip", action === f.key && "is-on")}
                      onClick={() => setAction(f.key)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            }
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
                          <Avatar name={e.person_name || "?"} hue={hueFromName(e.person_name || "")} size={28} />
                          <div className="kusg-event-body">
                            <p className="kusg-event-line">
                              <strong>{e.person_name || "Removed user"}</strong>
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
