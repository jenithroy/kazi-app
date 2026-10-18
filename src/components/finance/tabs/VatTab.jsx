/**
 * VAT bills: the bills that are filed, and (the half that is worked down) the purchases that say they have a VAT bill and have none.
 *
 * "Needs a bill" lists those purchases with an Attach button on each, so the whole list can be gone through without hunting for
 * the purchase in a menu. A filed bill opens in a card (a picture of it, who uploaded it, Delete).
 */
import { useEffect, useMemo, useState } from "react";
import DataTable from "../../table/DataTable";
import { FilterChips, SearchBox } from "../../table/Bar";
import { EmptyNote } from "../../bento/Bento";
import { Icons } from "../../ui";
import FinPane from "../FinPane";
import { VatBillCard, VatUploadCard } from "../cards/VatCards";
import { useFin, emptyWords } from "../FinanceContext";
import { Amt, ExportButton, Foot, FootSum, NameCell, plural, useMoney, usePhoneRows } from "../parts";
import { kathmanduDate, tsDate, tsMillis } from "../../../utils/date";

const has = (hay, q) => String(hay || "").toLowerCase().includes(q);

export default function VatTab() {
  const f = useFin();
  const { vatBills, regionVatBills, regionPurchases, purchases, canEditTab, show, loading, newRef, fyActive, fy } = f;
  const canEdit = canEditTab("vat bills");
  const money = useMoney();
  const [view, setView] = useState("bills");                 // bills | needs
  const [query, setQuery] = useState("");
  const [bill, setBill] = useState(null);                    // a filed bill's id
  const [upload, setUpload] = useState(null);                // null, or { purchase } (purchase null = choose one)

  useEffect(() => {
    newRef.current = canEdit ? () => setUpload({ purchase: null }) : null;
    return () => { newRef.current = null; };
  }, [newRef, canEdit]);

  const filedFor = useMemo(() => new Set(regionVatBills.map((b) => b.purchaseId).filter(Boolean)), [regionVatBills]);
  const needs = useMemo(
    () => purchases.filter((p) => p.vatBill === true && !filedFor.has(p.id)).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.expenseId || "").localeCompare(a.expenseId || "")),
    [purchases, filedFor],
  );
  const q = query.trim().toLowerCase();
  const billRows = useMemo(
    () => vatBills.filter((b) => !q || has(b.expenseId, q) || has(b.expenseItem, q) || has(b.fileName, q) || has(b.uploadedBy, q)),
    [vatBills, q],
  );
  const needRows = useMemo(() => needs.filter((p) => !q || has(p.expenseId, q) || has(p.expenseItem, q) || has(p.category, q)), [needs, q]);

  const openBill = bill ? regionVatBills.find((b) => b.id === bill) || null : null;
  useEffect(() => { if (bill && !loading && !openBill) setBill(null); }, [bill, loading, openBill]);
  const purchaseOf = (b) => (b.purchaseId ? regionPurchases.find((p) => p.id === b.purchaseId) : null);

  const billColumns = useMemo(() => [
    { id: "no", label: "Number", width: 104, drop: 3, sort: (b) => b.expenseId || "", render: (b) => <span className="fn-id"><b>{b.expenseId || "—"}</b></span> },
    {
      id: "item", label: "For", grow: true, min: 160, max: 480, sort: (b) => (b.expenseItem || "").trim().toLowerCase(),
      render: (b, { dropped }) => <NameCell main={(b.expenseItem || "").trim() || "—"} rest={b.fileName} extra={[dropped.has("no") && b.expenseId]} />,
    },
    { id: "by", label: "Uploaded by", width: 140, drop: 5, sort: (b) => (b.uploadedBy || "").trim().toLowerCase(), render: (b) => <span className="dt-clip dt-dim">{(b.uploadedBy || "").trim() || "—"}</span> },
    {
      id: "on", label: "Uploaded", width: 116, drop: 4, first: "desc", sort: (b) => tsMillis(b.uploadedAt),
      render: (b) => { const d = tsDate(b.uploadedAt); return <span className="dt-num">{d ? show(kathmanduDate(d)) : "—"}</span>; },
    },
    {
      id: "file", label: "Bill", width: 96, align: "end",
      render: (b) => <a className="dt-act fn-link" href={b.fileUrl} target="_blank" rel="noopener noreferrer">View ↗</a>,
    },
  ], [show]);

  const needColumns = useMemo(() => [
    { id: "no", label: "Number", width: 112, drop: 4, sort: (p) => `${p.fiscalYear || ""}${p.expenseId || ""}`, render: (p) => <span className="fn-id"><b>{p.expenseId || "—"}</b>{p.fiscalYear ? <i>{p.fiscalYear.slice(2)}</i> : null}</span> },
    { id: "date", label: "Date", width: 116, drop: 3, first: "desc", sort: (p) => p.date || "", render: (p) => <span className="dt-num">{show(p.date)}</span> },
    {
      id: "party", label: "Bought from", grow: true, min: 160, max: 480, sort: (p) => (p.expenseItem || "").trim().toLowerCase(),
      render: (p, { dropped }) => (
        <NameCell main={(p.expenseItem || "").trim() || "—"} rest={p.category} extra={[dropped.has("no") && p.expenseId, dropped.has("date") && show(p.date), dropped.has("amt") && money(Number(p.amountNPR) || 0)]} />
      ),
    },
    { id: "amt", label: "Amount", width: 124, drop: 2, align: "end", first: "desc", sort: (p) => Number(p.amountNPR) || 0, render: (p) => <Amt n={p.amountNPR} strong /> },
    {
      id: "attach", label: <span className="fn-sr">Attach a bill</span>, width: 110, align: "end",
      render: (p) => canEdit
        ? <button type="button" className="dt-act dt-mini" onClick={() => setUpload({ purchase: p })}><Icons.Paperclip size={13} sw={1.9} aria-hidden="true" /> Attach</button>
        : null,
    },
  ], [show, canEdit, money]);

  const csvBills = useMemo(() => [
    { label: "Number", value: (b) => b.expenseId }, { label: "For", value: (b) => (b.expenseItem || "").trim() }, { label: "File", value: (b) => b.fileName },
    { label: "Uploaded by", value: (b) => (b.uploadedBy || "").trim() }, { label: "Uploaded on", value: (b) => (tsDate(b.uploadedAt) ? kathmanduDate(tsDate(b.uploadedAt)) : "") },
  ], []);
  const csvNeeds = useMemo(() => [
    { label: "Number", value: (p) => p.expenseId }, { label: "Fiscal year", value: (p) => p.fiscalYear }, { label: "Date", value: (p) => p.date },
    { label: "Bought from", value: (p) => (p.expenseItem || "").trim() }, { label: "Amount NPR", value: (p) => p.amountNPR },
  ], []);

  const onBills = view === "bills";
  const [billsCapped, billsMore] = usePhoneRows(billRows);
  const [needsCapped, needsMore] = usePhoneRows(needRows);
  const shownCount = onBills ? billRows.length : needRows.length;
  const empty = onBills
    ? emptyWords({ fyActive, fy, noun: "VAT bills", regionCount: regionVatBills.length, fallback: "No VAT bills uploaded yet." })
    : "Every purchase marked as having a VAT bill has one filed.";

  return (
    <>
      <FinPane
        title="VAT bills" note={`${vatBills.length} filed · ${needs.length} to file`} id="fin-pane" labelledBy="fin-tab-vat-bills"
        tools={(
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Search bills" label="Search VAT bills" />
            <FilterChips
              label="Which VAT bills" value={view} onChange={setView}
              options={[
                { value: "bills", label: "Filed", count: vatBills.length },
                { value: "needs", label: "Needs a bill", count: needs.length, tone: needs.length > 0 ? "warn" : undefined },
              ]}
            />
          </>
        )}
        actions={(
          <>
            <ExportButton name={onBills ? "vat-bills" : "vat-bills-needed"} columns={onBills ? csvBills : csvNeeds} rows={onBills ? billRows : needRows} />
            {canEdit && (
              <button type="button" className="kb-btn kb-btn--primary" onClick={() => setUpload({ purchase: null })} title="Shift + N">
                <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> Upload a bill
              </button>
            )}
          </>
        )}
        foot={(
          <Foot>
            <FootSum count label={onBills ? plural(shownCount, "bill") : plural(shownCount, "purchase")} value={shownCount} />
            {!onBills && <FootSum label="Total" value={money(needRows.reduce((sum, p) => sum + Number(p.amountNPR || 0), 0))} />}
          </Foot>
        )}
      >
        {!canEdit && <p className="fn-viewonly">View only. Only staff with edit rights can upload or delete VAT bills.</p>}
        {fyActive && onBills && <p className="fn-viewonly">A bill is filed under the date of the purchase or expense it is for.</p>}
        {onBills ? (
          <DataTable
            className="fn-dense" label="VAT bills" rows={billsCapped} rowKey={(b) => b.id} columns={billColumns}
            defaultSort={{ id: "on", dir: "desc" }} onOpen={(b) => setBill(b.id)} rowLabel={(b) => `Open the bill for ${b.expenseId || "a purchase"}`}
            activeKey={bill || undefined} loading={loading}
            empty={<EmptyNote icon={<Icons.File size={22} sw={1.5} />}>{vatBills.length === 0 ? empty : "Nothing matches that."}</EmptyNote>}
          />
        ) : (
          <DataTable
            className="fn-dense" label="Purchases that need a VAT bill" rows={needsCapped} rowKey={(p) => p.id} columns={needColumns}
            defaultSort={{ id: "date", dir: "desc" }} loading={loading}
            empty={<EmptyNote icon={<Icons.Check size={22} sw={1.7} />}>{needs.length === 0 ? empty : "Nothing matches that."}</EmptyNote>}
          />
        )}
        {onBills ? billsMore : needsMore}
      </FinPane>

      {openBill && <VatBillCard key={openBill.id} bill={openBill} purchase={purchaseOf(openBill)} onClose={() => setBill(null)} />}
      {upload && <VatUploadCard key={upload.purchase?.id || "new"} purchase={upload.purchase} onClose={() => setUpload(null)} />}
    </>
  );
}
