import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { sectionVisible, visibleSections } from "../utils/permissions";

/**
 * Where to send someone who has no business on the page they asked for.
 *
 * Their own dashboard if they have one, otherwise the first section their
 * position does open. Falling back to a fixed route would bounce anyone who
 * cannot see that route straight back here.
 */
export function landingPath(profile) {
  if (sectionVisible(profile, "dashboard")) return "/dashboard";
  const first = visibleSections(profile).find((s) => SECTION_ROUTES[s]);
  return first ? SECTION_ROUTES[first] : null;
}

// Only sections that have a page of their own.
const SECTION_ROUTES = {
  dashboard: "/dashboard",
  tasks: "/tasks",
  attendance: "/attendance",
  production: "/production",
  quality_control: "/qc",
  inventory: "/inventory",
  library: "/inventory",
  sales: "/sales",
  billing: "/billing",
  finance: "/finance",
  purchases: "/purchases",
  budget: "/content",
  employees: "/employees",
  directors: "/directors",
  customers: "/customers",
  marketing: "/marketing",
  messenger: "/messenger",
  admin: "/admin",
};

function NoAccess({ profile }) {
  const home = landingPath(profile);
  return (
    <div className="knoaccess">
      <div className="knoaccess-card">
        <h1 className="knoaccess-title">You don't have access to this page</h1>
        <p className="knoaccess-body">
          Your position is <strong>{profile?.positionLabel || "not set"}</strong>, which doesn't
          include this section. If you think it should, ask an administrator to
          change your position in Employees &amp; HR.
        </p>
        {home ? (
          <Link className="primary-button knoaccess-btn" to={home}>Go to {home === "/dashboard" ? "your dashboard" : "a page you can open"}</Link>
        ) : (
          <p className="knoaccess-body">
            Your position doesn't open any pages yet. An administrator needs to set it up.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Gates one route on a section from the permission matrix.
 *
 * This is the check that was missing: the app had a single guard asking only
 * "are you signed in?", so typing /finance into the address bar loaded Finance
 * for anyone with an account. Row level security kept the *data* empty, which
 * is the protection that actually matters, but the page still opened — and a
 * page that renders its own chrome, totals of nothing, and edit controls is
 * both confusing and a needless hint about what exists.
 *
 * `anyOf` is for pages that merge two sections — Inventory and Product Library
 * are one screen, so either permission opens it.
 */
export default function RequireSection({ section, anyOf, children }) {
  const { profile } = useAuth();
  const wanted = anyOf || [section];

  if (!wanted.some((s) => sectionVisible(profile, s))) {
    return <NoAccess profile={profile} />;
  }
  return children;
}
