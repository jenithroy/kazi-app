import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppLayout from "./AppLayout";

/**
 * The signed-in gate.
 *
 * It tests `authenticated`, not `user`. Those are different things: `user` only
 * says a token exists, while `authenticated` also requires that the token
 * resolved to an active person — which is what every permission is read from.
 * Testing `user` let anyone holding any account into the entire app, including
 * accounts with no staff record at all.
 *
 * Being signed in is necessary but not sufficient. Each route additionally
 * declares the section it belongs to (see App.jsx); RequireSection enforces it.
 */
function ProtectedRoute() {
  const { authenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="full-page-center">Loading KAZI data...</div>;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

export default ProtectedRoute;
