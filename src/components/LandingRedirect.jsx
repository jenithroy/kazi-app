import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { landingPath } from "./RequireSection";

/**
 * Sends a signed-in person to a page they can actually open.
 *
 * The catch-all used to point at /dashboard for everyone, which is wrong for
 * any position that cannot see the dashboard — they would be redirected to a
 * page that immediately refuses them.
 */
export default function LandingRedirect() {
  const { profile } = useAuth();
  const home = landingPath(profile);

  if (home) return <Navigate to={home} replace />;

  return (
    <div className="knoaccess">
      <div className="knoaccess-card">
        <h1 className="knoaccess-title">Nothing to show yet</h1>
        <p className="knoaccess-body">
          Your position — <strong>{profile?.positionLabel || "not set"}</strong> — doesn't open any
          pages. Ask an administrator to set it in Employees &amp; HR.
        </p>
      </div>
    </div>
  );
}
