import { Icons } from "../ui";
import { Tile, Figure, Sub, Meter, Money } from "../bento/Bento";
import { MiniBars } from "../bento/charts";

const ico = { size: 14, sw: 1.8 };

/**
 * The three numbers that add up: what was invoiced, what has come in, what is still owed. They are
 * the customers' rows added together, so they always match the list beside them. Each goes to
 * Billing, which has the invoices behind it.
 */

/** Everything invoiced, with this month's share and (when the tile is tall enough) the last six months. */
export function InvoicedTile({ totals, months, thisMonthNPR, loading }) {
  const bars = months.map((m) => m.npr);
  return (
    <Tile area="inv" to="/billing" section="billing" icon={<Icons.Billing {...ico} />} title="Invoiced" loading={loading} align="top" className="sl-kpi">
      <Figure><Money npr={totals.invoiced} /></Figure>
      <Sub>
        {thisMonthNPR > 0 ? <><b><Money npr={thisMonthNPR} compact /></b> this month</> : "Nothing invoiced this month"}
      </Sub>
      {bars.some((v) => v > 0) && (
        <div className="sl-vis" role="img" aria-label={`Invoiced per month, ${months.map((m) => m.label).join(", ")}`}>
          <MiniBars values={bars} labels={months.map((m) => m.label)} />
        </div>
      )}
    </Tile>
  );
}

/** What has been paid, and the share of the invoiced total that is. */
export function CollectedTile({ totals, loading }) {
  const pct = Math.round(totals.collectRate);
  return (
    <Tile area="col" to="/billing" section="billing" icon={<Icons.Wallet {...ico} />} title="Collected" loading={loading} align="top" className="sl-kpi">
      <Figure><Money npr={totals.collected} /></Figure>
      <Sub>{totals.invoiced > 0 ? <><b>{pct}%</b> of invoiced</> : "Nothing invoiced yet"}</Sub>
      {totals.invoiced > 0 && (
        <div className="sl-vis sl-vis--meter">
          <Meter pct={totals.collectRate} tone="good" />
        </div>
      )}
    </Tile>
  );
}

/** What customers still owe. It asks for attention (terracotta) only when part of it is overdue. */
export function OwedTile({ totals, loading }) {
  const owed = totals.outstanding;
  const late = totals.overdue;
  const soon = Math.max(0, owed - late);
  const tone = late > 0.5 ? "terra" : owed > 0.5 ? "default" : "wash";
  return (
    <Tile area="owe" tone={tone} to="/billing" section="billing" icon={<Icons.Alert {...ico} />} title="Still owed" loading={loading} align="top" className="sl-kpi">
      <Figure><Money npr={owed} /></Figure>
      <Sub>
        {late > 0.5
          ? <><b><Money npr={late} compact /></b> overdue</>
          : owed > 0.5 ? "None overdue" : "Everyone has paid"}
      </Sub>
      {owed > 0.5 && (
        <div className="sl-vis sl-vis--meter">
          <div className="sl-split" aria-hidden="true">
            {late > 0.5 && <i className="is-late" style={{ flexGrow: late }} />}
            {soon > 0.5 && <i className="is-soon" style={{ flexGrow: soon }} />}
          </div>
        </div>
      )}
    </Tile>
  );
}
