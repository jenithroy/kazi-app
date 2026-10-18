/**
 * The operations head and manager (and any Nepal admin): the factory floor on
 * one screen, same as the mobile app's ops dashboard. They work a shift too, so
 * their own clock-in sits at the foot of the team's attendance.
 *
 *   attendance  production           tasks
 *   attendance  production           tasks
 *   stock       finance     budget   due soon
 *   stock       finance     budget   due soon
 *
 * Finance, for a position that may not open it, becomes "not in today".
 */
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { sectionCanEdit, sectionVisible } from "../../utils/permissions";
import { createdAfterCutoff } from "../../constants";
import ClockInCard from "../../components/ClockInCard";
import { RegionSwitch } from "../../components/RegionSwitch";
import { BentoGrid, BentoPage, DashHead } from "../../components/bento/Bento";
import { Layers } from "../../components/bento/icons";
import { attendanceToday, lowStockItems, moneySummary, taskSummary, useDashData, whosOut } from "./shared";
import { ProductCostsModal } from "./modals";
import { LoadError } from "./LoadError";
import {
  AttendanceTile, BudgetTile, DueSoonTile, MoneyTile, OrdersTile, StockTile, TasksTile, WhosOutTile,
} from "./tiles";

const COLLECTIONS = {
  attendance: "attendance",
  inventory: "inventory",
  tasks: "tasks",
  budgetRequests: "budget_requests",
  orders: "orders",
  expenses: "finance_expenses",
  users: "users",
  orderCosts: "order_costs",
  invoices: "invoices",
  payroll: "finance_payroll",
  purchases: "finance_purchases",
  employees: "employees",
};
const LIVE = ["finance_payroll", "finance_expenses", "finance_purchases", "employees", "orders", "invoices"];

function derive(cols, { today }) {
  const { attendance, inventory, tasks, budgetRequests, orders, users } = cols;
  const totalStaff = users.filter((u) => ["nepal_admin", "employee", "nepal_staff"].includes(u.role)).length || users.length || 7;
  return {
    attendance: attendanceToday(attendance, totalStaff, today),
    whosOut: whosOut(attendance, users, today),
    ...taskSummary(tasks, users, today),
    ...moneySummary(cols, createdAfterCutoff),
    lowItems: lowStockItems(inventory),
    pendingBudget: budgetRequests.filter((b) => b.status === "Pending" || !b.status),
    orders,
  };
}

export default function OpsDash() {
  const { profile } = useAuth();
  const { data, error, reload } = useDashData({ collections: COLLECTIONS, live: LIVE, derive });
  const [costsOpen, setCostsOpen] = useState(false);

  const loading = !data;
  const d = data || {};
  const canClock = sectionCanEdit(profile, "attendance");
  const canEditCosts = ["nepal_admin", "uk_admin", "super_admin"].includes(profile?.appRole || profile?.role);
  const hasFinance = sectionVisible(profile, "finance");

  return (
    <BentoPage>
      <DashHead profile={profile}>
        <RegionSwitch hint={false} />
        <button type="button" className="kb-pillbtn" onClick={() => setCostsOpen(true)}>
          <Layers size={14} sw={1.8} />Product costs
        </button>
      </DashHead>

      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : (
        <BentoGrid layout="ops">
          <AttendanceTile
            counts={d.attendance}
            loading={loading}
            clock={canClock ? <ClockInCard variant="strip" profile={profile} onClockChange={reload} /> : null}
          />
          <OrdersTile orders={d.orders || []} loading={loading} />
          <TasksTile data={d} loading={loading} />
          <StockTile items={d.lowItems} loading={loading} />
          {hasFinance ? <MoneyTile data={d} loading={loading} /> : <WhosOutTile area="money" people={d.whosOut} loading={loading} />}
          <BudgetTile list pending={d.pendingBudget} loading={loading} />
          <DueSoonTile orders={d.orders || []} loading={loading} />
        </BentoGrid>
      )}

      {costsOpen && <ProductCostsModal canEdit={canEditCosts} onClose={() => setCostsOpen(false)} />}
    </BentoPage>
  );
}
