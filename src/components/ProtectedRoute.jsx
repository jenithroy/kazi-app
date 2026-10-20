import { Suspense, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { buildNav, CHAT } from "../constants/nav";
import { preloadQuietly } from "../lib/lazyPages";
import AppLayout from "./AppLayout";
import ErrorBoundary from "./ErrorBoundary";
import PageLoading from "./PageLoading";

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
  const { authenticated, loading, profile } = useAuth();
  const location = useLocation();

  // Once somebody is signed in, quietly fetch the pages their menu shows, so moving between pages never waits on the
  // network (lib/lazyPages.js). Keyed on the person, not the profile object, which is a new one after every refresh.
  const personId = profile?.personId;
  useEffect(() => {
    if (!authenticated) return undefined;
    const paths = buildNav(profile).flatMap((group) => group.items.map((item) => item.path));
    if (CHAT.can(profile)) paths.push(CHAT.to);
    return preloadQuietly(paths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, personId]);

  if (loading) {
    return <div className="full-page-center">Loading KAZI data...</div>;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <AppLayout>
      <ErrorBoundary>
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </AppLayout>
  );
}

export default ProtectedRoute;
