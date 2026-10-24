import { useLocation, NavLink } from "react-router-dom";
import TopNav from "./TopNav";
import { useAuth } from "../context/AuthContext";
import { cn, Icons } from "./ui";
import { isNative } from "../utils/native";
import useActivityLog from "../hooks/useActivityLog";
import { useApplyTheme } from "../hooks/useTheme";
import Spotlight from "./Spotlight";
import { PersonProvider } from "./profile/PersonProvider";
import { ShareProvider } from "./share/ShareProvider";
import "./glass.css";
import "./nav-theme.css";

// Bottom nav shown on mobile/native for workers — replaces sidebar hamburger
function BottomNav({ profile }) {
  const location = useLocation();
  const role = profile?.appRole || profile?.role;
  const isWorker = role === "employee" || role === "nepal_staff";

  const items = isWorker ? [
    { to: "/dashboard",  label: "Home",       Icon: Icons.Dashboard },
    { to: "/attendance", label: "Clock In",   Icon: Icons.Attendance },
    { to: "/tasks",      label: "Tasks",      Icon: Icons.Tasks },
    { to: "/production", label: "Production", Icon: Icons.Production },
  ] : [
    { to: "/dashboard",  label: "Dashboard",  Icon: Icons.Dashboard },
    { to: "/tasks",      label: "Tasks",      Icon: Icons.Tasks },
    { to: "/attendance", label: "Attendance", Icon: Icons.Attendance },
    { to: "/production", label: "Production", Icon: Icons.Production },
    { to: "/billing",    label: "Billing",    Icon: Icons.Billing },
  ];

  return (
    <nav className="kbnav">
      {items.map(({ to, label, Icon }) => {
        const active = location.pathname.startsWith(to);
        return (
          <NavLink key={to} to={to} className={cn("kbnav-item", active && "kbnav-item--active")}>
            <Icon size={22} sw={active ? 2.2 : 1.7} />
            <span>{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function AppLayout({ children }) {
  const { profile } = useAuth();

  // Records the page somebody is on and how long they stay. Here rather than
  // in each page, so nothing has to be remembered when a page is added.
  useActivityLog();

  // Light or dark, from the saved choice, for the whole shell. The top bar follows it on
  // every page; a page darkens its own content only once it has been written for it.
  useApplyTheme();

  return (
    <div className="kapp">
      {/* The native app already has its bottom tab bar for everyday pages, so it
          keeps the menu button hidden, as the old hamburger was. */}
      <TopNav showMenuButton={!isNative} />
      <main className={cn("kmain", isNative && "kmain--native")}>
        <div className="kscroll">
          {/* Any name on any page can open that person's profile (components/profile/): the provider draws no box, only the card. */}
          {/* Any record's card can send it to Chat (components/share/): one dialog, opened from a card's Send button. */}
          <PersonProvider><ShareProvider>{children}</ShareProvider></PersonProvider>
        </div>
        {isNative && <BottomNav profile={profile} />}
      </main>

      {/* Reads ?tour= off whatever page it lands on. Mounted here so no page
          has to know it exists beyond putting data-tour on one element. */}
      <Spotlight />
    </div>
  );
}

export default AppLayout;
