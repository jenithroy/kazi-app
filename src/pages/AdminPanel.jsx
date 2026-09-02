import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAll, supabase, updateRow } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit, sectionVisible } from "../utils/permissions";
import { Avatar, Ico, Icons, cn } from "../components/ui";

/**
 * Roles & Permissions.
 *
 * Access is a property of the job, not the person: you edit a role here and
 * everybody holding it moves together, including anyone already signed in, on
 * their next request. Every switch writes to position_permissions, which is
 * the same table the database reads when it decides whether a query may
 * return a row — there is no second copy of this anywhere.
 *
 * Nothing on the matrix is written as you click it. Edits collect in a draft,
 * a save bar appears, and the whole batch goes up together — so a half-made
 * change is never live, and there is a single "no, put it back" button rather
 * than the hope that you remember what you touched. The page refuses to be
 * navigated away from while that draft exists.
 *
 * Roles used to be filed under a ladder of named strata (Leadership,
 * Management, Staff, Assistants). Nothing in the app ever branched on those
 * names, so they were four headings to keep in sync with reality for no
 * return. What is left is the one distinction the database actually enforces:
 * super admin (tier 4, always full access) and everything else, which is
 * defined by the switches on this page.
 */

const SUPER_ADMIN_TIER = 4;

/* The one other thing tier still decides. Attendance and employee rows are
   filtered by app_tier() >= 2 in RLS, so a role either sees its own records or
   it sees everyone's — that is a scope question, not a rank. */
const RECORDS_TIER = 2;

const SCOPES = [
  { tier: 0, label: "Own records", hint: "On Attendance and Employees, sees only their own rows." },
  { tier: RECORDS_TIER, label: "All records", hint: "Sees everyone's attendance and employee records, on the pages they're granted." },
];

const scopeBucket = (t) => (Number(t) >= RECORDS_TIER ? RECORDS_TIER : 0);

/* ── Access levels ───────────────────────────────────────
   can_view/can_edit are two booleans, but only three of the four combinations
   mean anything — edit without view is not a thing. One three-way choice
   removes a state nobody wants and makes the page readable at a glance. */
const LEVELS = [
  { key: "none", label: "None", hint: "Hidden from the sidebar; the page refuses to open." },
  { key: "view", label: "View", hint: "Can open the page and read it, but not change anything." },
  { key: "edit", label: "Edit", hint: "Full access — can add, change and delete." },
];

const levelOf = (perm) => (!perm?.can_view ? "none" : perm.can_edit ? "edit" : "view");
const flagsFor = (level) => ({ can_view: level !== "none", can_edit: level === "edit" });

const slugify = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function hueFromName(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h % 360;
}

/* A page reads faster with its own sidebar icon beside it than as one of
   twenty identical labels. Unknown ids fall back rather than break. */
const SECTION_ICONS = {
  dashboard: Icons.Dashboard, tasks: Icons.Tasks, attendance: Icons.Attendance,
  production: Icons.Production, quality_control: Icons.QC, inventory: Icons.Inventory,
  library: Icons.Inventory, orders: Icons.Truck, purchases: Icons.Truck,
  sales: Icons.Sales, finance: Icons.Finance, accounting: Icons.Finance,
  billing: Icons.Billing, budget: Icons.Budget, content: Icons.Budget,
  employees: Icons.Employees, directors: Icons.Directors, customers: Icons.Customers,
  marketing: Icons.Marketing, messenger: Icons.Message, admin: Icons.Admin,
  bug_report: Icons.Bug, changelog: Icons.Changelog,
};

const SectionIcon = ({ id, ...rest }) => {
  const C = SECTION_ICONS[id] || Icons.Tasks;
  return <C {...rest} />;
};

const LockIcon = (p) => (
  <Ico
    {...p}
    s={<><rect x="4.75" y="10.5" width="14.5" height="9.5" rx="2.2" /><path d="M8.25 10.5V7.4a3.75 3.75 0 017.5 0v3.1" /></>}
  />
);

const PERSONAL_HINT =
  "Marks this page as one that only ever shows a person their own records. "
  + "It is a note on the page itself, the same for every role — the rule it "
  + "describes lives in that page's database policy.";

