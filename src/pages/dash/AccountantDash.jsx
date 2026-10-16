/**
 * The accountant: money in, money out, same as the mobile app's accountant
 * dashboard — what is owed, what went out this month, and the requests waiting
 * on a decision.
 *
 *   clock    invoices   finance
 *   clock    invoices   finance
 *   cash     payroll    purchases   budget
 *   latest invoices
 */
import { useAuth } from "../../context/AuthContext";
import { createdAfterCutoff } from "../../constants";
import { RegionSwitch } from "../../components/RegionSwitch";
import { BentoGrid, BentoPage, DashHead } from "../../components/bento/Bento";
import { toNPR } from "../../utils/currency";
import { invoiceSummary, moneySummary, useBank, useDashData } from "./shared";
import { LoadError } from "./LoadError";
import {
  BudgetTile, CashTile, ClockRingTile, InvoicesTile, MoneyTile, PayrollTile, ProfitTile, PurchasesTile, RecentInvoicesTile,
} from "./tiles";

const COLLECTIONS = {
  invoices: "invoices",
  expenses: "finance_expenses",
  purchases: "finance_purchases",
  payroll: "finance_payroll",
  employees: "employees",
  budgetRequests: "budget_requests",
  orders: "orders",
  orderCosts: "order_costs",
};
const LIVE = ["finance_payroll", "finance_expenses", "finance_purchases", "employees", "invoices"];

/** Newest first, each with where it stands: overdue beats the status written on it. */
function recentInvoices(invoices, today) {
  return [...invoices]
    .filter((i) => i.status !== "Cancelled")
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 8)
    .map((i) => {
      const late = i.status !== "Paid" && i.status !== "Draft" && i.dueDate && i.dueDate < today;
      const label = late ? "Overdue" : i.status === "Outstanding" ? "Sent" : i.status || "Draft";
      const tone = late ? "bad" : label === "Paid" ? "good" : label === "Partial" ? "warn" : label === "Sent" ? "info" : "";
      return { id: i.id, number: i.invoiceNumber || String(i.id).slice(-8), client: i.clientName || "—", npr: toNPR(i.totalNPR, i.currency), label, tone };
    });
}

function derive(cols, { today }) {
  const money = moneySummary(cols, createdAfterCutoff);
  const profit = money.totalProfitNPR;
  return {
    ...invoiceSummary(cols.invoices, today),
    recentInvoices: recentInvoices(cols.invoices, today),
    ...money,
    // the profit tile reads these names
    estProfitNPR: profit,
    totalRevAllNPR: money.totalRevNPR,
    estMargin: money.totalRevNPR > 0 ? money.avgMargin : null,
    pendingBudget: cols.budgetRequests.filter((b) => b.status === "Pending" || !b.status),
  };
}

export default function AccountantDash() {
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
        <BentoGrid layout="accountant">
          <ClockRingTile profile={profile} onClockChange={reload} />
          <InvoicesTile data={d} loading={loading} />
          <MoneyTile data={d} loading={loading} />
          {bank.allowed ? <CashTile bank={bank} /> : <ProfitTile area="cash" data={d} loading={loading} />}
          <PayrollTile data={d} loading={loading} />
          <PurchasesTile area="purch" npr={d.monthPurchNPR} loading={loading} />
          <BudgetTile pending={d.pendingBudget} loading={loading} />
          <RecentInvoicesTile rows={d.recentInvoices} loading={loading} />
        </BentoGrid>
      )}
    </BentoPage>
  );
}
