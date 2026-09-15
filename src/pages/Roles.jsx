import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAll } from "../lib/db";
import { Icons, cn } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { dutiesFor, roleKey, SHARED_DUTIES, SECTION_LABEL, SECTION_PATH } from "../lib/roles";
import { TOURS, tourHref } from "../lib/tours";

/**
 * Roles.
 *
 * Every role in the company, who holds it, and what that role is expected to
 * log. The roles and the people come from the database — `positions` and
 * `employees`, the same two tables the Admin Panel reads — so a role added or
 * renamed in Admin shows up here without anybody editing this file. An earlier
 * version listed them from the hardcoded TEAM_MEMBERS array and was wrong
 * about names, headcounts and which roles existed at all.
 *
 * Only the duty text is written down, in lib/roles.js, keyed by role. A role
 * with none says so rather than borrowing somebody else's.
 *
 * Two access notes, both deliberate:
 *
 *   - The route is ungated. A page telling people what to log is no use if
 *     only directors can open it.
 *   - `positions` is readable by anyone signed in, but `people` is not: its
 *     RLS gives HR-level roles everybody's rows and everybody else only their
 *     own. So the role names and duties always render, while the member lists
 *     fill in only for those the database lets see them. That is the policy
 *     doing its job, not a bug — widening it is a decision for a migration on
 *     `people`, which is what 0018 says too.
 */

/*
 * Left off the page by name, not by rank.
 *
 * Filtering on tier looked right and was wrong: 0019 promoted `director` to
 * tier 4 so Finn and Zen could reach every page, which put Directors on the
 * same rung as the two roles that exist to keep the app running — so hiding
 * tier 4 hid the owners of the company along with them. These two ids are the
 * actual thing being excluded, so exclude those.
 */
const NOT_A_JOB = new Set(["system-admin", "developer"]);

