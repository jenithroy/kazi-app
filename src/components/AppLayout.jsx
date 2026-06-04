import { useState, useMemo, useEffect } from "react";
import { useLocation, NavLink } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { cn, Icons, Avatar } from "./ui";

const ROUTE_LABEL = {
  dashboard:  "Dashboard",
  tasks:      "Tasks",
  attendance: "Attendance",
  production: "Production",
  qc:         "Quality Control",
  inventory:  "Inventory",
  finance:    "Finance",
  billing:    "Billing",
  content:    "Budget Requests",
  employees:  "Employee and HR",
  admin:      "Admin Panel",
  messenger:  "Messenger Chat",
};

function useKTMTime() {
  const [time, setTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kathmandu", hour: "2-digit", minute: "2-digit" });
  });
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kathmandu", hour: "2-digit", minute: "2-digit" }));
    };
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function Topbar({ collapsed, onMobileMenuToggle }) {
  const { profile } = useAuth();
  const { currency, toggle: toggleCurrency } = useCurrency();
  const location = useLocation();
  const routeKey = location.pathname.replace("/", "") || "dashboard";
  const routeLabel = ROUTE_LABEL[routeKey] || routeKey;
  const isDashboard = routeKey === "dashboard";
  const ktmTime = useKTMTime();

  const greeting = useMemo(() => {
    const h = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" })).getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }, []);

  const dateStr = new Date().toLocaleDateString("en-GB", {
    timeZone: "Asia/Kathmandu", weekday: "long", day: "numeric", month: "long",
  });

  return (
    <header className="ktop">
      {/* Mobile hamburger */}
      <button className="ktop-hamburger" onClick={onMobileMenuToggle} aria-label="Open menu">
        <Icons.Menu size={20} sw={2} />
      </button>

      {/* Left */}
      <div className="ktop-l">
        <div className="ktop-bread">
          <NavLink to="/dashboard" className="ktop-bread-l" style={{ textDecoration: "none", color: "inherit" }}>Kazi</NavLink>
          <Icons.ChevronRight size={12} />
          <span className="ktop-bread-c">{routeLabel}</span>
        </div>
        {isDashboard && profile && (
          <div className="ktop-greet">
            <h1>{greeting}, {profile.name?.split(" ")[0]}</h1>
            <span className="ktop-greet-sub">{dateStr} · Kathmandu HQ · 🕐 {ktmTime} KTM</span>
          </div>
        )}
      </div>

      {/* Right */}
      <div className="ktop-r">
        {/* Currency toggle */}
        <button
          onClick={toggleCurrency}
          title={`Switch to ${currency === "NPR" ? "GBP" : "NPR"}`}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 8,
            border: "1.5px solid var(--line)",
            background: currency === "GBP" ? "var(--mint-soft)" : "transparent",
            color: currency === "GBP" ? "var(--mint-deep)" : "var(--ink-3)",
            fontSize: 12, fontWeight: 600, fontFamily: "var(--mono)",
            cursor: "pointer", transition: "all 0.15s",
          }}
        >
          {currency === "NPR" ? "₨ NPR" : "£ GBP"}
        </button>

        {/* User */}
        {profile && (
          <div className="ktop-user-btn">
            <Avatar name={profile.name} hue={145} size={26} />
            <div className="ktop-user-meta">
              <span className="ktop-user-name">{profile.name}</span>
              <span className="ktop-user-role">{profile.role || profile.appRole}</span>
            </div>
            <Icons.ChevronDown size={14} />
          </div>
        )}
      </div>
    </header>
  );
}

function AppLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <div className="kapp">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="kside-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <main className="kmain">
        <Topbar collapsed={collapsed} onMobileMenuToggle={() => setMobileOpen(o => !o)} />
        <div className="kscroll">
          {children}
        </div>
      </main>
    </div>
  );
}

export default AppLayout;
