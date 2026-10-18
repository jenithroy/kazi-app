/**
 * The five numbers at the top of Finance: what came in, what went out on purchases and on expenses, what payroll cost, and where
 * that leaves the books. Each opens the part of Finance it comes from.
 *
 * They are the old four cards (payroll, expenses, purchases, net) in the new look, plus income, which the net figure was always
 * measured against but never showed. Every number is the old one: nothing is added up differently.
 */
import { Tile, Figure, Sub, Money } from "../bento/Bento";
import { Icons } from "../ui";
import { TrendUp } from "../bento/icons";
import { financeTabAllowed, sectionVisible } from "../../utils/permissions";
import { plural } from "./parts";

const ico = { size: 14, sw: 1.8 };

// a crore or more would not fit a tile in full: those are pinned to the short spelling
const Fig = ({ n }) => <Money npr={n} compact={Math.abs(Number(n) || 0) >= 1e7} />;

export default function FinanceTiles({ loading, summary, pl, exp, purchaseCount, fy, fyActive, periodActive, onTab, onPayroll }) {
  const net = pl.netProfit;
  const loss = net < 0;
  // which months the figure covers, by name: payroll is kept by the A.D. month it names and counted in the period its first day falls in
  const months = summary.payrollMonthsLabel || "";
  const payrollNote = periodActive
    ? ((fyActive && (!months || / months$/.test(months))) ? `FY ${fy}` : months || "this period")      // a whole year reads better as the year than as "9 months"
    : summary.payrollMonthLabel || "latest month";
  const tab = (key) => (p) => financeTabAllowed(p, key);

  return (
    <>
      <Tile area="t1" icon={<TrendUp {...ico} />} title="Income" can={tab("pl")} onOpen={() => onTab("p&l")} label="Open profit and loss" loading={loading} className="fn-t">
        <Figure><Fig n={pl.totalIncome} /></Figure>
        <Sub>Paid sales{pl.otherIncome > 0 ? " and other income" : ""}</Sub>
      </Tile>

      <Tile area="t2" icon={<Icons.Cart {...ico} />} title="Purchases" can={tab("purchases")} onOpen={() => onTab("purchases")} label="Open purchases" loading={loading} className="fn-t">
        <Figure><Fig n={summary.purchNPR} /></Figure>
        <Sub><b>{purchaseCount}</b> {plural(purchaseCount, "bill")}</Sub>
      </Tile>

      <Tile area="t3" icon={<Icons.File {...ico} />} title="Expenses" can={tab("expenses")} onOpen={() => onTab("expenses")} label="Open expenses" loading={loading} className="fn-t">
        <Figure><Fig n={summary.expensesNPR} /></Figure>
        <Sub>
          {exp.unpaidCount > 0 ? <><b>{exp.unpaidCount}</b> not marked paid</> : exp.count > 0 ? "All marked paid" : "No expenses"}
        </Sub>
      </Tile>

      <Tile
        area="t4" icon={<Icons.Wallet {...ico} />} title="Payroll" note={payrollNote} loading={loading} className="fn-t"
        can={(p) => sectionVisible(p, "employees") && financeTabAllowed(p, "payroll")} onOpen={onPayroll} label="Open payroll"
      >
        <Figure><Fig n={summary.payrollNPR} /></Figure>
        <Sub>Gross pay</Sub>
      </Tile>

      <Tile
        area="t5" tone={loss ? "terra" : "default"} icon={<Icons.Finance {...ico} />} title={loss ? "Net loss" : "Net profit"}
        can={tab("pl")} onOpen={() => onTab("p&l")} label="Open profit and loss" loading={loading} className="fn-t"
      >
        <Figure tone={loss ? "bad" : undefined}><Fig n={Math.abs(net)} /></Figure>
        <Sub>Income less everything spent</Sub>
      </Tile>
    </>
  );
}
