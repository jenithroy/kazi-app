import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Attendance from "./pages/Attendance";
import Production from "./pages/Production";
import Inventory from "./pages/Inventory";
import QualityControl from "./pages/QualityControl";
import Finance from "./pages/Finance";
import FiscalYearTransactions from "./pages/FiscalYearTransactions";
import Purchases from "./pages/Purchases";
import Tasks from "./pages/Tasks";
import Budget from "./pages/Budget";
import Billing from "./pages/Billing";
import Employees from "./pages/Employees";
import AdminPanel from "./pages/AdminPanel";
import Directors from "./pages/Directors";
import Customers from "./pages/Customers";
import Messenger from "./pages/Messenger";
import Sales from "./pages/Sales";
import Marketing from "./pages/Marketing";
import BugReport from "./pages/BugReport";
import Changelog from "./pages/Changelog";
import ProtectedRoute from "./components/ProtectedRoute";
import RequireSection from "./components/RequireSection";
import LandingRedirect from "./components/LandingRedirect";
import { isRecoveryPending } from "./lib/recoveryLink";

/**
 * Every route names the section it belongs to.
 *
 * Signing in used to be the only check, so the address bar was an open door —
 * any account could load /finance, /employees or /admin. The section here is
 * matched against the same position matrix the database enforces, so the page
 * a person can reach and the data they can read now agree.
 *
 * Bug Report and Changelog are deliberately ungated: everyone may file a bug
 * and read release notes, which is how the sidebar has always treated them.
 */
function App() {
  const location = useLocation();

  // A reset link lands wherever the Supabase project's redirect list sends it,
  // which is not always /login — an address that is not on that list falls back
  // to the project's Site URL, i.e. the app's front door. Wherever they come
  // ashore, the one thing left to do is choose a new password, so send them to
  // the screen that asks for it rather than into a dashboard they cannot yet
  // sign back into.
  if (isRecoveryPending() && location.pathname !== "/login") {
    return <Navigate to="/login" replace />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard"   element={<RequireSection section="dashboard"><Dashboard /></RequireSection>} />
        <Route path="/tasks"       element={<RequireSection section="tasks"><Tasks /></RequireSection>} />
        <Route path="/attendance"  element={<RequireSection section="attendance"><Attendance /></RequireSection>} />
        <Route path="/production"  element={<RequireSection section="production"><Production /></RequireSection>} />
        <Route path="/qc"          element={<RequireSection section="quality_control"><QualityControl /></RequireSection>} />
        {/* Inventory and Product Library are one merged screen, so either opens it. */}
        <Route path="/inventory"   element={<RequireSection anyOf={["inventory", "library"]}><Inventory /></RequireSection>} />
        <Route path="/sales"       element={<RequireSection section="sales"><Sales /></RequireSection>} />
        <Route path="/finance"     element={<RequireSection section="finance"><Finance /></RequireSection>} />
        <Route path="/finance/:fy" element={<RequireSection section="finance"><FiscalYearTransactions /></RequireSection>} />
        <Route path="/purchases"   element={<RequireSection section="purchases"><Purchases /></RequireSection>} />
        <Route path="/billing"     element={<RequireSection section="billing"><Billing /></RequireSection>} />
        {/* /content renders Budget — named for the page it shows, not its path. */}
        <Route path="/content"     element={<RequireSection section="budget"><Budget /></RequireSection>} />
        <Route path="/employees"   element={<RequireSection section="employees"><Employees /></RequireSection>} />
        <Route path="/directors"   element={<RequireSection section="directors"><Directors /></RequireSection>} />
        <Route path="/customers"   element={<RequireSection section="customers"><Customers /></RequireSection>} />
        <Route path="/marketing"   element={<RequireSection section="marketing"><Marketing /></RequireSection>} />
        <Route path="/messenger"   element={<RequireSection section="messenger"><Messenger /></RequireSection>} />
        <Route path="/admin"       element={<RequireSection section="admin"><AdminPanel /></RequireSection>} />

        {/* Open to everyone who is signed in. */}
        <Route path="/bug-report"  element={<BugReport />} />
        <Route path="/changelog"   element={<Changelog />} />

        <Route path="/orders"      element={<Navigate to="/production" replace />} />
        <Route path="/library"     element={<Navigate to="/inventory" replace />} />
        <Route path="/accounting"  element={<Navigate to="/finance" replace />} />

        {/* An unknown path goes to a page this person can actually open, rather
            than always /dashboard — which not every position can see. */}
        <Route path="*" element={<LandingRedirect />} />
      </Route>

      {/* Unknown path while signed out: the guard sends it to /login and
          remembers where they were headed. */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
