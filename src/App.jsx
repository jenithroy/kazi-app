import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Attendance from "./pages/Attendance";
import Production from "./pages/Production";
import Inventory from "./pages/Inventory";
import QualityControl from "./pages/QualityControl";
import Finance from "./pages/Finance";
import Tasks from "./pages/Tasks";
import Budget from "./pages/Budget";
import Billing from "./pages/Billing";
import Employees from "./pages/Employees";
import AdminPanel from "./pages/AdminPanel";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/production" element={<Production />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/qc" element={<QualityControl />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/content" element={<Budget />} />
        <Route path="/orders" element={<Navigate to="/production" replace />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/accounting" element={<Navigate to="/finance" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
