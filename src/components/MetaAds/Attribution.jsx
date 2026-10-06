import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Btn, Pill, Icons } from "../ui";
import { asCurrency } from "../../utils/format";
import { fetchCampaignAttribution } from "../../lib/metaAds";
import DateRangePicker from "./DateRangePicker";
import { money } from "./money";

/**
 * ROAS needs spend (the ad account's own currency) against order value
 * (always NPR, per orders.total_value_npr) — two different currencies that
 * cannot just be divided. This fetches today's rate for whichever
 * currencies actually showed up, scoped to this component only.
 * A failed fetch is stored as null so that campaign's ROAS shows "—"
 * rather than a wrong number or a "converting…" that never ends.
 */
function useNprRates(currencies) {
  const [rates, setRates] = useState({});
  const [fetching, setFetching] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [hasError, setHasError] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const retry = () => setRetryTrigger((k) => k + 1);

  useEffect(() => {
    const missing = currencies.filter((c) => c && c !== "NPR" && !(c in rates));
    if (missing.length === 0) return;
    let alive = true;
    setFetching(true);
    setHasError(false);

    Promise.all(
      missing.map((c) =>
        fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(c)}`)
          .then((r) => r.json())
          .then((d) => [c, d?.rates?.NPR || null])
          .catch(() => [c, null])
      )
    ).then((pairs) => {
      if (!alive) return;
      const newMap = Object.fromEntries(pairs);
      setRates((prev) => ({ ...prev, ...newMap }));
      setFetchedAt(new Date());
      setFetching(false);
      if (pairs.some(([, val]) => val == null)) {
        setHasError(true);
      }
    });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencies.join(","), retryTrigger]);

  return { rates, fetching, fetchedAt, hasError, retry };
}

export default function Attribution({ range: propRange }) {
  const navigate = useNavigate();
  const [internalRange, setInternalRange] = useState({ dateFrom: "", dateTo: "" }); // all-time by default
  const range = propRange || internalRange;
  const setRange = setInternalRange;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetchCampaignAttribution(range.dateFrom || null, range.dateTo || null)
      .then((r) => alive && setRows(r || []))
      .catch((e) => alive && setError(e.message || "Couldn't load attribution."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [range.dateFrom, range.dateTo]);

  const currencies = [...new Set(rows.map((r) => r.currency).filter(Boolean))];
  const { rates, fetchedAt, hasError, retry } = useNprRates(currencies);
  const foreign = currencies.filter((c) => c !== "NPR");

  const formattedDate = fetchedAt
    ? fetchedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";

  /**
   * ROAS is only a number when there is something to measure: spend > 0,
   * at least one tagged order, and a known rate. Otherwise say why, rather
   * than "0.00×" (reads as a measured failure) or an endless "converting…".
   */
  const roasCell = (r) => {
    if (!(Number(r.spend) > 0)) return { text: "—", title: "No spend in this range" };
    if (!(Number(r.taggedOrders) > 0)) return { text: "—", title: "No tagged orders yet" };
    let spendNpr = null;
    if (r.currency === "NPR") {
      spendNpr = Number(r.spend);
    } else if (!(r.currency in rates)) {
      return { text: "…", title: "Fetching exchange rate" };
    } else if (rates[r.currency]) {
      spendNpr = Number(r.spend) * rates[r.currency];
    } else {
      return { text: "—", title: `No ${r.currency}→NPR rate available` };
    }
    return { text: `${(Number(r.taggedOrderValueNpr) / spendNpr).toFixed(2)}×`, title: "" };
  };

  // Sort rows by spend descending, then order value descending
  const sortedRows = [...rows].sort((a, b) => {
    const diffSpend = Number(b.spend || 0) - Number(a.spend || 0);
    if (diffSpend !== 0) return diffSpend;
    return Number(b.taggedOrderValueNpr || 0) - Number(a.taggedOrderValueNpr || 0);
  });

  const isActive = (r) =>
    Number(r.spend) > 0 || Number(r.taggedCustomers) > 0 || Number(r.taggedOrders) > 0;

  const activeRows = sortedRows.filter(isActive);
  const inactiveRows = sortedRows.filter((r) => !isActive(r));
  const displayedRows = showInactive ? sortedRows : activeRows;

  // Aggregate totals
  const totalCustomers = rows.reduce((s, r) => s + (Number(r.taggedCustomers) || 0), 0);
  const totalOrders = rows.reduce((s, r) => s + (Number(r.taggedOrders) || 0), 0);
  const totalOrderValueNpr = rows.reduce((s, r) => s + (Number(r.taggedOrderValueNpr) || 0), 0);

  const spendByCurrency = {};
  for (const r of rows) {
    const cur = r.currency || "USD";
    spendByCurrency[cur] = (spendByCurrency[cur] || 0) + (Number(r.spend) || 0);
  }
  const spendCurrencies = Object.keys(spendByCurrency);

  const renderTotalSpend = () => {
    if (spendCurrencies.length === 0) return "—";
    if (spendCurrencies.length === 1) {
      const cur = spendCurrencies[0];
      return money(spendByCurrency[cur], cur);
    }
    return spendCurrencies.map((cur) => money(spendByCurrency[cur], cur)).join(" + ");
  };

  const renderTotalCostPerCust = () => {
    if (totalCustomers === 0) return "—";
    if (spendCurrencies.length === 1) {
      const cur = spendCurrencies[0];
      return money(spendByCurrency[cur] / totalCustomers, cur);
    }
    return "—";
  };

  const totalRoasObj = (() => {
    if (totalOrders === 0) return { text: "—", title: "No tagged orders yet" };
    let totalSpendNpr = 0;
    for (const r of rows) {
      const spend = Number(r.spend) || 0;
      if (spend <= 0) continue;
      if (r.currency === "NPR") {
        totalSpendNpr += spend;
      } else if (rates[r.currency]) {
        totalSpendNpr += spend * rates[r.currency];
      } else {
        return { text: "—", title: `Exchange rate missing for ${r.currency}` };
      }
    }
    if (totalSpendNpr <= 0) return { text: "—", title: "No spend in this range" };
    return {
      text: `${(totalOrderValueNpr / totalSpendNpr).toFixed(2)}×`,
      title: "Total ROAS across all campaigns",
    };
  })();

  return (
    <div className="kmkt-attribution">
      {/* Info Banner (Blue) with Disclosure */}
      <div className="kmkt-attr-banner-blue">
        <div className="kmkt-attr-banner-header">
          <div className="kmkt-attr-banner-lead">
            <Icons.Info size={16} />
            <span>Hand-tagged by staff, not tracked. Treat as a rough steer.</span>
          </div>
          <button
            type="button"
            className="kmkt-attr-disclosure-btn"
            onClick={() => setShowDisclosure((v) => !v)}
            aria-expanded={showDisclosure}
          >
            How tagging works
            <Icons.ChevronDown
              size={13}
              style={{
                transform: showDisclosure ? "rotate(180deg)" : "none",
                transition: "transform 0.15s ease",
              }}
            />
          </button>
        </div>
        {showDisclosure && (
          <div className="kmkt-attr-disclosure-body">
            <p style={{ margin: "0 0 6px" }}>
              There's no ad-click tracking anywhere in this app — these numbers come only from staff
              picking a campaign on a customer's record when they know that's where the lead came from
              (Customers → Source campaign). A customer's later, unrelated orders inherit whatever tag
              they were given once. Treat this as a rough steer, not a measurement.
            </p>
            <button
              type="button"
              className="kmkt-attr-link"
              onClick={() => navigate("/customers")}
            >
              Tag a customer in Customers →
            </button>
          </div>
        )}
      </div>

      {/* Range controls if not embedded with section bar */}
      {!propRange && (
        <div className="kmkt-overview-head">
          <DateRangePicker
            dateFrom={range.dateFrom}
            dateTo={range.dateTo}
            onChange={setRange}
            allowAll
          />
        </div>
      )}

      {error && (
        <p className="form-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}

      {/* Desktop Grouped Header Table */}
      <div className="kmkt-attr-desktop">
        <Card pad={false}>
          <div className="kmkt-table-scroll">
            <table className="ktable">
              <thead>
                <tr className="kmkt-attr-superhead">
                  <th style={{ borderBottom: "none" }}></th>
                  <th className="kmkt-num kmkt-th-group">Meta · in range</th>
                  <th colSpan={3} className="kmkt-th-group" style={{ textAlign: "center" }}>
                    Tagged in Kazi · all time
                  </th>
                  <th colSpan={2} className="kmkt-num kmkt-th-group" style={{ textAlign: "right" }}>
                    Derived
                  </th>
                </tr>
                <tr className="kmkt-attr-subhead">
                  <th>Campaign</th>
                  <th className="kmkt-num">Spend</th>
                  <th className="kmkt-num">Customers</th>
                  <th className="kmkt-num">Orders</th>
                  <th className="kmkt-num">Order value (NPR)</th>
                  <th className="kmkt-num">Cost / cust</th>
                  <th className="kmkt-num">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((r) => {
                  const roas = roasCell(r);
                  return (
                    <tr key={r.campaignId}>
                      <td style={{ fontWeight: 500 }}>{r.campaignName}</td>
                      <td className="mono kmkt-num">{money(r.spend, r.currency)}</td>
                      <td className="mono kmkt-num">{r.taggedCustomers}</td>
                      <td className="mono kmkt-num">{r.taggedOrders}</td>
                      <td className="mono kmkt-num">{asCurrency(r.taggedOrderValueNpr, "NPR")}</td>
                      <td className="mono kmkt-num">
                        {r.taggedCustomers ? money(r.spend / r.taggedCustomers, r.currency) : "—"}
                      </td>
                      <td className="mono kmkt-num" title={roas.title || undefined}>
                        {roas.text}
                      </td>
                    </tr>
                  );
                })}

                {inactiveRows.length > 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "10px 16px" }}>
                      <Btn kind="ghost" size="sm" onClick={() => setShowInactive((v) => !v)}>
                        {showInactive ? "Hide" : "Show"} {inactiveRows.length} inactive campaign
                        {inactiveRows.length === 1 ? "" : "s"} (no spend or tags)
                      </Btn>
                    </td>
                  </tr>
                )}

                {loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="kmkt-muted" style={{ textAlign: "center", padding: "20px 16px" }}>
                      Loading attribution…
                    </td>
                  </tr>
                )}
                {!loading && !error && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="kmkt-muted" style={{ textAlign: "center", padding: "24px 16px" }}>
                      No campaigns synced yet.
                    </td>
                  </tr>
                )}
              </tbody>

              {rows.length > 0 && (
                <tfoot>
                  <tr className="kmkt-attr-total-row">
                    <td>Total ({rows.length} campaigns)</td>
                    <td className="mono kmkt-num">{renderTotalSpend()}</td>
                    <td className="mono kmkt-num">{totalCustomers}</td>
                    <td className="mono kmkt-num">{totalOrders}</td>
                    <td className="mono kmkt-num">{asCurrency(totalOrderValueNpr, "NPR")}</td>
                    <td className="mono kmkt-num">{renderTotalCostPerCust()}</td>
                    <td className="mono kmkt-num" title={totalRoasObj.title || undefined}>
                      {totalRoasObj.text}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="kmkt-attr-footnote">
            <div>
              {foreign.length > 0 ? (
                <span>
                  ROAS converts spend to NPR at today's rate (
                  {foreign
                    .map((c) =>
                      rates[c]
                        ? `1 ${c} ≈ ${rates[c].toFixed(2)} NPR`
                        : `${c} rate unavailable`
                    )
                    .join(", ")}
                  {formattedDate ? ` · fetched ${formattedDate}` : ""}
                  ) — approximate, not the rate at the time each ad ran.
                </span>
              ) : (
                <span>All amounts in NPR.</span>
              )}
            </div>
            {hasError && (
              <div>
                <span className="form-error" style={{ marginRight: 8 }}>
                  Rate unavailable
                </span>
                <Btn kind="ghost" size="sm" onClick={retry}>
                  Retry
                </Btn>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Mobile Card Layout */}
      <div className="kmkt-attr-mobile">
        {rows.length > 0 && (
          <div className="kmkt-attr-card kmkt-attr-card--total">
            <div className="kmkt-attr-card-h">
              <div className="kmkt-attr-card-title">Total ({rows.length} campaigns)</div>
              <Pill tone={totalRoasObj.text !== "—" ? "mint" : "neutral"}>
                {totalRoasObj.text !== "—" ? `${totalRoasObj.text} ROAS` : "ROAS —"}
              </Pill>
            </div>
            <div className="kmkt-attr-card-grid">
              <div>
                <span className="kmkt-attr-card-label">Total Spend: </span>
                <span className="kmkt-attr-card-val mono">{renderTotalSpend()}</span>
              </div>
              <div>
                <span className="kmkt-attr-card-label">Cost / cust: </span>
                <span className="kmkt-attr-card-val mono">{renderTotalCostPerCust()}</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink)", marginTop: 2 }}>
              <strong>{totalCustomers}</strong> customers · <strong>{totalOrders}</strong> orders ·{" "}
              <strong className="mono">{asCurrency(totalOrderValueNpr, "NPR")}</strong>
            </div>
          </div>
        )}

        {displayedRows.map((r) => {
          const roas = roasCell(r);
          return (
            <div className="kmkt-attr-card" key={r.campaignId}>
              <div className="kmkt-attr-card-h">
                <div className="kmkt-attr-card-title">{r.campaignName}</div>
                <Pill tone={roas.text !== "—" ? "mint" : "neutral"}>
                  {roas.text !== "—" ? `${roas.text} ROAS` : "ROAS —"}
                </Pill>
              </div>
              <div className="kmkt-attr-card-grid">
                <div>
                  <span className="kmkt-attr-card-label">Spend in range: </span>
                  <span className="kmkt-attr-card-val mono">{money(r.spend, r.currency)}</span>
                </div>
                <div>
                  <span className="kmkt-attr-card-label">Cost / cust: </span>
                  <span className="kmkt-attr-card-val mono">
                    {r.taggedCustomers ? money(r.spend / r.taggedCustomers, r.currency) : "—"}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                <strong>{r.taggedCustomers}</strong> customer{r.taggedCustomers === 1 ? "" : "s"} ·{" "}
                <strong>{r.taggedOrders}</strong> order{r.taggedOrders === 1 ? "" : "s"} ·{" "}
                <strong className="mono">{asCurrency(r.taggedOrderValueNpr, "NPR")}</strong>
              </div>
            </div>
          );
        })}

        {inactiveRows.length > 0 && (
          <div style={{ textAlign: "center", padding: "6px 0" }}>
            <Btn kind="ghost" size="sm" onClick={() => setShowInactive((v) => !v)}>
              {showInactive ? "Hide" : "Show"} {inactiveRows.length} inactive campaign
              {inactiveRows.length === 1 ? "" : "s"}
            </Btn>
          </div>
        )}

        {loading && rows.length === 0 && (
          <p className="kmkt-muted" style={{ textAlign: "center", padding: "16px 0" }}>
            Loading attribution…
          </p>
        )}
      </div>
    </div>
  );
}