function hueFromName(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const initials = (name = "?") =>
  name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

/* ── Bits ─────────────────────────────────────────────── */

function Section({ title, sub, children }) {
  return (
    <div className="krole-sec">
      <div className="krole-sec-head">
        <h3>{title}</h3>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function Duty({ d }) {
  const label = SECTION_LABEL[d.section];
  const path = SECTION_PATH[d.section];
  return (
    <li className="krole-duty">
      <div className="krole-duty-head">
        <span className="krole-duty-title">{d.what}</span>
        <span className="krole-cadence">{d.cadence}</span>
      </div>
      {d.detail && <p className="krole-duty-detail">{d.detail}</p>}
      <div className="krole-duty-links">
        {path && <Link to={path}>{label} →</Link>}
        {d.tour && TOURS[d.tour] && (
          <Link className="krole-show" to={tourHref(d.tour)}>
            <Icons.MapPin size={12} sw={2} /> Show me
          </Link>
        )}
      </div>
    </li>
  );
}

function MemberCard({ m, isYou }) {
  const hours = m.scheduleStart && m.scheduleEnd ? `${m.scheduleStart}–${m.scheduleEnd}` : null;
  return (
    <div className={cn("krole-member", isYou && "krole-member--you")}>
      <div className="krole-member-av" style={{ background: `oklch(55% .16 ${hueFromName(m.name)})` }}>
        {initials(m.name)}
      </div>
      <div className="krole-member-meta">
        <div className="krole-member-name">
          {m.name}
          {isYou && <span className="krole-you-chip">You</span>}
        </div>
        <div className="krole-member-mail">{m.email}</div>
      </div>
      {hours && <span className="krole-member-hours" title="Working hours">{hours}</span>}
    </div>
  );
}

function RoleCard({ position, people, myPersonId, directoryVisible }) {
  const duties = dutiesFor(position);
  const isMine = people.some(p => p.id === myPersonId);

  return (
    <article className={cn("krole-card", isMine && "krole-card--mine")}>
      <header className="krole-card-head">
        <div className="krole-card-title">
          <h4>{position.label}</h4>
        </div>
        {directoryVisible && (
          <span className="krole-count">
            {people.length === 1 ? "1 person" : `${people.length} people`}
          </span>
        )}
      </header>

      {directoryVisible && (
        <div className="krole-members">
          {people.length === 0
            ? <div className="krole-vacant">No one currently in this role.</div>
            : people.map(m => <MemberCard key={m.id} m={m} isYou={m.id === myPersonId} />)}
        </div>
      )}

      {duties === undefined ? (
        <div className="krole-duties-wrap">
          <p className="krole-note">Duties for this role haven't been written up yet.</p>
        </div>
      ) : duties.length > 0 ? (
        <div className="krole-duties-wrap">
          <div className="krole-duties-l">What this role logs</div>
          <ol className="krole-duties">
            {duties.map(d => <Duty key={d.what} d={d} />)}
          </ol>
        </div>
      ) : null}
    </article>
  );
}

/* ── Page ─────────────────────────────────────────────── */

export default function Roles() {
  const { profile } = useAuth();
  const [positions, setPositions] = useState([]);
  const [people, setPeople] = useState(null); // null = not readable / not loaded
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const pos = await fetchAll("positions");
        if (!alive) return;
        setPositions(pos);
      } catch (e) {
        if (alive) setError(e.message || "Couldn't load roles.");
      }

      // Separate, and allowed to fail: most roles cannot read the staff
      // directory, and the roles themselves should still render when it does.
      try {
        const staff = await fetchAll("employees");
        if (alive) setPeople(staff);
      } catch {
        if (alive) setPeople(null);
      }

      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const active = useMemo(
    () => (people || []).filter(p => p.status !== "Inactive" && p.name),
    [people],
  );

  const roles = useMemo(
    () => positions
      .filter(p => !NOT_A_JOB.has(p.id) && !NOT_A_JOB.has(roleKey(p.label)))
      .sort((a, b) => (a.label || "").localeCompare(b.label || "")),
    [positions],
  );

  const holdersOf = (id) => active.filter(p => p.positionId === id);

  // Location comes off the people, so it is only known when the directory is.
  const locationOf = (id) => {
    const loc = holdersOf(id).map(p => (p.location || "").toLowerCase());
    return loc.includes("uk") ? "uk" : loc.length ? "nepal" : null;
  };

  const directoryVisible = active.length > 0;
  const grouped = directoryVisible;

  const ukRoles = grouped ? roles.filter(r => locationOf(r.id) === "uk") : [];
  const npRoles = grouped ? roles.filter(r => locationOf(r.id) !== "uk") : roles;

  const renderRoles = (list) => (
    <div className="krole-cards">
      {list.map(r => (
        <RoleCard
          key={r.id}
          position={r}
          people={holdersOf(r.id)}
          myPersonId={profile?.personId}
          directoryVisible={directoryVisible}
        />
      ))}
    </div>
  );

  return (
    <div className="kscr fade-in krole-wrap">

      <div className="kph krole-ph">
        <div>
          <h2>Roles</h2>
          <p>Who's in each role, and what that role is expected to log in the ERP.</p>
        </div>
      </div>

      {error && (
        <p className="banner-warning">{error}</p>
      )}

      {loading ? (
        <p className="krole-loading">Loading roles…</p>
      ) : roles.length === 0 ? (
        <p className="krole-note">No roles are set up yet.</p>
      ) : grouped ? (
        <>
          {ukRoles.length > 0 && (
            <Section title="UK">
              {renderRoles(ukRoles)}
            </Section>
          )}

          <Section title="Nepal" sub="operations in Kathmandu">
            <section className="krole-shared">
              <div className="krole-shared-l">Everyone on the Nepal team</div>
              <ol className="krole-duties">
                {SHARED_DUTIES.map(d => <Duty key={d.what} d={d} />)}
              </ol>
            </section>
            {renderRoles(npRoles)}
          </Section>
        </>
      ) : (
        <Section title="All roles">
          <section className="krole-shared">
            <div className="krole-shared-l">Everyone on the Nepal team</div>
            <ol className="krole-duties">
              {SHARED_DUTIES.map(d => <Duty key={d.what} d={d} />)}
            </ol>
          </section>
          {renderRoles(npRoles)}
        </Section>
      )}

      <Section title="How the roles sit together">
        <div className="krole-org">
          {[
            { tier: "Directors (UK)", desc: "Own the business, set strategy, manage client relationships and finance from the UK." },
            { tier: "Operations & Accounts (Nepal)", desc: "Run day-to-day ops in Kathmandu — production, billing, payroll, inventory, QC." },
            { tier: "Delivery team (Nepal)", desc: "Production floor, marketing, content and operations support." },
          ].map(({ tier, desc }) => (
            <div key={tier} className="krole-org-row">
              <span className="krole-org-dot" />
              <div>
                <div className="krole-org-tier">{tier}</div>
                <div className="krole-org-desc">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Last thing on the page, under the roles — it applies to all of them
          rather than to any one, and it is what you want in front of somebody
          who has just read their duties and found one of them doesn't work. */}
      <Link className="krole-bug" to="/bug-report">
        <span className="krole-bug-ico"><Icons.Bug size={18} sw={1.8} /></span>
        <span className="krole-bug-txt">
          <strong>Anything broken, confusing, or missing — report it.</strong>
          Every bug, every rough edge, every “it would be much easier if…” goes on the Bug
          Report page. It reaches the dev team directly, and a screenshot usually makes it
          fixable the same day. Nothing is too small to be worth reporting.
        </span>
        <Icons.ChevronRight size={16} />
      </Link>

    </div>
  );
}
