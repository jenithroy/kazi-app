import { Icons } from "../ui";
import { Tile, Figure, Sub, Meter, Money } from "../bento/Bento";

const ico = { size: 14, sw: 1.8 };
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/**
 * The three numbers that add up: what was invoiced, what has come in, what is still owed. They are the customers' rows
 * added together, so they always match the list under them. Each goes to Billing, which has the invoices behind it, and
 * is locked for a position that cannot open Billing (it could not see the invoices, so it would read nought).
 * A tile in this short row shows its figure and one line; the thick bar under a figure only has room on a phone.
 */

/** Everything invoiced, and how many customers it was invoiced to. */
export function InvoicedTile({ totals, billed, loading }) {
  return (
    <Tile area="inv" to="/billing" section="billing" icon={<Icons.Billing {...ico} />} title="Invoiced" loading={loading} align="top" className="cu-kpi">
      <Figure><Money npr={totals.invoiced} /></Figure>
      <Sub>{billed > 0 ? <>to <b>{billed}</b> {plural(billed, "customer")}</> : "Nothing invoiced yet"}</Sub>
    </Tile>
  );
}

/** What has been paid, and the share of the invoiced total that is. */
export function CollectedTile({ totals, loading }) {
  const pct = Math.round(totals.collectRate);
  return (
    <Tile area="col" to="/billing" section="billing" icon={<Icons.Wallet {...ico} />} title="Collected" loading={loading} align="top" className="cu-kpi">
      <Figure><Money npr={totals.collected} /></Figure>
      <Sub>{totals.invoiced > 0 ? <><b>{pct}%</b> of invoiced</> : "Nothing invoiced yet"}</Sub>
      {totals.invoiced > 0 && (
        <div className="cu-vis">
          <Meter pct={totals.collectRate} tone="good" />
        </div>
      )}
    </Tile>
  );
}

/**
 * What customers still owe. It asks for attention (terracotta) only when part of it is overdue, and says "Everyone has paid" (the calm
 * tint) only when something has been invoiced: with nothing invoiced (an empty side of the region switch) nobody has paid anything.
 */
export function OwedTile({ totals, loading }) {
  const owed = totals.outstanding;
  const late = totals.overdue;
  const soon = Math.max(0, owed - late);
  const billed = totals.invoiced > 0.5;
  const tone = late > 0.5 ? "terra" : owed > 0.5 ? "default" : billed ? "wash" : "default";
  return (
    <Tile area="owe" tone={tone} to="/billing" section="billing" icon={<Icons.Alert {...ico} />} title="Still owed" loading={loading} align="top" className="cu-kpi">
      <Figure><Money npr={owed} /></Figure>
      <Sub>
        {late > 0.5
          ? <><b><Money npr={late} compact /></b> overdue</>
          : owed > 0.5 ? "None overdue" : billed ? "Everyone has paid" : "Nothing invoiced yet"}
      </Sub>
      {owed > 0.5 && (
        <div className="cu-vis">
          <div className="cu-split" aria-hidden="true">
            {late > 0.5 && <i className="is-late" style={{ flexGrow: late }} />}
            {soon > 0.5 && <i className="is-soon" style={{ flexGrow: soon }} />}
          </div>
        </div>
      )}
    </Tile>
  );
}
