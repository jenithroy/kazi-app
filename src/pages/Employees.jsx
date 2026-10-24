/**
 * Employees & HR, on the same frosted-glass bento frame as the Dashboard, Sales and Finance: one screen, no page scroll, the list
 * scrolls inside its pane.
 *
 *   top row   how many are on the team, what their basic pay comes to, who has no working hours, and who is tagged as a
 *             production worker (each also sets the list's filter, or goes to Payroll)
 *   below     the people: a search and ONE Filters button (components/filters) that holds Active | Inactive | All, the Show choice
 *             (no working hours, production workers), the side of the business, and department, position, join date, pay and a few
 *             "missing" switches. A row opens that person's card (details, pay and bank, working hours); a salary slip is one
 *             press on the row
 *
 * The old page had three tabs (Directory, Org Chart, Payroll) and a 15-column table. The org chart is gone: nobody has a manager
 * set, so it drew every person as a root. "Reports to" stays on the card. Payroll is a page of its own (pages/Payroll.jsx) and is
 * still reached as /employees?tab=payroll; `Employees` at the bottom decides which of the two to draw.
 *
 * The rules and sums are in lib/employees.js, the writes in lib/employeesWrites.js (each reads the row back: row-level security
 * drops a refused update without an error), the reads in hooks/useEmployeesData.js.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { financeTabAllowed, sectionCanEdit } from "../utils/permissions";
import { kathmanduDate } from "../utils/date";
import useMedia from "../hooks/useMedia";
import useUrlTab from "../hooks/useUrlTab";
import { BentoGrid, BentoPage } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import SalarySlipModal from "../components/SalarySlipModal";
import { useShiftN } from "../components/finance/parts";
import useFilters from "../components/filters/useFilters";
import useEmployeesData from "../hooks/useEmployeesData";
import PeoplePane from "../components/employees/PeoplePane";
import PersonCard from "../components/employees/PersonCard";
import { CrewTile, HoursTile, PayTile, PeopleTile } from "../components/employees/Tiles";
import { personName, useStrip } from "../components/employees/parts";
import { countPeople, filterPeople, orderPeople, seesPrivate, summarise } from "../lib/employees";
import { fmtDay } from "../lib/sales";
import Payroll from "./Payroll";
import "../components/employees/employees.css";

function EmployeesPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const phone = useMedia("(max-width: 768px)");
  const canEdit = sectionCanEdit(profile, "employees");
  const canViewPayroll = financeTabAllowed(profile, "payroll");
  const pay = seesPrivate(profile, null);                 // pay and bank figures are only in the directory for tier 2 and above
  const { rows, positions, positionsFailed, state, stale, reload, patch, drop } = useEmployeesData();
  const ready = state === "ready";
  const loading = !ready;
  const today = kathmanduDate();

  const [status, setStatus] = useState("active");     // the page's main view (Active is where it opens), so the panel only mirrors it
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);          // the person whose card is open
  const [creating, setCreating] = useState(false);     // the new-person card
  const [slip, setSlip] = useState(null);              // null, or the salary slip's starting values ({} for a blank one)
  const [note, setNote] = useState(null);              // { tone: "warn" | "bad", text }: something that must stay until it is read
  const [strip, offer, clearStrip] = useStrip();

  useShiftN(canEdit && ready ? () => setCreating(true) : null);

  /* ── what is on screen ─────────────────────────────────── */

  const counts = useMemo(() => countPeople(rows), [rows]);
  const sum = useMemo(() => summarise(rows, { pay }), [rows, pay]);

  // Who is listed: Active | Inactive | All and the search are the page's own (lib/employees.js `filterPeople`); everything else is in the
  // Filters panel. The panel's "Show" and "Side of the business" ask `filterPeople` about one person at a time, so the rules are the old ones.
  const searched = useMemo(() => filterPeople(rows, { status, query }), [rows, status, query]);
  const filterDefs = useMemo(() => {
    const only = (e, opts) => filterPeople([e], { status: "all", ...opts }).length > 0;
    const unset = (v) => !String(v ?? "").trim();
    return [
      // the page's main view: it narrows through `searched`, not here
      {
        id: "view", label: "Which people", kind: "chips", controlled: { value: status, set: setStatus },
        options: [
          { value: "active", label: "Active", count: counts.active },
          { value: "inactive", label: "Inactive", count: counts.inactive },
          { value: "all", label: "All", count: counts.all },
        ],
      },
      {
        id: "focus", label: "Show", kind: "chips", test: (e, v) => only(e, { focus: v }),
        options: [{ value: "", label: "Everyone" }, { value: "nohours", label: "No working hours" }, { value: "prod", label: "Production workers" }],
      },
      {
        id: "side", label: "Side of the business", kind: "chips", test: (e, v) => only(e, { location: v }),
        options: [{ value: "", label: "Both sides" }, { value: "nepal", label: "Nepal" }, { value: "uk", label: "UK" }],
      },
      { id: "dept", label: "Department", kind: "select", of: (e) => e.department, any: "Any department", none: "No department" },
      { id: "role", label: "Position", kind: "select", of: (e) => e.role, any: "Any position", none: "No position" },
      // pay, join date, phone and bank are hidden by the directory for most viewers (a null that means "hidden"): never offer a filter on them there
      ...(pay ? [
        { id: "joined", label: "Joined between", kind: "dates", get: (e) => e.joinDate || "", show: fmtDay, pill: "Joined" },
        { id: "salary", label: "Basic pay", kind: "range", get: (e) => (Number(e.basicSalaryNPR) > 0 ? Number(e.basicSalaryNPR) : null), unit: "NPR", pill: "Basic pay" },
        { id: "nopay", label: "No basic pay set", kind: "toggle", text: "No basic pay set", pill: "No pay set", test: (e) => !(Number(e.basicSalaryNPR) > 0) },
        { id: "nobank", label: "No bank details", kind: "toggle", text: "No bank account", pill: "No bank account", test: (e) => unset(e.bankAccount) },
        { id: "nophone", label: "No phone number", kind: "toggle", text: "No phone number", pill: "No phone number", test: (e) => unset(e.phone) },
      ] : []),
    ];
  }, [status, counts, pay]);
  const tf = useFilters(filterDefs, searched);
  const { clear: clearFilters } = tf;
  const focus = tf.values.focus || "";                    // "" | "nohours" | "prod": the tiles set it
  const filtered = Boolean(query) || tf.count > 0;
  const list = useMemo(() => orderPeople(tf.rows), [tf.rows]);

  const openRow = openId ? rows.find((r) => r.id === openId) || null : null;
  // A person who is gone closes their card. When somebody else removed them the page says so (what was typed in the card is lost);
  // a person this page is deleting itself needs no explanation.
  const knownName = useRef("");
  const removing = useRef(null);
  if (openRow) knownName.current = personName(openRow);
  useEffect(() => {
    if (!(openId && ready && !openRow)) return;
    if (removing.current !== openId) {
      setNote({ tone: "warn", text: `${knownName.current || "That person"} is no longer on the team (somebody else removed them), so their card was closed.` });
    }
    setOpenId(null);
  }, [openId, ready, openRow]);

  // Where the cursor goes when a card closes. The card gives it back to the row that opened it, but that row may be gone by then
  // (the person was deleted, or made inactive and so left the Active list): then it goes to the row that took its place.
  const listRef = useRef(list);
  listRef.current = list;
  const at = useRef(0);                                   // where the open person was in the list
  const wasOpen = useRef(false);
  useEffect(() => {
    const open = openId !== null;
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closed) return undefined;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => {
      const now = document.activeElement;
      if (now && now !== document.body && now.isConnected) return;            // the cursor is already somewhere real
      const hits = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('[data-tile="list"] .dt-hit'));
      hits[Math.min(at.current, hits.length - 1)]?.focus({ preventScroll: true });
    }));
    return () => cancelAnimationFrame(id);
  }, [openId]);

  /* ── the filter, and the tiles that set it ─────────────── */

  function show(next) {
    setStatus(next.status);
    clearFilters();                                       // a tile shows what it counts: every other filter goes back to "any"
    if (next.focus) tf.set("focus", next.focus);
    setQuery("");
    // a phone's page scrolls: bring the list to the top of the screen
    if (phone) {
      const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document.querySelector('[data-tile="list"]')?.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
    }
  }

  /* ── what happens after a write ────────────────────────── */

  const afterSaved = useCallback(async (res) => {
    if (res.unchanged) return;
    patch(res.row);
    await reload();
    offer(`Saved ${personName(res.row)}.`);
  }, [patch, reload, offer]);

  // a new person: show them where they will be found, and say whether their sign-in email went
  const afterCreated = useCallback(async (res) => {
    if (res.row) patch(res.row);
    setStatus(res.status === "Inactive" ? "inactive" : "active");
    clearFilters();
    setQuery("");
    await reload();
    if (res.login.ok) {
      offer(`Added ${res.name}. A password-setup email is on its way to ${res.email}.`);
    } else {
      setNote({
        tone: "warn",
        text: `${res.name} was saved, but their login email couldn't be sent automatically (${res.login.message}). You can invite them from the Supabase dashboard under Authentication.`,
      });
    }
  }, [patch, reload, offer, clearFilters]);

  const afterRemoved = useCallback(async (row) => {
    removing.current = row.id;
    drop(row.id);
    await reload();
    offer(`Deleted ${personName(row)}.`);
  }, [drop, reload, offer]);

  const openSlip = useCallback((r) => setSlip({ empName: r.name, designation: r.role, basicSalaryNPR: r.basicSalaryNPR }), []);
  // where the person's row is on screen (the table's own heads may have sorted it differently from `list`), for the cursor to come back to
  const openCard = useCallback((id) => {
    const who = listRef.current.find((r) => r.id === id);
    const hits = [...document.querySelectorAll('[data-tile="list"] .dt-hit')];
    const i = who ? hits.findIndex((h) => h.getAttribute("aria-label")?.startsWith(`Open ${personName(who)},`)) : -1;
    at.current = i >= 0 ? i : Math.max(0, listRef.current.findIndex((r) => r.id === id));
    setOpenId(id);
  }, []);

  /* ── the page ──────────────────────────────────────────── */

  // what is on screen, in words (the Active | Inactive | All choice is in the Filters panel), then how the team stands
  const sub = ready
    ? (
      <>
        <span>{{ active: "Active people", inactive: "Inactive people", all: "Everyone" }[status]}</span>
        <span>{sum.active} active{sum.inactive > 0 ? ` · ${sum.inactive} inactive` : ""}</span>
      </>
    )
    : state === "error" ? null : <span>Loading…</span>;

  return (
    <BentoPage className="em-page">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Employees &amp; HR</h1>
          <p className="kb-head-sub">{sub}</p>
        </div>
        <div className="kb-head-r">
          <div className="kb-head-act">
            {canViewPayroll && (
              <button type="button" className="kb-pillbtn" onClick={() => navigate("/employees?tab=payroll")}>
                Payroll <Icons.ChevronRight size={14} sw={2} aria-hidden="true" />
              </button>
            )}
            <button type="button" className="kb-pillbtn" onClick={() => setSlip({})} title="Make a salary slip for anyone">
              <Icons.File size={14} sw={1.9} aria-hidden="true" /> Salary slip
            </button>
            {/* off until the list is in: the card's "Reports to" list and the sign-in follow from the people already there */}
            {canEdit && (
              <button type="button" className="kb-btn kb-btn--primary em-newbtn" disabled={!ready} title="Shift + N" onClick={() => setCreating(true)}>
                <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> Add employee
              </button>
            )}
          </div>
        </div>
      </header>

      {note && (
        <div className={`em-banner${note.tone === "bad" ? " em-banner--bad" : ""}`} role={note.tone === "bad" ? "alert" : "status"}>
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>{note.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNote(null)}><Icons.X size={14} sw={2} aria-hidden="true" /></button>
        </div>
      )}
      {ready && stale && (
        <div className="em-banner" role="status">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>{stale}</span>
        </div>
      )}

      {state === "error" ? (
        <div className="kb-error" role="alert">
          <p>The team could not load. Check your connection and try again.</p>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={reload}>Try again</button>
        </div>
      ) : (
        <BentoGrid layout="employees">
          <PeopleTile sum={sum} loading={loading} onOpen={() => show({ status: "active" })} />
          <PayTile sum={sum} loading={loading} to={canViewPayroll ? "/employees?tab=payroll" : undefined} hidden={!pay} />
          <HoursTile sum={sum} loading={loading} onOpen={() => show({ status: "active", focus: "nohours" })} />
          <CrewTile sum={sum} loading={loading} onOpen={() => show({ status: sum.prodInactive > 0 ? "all" : "active", focus: "prod" })} />
          <PeoplePane
            rows={list} counts={counts}
            status={status} filters={tf} filtered={filtered}
            query={query} onQuery={setQuery}
            pay={pay} canEdit={canEdit} hidden={!pay}
            onOpen={openCard} onSlip={openSlip} activeId={openId || undefined} loading={loading}
            strip={strip} onStripClose={clearStrip}
          />
        </BentoGrid>
      )}

      {openRow && (
        <PersonCard
          key={openRow.id} row={openRow} rows={rows} positions={positions} positionsFailed={positionsFailed}
          canEdit={canEdit} canSeePrivate={seesPrivate(profile, openRow)} selfId={profile?.personId} today={today}
          startSection={focus === "nohours" ? "hours" : undefined}
          onSaved={afterSaved} onRemoved={afterRemoved} onLook={reload} onClose={() => setOpenId(null)}
        />
      )}
      {creating && (
        <PersonCard
          key="new" row={null} rows={rows} positions={positions} positionsFailed={positionsFailed}
          canEdit={canEdit} canSeePrivate selfId={profile?.personId} today={today}
          onCreated={afterCreated} onLook={reload} onClose={() => setCreating(false)}
        />
      )}

      {slip !== null && <SalarySlipModal initialData={slip} employees={rows} onClose={() => setSlip(null)} />}
    </BentoPage>
  );
}

/**
 * Employees & HR. Its Payroll tab is a page of its own (pages/Payroll.jsx) and is reached the same way as ever (/employees?tab=payroll);
 * this decides which of the two to draw, so the directory's own loading does not run behind Payroll.
 */
function Employees() {
  const { profile } = useAuth();
  const location = useLocation();
  const canViewPayroll = financeTabAllowed(profile, "payroll");
  // Arrived from Finance's "Payroll This Month" KPI (it passes router state): land straight on Payroll.
  const fromFinance = location.state?.tab === "payroll";
  // The tab lives in the address (?tab=payroll) so the top menu can link straight to Payroll and the menu's highlight follows.
  const [activeTab, setActiveTab] = useUrlTab(["directory", ...(canViewPayroll ? ["payroll"] : [])]);
  useEffect(() => {
    if (fromFinance && canViewPayroll) setActiveTab("payroll");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arrival only
  }, []);
  if (activeTab === "payroll" && canViewPayroll) return <Payroll />;
  return <EmployeesPage />;
}

export default Employees;
