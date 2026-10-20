/**
 * Roles & Duties, on the same frosted-glass frame as the Dashboard and the other redone pages: one screen, nothing scrolls but the
 * panes' own lists.
 *
 *   left    the roles, grouped by where their people are (UK, Nepal), each with who holds it; your own is open when you arrive
 *   middle  the open role: what it is for, the people in it, and what it is expected to log (each duty links to the page where it
 *           is done, and to a "Show me" walk-through where there is one)
 *   right   what everyone on the Nepal team is asked to do, and how the roles sit together
 *
 * The old page was one column 880px wide, left-aligned, four screens tall. Under 1100px the rail gives way to a dropdown in the
 * card, and on a phone the page scrolls and the tiles stack.
 *
 * What the page reads and who may see it is as it always was. The route is ungated: a page telling people what to log is no use if
 * only directors can open it. `positions` is readable by everyone signed in; the staff directory (`fs_employees`, which returns the
 * roster to everyone and masks only pay and contact details) is read on its own and allowed to fail, and then the roles and their
 * duties still draw and the people are left out. Only the words (duties, cadences) are written down, in lib/roles.js, keyed by
 * role; a role with none says so rather than borrowing somebody else's. The rules are in lib/rolesPage.js.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAll } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { BentoGrid, BentoPage } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import RoleRail from "../components/roles/RoleRail";
import RoleCard from "../components/roles/RoleCard";
import { OrgTile, SharedTile } from "../components/roles/Aside";
import { activeStaff, countLabel, firstRoleId, groupRoles, holdersOf, jobRoles, myRoleId } from "../lib/rolesPage";
import "../components/roles/roles.css";

/** Read both tables. A failed directory is not a failure of the page: only the roles themselves are needed. */
async function readAll() {
  let positions;
  try {
    positions = await fetchAll("positions");
  } catch (e) {
    return { error: e.message || "Couldn't load roles." };
  }
  let staff = null;
  try {
    staff = await fetchAll("employees");
  } catch {
    staff = null;
  }
  return { positions, staff };
}

export default function Roles() {
  const { profile } = useAuth();
  const [positions, setPositions] = useState([]);
  const [people, setPeople] = useState(null);          // null = not readable, or not read yet
  const [status, setStatus] = useState("loading");     // loading | ready | error
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [picked, setPicked] = useState(null);          // the role somebody chose; until then the page opens its own choice
  const alive = useRef(true);

  const take = useCallback((res) => {
    if (!alive.current) return;
    if (res.error) { setError(res.error); setStatus("error"); return; }
    setPositions(res.positions);
    setPeople(res.staff);
    setStatus("ready");
  }, []);

  useEffect(() => {
    alive.current = true;
    readAll().then(take);
    return () => { alive.current = false; };
  }, [take]);

  const retry = async () => {
    setRetrying(true);
    try { take(await readAll()); } finally { if (alive.current) setRetrying(false); }
  };

  const loading = status === "loading";
  const active = useMemo(() => activeStaff(people), [people]);
  const roles = useMemo(() => jobRoles(positions), [positions]);
  const directoryVisible = active.length > 0;
  const groups = useMemo(() => groupRoles(roles, active, directoryVisible), [roles, active, directoryVisible]);
  const myId = profile?.personId;
  const mineId = useMemo(() => myRoleId(roles, active, myId), [roles, active, myId]);

  const selectedId = roles.some((r) => r.id === picked) ? picked : firstRoleId(groups, roles, mineId);
  const role = roles.find((r) => r.id === selectedId) || null;
  const holders = role && directoryVisible ? holdersOf(active, role.id) : [];
  const roleOptions = useMemo(
    () => roles.map((r) => ({ value: r.id, label: r.label, hint: directoryVisible ? countLabel(holdersOf(active, r.id).length) : undefined })),
    [roles, active, directoryVisible],
  );

  return (
    <BentoPage className="rl-page">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Roles &amp; Duties</h1>
          <p className="kb-head-sub"><span>Who&apos;s in each role, and what that role is expected to log in the ERP.</span></p>
        </div>
        <div className="kb-head-r">
          <div className="kb-head-act">
            <Link className="kb-pillbtn" to="/bug-report">
              <Icons.Bug size={14} sw={1.9} aria-hidden="true" /> Report a bug
            </Link>
          </div>
        </div>
      </header>

      {status === "error" ? (
        <div className="kb-error" role="alert">
          <p>{error} Check your connection and try again.</p>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={retry} disabled={retrying}>{retrying ? "Trying…" : "Try again"}</button>
        </div>
      ) : (
        <BentoGrid layout="roles">
          <RoleRail groups={groups} active={active} mineId={mineId} selectedId={selectedId} onPick={setPicked} loading={loading} directoryVisible={directoryVisible} />
          <RoleCard role={role} roleOptions={roleOptions} onPick={setPicked} holders={holders} directoryVisible={directoryVisible} myId={myId} loading={loading} />
          <SharedTile loading={loading} />
          <OrgTile loading={loading} />
        </BentoGrid>
      )}
    </BentoPage>
  );
}
