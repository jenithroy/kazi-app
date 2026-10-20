import { Icons } from "../components/ui";
import {
  sectionVisible,
  financeTabAllowed,
  marketingTabAllowed,
} from "../utils/permissions";
import { listFiscalYears, fiscalYearToSlug } from "../utils/fiscalYear";

/**
 * The top menu, as data.
 *
 * Six groups, each a dropdown. A group lists the pages that belong together,
 * including the ones that used to be reachable only by a button inside another
 * page — Purchases (a card on Finance) and Payroll (a tab on Employees) now sit
 * in the Finance menu where somebody looking for them would look.
 *
 * Who sees what is not decided here. `can` asks the same permission helpers the
 * routes in App.jsx use, so a menu entry appears exactly when its page opens.
 *
 * `to` may carry a query (?tab=payroll). The query is part of the entry's
 * identity: Payroll and Employees & HR are the same route, and the menu lights
 * up whichever one the address actually names. `accepts` lists other values of
 * that query that mean the same thing (no entry needs it today: Meta Ads, which
 * was ?tab=meta-ads on the Marketing page, is the page /marketing/meta-ads now).
 */

const section = (key) => (profile) => sectionVisible(profile, key);
const anyOf = (...keys) => (profile) => keys.some((k) => sectionVisible(profile, k));
const everyone = () => true;

