import { useState, useMemo, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useAuth } from "../context/AuthContext";
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

function Topbar({ collapsed, onMobileMenuToggle }) {
  const { profile } = useAuth();
  const location = useLocation();
  const routeKey = location.pathname.replace("/", "") || "dashboard";
  const routeLabel = ROUTE_LABEL[routeKey] || routeKey;
  const isDashboard = routeKey === "dashboard";

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }, []);

  const dateStr = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
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
          <span className="ktop-bread-l">Kazi</span>
          <Icons.ChevronRight size={12} />
          <span className="ktop-bread-c">{routeLabel}</span>
        </div>
        {isDashboard && profile && (
          <div className="ktop-greet">
            <h1>{greeting}, {profile.name?.split(" ")[0]}</h1>
            <span className="ktop-greet-sub">{dateStr} · Kathmandu HQ</span>
          </div>
        )}
      </div>

      {/* Right */}
      <div className="ktop-r">
        {/* Search */}
        <button className="ktop-iconbtn" title="Search (⌘K)">
          <Icons.Search size={16} sw={1.8} />
        </button>

        {/* Notifications */}
        <button className="ktop-iconbtn ktop-iconbtn--badge" title="Notifications">
          <Icons.Bell size={16} sw={1.8} />
          <span className="ktop-badgedot" />
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
