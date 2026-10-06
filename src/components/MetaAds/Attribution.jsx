import { useEffect, useState } from "react";
import { Card, Pill } from "../ui";
import { asCurrency } from "../../utils/format";
import { fetchCampaignAttribution } from "../../lib/metaAds";
import DateRangePicker from "./DateRangePicker";
import { money } from "./money";

/**
 * ROAS needs spend (the ad account's own currency) against order value
 * (always NPR, per orders.total_value_npr) — two different currencies that
 * cannot just be divided. This fetches today's rate for whichever
 * currencies actually showed up, scoped to this component only (not the
 * shared CurrencyContext, which is a GBP<->NPR display toggle for the rest
 * of the app, a different job). A failed fetch is stored as null so that
 * campaign's ROAS shows "—" (rate unavailable) rather than a wrong number
 * or a "converting…" that never ends.
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
    setError("");
    fetchCampaignAttribution(range.dateFrom || null, range.dateTo || null)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(e.message || "Couldn't load attribution."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [range.dateFrom, range.dateTo]);

  const currencies = [...new Set(rows.map((r) => r.currency).filter(Boolean))];
  const npr = useNprRates(currencies);
  const foreign = currencies.filter((c) => c !== "NPR");

  /**
   * ROAS is only a number when there is something to measure: spend > 0,
   * at least one tagged order, and a known rate. Otherwise say why, rather
   * than "0.00×" (reads as a measured failure) or an endless "converting…".
   */
  const roasCell = (r) => {
    if (!(Number(r.spend) > 0)) return { text: "—", title: "No spend in this range" };
    if (!(Number(r.taggedOrders) > 0)) return { text: "—", title: "No tagged orders yet" };
    let spendNpr = null;
    if (r.currency === "NPR") spendNpr = Number(r.spend);
    else if (!(r.currency in npr)) return { text: "…", title: "Fetching exchange rate" };
    else if (npr[r.currency]) spendNpr = Number(r.spend) * npr[r.currency];
    else return { text: "—", title: `No ${r.currency}→NPR rate available` };
    return { text: `${(Number(r.taggedOrderValueNpr) / spendNpr).toFixed(2)}×`, title: "" };
  };

  const rateText = (c) => {
    if (!(c in npr)) return `1 ${c} ≈ … NPR (fetching)`;
    if (!npr[c]) return `${c} rate unavailable`;
    return `1 ${c} ≈ ${npr[c].toFixed(2)} NPR`;
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
          dateFrom={range.dateFrom}
          dateTo={range.dateTo}
          onChange={setRange}
          allowAll
        />
        <Pill tone="neutral">
          {range.dateFrom || range.dateTo ? "Spend is limited to this range; tagged customers/orders are all-time" : "All time"}
        </Pill>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <Card pad={false}>
        <div className="kmkt-table-scroll">
          <table className="ktable">
            <thead>
              <tr>
                <th>Campaign</th>
                <th className="kmkt-num">Spend</th>
                <th className="kmkt-num">Tagged customers</th>
                <th className="kmkt-num">Tagged orders</th>
                <th className="kmkt-num">Order value (NPR)</th>
                <th className="kmkt-num">Cost / tagged customer</th>
                <th className="kmkt-num">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const roas = roasCell(r);
                return (
                  <tr key={r.campaignId}>
                    <td>{r.campaignName}</td>
                    <td className="mono kmkt-num">{money(r.spend, r.currency)}</td>
                    <td className="mono kmkt-num">{r.taggedCustomers}</td>
                    <td className="mono kmkt-num">{r.taggedOrders}</td>
                    <td className="mono kmkt-num">{asCurrency(r.taggedOrderValueNpr, "NPR")}</td>
                    <td className="mono kmkt-num">
                      {r.taggedCustomers ? money(r.spend / r.taggedCustomers, r.currency) : "—"}
                    </td>
                    <td className="mono kmkt-num" title={roas.title || undefined}>{roas.text}</td>
                  </tr>
                );
              })}
              {loading && rows.length === 0 && (
                <tr><td colSpan={7} className="kmkt-muted">Loading…</td></tr>
              )}
              {!loading && !error && rows.length === 0 && (
                <tr><td colSpan={7} className="kmkt-muted">No campaigns synced yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {foreign.length > 0 && (
        <p className="kmkt-muted">
          ROAS converts spend to NPR at today's rate ({foreign.map(rateText).join(", ")}) — approximate, not the rate at the time each ad ran.
        </p>
      )}
    </div>
  );
}