export const NAV_GROUPS = [
  {
    id: "workspace",
    label: "Dashboard",
    items: [
      { id: "dashboard",  to: "/dashboard",  label: "Overview",   Icon: Icons.Dashboard,  desc: "Your start page",         can: section("dashboard") },
      { id: "tasks",      to: "/tasks",      label: "Tasks",      Icon: Icons.Tasks,      desc: "Team task board",         can: section("tasks") },
      { id: "attendance", to: "/attendance", label: "Attendance", Icon: Icons.Attendance, desc: "Clock-in and daily logs", can: section("attendance") },
    ],
  },
  {
    id: "ops",
    label: "Operations",
    items: [
      { id: "production", to: "/production", label: "Production",           Icon: Icons.Production, desc: "Pipeline from order to dispatch", can: section("production") },
      { id: "inventory",  to: "/inventory",  label: "Inventory & Library",  Icon: Icons.Inventory,  desc: "Stock, fabrics and tech packs",   can: anyOf("inventory", "library") },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { id: "sales",     to: "/sales",     label: "Sales",     Icon: Icons.Sales,   desc: "Orders, customers and what is owed", can: section("sales") },
      { id: "finance",   to: "/finance",   label: "Finance",   Icon: Icons.Finance, desc: "Expenses, ledger, P&L and bank",   can: section("finance") },
      { id: "purchases", to: "/purchases", label: "Purchases", Icon: Icons.Cart,    desc: "Saved supplier purchases",         can: section("purchases") },
      {
        id: "payroll", to: "/employees?tab=payroll", label: "Payroll", Icon: Icons.Wallet, desc: "Salaries and payroll runs",
        // The Payroll tab is its own finance permission on top of the Employees page.
        can: (profile) => sectionVisible(profile, "employees") && financeTabAllowed(profile, "payroll"),
      },
      { id: "billing",   to: "/billing",   label: "Billing",   Icon: Icons.Billing, desc: "Invoices, challans, quotations",   can: section("billing") },
      { id: "budget",    to: "/content",   label: "Budget",    Icon: Icons.Budget,  desc: "Requests for director sign-off",   can: section("budget") },
    ],
    // Finance pages by Nepali fiscal year; shown as small links under the list.
    years: { label: "Transactions by fiscal year", can: section("finance") },
  },
  {
    id: "people",
    label: "People",
    items: [
      { id: "employees", to: "/employees", label: "Employees & HR", Icon: Icons.Employees, desc: "People, pay and working hours", can: section("employees") },
      { id: "customers", to: "/customers", label: "Customers",      Icon: Icons.Customers, desc: "Clients, what they owe, who is late",  can: section("customers") },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    items: [
      { id: "calendar", to: "/marketing", label: "Calendar", Icon: Icons.Calendar, desc: "Content calendar and ideas inbox", can: section("marketing") },
      {
        id: "meta-ads", to: "/marketing/meta-ads", label: "Meta Ads", Icon: Icons.Marketing, desc: "Campaigns, spend and leads",
        // Meta Ads is its own permission on top of the Marketing section (migration 0049).
        can: (profile) => sectionVisible(profile, "marketing") && marketingTabAllowed(profile, "meta_ads"),
      },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { id: "admin",     to: "/admin",      label: "Admin",            Icon: Icons.Admin,     desc: "Roles and permissions",          can: section("admin") },
      { id: "usage",     to: "/usage",      label: "Usage & Activity", Icon: Icons.Pulse,     desc: "Who uses the ERP, and for what", can: section("usage_analytics") },
      // Open to everyone who is signed in, same as their routes in App.jsx.
      { id: "roles",     to: "/roles",      label: "Roles & Duties",   Icon: Icons.Directors, desc: "What each role logs",            can: everyone },
      { id: "bug",       to: "/bug-report", label: "Bug Report",       Icon: Icons.Bug,       desc: "Tell us something is broken",    can: everyone },
      { id: "changelog", to: "/changelog",  label: "Changelog",        Icon: Icons.Changelog, desc: "What changed in the app",        can: everyone },
    ],
  },
];

/**
 * Chat sits outside the dropdowns: a solid icon button of its own at the right
 * of the bar, so the conversation tool people open all day is one click away.
 * The page used to be called Messenger; it is still served at /messenger, which
 * is where links and push notifications point.
 */
export const CHAT = { id: "chat", to: "/messenger", label: "Chat", Icon: Icons.ChatFill, can: section("messenger") };

function splitTo(to) {
  const [path, qs = ""] = to.split("?");
  return { path, query: new URLSearchParams(qs) };
}

/**
 * The groups this person can see, with each item's text resolved and its
 * address split into path and query. Empty groups are dropped, so a role that
 * opens one page of a group still gets that group.
 */
export function buildNav(profile) {
  if (!profile) return [];
  return NAV_GROUPS.map((group) => {
    const items = group.items
      .filter((item) => item.can(profile))
      .map((item) => ({
        ...item,
        desc: typeof item.desc === "function" ? item.desc(profile) : item.desc,
        ...splitTo(item.to),
      }));
    // Fiscal years are listed relative to today, so build them with the menu
    // rather than once at import time (a tab left open across Shrawan 1).
    const years = group.years && group.years.can(profile) && items.length > 0
      ? {
          label: group.years.label,
          links: listFiscalYears({ back: 1, forward: 0 }).map((fy) => {
            const to = `/finance/${fiscalYearToSlug(fy)}`;
            return { id: `fy-${fy}`, to, label: `FY ${fy}`, ...splitTo(to) };
          }),
        }
      : null;
    return { id: group.id, label: group.label, items, years };
  }).filter((group) => group.items.length > 0);
}

/**
 * Which entry the address belongs to. The most specific match wins: a path that
 * matches more of the address beats a shorter one, and an entry whose query is
 * also present beats the same path without it. So /employees?tab=payroll lights
 * Payroll, /employees lights Employees & HR, and /finance/2082-83 lights that
 * year rather than Finance.
 */
export function pickActive(groups, { pathname, search }) {
  const params = new URLSearchParams(search);
  let best = { score: -1, itemId: null, groupId: null };
  for (const group of groups) {
    const candidates = [...group.items, ...(group.years ? group.years.links : [])];
    for (const entry of candidates) {
      const onPath = pathname === entry.path || pathname.startsWith(`${entry.path}/`);
      if (!onPath) continue;
      let queryOk = true;
      for (const [key, value] of entry.query) {
        const accepted = entry.accepts?.[key] || [value];
        if (!accepted.includes(params.get(key))) { queryOk = false; break; }
      }
      if (!queryOk) continue;
      const score = entry.path.length * 10 + entry.query.size * 1000;
      if (score > best.score) best = { score, itemId: entry.id, groupId: group.id };
    }
  }
  return best;
}
