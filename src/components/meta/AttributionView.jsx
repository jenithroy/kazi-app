/**
 * Meta Ads, Attribution: what each campaign cost against the customers and orders staff have tagged to it. It is hand-tagged (a person
 * picks a campaign on a customer's record when they know where the lead came from), not tracked, and the page says so at the top.
 *
 *   top row   spend in the range, customers tagged, order value (NPR), and the overall ROAS
 *   below     one table: each campaign's spend, tagged customers, orders, order value, cost per customer and ROAS, then the totals
 *
 * Order value is always NPR and spend is in the ad account's own currency, so ROAS needs today's rate (hooks/useNprRates.js); a campaign
 * whose rate is missing shows "—" with the reason, never a wrong number. Campaigns with no spend and no tags are tucked behind a button.
 * Spend is bounded by the date range; the tags are all time (the page says which).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icons } from "../ui";
import { BentoGrid, EmptyNote, Tile } from "../bento/Bento";
import DataTable from "../table/DataTable";
import { Kpi, LoadError, NONE, Notice, ico, num, plural } from "./Common";
import useMetaLoad from "../../hooks/useMetaLoad";
import useNprRates from "../../hooks/useNprRates";
import { fetchCampaignAttribution } from "../../lib/metaAds";
import { money } from "../../lib/metaMoney";
import { asCurrency } from "../../utils/format";
import { attributionActive, attributionSorted, attributionTotals, rangeWords, roasOf } from "../../lib/metaCalc";

export default function AttributionView({ range, tick }) {
  const about = `${range.dateFrom}|${range.dateTo}`;
  const { data, status, stale, refreshing, reload } = useMetaLoad(async () => (await fetchCampaignAttribution(range.dateFrom || null, range.dateTo || null)) || [], `${about}|${tick}`, about);
  const rows = data || NONE;
  const loading = status === "loading";
  const [inactive, setInactive] = useState(false);
  const [how, setHow] = useState(false);

  const currencies = useMemo(() => [...new Set(rows.map((r) => r.currency).filter(Boolean))], [rows]);
  const { rates, fetchedAt, hasError, retry } = useNprRates(currencies);
  const foreign = currencies.filter((c) => c !== "NPR");

  const sorted = useMemo(() => attributionSorted(rows), [rows]);
  const active = sorted.filter(attributionActive);
  const quiet = sorted.filter((r) => !attributionActive(r));
  const totals = useMemo(() => attributionTotals(rows, rates), [rows, rates]);

  const table = useMemo(() => {
    const body = (inactive ? sorted : active).map((r) => ({ ...r, key: r.campaignId }));
    return rows.length > 0 ? [...body, { key: "total", kind: "total" }] : body;
  }, [rows, sorted, active, inactive]);

  const spendText = totals.currencies.length === 0 ? "—" : totals.currencies.map((c) => money(totals.spend[c], c)).join(" + ");

  const columns = useMemo(() => [
    {
      id: "name", label: "Campaign", grow: true, min: 200, max: 420,
      render: (r) => (r.kind === "total" ? <b>Total ({rows.length} {plural(rows.length, "campaign")})</b> : <span className="ma-line" title={r.campaignName}>{r.campaignName}</span>),
    },
    { id: "spend", label: "Spend", width: 118, align: "end", render: (r) => <span className="dt-num">{r.kind === "total" ? spendText : money(r.spend, r.currency)}</span> },
    { id: "cust", label: "Customers", width: 100, align: "end", drop: 3, render: (r) => <span className="dt-num">{r.kind === "total" ? totals.customers : r.taggedCustomers}</span> },
    { id: "orders", label: "Orders", width: 84, align: "end", drop: 4, render: (r) => <span className="dt-num">{r.kind === "total" ? totals.orders : r.taggedOrders}</span> },
    { id: "value", label: "Order value", width: 128, align: "end", drop: 2, render: (r) => <span className="dt-num">{asCurrency(r.kind === "total" ? totals.valueNpr : r.taggedOrderValueNpr, "NPR")}</span> },
    {
      id: "cpc", label: "Cost / customer", width: 128, align: "end", drop: 5,
      render: (r) => {
        if (r.kind === "total") return <span className="dt-num">{totals.costPerCustomer ? money(totals.costPerCustomer.amount, totals.costPerCustomer.currency) : "—"}</span>;
        return <span className="dt-num">{r.taggedCustomers ? money(r.spend / r.taggedCustomers, r.currency) : "—"}</span>;
      },
    },
    {
      id: "roas", label: "ROAS", width: 88, align: "end",
      render: (r) => { const x = r.kind === "total" ? totals.roas : roasOf(r, rates); return <span className="dt-num dt-strong" title={x.title || undefined}>{x.text}</span>; },
    },
  ], [rows.length, totals, rates, spendText]);

  if (status === "error") return <LoadError what="Attribution" onRetry={reload} busy={refreshing} />;

  const stamp = fetchedAt ? fetchedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <>
      <Notice
        tone="info"
        action={{ label: how ? "Hide" : "How tagging works", onClick: () => setHow((v) => !v) }}
      >
        Hand-tagged by staff, not tracked. Treat it as a rough steer.
        {how && (
          <span className="ma-how">
            {" "}There is no ad-click tracking anywhere in this app: these numbers come only from staff picking a campaign on a customer's record when they know that is where the lead came from (Customers → Source campaign). A customer's later, unrelated orders inherit whatever tag they were given once. <Link to="/customers">Tag a customer in Customers →</Link>
          </span>
        )}
      </Notice>
      {stale && <Notice tone="warn" action={{ label: refreshing ? "Trying…" : "Try again", onClick: reload, disabled: refreshing }}>Could not refresh just now. This is what was loaded last.</Notice>}

      <BentoGrid layout="ma-attr">
        <Kpi area="sp" title="Spend" icon={<Icons.Wallet {...ico} />} loading={loading} value={spendText} sub={rangeWords(range)} />
        <Kpi area="cu" title="Customers tagged" icon={<Icons.Customers {...ico} />} loading={loading} value={num(totals.customers)} sub="all time" />
        <Kpi area="va" title="Order value" icon={<Icons.Billing {...ico} />} loading={loading} value={asCurrency(totals.valueNpr, "NPR")} sub={`${num(totals.orders)} tagged ${plural(totals.orders, "order")}`} />
        <Kpi area="ro" title="ROAS" icon={<Icons.Pulse {...ico} />} loading={loading} value={totals.roas.text} sub={totals.roas.title || "order value ÷ spend"} />

        <Tile area="main" title="By campaign" icon={<Icons.Marketing {...ico} />} align="top" className="ma-pane" note={loading ? undefined : `${active.length} of ${rows.length} with spend or tags`}>
          {!loading && rows.length === 0 ? (
            <div className="dt-empty"><EmptyNote icon={<Icons.Marketing size={22} sw={1.5} />}>No campaigns synced yet.</EmptyNote></div>
          ) : (
            <DataTable label="Attribution by campaign" rows={table} rowKey={(r) => r.key} columns={columns} kindOf={(r) => r.kind} loading={loading} focusBody />
          )}
          <div className="ma-foot">
            {quiet.length > 0 && (
              <button type="button" className="ma-more" onClick={() => setInactive((v) => !v)}>
                {inactive ? "Hide" : "Show"} {quiet.length} inactive {plural(quiet.length, "campaign")} (no spend or tags)
              </button>
            )}
            <p>
              {foreign.length > 0
                ? <>ROAS converts spend to NPR at today's rate ({foreign.map((c) => (rates[c] ? `1 ${c} ≈ ${rates[c].toFixed(2)} NPR` : `${c} rate unavailable`)).join(", ")}{stamp ? ` · fetched ${stamp}` : ""}), approximate, not the rate when each ad ran. Spend is for the range; tags are all time.</>
                : "All amounts in NPR. Spend is for the range; tags are all time."}
              {hasError && <> <span className="ma-bad">Rate unavailable.</span> <button type="button" className="ma-linkbtn" onClick={retry}>Retry</button></>}
            </p>
          </div>
        </Tile>
      </BentoGrid>
    </>
  );
}
