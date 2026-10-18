/**
 * Balance sheet: what the business has (assets), what it owes (liabilities) and what is left for its owners (equity), as of the end
 * of the chosen period. It is a position, not a period: every journal entry dated up to that day counts, not only the period's.
 */
import FinPane from "../FinPane";
import { StatBlock } from "../Statement";
import { useFin } from "../FinanceContext";
import { Chip, Foot, FootSum, useMoney } from "../parts";
import { balances } from "../../../lib/finance";

export default function BalanceTab() {
  const f = useFin();
  const { bs, asOfDate, fyActive, fy, fyRange, show, loading } = f;
  const money = useMoney();
  const level = balances(bs);
  const rows = (list) => list.map((a) => ({ key: a.id || a.name, label: a.name, value: a.balance }));
  const note = asOfDate
    ? `As of ${show(asOfDate)}${fyActive && asOfDate === fyRange.endAD ? `, the end of fiscal year ${fy}` : ""}`
    : "As of today";

  return (
    <FinPane
      title="Balance sheet" note={note} id="fin-pane" labelledBy="fin-tab-balance-sheet"
      foot={(
        <Foot>
          <FootSum label="Assets" value={money(bs.totalAssets)} />
          <FootSum label="Liabilities + equity" value={money(bs.totalLiabilities + bs.totalEquity)} tone={level ? undefined : "warn"} />
          {level ? <Chip tone="good">Balances</Chip> : <Chip tone="warn">Out by {money(Math.abs(bs.totalAssets - bs.totalLiabilities - bs.totalEquity))}</Chip>}
        </Foot>
      )}
    >
      <div className="fn-bsh" role="region" aria-label="Balance sheet" tabIndex={0} aria-busy={loading || undefined}>
        {asOfDate && <p className="fn-viewonly ec-wide">Every journal entry dated up to then counts, not only this period's.</p>}
        <StatBlock title="Assets" tone="good" total={bs.totalAssets} rows={rows(bs.assets)} />
        <StatBlock title="Liabilities" tone="bad" total={bs.totalLiabilities} rows={rows(bs.liabilities)} />
        <StatBlock title="Equity" total={bs.totalEquity} rows={rows(bs.equity)} />
      </div>
    </FinPane>
  );
}