/* ── Three-way access selector ───────────────────────────── */
function LevelPicker({ value, onChange, disabled }) {
  return (
    <div className={cn("kap-seg", `kap-seg--${value}`, disabled && "kap-seg--dis")} role="radiogroup">
      {LEVELS.map((l) => (
        <button
          key={l.key}
          type="button"
          role="radio"
          aria-checked={value === l.key}
          disabled={disabled}
          title={l.hint}
          className={cn("kap-seg-btn", value === l.key && "is-on")}
          onClick={() => value !== l.key && onChange(l.key)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

/* ── On/off switch, for the super admin row ──────────────── */
function Switch({ on, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Super admin"
      disabled={disabled}
      className={cn("kap-switch", on && "is-on", disabled && "is-dis")}
      onClick={() => onChange(!on)}
    >
      <span className="kap-switch-knob" />
    </button>
  );
}

/* ── One page's row in the matrix ────────────────────────── */
function AccessRow({
  id, label, level, onChange, disabled, changed,
  personal, personalChanged, onPersonal,
}) {
  return (
    <div className={cn("kap-row", `kap-row--${level}`, changed && "is-changed")}>
      <span className="kap-row-ico"><SectionIcon id={id} size={16} /></span>
      <span className="kap-row-label">{label}</span>
      {onPersonal && (
        <button
          type="button"
          aria-pressed={personal}
          title={PERSONAL_HINT}
          className={cn("kap-personal", personal && "is-on", personalChanged && "is-changed")}
          onClick={() => onPersonal(!personal)}
        >
          own records only
        </button>
      )}
      {!onPersonal && personal && (
        <span className="kap-personal is-on" title={PERSONAL_HINT}>own records only</span>
      )}
      <LevelPicker value={level} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/* ── Distribution bar ────────────────────────────────────── */
function AccessBar({ counts, total, height = 5 }) {
  const pct = (n) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <span className="kap-bar" style={{ height }}>
      <span className="kap-bar-seg kap-bar-seg--edit" style={{ width: pct(counts.edit) }} />
      <span className="kap-bar-seg kap-bar-seg--view" style={{ width: pct(counts.view) }} />
      <span className="kap-bar-seg kap-bar-seg--none" style={{ width: pct(counts.none) }} />
    </span>
  );
}

/* ── Create / edit a role ────────────────────────────────── */
function RoleEditor({ mode, initial, existingIds = [], busy, onSubmit, onCancel, onDelete, holderCount = 0 }) {
  const editing = mode === "edit";
  const [label, setLabel] = useState(initial?.label || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [scope, setScope] = useState(scopeBucket(initial?.tier ?? 0));

  // On create the id is derived from the name rather than typed — one less
  // thing to get wrong, and it stays stable if the name is reworded later.
  const id = editing ? initial.id : slugify(label);
  const clash = !editing && !!id && existingIds.includes(id);
  const valid = !!label.trim() && !!id && !clash;

  return (
    <form
      className="kap-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        // Keep an existing tier that already sits inside the chosen bucket, so
        // renaming a role never quietly re-ranks it.
        const tier = scopeBucket(initial?.tier ?? 0) === scope ? (initial?.tier ?? 0) : scope;
        onSubmit({ id, label: label.trim(), description: description.trim() || null, tier });
      }}
    >
      <div className="kap-editor-hd">
        <h3>{editing ? `Edit ${initial.label}` : "New role"}</h3>
        <button type="button" className="kap-iconbtn" onClick={onCancel} aria-label="Close">
          <Icons.X size={15} />
        </button>
      </div>

      <div className="kap-editor-grid">
        <label className="kap-field">
          <span className="kap-field-label">Role name</span>
          <input
            type="text" value={label} autoFocus required
            placeholder="e.g. Production Supervisor"
            onChange={(e) => setLabel(e.target.value)}
          />
          {!editing && id && <span className="kap-field-hint">Saved as <code>{id}</code></span>}
          {editing && <span className="kap-field-hint">Id <code>{id}</code> never changes.</span>}
          {clash && <span className="kap-field-err">A role with that name already exists.</span>}
        </label>

        <label className="kap-field">
          <span className="kap-field-label">Description <em>optional</em></span>
          <input
            type="text" value={description}
            placeholder="What this role is for"
            onChange={(e) => setDescription(e.target.value)}
          />
          <span className="kap-field-hint">Shown here only, to explain the role to whoever edits it next.</span>
        </label>

        <div className="kap-field">
          <span className="kap-field-label">Record scope</span>
          <div className="kap-scope">
            {SCOPES.map((s) => (
              <button
                key={s.tier}
                type="button"
                className={cn("kap-scope-btn", scope === s.tier && "is-on")}
                onClick={() => setScope(s.tier)}
                title={s.hint}
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className="kap-field-hint">{SCOPES.find((s) => s.tier === scope)?.hint}</span>
        </div>
      </div>

      <div className="kap-editor-ft">
        <div className="kap-editor-actions">
          <button type="submit" className="kap-btn kap-btn--primary" disabled={!valid || busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create role"}
          </button>
          <button type="button" className="kap-btn" onClick={onCancel}>Cancel</button>
        </div>
        {editing ? (
          <button
            type="button"
            className="kap-btn kap-btn--danger"
            disabled={busy || holderCount > 0}
            title={holderCount > 0 ? "Move the people holding this role first." : "Delete this role"}
            onClick={onDelete}
          >
            Delete role
          </button>
        ) : (
          <p className="kap-editor-note">
            Starts with no access at all. Grant pages below, then assign people from Employees &amp; HR.
          </p>
        )}
      </div>
    </form>
  );
}

/* An untouched draft. Only entries that differ from what is saved live here,
   so putting a switch back where it was makes the page clean again. */
const EMPTY_DRAFT = { levels: {}, tabs: {}, personal: {}, superAdmin: null };

/* ── Main component ──────────────────────────────────────── */
export default function AdminPanel() {
  const { profile, reloadProfile } = useAuth();

  const [positions, setPositions] = useState([]);
  const [sections, setSections] = useState([]);
  const [financeTabs, setFinTabs] = useState([]);
  const [perms, setPerms] = useState({});       // positionId -> sectionId -> {can_view, can_edit}
  const [tabPerms, setTabPerms] = useState({}); // positionId -> tabId -> {can_view, can_edit}
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [savingAll, setSavingAll] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);   // null | "new" | "edit"
  const [busy, setBusy] = useState(false);
  const [roleQuery, setRoleQuery] = useState("");
  const [pageQuery, setPageQuery] = useState("");
  const [finOpen, setFinOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [personQuery, setPersonQuery] = useState("");
  const [personBusy, setPersonBusy] = useState("");

  const load = useCallback(async () => {
    const [pos, secs, tabs, pp, pft, staff] = await Promise.all([
      fetchAll("positions"),
      fetchAll("sections"),
      fetchAll("finance_tabs"),
      fetchAll("position_permissions"),
      fetchAll("position_finance_tabs"),
      fetchAll("employees"),
    ]);

    const byPos = {};
    for (const r of pp) (byPos[r.position_id] ||= {})[r.section_id] = { can_view: !!r.can_view, can_edit: !!r.can_edit };
    const byTab = {};
    for (const r of pft) (byTab[r.position_id] ||= {})[r.tab_id] = { can_view: !!r.can_view, can_edit: !!r.can_edit };

    setPositions([...pos].sort((a, b) => a.label.localeCompare(b.label)));
    setSections([...secs].sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99)));
    setFinTabs([...tabs].sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99)));
    setPerms(byPos);
    setTabPerms(byTab);
    setPeople(staff);
    setSelected((cur) => cur || pos.find((p) => p.tier < SUPER_ADMIN_TIER)?.id || pos[0]?.id || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((e) => { console.error(e); setError(e.message); setLoading(false); });
  }, [load]);

  const canAdminister = sectionCanEdit(profile, "admin");
  const selectedRole = positions.find((p) => p.id === selected) || null;

  /* ── The draft ───────────────────────────────────────── */
  const changeCount =
    Object.keys(draft.levels).length +
    Object.keys(draft.tabs).length +
    Object.keys(draft.personal).length +
    (draft.superAdmin !== null ? 1 : 0);
  const dirty = changeCount > 0;

  const savedSuper = (selectedRole?.tier ?? 0) >= SUPER_ADMIN_TIER;
  const isSuperAdmin = draft.superAdmin ?? savedSuper;   // what the page is showing
  const locked = !canAdminister || isSuperAdmin;

  const resetDraft = useCallback(() => setDraft(EMPTY_DRAFT), []);

  /** Flash the save bar at someone trying to walk away mid-edit. */
  const nudge = useCallback(() => {
    setShaking(true);
    window.setTimeout(() => setShaking(false), 500);
  }, []);

  /** Wrap anything that would throw the draft away. */
  const guard = useCallback((fn) => (...args) => {
    if (dirty) { nudge(); return; }
    fn(...args);
  }, [dirty, nudge]);

  /** Stage one edit, or drop it again if it lands back on the saved value. */
  const stage = useCallback((bucket, key, value, saved) => {
    setDraft((d) => {
      const next = { ...d, [bucket]: { ...d[bucket] } };
      if (value === saved) delete next[bucket][key];
      else next[bucket][key] = value;
      return next;
    });
  }, []);

  const savedLevel = useCallback(
    (sectionId) => levelOf(perms[selected]?.[sectionId]),
    [perms, selected]
  );
  const levelFor = (sectionId) =>
    (isSuperAdmin ? "edit" : draft.levels[sectionId] ?? savedLevel(sectionId));

  const savedTabLevel = useCallback(
    (tabId) => levelOf(tabPerms[selected]?.[tabId]),
    [tabPerms, selected]
  );
  const tabLevelFor = (tabId) =>
    (isSuperAdmin ? "edit" : draft.tabs[tabId] ?? savedTabLevel(tabId));

  const personalFor = (section) => draft.personal[section.id] ?? !!section.is_personal;

  /* ── Leaving with a draft open ───────────────────────── */
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // The router here is a plain BrowserRouter, so there is no blocker to hook
  // into. Every in-app link is a real anchor, though, so catching the click
  // before the router sees it holds the page in exactly the cases that matter:
  // the sidebar, the topbar, anything a stray click lands on.
  useEffect(() => {
    if (!dirty) return undefined;
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const link = e.target?.closest?.("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.getAttribute("href"), window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      nudge();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, nudge]);

  const activePeople = useMemo(() => people.filter((p) => p.status !== "Inactive"), [people]);
  const holders = useMemo(() => activePeople.filter((p) => p.positionId === selected), [activePeople, selected]);
  const holderCount = useCallback(
    (posId) => activePeople.filter((p) => p.positionId === posId).length,
    [activePeople]
  );

  const countsFor = useCallback((posId, tier) => {
    if (tier >= SUPER_ADMIN_TIER) return { edit: sections.length, view: 0, none: 0 };
    const p = perms[posId] || {};
    let edit = 0, view = 0;
    for (const s of sections) {
      const l = levelOf(p[s.id]);
      if (l === "edit") edit++; else if (l === "view") view++;
    }
    return { edit, view, none: sections.length - edit - view };
  }, [perms, sections]);

  /** What the meter shows: the draft as it stands, not what is saved. */
  const draftCounts = useMemo(() => {
    if (isSuperAdmin) return { edit: sections.length, view: 0, none: 0 };
    let edit = 0, view = 0;
    for (const s of sections) {
      const l = draft.levels[s.id] ?? levelOf(perms[selected]?.[s.id]);
      if (l === "edit") edit++; else if (l === "view") view++;
    }
    return { edit, view, none: sections.length - edit - view };
  }, [sections, draft.levels, perms, selected, isSuperAdmin]);

  const filteredRoles = useMemo(() => {
    const q = roleQuery.trim().toLowerCase();
    if (!q) return positions;
    return positions.filter((p) => `${p.label} ${p.id} ${p.description || ""}`.toLowerCase().includes(q));
  }, [positions, roleQuery]);

  const superRoles = filteredRoles.filter((p) => p.tier >= SUPER_ADMIN_TIER);
  const normalRoles = filteredRoles.filter((p) => p.tier < SUPER_ADMIN_TIER);

  const visibleSectionRows = useMemo(() => {
    const q = pageQuery.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter((s) => `${s.label} ${s.id}`.toLowerCase().includes(q));
  }, [sections, pageQuery]);

  // Moving somebody between roles writes to people, which RLS gates on
  // employees-edit — not on admin. Someone can be allowed to shape a role
  // without being allowed to decide who holds it.
  const canManagePeople = sectionCanEdit(profile, "employees");

  const candidates = useMemo(() => {
    const q = personQuery.trim().toLowerCase();
    return activePeople
      .filter((p) => p.positionId !== selected && p.name)
      .filter((p) => !q || `${p.name} ${p.email || ""} ${p.department || ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activePeople, selected, personQuery]);

  const roleLabel = useCallback(
    (posId) => positions.find((p) => p.id === posId)?.label || "",
    [positions]
  );

  /* ── Staging edits ───────────────────────────────────── */
  function setSectionLevel(sectionId, level) {
    if (locked) return;
    stage("levels", sectionId, level, savedLevel(sectionId));
  }

  function setTabLevel(tabId, level) {
    if (locked) return;
    stage("tabs", tabId, level, savedTabLevel(tabId));
  }

  function setPersonal(section, value) {
    if (!canAdminister) return;
    stage("personal", section.id, value, !!section.is_personal);
  }

  /** Every page at once — still only staged. */
  function setAll(level) {
    if (locked) return;
    setDraft((d) => {
      const levels = { ...d.levels };
      for (const s of sections) {
        if (levelOf(perms[selected]?.[s.id]) === level) delete levels[s.id];
        else levels[s.id] = level;
      }
      return { ...d, levels };
    });
  }

  /**
   * Super admin, as a switch at the end of the matrix.
   *
   * It is a tier, not a permission row: tier 4 is what the database itself
   * treats as unreducible, and a trigger fills in every page and finance tab
   * the moment a role reaches it. Staged like everything else, so it only
   * happens on save.
   */
  function setSuperAdmin(on) {
    if (!canAdminister) return;
    setDraft((d) => {
      const next = { ...d, superAdmin: on === savedSuper ? null : on };
      // With super admin on, every page is granted whatever the switches say,
      // so staged page edits are moot — and the database would refuse them
      // outright if the role is already tier 4. Drop them rather than carry a
      // pending change that cannot land.
      if (on) { next.levels = {}; next.tabs = {}; }
      return next;
    });
  }

  /* ── Committing the draft ────────────────────────────── */
  async function saveChanges() {
    if (!dirty || savingAll || !selectedRole) return;

    // Dropping super admin is destructive in a way worth stopping on, and it
    // cannot un-grant what tier 4 already handed out.
    if (draft.superAdmin === false && !window.confirm(
      `Remove super admin from "${selectedRole.label}"?\n\n`
      + "It keeps edit on every page it was given — those switches become editable "
      + "again, so turn off whatever it shouldn't have. Its record scope drops to "
      + "own records."
    )) return;

    setSavingAll(true);
    setError("");
    try {
      // Order matters. While the role is still tier 4 the database refuses to
      // reduce any of its rows, so the demotion has to land first.
      if (draft.superAdmin === false) {
        const { error: err } = await supabase.from("positions").update({ tier: 0 }).eq("id", selected);
        if (err) throw err;
      }

      const permRows = Object.entries(draft.levels)
        .map(([sectionId, level]) => ({ position_id: selected, section_id: sectionId, ...flagsFor(level) }));
      if (permRows.length) {
        const { error: err } = await supabase
          .from("position_permissions").upsert(permRows, { onConflict: "position_id,section_id" });
        if (err) throw err;
      }

      const tabRows = Object.entries(draft.tabs)
        .map(([tabId, level]) => ({ position_id: selected, tab_id: tabId, ...flagsFor(level) }));
      if (tabRows.length) {
        const { error: err } = await supabase
          .from("position_finance_tabs").upsert(tabRows, { onConflict: "position_id,tab_id" });
        if (err) throw err;
      }

      // Page annotations are a property of the page, not of this role.
      for (const [sectionId, value] of Object.entries(draft.personal)) {
        const { error: err } = await supabase
          .from("sections").update({ is_personal: value }).eq("id", sectionId);
        if (err) throw err;
      }

      // Granting it goes last: the trigger behind it fills in every page.
      if (draft.superAdmin === true) {
        const { error: err } = await supabase
          .from("positions").update({ tier: SUPER_ADMIN_TIER }).eq("id", selected);
        if (err) throw err;
      }

      setDraft(EMPTY_DRAFT);
      await load();
      if (selected === profile?.positionId) reloadProfile?.();
    } catch (e) {
      // The draft stays put, so nothing is lost and the save can be retried.
      setError(e.message);
    }
    setSavingAll(false);
  }

  /* ── People, written as you go ───────────────────────── */
  async function assignPerson(person) {
    if (!canManagePeople || !selectedRole || person.positionId === selectedRole.id) return;
    const current = roleLabel(person.positionId);
    if (current && !window.confirm(
      `${person.name} holds "${current}". Move them to "${selectedRole.label}"?`
    )) return;

    setPersonBusy(person.id);
    setError("");
    try {
      await updateRow("employees", person.id, { positionId: selectedRole.id });
      setPeople((prev) => prev.map((p) => (p.id === person.id ? { ...p, positionId: selectedRole.id } : p)));
      if (person.id === profile?.personId) reloadProfile?.();
    } catch (e) {
      setError(e.message);
    }
    setPersonBusy("");
  }

  async function unassignPerson(person) {
    if (!canManagePeople) return;
    if (!window.confirm(
      `Take ${person.name} out of "${selectedRole.label}"?\n\n`
      + "They will hold no role, which means no access to any page until you give them one."
    )) return;

    setPersonBusy(person.id);
    setError("");
    try {
      await updateRow("employees", person.id, { positionId: null });
      setPeople((prev) => prev.map((p) => (p.id === person.id ? { ...p, positionId: null } : p)));
      if (person.id === profile?.personId) reloadProfile?.();
    } catch (e) {
      setError(e.message);
    }
    setPersonBusy("");
  }

  /* ── The role itself ─────────────────────────────────── */
  async function createRole({ id, label, description, tier }) {
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("positions").insert({ id, label, description, tier });
    if (err) setError(err.message);
    else {
      setEditor(null);
      await load();
      setSelected(id);
    }
    setBusy(false);
  }

  async function saveRole({ id, label, description, tier }) {
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("positions").update({ label, description, tier }).eq("id", id);
    if (err) setError(err.message);
    else {
      setEditor(null);
      await load();
    }
    setBusy(false);
  }

  async function deleteRole() {
    if (!selectedRole) return;
    if (!window.confirm(`Delete the role "${selectedRole.label}"? Its permissions go with it.`)) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("positions").delete().eq("id", selectedRole.id);
    if (err) setError(err.message);
    else {
      setEditor(null);
      setSelected(null);
      await load();
    }
    setBusy(false);
  }

  /* ── Access gate ── */
  if (!sectionVisible(profile, "admin")) {
    return (
      <div className="kap-deny">
        <span className="kap-deny-ico"><LockIcon size={26} /></span>
        <h2>Access restricted</h2>
        <p>Your role doesn't include the Admin Panel.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="kap">
        <div className="kap-skel kap-skel--head" />
        <div className="kap-body">
          <div className="kap-skel kap-skel--rail" />
          <div className="kap-skel kap-skel--panel" />
        </div>
      </div>
    );
  }

  const showSuperRow = !pageQuery.trim() || "super admin".includes(pageQuery.trim().toLowerCase());

  const selectRole = guard((id) => {
    setSelected(id);
    setEditor(null);
    setPageQuery("");
    setPeopleOpen(false);
    setPersonQuery("");
  });

  const roleButton = (r) => {
    const c = countsFor(r.id, r.tier);
    const n = holderCount(r.id);
    const isSuper = r.tier >= SUPER_ADMIN_TIER;
    return (
      <button
        key={r.id}
        className={cn("kap-role", selected === r.id && "is-active")}
        onClick={() => selectRole(r.id)}
      >
        <span className="kap-role-top">
          <Avatar name={r.label} hue={hueFromName(r.label)} size={24} />
          <span className="kap-role-name">{r.label}</span>
          {isSuper && <LockIcon size={13} />}
          {selected === r.id && dirty && <span className="kap-role-dot" title="Unsaved changes" />}
        </span>
        <span className="kap-role-meta">
          {n === 0 ? "nobody assigned" : `${n} ${n === 1 ? "person" : "people"}`}
          <span className="kap-dot">·</span>
          {isSuper ? "all pages" : `${c.edit} edit · ${c.view} view`}
        </span>
        <AccessBar counts={c} total={sections.length} height={3} />
      </button>
    );
  };

  return (
    <div className="kap">
      {/* ── Header ── */}
      <header className="kap-top">
        <div className="kap-top-l">
          <h1 className="kap-title">Roles &amp; permissions</h1>
          <p className="kap-sub">
            Access belongs to the role, not the person. Change a role here and everyone
            holding it changes with it — including anyone already signed in.
          </p>
        </div>
        <div className="kap-top-r">
          <div className="kap-stats">
            <div className="kap-stat">
              <span className="kap-stat-n">{positions.length}</span>
              <span className="kap-stat-l">roles</span>
            </div>
            <div className="kap-stat">
              <span className="kap-stat-n">{activePeople.filter((p) => p.positionId).length}</span>
              <span className="kap-stat-l">people</span>
            </div>
            <div className="kap-stat">
              <span className="kap-stat-n">{sections.length}</span>
              <span className="kap-stat-l">pages</span>
            </div>
          </div>
          {canAdminister && (
            <button className="kap-btn kap-btn--primary" onClick={guard(() => setEditor("new"))}>
              <Icons.Plus size={15} /> New role
            </button>
          )}
        </div>
      </header>

      {!canAdminister && (
        <div className="kap-note">
          <Icons.Alert size={15} />
          <span>You can see how roles are configured, but only roles with edit access to the Admin Panel can change them.</span>
        </div>
      )}

      {error && (
        <div className="kap-error" role="alert">
          <Icons.Alert size={15} />
          <span><strong>Couldn't save.</strong> {error}</span>
          <button className="kap-iconbtn" onClick={() => setError("")} aria-label="Dismiss">
            <Icons.X size={14} />
          </button>
        </div>
      )}

      {editor === "new" && (
        <RoleEditor
          mode="new"
          existingIds={positions.map((p) => p.id)}
          busy={busy}
          onSubmit={createRole}
          onCancel={() => setEditor(null)}
        />
      )}

      <div className="kap-body">
        {/* ── Left: roles ── */}
        <aside className="kap-rail">
          <div className="kap-search">
            <Icons.Search size={14} />
            <input
              type="search"
              value={roleQuery}
              placeholder="Search roles"
              aria-label="Search roles"
              onChange={(e) => setRoleQuery(e.target.value)}
            />
          </div>

          <div className="kap-rail-scroll">
            {superRoles.length > 0 && (
              <div className="kap-group">
                <div className="kap-group-hd">
                  <LockIcon size={11} />
                  <span>Super admin</span>
                  <span className="kap-group-note">always full access</span>
                </div>
                {superRoles.map(roleButton)}
              </div>
            )}

            <div className="kap-group">
              <div className="kap-group-hd">
                <span>Roles</span>
                <span className="kap-group-note">{normalRoles.length}</span>
              </div>
              {normalRoles.length === 0
                ? <p className="kap-rail-empty">{roleQuery ? "No role matches that." : "No roles yet."}</p>
                : normalRoles.map(roleButton)}
            </div>
          </div>
        </aside>

        {/* ── Right: the matrix ── */}
        <section className="kap-panel">
          {!selectedRole ? (
            <div className="kap-empty">
              <Icons.Admin size={30} />
              <p>Pick a role to see what it can reach.</p>
            </div>
          ) : editor === "edit" ? (
            <RoleEditor
              mode="edit"
              initial={selectedRole}
              busy={busy}
              holderCount={holders.length}
              onSubmit={saveRole}
              onCancel={() => setEditor(null)}
              onDelete={deleteRole}
            />
          ) : (
            <>
              {/* Everything about the role itself in one fixed block, so the
                  matrix below is what gets the leftover height. */}
              <div className="kap-panel-top">
                <div className="kap-panel-hd">
                  <Avatar name={selectedRole.label} hue={hueFromName(selectedRole.label)} size={36} />
                  <div className="kap-panel-id">
                    <h2>
                      {selectedRole.label}
                      {isSuperAdmin && (
                        <span className="kap-chip kap-chip--lock"><LockIcon size={11} /> super admin</span>
                      )}
                      {!isSuperAdmin && scopeBucket(selectedRole.tier) === RECORDS_TIER && (
                        <span className="kap-chip">all records</span>
                      )}
                    </h2>
                    <p className="kap-panel-sub">
                      <code>{selectedRole.id}</code>
                      {selectedRole.description ? <> · {selectedRole.description}</> : null}
                    </p>
                  </div>
                  <div className="kap-panel-actions">
                    {!locked && (
                      <div className="kap-bulk">
                        <span className="kap-bulk-l">Set all</span>
                        <button className="kap-btn kap-btn--sm" onClick={() => setAll("none")}>None</button>
                        <button className="kap-btn kap-btn--sm" onClick={() => setAll("view")}>View</button>
                        <button className="kap-btn kap-btn--sm" onClick={() => setAll("edit")}>Edit</button>
                      </div>
                    )}
                    {canAdminister && !isSuperAdmin && (
                      <button className="kap-btn" onClick={guard(() => setEditor("edit"))}>Edit role</button>
                    )}
                  </div>
                </div>

                <div className="kap-meter">
                  <AccessBar counts={draftCounts} total={sections.length} height={5} />
                  <div className="kap-legend">
                    <span><i className="kap-swatch kap-swatch--edit" />{draftCounts.edit} edit</span>
                    <span><i className="kap-swatch kap-swatch--view" />{draftCounts.view} view</span>
                    <span><i className="kap-swatch kap-swatch--none" />{draftCounts.none} hidden</span>
                  </div>
                  {isSuperAdmin && (
                    <span className="kap-meter-note">
                      <LockIcon size={12} /> Locked while super admin is on.
                    </span>
                  )}
                </div>

                {/* Who holds it. Click through to add and remove people. */}
                <div className="kap-people">
                  <button
                    type="button"
                    className="kap-people-trigger"
                    aria-expanded={peopleOpen}
                    title={canManagePeople ? "Add or remove people in this role" : "Who holds this role"}
                    onClick={() => setPeopleOpen((v) => !v)}
                  >
                    {holders.length === 0 ? (
                      <span className="kap-holders-empty">Nobody holds this role yet</span>
                    ) : (
                      <>
                        <span className="kap-holders-stack">
                          {holders.slice(0, 6).map((h) => (
                            <span key={h.id} title={h.name}>
                              <Avatar name={h.name} hue={hueFromName(h.name)} size={24} ring="var(--card)" />
                            </span>
                          ))}
                          {holders.length > 6 && <span className="kap-holders-more">+{holders.length - 6}</span>}
                        </span>
                        <span className="kap-holders-txt">
                          {holders.slice(0, 3).map((h) => h.name).join(", ")}
                          {holders.length > 3 && ` +${holders.length - 3} more`}
                        </span>
                      </>
                    )}
                    <span className="kap-people-cta">
                      {canManagePeople ? "Add or remove" : "See who"}
                      <span className={cn("kap-chev", peopleOpen && "is-open")}><Icons.ChevronDown size={14} /></span>
                    </span>
                  </button>

                  {peopleOpen && (
                    <div className="kap-people-panel">
                      <div className="kap-people-col">
                        <div className="kap-people-hd">
                          <span>In this role</span>
                          <span className="kap-people-n">{holders.length}</span>
                        </div>
                        <div className="kap-people-list">
                          {holders.length === 0 ? (
                            <p className="kap-people-empty">Nobody yet — add someone from the right.</p>
                          ) : holders.map((h) => (
                            <div key={h.id} className="kap-person">
                              <Avatar name={h.name} hue={hueFromName(h.name)} size={26} />
                              <span className="kap-person-id">
                                <span className="kap-person-name">{h.name}</span>
                                <em>{h.department || h.email || "—"}</em>
                              </span>
                              {canManagePeople && (
                                <button
                                  className="kap-btn kap-btn--sm"
                                  disabled={personBusy === h.id}
                                  onClick={() => unassignPerson(h)}
                                >
                                  {personBusy === h.id ? "…" : "Remove"}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="kap-people-col">
                        <div className="kap-people-hd">
                          <span>Add someone</span>
                        </div>
                        {!canManagePeople ? (
                          <p className="kap-people-empty">
                            Moving people between roles needs edit access to Employees &amp; HR.
                          </p>
                        ) : (
                          <>
                            <div className="kap-search kap-search--sm">
                              <Icons.Search size={13} />
                              <input
                                type="search" value={personQuery} placeholder="Search people"
                                aria-label="Search people to add"
                                onChange={(e) => setPersonQuery(e.target.value)}
                              />
                            </div>
                            <div className="kap-people-list">
                              {candidates.length === 0 ? (
                                <p className="kap-people-empty">Nobody else matches.</p>
                              ) : candidates.slice(0, 50).map((p) => (
                                <div key={p.id} className="kap-person">
                                  <Avatar name={p.name} hue={hueFromName(p.name)} size={26} />
                                  <span className="kap-person-id">
                                    <span className="kap-person-name">{p.name}</span>
                                    <em>{roleLabel(p.positionId) || "no role"}</em>
                                  </span>
                                  <button
                                    className="kap-btn kap-btn--sm kap-btn--add"
                                    disabled={personBusy === p.id}
                                    onClick={() => assignPerson(p)}
                                  >
                                    {personBusy === p.id ? "…" : "Add"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Pages */}
              <div className="kap-card kap-card--grow">
                <div className="kap-card-hd">
                  <span className="kap-card-title">Page access</span>
                  <div className="kap-search kap-search--sm">
                    <Icons.Search size={13} />
                    <input
                      type="search" value={pageQuery} placeholder="Filter pages"
                      aria-label="Filter pages"
                      onChange={(e) => setPageQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="kap-rows">
                  {visibleSectionRows.length === 0 && !showSuperRow ? (
                    <p className="kap-rows-empty">No page matches that.</p>
                  ) : visibleSectionRows.map((s) => (
                    <AccessRow
                      key={s.id}
                      id={s.id}
                      label={s.label}
                      level={levelFor(s.id)}
                      changed={draft.levels[s.id] !== undefined}
                      onChange={(lvl) => setSectionLevel(s.id, lvl)}
                      disabled={locked}
                      personal={personalFor(s)}
                      personalChanged={draft.personal[s.id] !== undefined}
                      onPersonal={canAdminister ? (v) => setPersonal(s, v) : undefined}
                    />
                  ))}

                  {/* Last row, and the only one that isn't a page: the whole
                      matrix above stops applying while this is on. */}
                  {showSuperRow && (
                    <div className={cn(
                      "kap-row kap-row--super",
                      isSuperAdmin && "is-on",
                      draft.superAdmin !== null && "is-changed",
                    )}>
                      <span className="kap-row-ico"><LockIcon size={16} /></span>
                      <span className="kap-row-label">
                        Super admin
                        <em>
                          Full access to every page and finance tab, permanently — the switches
                          above stop applying, and nothing can reduce it while this is on.
                        </em>
                      </span>
                      <Switch
                        on={isSuperAdmin}
                        disabled={!canAdminister || savingAll}
                        onChange={setSuperAdmin}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Finance tabs */}
              <div className="kap-card kap-card--fin">
                <button className="kap-card-hd kap-card-hd--btn" onClick={() => setFinOpen((v) => !v)}>
                  <span className="kap-card-title">Finance tabs</span>
                  <span className="kap-card-note">
                    Inside the Finance page — {financeTabs.length} tabs
                    <span className={cn("kap-chev", finOpen && "is-open")}><Icons.ChevronDown size={15} /></span>
                  </span>
                </button>
                {finOpen && (
                  <div className="kap-rows">
                    {financeTabs.map((t) => (
                      <AccessRow
                        key={t.id}
                        id="finance"
                        label={t.label}
                        level={tabLevelFor(t.id)}
                        changed={draft.tabs[t.id] !== undefined}
                        onChange={(lvl) => setTabLevel(t.id, lvl)}
                        disabled={locked}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* ── Nothing is live until this is saved ── */}
      {dirty && (
        <div className={cn("kap-savebar", shaking && "is-shaking")} role="status" aria-live="polite">
          <span className="kap-savebar-ico"><Icons.Alert size={16} /></span>
          <span className="kap-savebar-txt">
            <strong>Careful — you have unsaved changes.</strong>
            <em>
              {changeCount} {changeCount === 1 ? "change" : "changes"} on {selectedRole?.label}
            </em>
          </span>
          <button className="kap-btn kap-btn--sm" disabled={savingAll} onClick={resetDraft}>
            Undo changes
          </button>
          <button className="kap-btn kap-btn--sm kap-btn--primary" disabled={savingAll} onClick={saveChanges}>
            {savingAll ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}
