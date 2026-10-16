/**
 * Directors, the developer and system admins (and UK / super admins): money and
 * the big picture, same as the mobile app's owner dashboard.
 *
 *   revenue    invoices   cash     payroll
 *   revenue    invoices   profit
 *   approvals  pipeline   attendance
 *   approvals  pipeline   quality
 */
import { useAuth } from "../../context/AuthContext";
import { toNPR } from "../../utils/currency";
import { RegionSwitch } from "../../components/RegionSwitch";
import { BentoGrid, BentoPage, DashHead } from "../../components/bento/Bento";
import { attendanceToday, invoiceSummary, qcSummary, useBank, useDashData } from "./shared";
import { LoadError } from "./LoadError";
import {
  ActiveOrdersTile, ApprovalsTile, AttendanceTile, CashTile, InvoicesTile, OrdersTile,
  PayrollTile, ProfitTile, QcTile, RevenueTile,
} from "./tiles";

const COLLECTIONS = {
  invoices: "invoices",
  orders: "orders",
  attendance: "attendance",
  budgetRequests: "budget_requests",
  users: "users",
  payroll: "finance_payroll",
  orderCosts: "order_costs",
  employees: "employees",
  qcLogs: "qc_logs",
};
const LIVE = ["finance_payroll", "invoices", "orders", "employees"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function derive({ invoices, orders, attendance, budgetRequests, users, payroll, orderCosts, employees, qcLogs }, { today }) {
  // Headcount is the active roster — access comes from the person's position.
  const totalStaff = users.filter((u) => u.status !== "Inactive").length || 7;

  const thisMonth = new Date().toISOString().slice(0, 7);
  const lastMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();

  // Revenue MTD — this month's paid invoices, fall back to last month if none yet
  let revMonth = thisMonth;
  let paidInvoices = invoices.filter((i) => i.status === "Paid" && (i.date || "").slice(0, 7) === thisMonth);
  if (paidInvoices.length === 0) {
    revMonth = lastMonth;
    paidInvoices = invoices.filter((i) => i.status === "Paid" && (i.date || "").slice(0, 7) === lastMonth);
  }

  // Payroll — current month first, then employee base salaries as estimate
  const curMonthName = MONTH_NAMES[new Date().getMonth()];
  const curYear = new Date().getFullYear();
  const payrollRecs = payroll.filter((p) => p.month === curMonthName && Number(p.year) === curYear);
  const payrollIsEstimate = payrollRecs.length === 0;
  const payrollNPR = payrollIsEstimate
    ? employees.filter((e) => e.status === "Active").reduce((s, e) => s + Number(e.basicSalaryNPR || 0), 0)
    : payrollRecs.reduce((s, p) => s + Number(p.grossNPR || p.netNPR || p.amountNPR || p.amount || 0), 0);

  // Estimated profit from order_costs
  const totalCostNPR = orderCosts.reduce((s, c) => s + Number(c.material || 0) + Number(c.labour || 0) + Number(c.overhead || 0) + Number(c.shipping || 0), 0);
  const totalRevAllNPR = orders.reduce((s, o) => s + Number(o.totalValueNPR || 0), 0);
  const estProfitNPR = totalRevAllNPR - totalCostNPR;

  // 30-day revenue trend
  const dates30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  });
  const revData = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    const key = d.toISOString().slice(0, 10);
    return invoices.filter((inv) => inv.date === key && inv.status === "Paid").reduce((s, inv) => s + toNPR(inv.totalNPR, inv.currency), 0);
  });

  return {
    ...invoiceSummary(invoices, today),
    ...qcSummary(qcLogs),
    totalPaidNPR: paidInvoices.reduce((s, i) => s + toNPR(i.totalNPR, i.currency), 0),
    revIsLastMonth: revMonth !== thisMonth,
    revData, dates30,
    attendance: attendanceToday(attendance, totalStaff, today),
    pendingBudget: budgetRequests.filter((b) => b.status === "Pending" || !b.status),
    orders,
    inProgress: orders.filter((o) => !["Delivered", "Cancelled", "Shipped"].includes(o.stage)).length,
    dispatched: orders.filter((o) => ["Shipped", "Delivered"].includes(o.stage)).length,
    payrollNPR, payrollIsEstimate,
    estProfitNPR, totalRevAllNPR, totalCostNPR,
    estMargin: totalRevAllNPR > 0 ? ((estProfitNPR / totalRevAllNPR) * 100).toFixed(1) : null,
  };
}

export default function OwnerDash() {
  const { profile } = useAuth();
  const bank = useBank(profile);
  const { data, error, reload } = useDashData({ collections: COLLECTIONS, live: LIVE, derive });
  const loading = !data;
  const d = data || {};

  return (
    <BentoPage>
      <DashHead profile={profile}>
        <RegionSwitch hint={false} />
      </DashHead>

      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : (
        <BentoGrid layout="owner">
          <RevenueTile data={d} loading={loading} />
          <InvoicesTile data={d} loading={loading} />
          {bank.allowed ? <CashTile bank={bank} /> : <ActiveOrdersTile data={d} loading={loading} />}
          <PayrollTile data={d} loading={loading} />
          <ProfitTile data={d} loading={loading} />
          <ApprovalsTile pending={d.pendingBudget} loading={loading} />
          <OrdersTile area="pipe" title="Order pipeline" orders={d.orders || []} loading={loading} />
          <AttendanceTile counts={d.attendance} loading={loading} />
          <QcTile data={d} loading={loading} />
        </BentoGrid>
      )}
    </BentoPage>
  );
}
