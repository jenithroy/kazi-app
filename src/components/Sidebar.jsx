import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { cn, Icons, Avatar } from "./ui";
import { sectionVisible } from "../utils/permissions";

// Nav items with optional badges
const NAV_ITEMS = [
  { to: "/dashboard",  label: "Dashboard",  Icon: Icons.Dashboard,  group: "main" },
  { to: "/tasks",      label: "Tasks",      Icon: Icons.Tasks,      group: "main", badge: 7 },
  { to: "/attendance", label: "Attendance", Icon: Icons.Attendance, group: "main" },
  { to: "/production", label: "Production", Icon: Icons.Production, group: "ops" },
  { to: "/qc",         label: "QC",         Icon: Icons.QC,         group: "ops" },
  { to: "/inventory",  label: "Inventory",  Icon: Icons.Inventory,  group: "ops", badge: 4, badgeTone: "amber" },
  { to: "/finance",    label: "Finance",    Icon: Icons.Finance,    group: "biz" },
  { to: "/billing",    label: "Billing",    Icon: Icons.Billing,    group: "biz" },
  { to: "/content",    label: "Budget",     Icon: Icons.Budget,     group: "biz", badge: 4 },
  { to: "/employees",  label: "Employee and HR",  Icon: Icons.Employees,  group: "biz" },
  { to: "/admin",      label: "Admin",      Icon: Icons.Admin,      group: "biz" },
  { to: "/directors",  label: "Directors",  Icon: Icons.Directors,  group: "biz" },
  { to: "/customers",  label: "Customers",  Icon: Icons.Customers,  group: "biz" },
  { to: "/messenger",  label: "Messenger",  Icon: Icons.Message,    group: "biz" },
];

const GROUPS = [
  { id: "main", label: "Workspace" },
  { id: "ops",  label: "Operations" },
  { id: "biz",  label: "Business" },
];

function routeKey(path) {
  const p = path.replace("/", "") || "dashboard";
  return p;
}

function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { profile, logout } = useAuth();
  const location = useLocation();
  const role = profile?.appRole || profile?.role || "employee";

  const items = NAV_ITEMS
    .filter(item => {
      if (item.to === "/inventory") {
        return sectionVisible(profile, "inventory") || sectionVisible(profile, "library");
      }
      return sectionVisible(profile, routeKey(item.to));
    })
    .map(item => {
      if (item.to === "/inventory") {
        const hasInv = sectionVisible(profile, "inventory");
        const hasLib = sectionVisible(profile, "library");
        let label = "Inventory";
        if (hasInv && hasLib) label = "Inventory & Library";
        else if (hasLib) label = "Production Library";
        else if (hasInv) label = "Inventory & Stock";
        return { ...item, label };
      }
      return item;
    });

  const byGroup = GROUPS.map(g => ({
    ...g,
    items: items.filter(i => i.group === g.id),
  })).filter(g => g.items.length > 0);

  return (
    <aside className={cn("kside", collapsed && "kside--collapsed", mobileOpen && "kside--mobile-open")}>

      {/* Mobile close button */}
      {mobileOpen && (
        <button className="kside-mobile-close" onClick={onMobileClose} aria-label="Close menu">
          ✕
        </button>
      )}

      {/* Brand */}
      <div className="kside-brand">
        {collapsed ? (
          <img src="/kazi - logo - white-01.png" alt="Kazi" className="kside-logo kside-logo--sm" />
        ) : (
          <>
            <img src="/kazi - logo - white-01.png" alt="Kazi" className="kside-logo" />
            <span className="kside-tag">Kathmandu HQ</span>
          </>
        )}
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="kside-search">
          <Icons.Search size={14} />
          <input placeholder="Search Kazi…" readOnly />
          <kbd>⌘K</kbd>
        </div>
      )}

      {/* Nav */}
      <nav className="kside-nav">
        {byGroup.map(g => (
          <div key={g.id} className="kside-group">
            {!collapsed && <div className="kside-group-l">{g.label}</div>}
            {g.items.map(item => {
              const isActive = location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn("kside-item", isActive && "kside-item--active")}
                  title={collapsed ? item.label : undefined}
                >
                  <item.Icon size={17} sw={1.7} />
                  {!collapsed && <span className="kside-label">{item.label}</span>}
                  {!collapsed && item.badge != null && (
                    <span className={cn("kside-badge", item.badgeTone && `kside-badge--${item.badgeTone}`)}>
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button className="kside-collapse" onClick={onToggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed
          ? <Icons.ChevronRight size={14} />
          : <><Icons.ChevronLeft size={14} /><span>Collapse</span></>
        }
      </button>

      {/* User */}
      <div className="kside-user">
        {profile && (
          <>
            <Avatar name={profile.name} hue={145} size={collapsed ? 30 : 34} ring="rgba(125,211,168,.3)" />
            {!collapsed && (
              <div className="kside-user-text">
                <span className="kside-user-name">{profile.name}</span>
                <span className="kside-user-role">{profile.role || role}</span>
              </div>
            )}
            {!collapsed && (
              <button className="kside-logout" title="Log out" onClick={logout}>
                <Icons.Logout size={15} sw={1.8} />
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
