/**
 * Profit and loss: what came in against everything that went out, over the period chosen at the top. Every line is built from the
 * other sections (paid invoices, expenses, purchases, payroll, the journal), so none of it is typed here; a line with a record behind
 * it takes you there. The three bars on the right are the same three numbers, to see them against each other.
 */
import FinPane from "../FinPane";
import { FindBar } from "../FilterMenu";
import { StatBlock } from "../Statement";
import { Meter } from "../../bento/Bento";
import { useFin } from "../FinanceContext";
import { Foot, FootSum, useMoney } from "../parts";
import { describePeriod } from "../../../lib/period";
import { financeTabAllowed, sectionVisible } from "../../../utils/permissions";

export default function PnlTab() {
  const f = useFin();
  const { pl, periodActive, fy, dateRange, dateMode, openTab, goToSource, loading } = f;
  const money = useMoney();
  const loss = pl.netProfit < 0;
  const top = Math.max(pl.totalIncome, pl.totalExpenses, Math.abs(pl.netProfit), 1);
  const pct = (n) => (Math.abs(n) / top) * 100;
  const seesPayroll = sectionVisible(f.profile, "employees") && financeTabAllowed(f.profile, "payroll");

  return (
    <FinPane
      title="Profit & loss" note={describePeriod({ fy, range: dateRange, mode: dateMode })} id="fin-pane" labelledBy="fin-tab-p-l"
      tools={<FindBar />}
      foot={(
        <Foot>
          <FootSum label="Income" value={money(pl.totalIncome)} tone="good" />
          <FootSum label="Spent" value={money(pl.totalExpenses)} tone="bad" />
          <FootSum label={loss ? "Net loss" : "Net profit"} value={money(Math.abs(pl.netProfit))} tone={loss ? "bad" : "good"} />
        </Foot>
      )}
    >
      <div className="fn-stm" role="region" aria-label="Profit and loss" tabIndex={0} aria-busy={loading || undefined}>
        <div className="fn-stm-l">
          <StatBlock
            title="Income" tone="good" total={pl.totalIncome} totalLabel="Total income"
            rows={[
              { label: "Sales", sub: "paid invoices", value: pl.salesRevenue, go: () => goToSource("/billing"), title: "Open Billing" },
              { label: "Other income", sub: "journal entries to an income account", value: pl.otherIncome, go: () => openTab("journal"), title: "Open the journal" },
            ]}
          />
          <StatBlock
            title="Expenses" tone="bad" total={pl.totalExpenses} totalLabel="Total expenses"
            rows={[
              { label: "Expenses", sub: "the Expenses section", value: pl.expensesTotal, go: () => openTab("expenses"), title: "Open expenses" },
              { label: "Purchases", sub: "bills from suppliers", value: pl.purchasesTotal, go: () => openTab("purchases"), title: "Open purchases" },
              {
                label: "Payroll", sub: periodActive ? "in this period" : "this calendar year", value: pl.payrollTotal,
                ...(seesPayroll ? { go: () => goToSource("/employees?tab=payroll", { tab: "payroll" }), title: "Open payroll" } : {}),
              },
              ...(pl.journalExpenses > 0 ? [{ label: "Journal expenses", sub: "entries to an expense account", value: pl.journalExpenses, go: () => openTab("journal"), title: "Open the journal" }] : []),
            ]}
          />
          <div className={`fn-stm-net${loss ? " is-loss" : ""}`}>
            <span>{loss ? "Net loss" : "Net profit"}</span>
            <b>{money(Math.abs(pl.netProfit))}</b>
          </div>
        </div>

        <section className="fn-stm-r" aria-label="Income against expenses">
          <h3>Income against expenses</h3>
          {[
            ["Income", pl.totalIncome, "good"],
            ["Expenses", pl.totalExpenses, "bad"],
            [loss ? "Net loss" : "Net profit", Math.abs(pl.netProfit), loss ? "bad" : "good"],
          ].map(([label, n, tone]) => (
            <div className="fn-hbar" key={label}>
              <div className="fn-hbar-h"><span>{label}</span><b>{money(n)}</b></div>
              <Meter pct={pct(n)} tone={tone} />
            </div>
          ))}
        </section>
      </div>
    </FinPane>
  );
}
