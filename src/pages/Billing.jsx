/**
 * Billing, on the same glass frame as Finance: one screen, the documents scroll in their pane under a head that stays put, and a
 * document is typed into and corrected in the card in the middle of the screen.
 *
 *   header    the period (a fiscal year or a From / To, in A.D. or B.S.) and the region, as on Finance
 *   tabs      VAT invoices · Challans · Quotations, each with how many there are in the period
 *   top row   what this kind of document comes to: the total, what has been collected (delivered, accepted), what is still owed, and for
 *             an invoice the VAT collected
 *   pane      one line per document, filtered by chips and a search; a row opens the document; View opens the A4 copy to print
 *
 * What it reads, who may change it, the numbering of documents, the PAN rule, payments, stock and every write are the old page's
 * (lib/billing.js, lib/billingWrites.js). The A4 document itself (components/DocPreview.jsx) is untouched: it is a legal record.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BentoGrid, BentoPage, EmptyNote, Figure, Money, Sub, Tile } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import DataTable from "../components/table/DataTable";
import { FilterChips, SearchBox } from "../components/table/Bar";
import { RegionSwitch } from "../components/RegionSwitch";
import PeriodBar, { DateModeSwitch } from "../components/finance/PeriodBar";
import FinPane from "../components/finance/FinPane";
import ConfirmDialog from "../components/finance/ConfirmDialog";
import { Chip, ExportButton, Foot, FootSum, NameCell, plural, useMoney, usePhoneRows, useShiftN } from "../components/finance/parts";
import "../components/finance/finance.css";
import "../components/billing/billing.css";
import DocTabs from "../components/billing/DocTabs";
import DocCard from "../components/billing/DocCard";
import PaymentCard from "../components/billing/PaymentCard";
import useAsk from "../components/billing/useAsk";
import DocPreview from "../components/DocPreview";
import useBillingData from "../hooks/useBillingData";
import useDateMode from "../hooks/useDateMode";
import { useAuth } from "../context/AuthContext";
import { useRegion } from "../context/RegionContext";
import { useCurrency } from "../context/CurrencyContext";
import { sectionCanEdit } from "../utils/permissions";
import { countUntagged, filterByRegion } from "../utils/region";
import { filterByDateRange, filterByFiscalYear, fiscalYearsIn, isFiscalYearLabel } from "../utils/fiscalYear";
import { useFiscalYearFilter } from "../components/FiscalYearFilter";
import { useDateRangeFilter } from "../components/DateRangeFilter";
import { describePeriod } from "../lib/period";
import { DOC_TYPES } from "../utils/billing.jsx";
import { toNPR } from "../utils/currency";
import { CHIPS, FIGURES, KINDS, WORDS, creditDue, csvColumns, hasPayments, numberOf, outOfOrderSeries, payInfo, relatedText, searchDocs, statusTone, summarise } from "../lib/billing";
import { cancelDoc, convertToInvoice, renumberSeries, setDocStatus } from "../lib/billingWrites";

const ico = { size: 14, sw: 1.8 };

export default function Billing() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { region } = useRegion();
  const { ratesVersion } = useCurrency();
  const [dateMode, , show] = useDateMode();
  const money = useMoney();
  const data = useBillingData();
  const loading = data.status === "loading";
  const canEdit = sectionCanEdit(profile, "billing");
  // Picking a client for a document can add one to Customers, which is gated on Customers access, the same rule Production's order form
  // uses: a role that cannot add customers there cannot back-door it by adding one from an invoice either.
  const canAddCustomers = sectionCanEdit(profile, "customers");

  const [tab, setTab] = useState("invoice");
  const [query, setQuery] = useState(location.state?.search || "");     // prefilled when arriving from a Finance ledger line
  const [chip, setChip] = useState("all");
  const [card, setCard] = useState(null);                  // null, or { id } (null id = a new document)
  const [payId, setPayId] = useState(null);                // an invoice whose payments are open
  const [preview, setPreview] = useState(null);            // { data, docType }: the A4 copy
  const [renumbering, setRenumbering] = useState(false);
  const [notice, setNotice] = useState(null);
  const [asking, ask] = useAsk();
  const timer = useRef(0);
  const notify = useCallback((text, tone = "bad") => {
    clearTimeout(timer.current);
    setNotice({ text, tone });
    timer.current = setTimeout(() => setNotice(null), 9000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  // The A4 copy (DocPreview) is a legal document with its own toolbar, not one of our dialogs: it needs Escape, and focus in and out, by hand.
  // Escape is taken before the card behind it can see the key, so it closes the copy and nothing else.
  const opener = useRef(null);
  const openPreview = useCallback((doc, docType) => { opener.current = document.activeElement; setPreview({ data: doc, docType }); }, []);
  const closePreview = useCallback(() => {
    setPreview(null);
    requestAnimationFrame(() => { const el = opener.current; if (el && el.isConnected) el.focus({ preventScroll: true }); });
  }, []);
  useEffect(() => {
    if (!preview) return undefined;
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePreview(); } };
    window.addEventListener("keydown", onKey, true);
    const raf = requestAnimationFrame(() => document.querySelector("#__kazi_doc_root__ .doc-toolbar button:last-of-type")?.focus());
    return () => { window.removeEventListener("keydown", onKey, true); cancelAnimationFrame(raf); };
  }, [preview, closePreview]);

  /* ── One region's documents, then one period of them ───────────────
     The region says whose book, the fiscal year which year of it (a document belongs to the year its own Nepali date falls in) and a
     From / To narrows that further. The tab counts, the top row and the table all read the narrowed lists. `data.*` stay whole for
     what must reach across regions and years: the numbering (one series), and the Finance ledger's deep link to a document. */
  const byKind = useMemo(() => ({
    invoice: filterByRegion(data.invoices, region),
    challan: filterByRegion(data.challans, region),
    quotation: filterByRegion(data.quotations, region),
  }), [data.invoices, data.challans, data.quotations, region]);
  const inventoryItems = useMemo(() => filterByRegion(data.inventoryItems, region), [data.inventoryItems, region]);
  const customers = useMemo(() => filterByRegion(data.customers, region), [data.customers, region]);
  const [fy] = useFiscalYearFilter();
  const [dateRange] = useDateRangeFilter();
  const inPeriod = useMemo(
    () => Object.fromEntries(KINDS.map((k) => [k, filterByDateRange(filterByFiscalYear(byKind[k], fy), dateRange)])),
    [byKind, fy, dateRange],
  );
  const fyActive = isFiscalYearLabel(fy);

  const meta = DOC_TYPES[tab];
  const words = WORDS[tab];
  const list = inPeriod[tab];
  const yearsHere = useMemo(() => fiscalYearsIn(byKind[tab]), [byKind, tab]);
  // every document of this kind, in any region and any year: numbers are one series across regions, so what would be renumbered is judged on all
  const allOfKind = tab === "invoice" ? data.invoices : tab === "challan" ? data.challans : data.quotations;
  // a tab counts the documents still standing (the same number as the top row and the "All" chip); the cancelled ones have their own chip
  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, inPeriod[k].filter((d) => d.status !== "Cancelled").length])), [inPeriod]);

  const searched = useMemo(() => searchDocs(list, tab, query), [list, tab, query]);
  const chips = CHIPS[tab];
  const chosen = chips.find((c) => c.value === chip) || chips[0];
  const shown = useMemo(() => searched.filter(chosen.test), [searched, chosen]);
  const [capped, more] = usePhoneRows(shown);
  const summary = useMemo(() => summarise(list, tab), [list, tab, ratesVersion]);     // eslint-disable-line react-hooks/exhaustive-deps
  const outOfOrder = useMemo(() => outOfOrderSeries({ tab, allOfKind, fiscalYear: fy }), [tab, allOfKind, fy]);
  const shownTotal = shown.reduce((s, d) => s + toNPR(d.totalNPR, d.currency), 0);
  const shownDue = tab === "invoice" ? shown.filter((d) => d.status !== "Cancelled").reduce((s, d) => s + creditDue(d), 0) : 0;
  const figures = FIGURES[tab];

  const cardDoc = card?.id ? allOfKind.find((d) => d.id === card.id) || null : null;
  const payDoc = payId ? data.invoices.find((d) => d.id === payId) || null : null;
  useEffect(() => { if (card?.id && data.status === "ready" && !cardDoc) setCard(null); }, [card, cardDoc, data.status]);

  const switchTab = (k) => { setTab(k); setCard(null); setPayId(null); setChip("all"); };

  // Arriving from a Finance-ledger click: jump straight into that invoice instead of landing on the list and making her find it
  const autoDone = useRef(false);
  useEffect(() => {
    if (autoDone.current || !location.state?.autoEdit || byKind.invoice.length === 0) return;
    autoDone.current = true;
    const q = (location.state.search || "").toLowerCase();
    const match = byKind.invoice.find((r) => (r.invoiceNumber || "").toLowerCase() === q) || byKind.invoice.find((r) => (r.clientName || "").toLowerCase() === q);
    if (match) { setTab("invoice"); setCard({ id: match.id }); }
  }, [byKind.invoice, location.state]);

  useShiftN(canEdit ? () => setCard({ id: null }) : null);

  /* ── What can be done to a saved document without editing it ───────── */
  const api = useMemo(() => ({
    reload: data.reload, notify, ask, addCustomer: data.addCustomer,
    view: (doc) => openPreview(doc, tab),
    pay: (doc) => setPayId(doc.id),
    async setStatus(doc, status) {
      const res = await setDocStatus({ tab, id: doc.id, status });
      if (!res.ok) { notify(res.message); return; }
      await data.reload();
      setCard(null);
    },
    async convert(qt) {
      const qtCurrency = qt.currency || "NPR";
      const yes = await ask({
        title: "Make a VAT invoice?", confirmLabel: "Make the invoice",
        body: <p>{qtCurrency !== "NPR" ? `Convert ${qt.quotationNumber} to a VAT invoice? The invoice will stay in ${qtCurrency}, with the same rates.` : `Convert ${qt.quotationNumber} to a VAT invoice?`}</p>,
      });
      if (!yes) return;
      const res = await convertToInvoice({ qt, profile });
      if (!res.ok) { notify(res.message); return; }
      await data.reload();
      setCard(null);
      setTab("invoice");
      setChip("all");
      notify(`Created ${res.number} from ${qt.quotationNumber}.`, "good");
    },
    async cancel(doc, unsaved) {
      const yes = await ask({
        title: `Cancel this ${words.one.replace(/^VAT /, "")}?`, confirmLabel: "Cancel it", danger: true,
        body: <p>The record is kept, marked Cancelled.{unsaved ? " What you changed in the card and have not saved is lost." : ""}</p>,
      });
      if (!yes) return;
      const res = await cancelDoc({ tab, id: doc.id });
      if (!res.ok) { notify(res.message); return; }
      await data.reload();
      setCard(null);
    },
  }), [data.reload, data.addCustomer, notify, ask, openPreview, tab, profile, words]);          // eslint-disable-line react-hooks/exhaustive-deps

  async function renumber() {
    const res = await renumberSeries({ tab, groups: outOfOrder });
    if (res.ok) await data.reload();
    return res;
  }

  /* ── The table ────────────────────────────────────────────────────── */
  const invoice = tab === "invoice";
  const columns = useMemo(() => {
    const dueText = (r) => (r.status === "Cancelled" ? "" : creditDue(r) > 0.005 ? `Credit due ${money(creditDue(r))}` : "");
    const quick = (r) => {
      if (!canEdit || r.status === "Cancelled") return null;
      if (tab === "invoice" && hasPayments(r)) {
        return <button type="button" className="dt-act dt-mini" onClick={() => setPayId(r.id)}>{creditDue(r) > 0.005 ? ((r.amountPaid || 0) > 0 ? "Add payment" : "Record payment") : "Payments"}</button>;
      }
      if (tab === "challan" && r.status !== "Delivered") return <button type="button" className="dt-act dt-mini" onClick={() => api.setStatus(r, "Delivered")}>Delivered</button>;
      if (tab === "quotation") {
        return (
          <>
            {!["Accepted", "Rejected"].includes(r.status) && <button type="button" className="dt-act dt-mini" onClick={() => api.setStatus(r, "Accepted")}>Accept</button>}
            {!r.relatedInvoice && r.status !== "Rejected" && <button type="button" className="dt-act dt-mini" onClick={() => api.convert(r)}>→ Invoice</button>}
          </>
        );
      }
      return null;
    };
    return [
      { id: "no", label: `${meta.label} #`, width: 108, drop: 5, first: "desc", sort: (r) => numberOf(tab, r), render: (r) => <span className="fn-id"><b>{numberOf(tab, r) || "—"}</b></span> },
      { id: "date", label: "Date", width: 116, drop: 4, first: "desc", sort: (r) => r.date || "", render: (r) => <span className="dt-num">{show(r.date)}</span> },
      {
        // a narrow table has no room for the number, the date, the status or the credit due: they go under the client
        id: "client", label: "Client", grow: true, min: 160, max: 520, sort: (r) => (r.clientName || "").toLowerCase(),
        render: (r, { dropped }) => (
          <NameCell
            main={(r.clientName || "").trim() || "—"} rest={r.clientPAN ? `PAN ${r.clientPAN}` : ""}
            extra={[dropped.has("no") && numberOf(tab, r), dropped.has("date") && show(r.date), dropped.has("status") && r.status, invoice && dropped.has("due") && dueText(r)]}
          />
        ),
      },
      ...(tab === "quotation"
        ? [{ id: "rel", label: "Valid until", width: 116, drop: 8, sort: (r) => r.validUntil || "", render: (r) => <span className="dt-num dt-dim">{r.validUntil ? show(r.validUntil) : "—"}</span> }]
        : [{ id: "rel", label: "Related", width: 136, drop: 8, render: (r) => <span className="dt-clip dt-dim">{relatedText(tab, r) || "—"}</span> }]),
      { id: "sub", label: "Subtotal", width: 116, align: "end", drop: 9, sort: (r) => toNPR(r.subtotalNPR, r.currency), render: (r) => <span className="dt-num">{money(toNPR(r.subtotalNPR, r.currency))}</span> },
      ...(invoice ? [{
        id: "disc", label: "Disc.", width: 84, align: "end", drop: 10,
        render: (r) => (r.discountMode === "amount"
          ? (r.discountAmtNPR > 0 ? <span className="dt-num dt-bad">{money(toNPR(r.discountAmtNPR, r.currency))}</span> : <span className="dt-dim">—</span>)
          : (r.discountPct > 0 ? <span className="dt-num dt-bad">{r.discountPct}%</span> : <span className="dt-dim">—</span>)),
      }, { id: "vat", label: "VAT 13%", width: 108, align: "end", drop: 7, sort: (r) => toNPR(r.vatAmountNPR, r.currency), render: (r) => <span className="dt-num">{money(toNPR(r.vatAmountNPR, r.currency))}</span> }] : []),
      { id: "total", label: "Total", width: 124, align: "end", first: "desc", sort: (r) => toNPR(r.totalNPR, r.currency), render: (r) => <span className="dt-num dt-strong">{money(toNPR(r.totalNPR, r.currency))}</span> },
      ...(invoice ? [{
        id: "due", label: "Credit due", width: 116, align: "end", drop: 2, first: "desc", sort: (r) => (r.status === "Cancelled" ? -1 : creditDue(r)),
        render: (r) => (r.status === "Cancelled" ? <span className="dt-dim">—</span> : creditDue(r) > 0.005 ? <span className="dt-num dt-bad dt-strong">{money(creditDue(r))}</span> : <span className="dt-good">Settled</span>),
      }] : []),
      { id: "status", label: "Status", width: 100, drop: 3, sort: (r) => r.status || "", render: (r) => <Chip tone={statusTone(r.status)}>{r.status}</Chip> },
      {
        id: "acts", label: <span className="fn-sr">Actions</span>, width: 214, align: "end", drop: 6,
        render: (r) => (
          <span className="bl-acts">
            <button type="button" className="dt-act dt-mini" onClick={() => openPreview(r, tab)}><Icons.File size={13} sw={1.9} aria-hidden="true" /> View</button>
            {quick(r)}
          </span>
        ),
      },
    ];
  }, [tab, invoice, meta, money, show, canEdit, api, openPreview]);

  const empty = fyActive && byKind[tab].length > 0
    ? `No ${words.many} in FY ${fy} (${byKind[tab].length} in other years).`
    : `No ${words.many} yet.`;

  return (
    <BentoPage className="fn-page bl-page">
      <header className="kb-head">
        <div className="kb-head-l">
          <h1>Billing</h1>
          <p className="kb-head-sub"><span>{describePeriod({ fy, range: dateRange, mode: dateMode })}</span></p>
        </div>
        <div className="kb-head-r fn-head-r">
          <button type="button" className="kb-pillbtn" onClick={() => navigate("/finance")}>
            <Icons.ChevronLeft size={14} sw={2} aria-hidden="true" /> Finance
          </button>
          <RegionSwitch untagged={countUntagged(allOfKind)} size="sm" />
          <DateModeSwitch />
          <PeriodBar years={yearsHere} />
        </div>
      </header>

      {notice && (
        <div className={`fn-banner fn-banner--${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}>
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><Icons.X size={14} sw={2} aria-hidden="true" /></button>
        </div>
      )}
      {data.status === "ready" && data.failed.length > 0 && (
        <div className="fn-banner" role="status">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>Could not load {data.failed.map((c) => (c === "inventory" ? "stock items" : c)).join(", ")}, so some figures may be missing or out of date.</span>
        </div>
      )}

      {data.status === "error" ? (
        <div className="kb-error" role="alert">
          <p>Billing could not load. Check your connection and try again.</p>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={data.reload}>Try again</button>
        </div>
      ) : (
        <BentoGrid layout={invoice ? "billing" : "billing3"}>
          <div className="bl-tabs" style={{ gridArea: "tabs" }} data-tour="billing-tabs">
            <DocTabs value={tab} onChange={switchTab} counts={counts} />
          </div>

          <Tile area="t1" icon={<Icons.Billing {...ico} />} title={figures.total} loading={loading} className="fn-t">
            <Figure><Money npr={summary.total} compact={Math.abs(summary.total) >= 1e7} /></Figure>
            <Sub><b>{summary.count}</b> {plural(summary.count, words.one, words.many)}</Sub>
          </Tile>
          <Tile area="t2" icon={<Icons.Check {...ico} />} title={figures.paid} loading={loading} className="fn-t">
            <Figure><Money npr={summary.paid} compact={Math.abs(summary.paid) >= 1e7} /></Figure>
            <Sub>{invoice ? "money received" : tab === "challan" ? "on the challans delivered" : "on the quotations accepted"}</Sub>
          </Tile>
          <Tile area="t3" tone={summary.pending > 0 ? "amber" : "default"} icon={<Icons.Alert {...ico} />} title={figures.pending} loading={loading} className="fn-t">
            <Figure><Money npr={summary.pending} compact={Math.abs(summary.pending) >= 1e7} /></Figure>
            <Sub>{invoice ? "still to collect" : tab === "challan" ? "on challans not delivered" : "waiting for an answer"}</Sub>
          </Tile>
          {invoice && (
            <Tile area="t4" icon={<Icons.File {...ico} />} title="VAT collected" loading={loading} className="fn-t">
              <Figure><Money npr={summary.vatCollected} compact={Math.abs(summary.vatCollected) >= 1e7} /></Figure>
              <Sub>13% in the invoices paid</Sub>
            </Tile>
          )}

          <FinPane
            title={words.pane} note={query || chosen.value !== "all" ? `${shown.length} of ${searched.length}` : `${shown.length} ${plural(shown.length, words.one, words.many)}`}
            id="fin-pane" labelledBy={`bl-tab-${tab}`} tour="billing-list"
            tools={(
              <>
                <SearchBox value={query} onChange={setQuery} placeholder={`Search ${words.many}`} label={`Search ${words.many} by client, number or status`} />
                <FilterChips
                  label={`Which ${words.many}`} value={chosen.value} onChange={setChip}
                  options={chips.map((c) => ({ value: c.value, label: c.label, count: searched.filter(c.test).length, tone: c.tone && searched.filter(c.test).length > 0 ? c.tone : undefined }))}
                />
              </>
            )}
            actions={(
              <>
                <ExportButton name={`${words.many.replace(/\s+/g, "-")}`} columns={csvColumns(tab)} rows={shown} />
                {canEdit && (
                  <button type="button" className="kb-btn kb-btn--primary" data-tour="new-doc" onClick={() => setCard({ id: null })} title="Shift + N">
                    <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> New {words.one}
                  </button>
                )}
              </>
            )}
            foot={(
              <Foot>
                <FootSum count label={plural(shown.length, words.one, words.many)} value={shown.length} />
                <FootSum label="Total" value={money(shownTotal)} />
                {invoice && shownDue > 0.005 && <FootSum label="Credit due" value={money(shownDue)} tone="bad" />}
              </Foot>
            )}
          >
            {!canEdit && <p className="fn-viewonly">View only. You do not have permission to raise or change documents.</p>}
            {canEdit && outOfOrder.length > 0 && (
              <div className="fn-note">
                <Icons.Alert size={15} sw={1.9} aria-hidden="true" />
                <span>
                  <b>{outOfOrder.reduce((n, g) => n + g.changes.length, 0)}</b> {words.one.replace(/^VAT /, "")} {plural(outOfOrder.reduce((n, g) => n + g.changes.length, 0), "number is", "numbers are")} out of date order
                  {" "}({outOfOrder.length === 1 && tab !== "quotation" ? `FY ${outOfOrder[0].key}` : tab === "quotation" ? "all years" : `${outOfOrder.length} fiscal years`}).
                </span>
                <button type="button" onClick={() => setRenumbering(true)}>Renumber by date</button>
              </div>
            )}
            <DataTable
              className="fn-dense fn-book" label={words.pane} rows={capped} rowKey={(r) => r.id} columns={columns}
              defaultSort={{ id: "date", dir: "desc" }} onOpen={(r) => setCard({ id: r.id })} activeKey={card?.id || undefined}
              rowLabel={(r) => `Open ${numberOf(tab, r) || words.one} for ${(r.clientName || "").trim() || "no client"}, ${money(toNPR(r.totalNPR, r.currency))}`}
              loading={loading}
              empty={<EmptyNote icon={<Icons.Billing size={22} sw={1.5} />}>{list.length === 0 ? empty : "Nothing matches that."}</EmptyNote>}
            />
            {more}
          </FinPane>
        </BentoGrid>
      )}

      {card && (!card.id || cardDoc) && (
        <DocCard
          key={`${tab}:${card.id || "new"}`} tab={tab} doc={cardDoc} allOfKind={allOfKind} customers={customers} inventoryItems={inventoryItems}
          canEdit={canEdit} canAddCustomers={canAddCustomers} profile={profile} region={region} api={api} onClose={() => setCard(null)}
        />
      )}
      {payDoc && (
        <PaymentCard
          key={payDoc.id} info={payInfo(payDoc)} canEdit={canEdit} profile={profile} api={api}
          onClose={() => setPayId(null)} onSaved={() => { setPayId(null); setCard(null); }}
        />
      )}
      {renumbering && (
        <ConfirmRenumber changes={outOfOrder.flatMap((g) => g.changes)} words={words} onCancel={() => setRenumbering(false)} onConfirm={renumber} />
      )}
      {asking}
      {preview && <DocPreview data={preview.data} docType={preview.docType} onClose={closePreview} />}
    </BentoPage>
  );
}

/** "Renumber by date?": which numbers would change, before anything does. */
function ConfirmRenumber({ changes, words, onCancel, onConfirm }) {
  return (
    <ConfirmDialog
      title="Renumber by date?" confirmLabel="Renumber" busyLabel="Renumbering…" onCancel={onCancel} onConfirm={onConfirm}
    >
      <p>This renumbers {changes.length} existing {words.many} so the numbers keep following the dates:</p>
      <ul className="fn-changes">
        {changes.slice(0, 8).map((c) => <li key={c.id}><span>{c.from || "—"}</span> <i aria-hidden="true">→</i> <b>{c.to}</b></li>)}
      </ul>
      {changes.length > 8 && <p className="ec-note">…and {changes.length - 8} more.</p>}
      <p>Copies already printed or sent will still show the old numbers.</p>
    </ConfirmDialog>
  );
}
