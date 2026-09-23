import { useEffect, useState } from "react";
import { Card, Pill } from "../ui";
import { asCurrency, roundAmount } from "../../utils/format";
import { fetchCampaignAttribution } from "../../lib/metaAds";
import DateRangePicker, { isoDaysAgo } from "./DateRangePicker";

/**
 * ROAS needs spend (the ad account's own currency) against order value
 * (always NPR, per orders.total_value_npr) — two different currencies that
 * cannot just be divided. This fetches today's rate for whichever
 * currencies actually showed up, scoped to this component only (not the
 * shared CurrencyContext, which is a GBP<->NPR display toggle for the rest
 * of the app, a different job). A failed fetch just leaves that campaign's
 * ROAS as "—" rather than showing a wrong number.
 */
function useNprRates(currencies) {
  const [rates, setRates] = useState({});
  useEffect(() => {
    const missing = currencies.filter((c) => c && c !== "NPR" && !(c in rates));
    if (missing.length === 0) return;
    let alive = true;
    Promise.all(
      missing.map((c) =>
        fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(c)}`)
          .then((r) => r.json())
          .then((d) => [c, d?.rates?.NPR || null])
          .catch(() => [c, null])
      )
    ).then((pairs) => {
      if (!alive) return;
      setRates((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencies.join(",")]);
  return rates;
}

export default function Attribution() {
  const [range, setRange] = useState({ dateFrom: "", dateTo: "" }); // all-time by default, per migration 0047
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchCampaignAttribution(range.dateFrom || null, range.dateTo || null)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(e.message || "Couldn't load attribution."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [range.dateFrom, range.dateTo]);

  const currencies = [...new Set(rows.map((r) => r.currency).filter(Boolean))];
  const npr = useNprRates(currencies);
  const nprValue = (spend, currency) => {
    if (currency === "NPR") return spend;
    const rate = npr[currency];
    return rate ? spend * rate : null;
  };

  return (
    <div className="kmkt-attribution">
      <Card className="kmkt-attr-banner">
        <p>
          <strong>Manually tagged, not tracked.</strong> There's no ad-click tracking anywhere in this
          app — these numbers come only from staff picking a campaign on a customer's record when they
          know that's where the lead came from (Customers → Source campaign). A customer's later,
          unrelated orders inherit whatever tag they were given once. Treat this as a rough steer, not
          a measurement.
        </p>
      </Card>

      <div className="kmkt-overview-head">
        <DateRangePicker
          dateFrom={range.dateFrom || isoDaysAgo(90)}
          dateTo={range.dateTo || isoDaysAgo(0)}
          onChange={setRange}
        />
        <Pill tone="neutral">Spend is limited to this range; tagged customers/orders are all-time</Pill>
      </div>

      {error && <p className="form-error">{error}</p>}

      <Card pad={false}>
        <table className="ktable">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Spend</th>
              <th>Tagged customers</th>
              <th>Tagged orders</th>
              <th>Order value (NPR)</th>
              <th>Cost / tagged customer</th>
              <th>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const spendNpr = nprValue(r.spend, r.currency);
              const roas = spendNpr ? r.taggedOrderValueNpr / spendNpr : null;
              return (
                <tr key={r.campaignId}>
                  <td>{r.campaignName}</td>
                  <td className="mono">{asCurrency(r.spend, r.currency)}</td>
                  <td className="mono">{r.taggedCustomers}</td>
                  <td className="mono">{r.taggedOrders}</td>
                  <td className="mono">{asCurrency(r.taggedOrderValueNpr, "NPR")}</td>
                  <td className="mono">
                    {r.taggedCustomers ? asCurrency(r.spend / r.taggedCustomers, r.currency) : "—"}
                  </td>
                  <td className="mono">
                    {roas != null ? `${roas.toFixed(2)}×` : r.currency === "NPR" ? "—" : "converting…"}
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="kmkt-muted">No campaigns synced yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
      {currencies.some((c) => c !== "NPR") && (
        <p className="kmkt-muted">
          ROAS converts spend to NPR at today's rate ({[...currencies].filter(c => c !== "NPR").map(c => `1 ${c} ≈ ${roundAmount(npr[c] || 0)} NPR`).join(", ") || "fetching…"}) — approximate, not the rate at the time each ad ran.
        </p>
      )}
    </div>
  );
}
