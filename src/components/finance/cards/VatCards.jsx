/**
 * The two cards of the VAT bills section: uploading a bill against a purchase, and looking at a bill that is filed (with Delete).
 *
 * Upload: choose the purchase (the ones still needing a bill come first, and it can be searched by number, supplier or amount),
 * choose the file, and it is filed. Looking: what the bill is for, who uploaded it and when, the picture if it is one.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import EditCard, { Field, KV, Tag } from "../../EditCard";
import Select from "../../Select";
import FileDrop from "../FileDrop";
import { useFin } from "../FinanceContext";
import { useMoney } from "../parts";
import { removeVatBill, uploadVatBill } from "../../../lib/financeWrites";
import ShareButton from "../../share/ShareButton";
import { kathmanduDate, tsDate } from "../../../utils/date";
import { focusFirst } from "../flow";

const optionOf = (p, money) => ({
  value: p.id,
  label: `${p.expenseId} · ${p.fiscalYear ? `FY ${p.fiscalYear} · ` : ""}${(p.expenseItem || "").trim() || "no supplier"}`,
  hint: money(Number(p.amountNPR) || 0),
});

export function VatUploadCard({ purchase: given, onClose }) {
  const { profile, region, regionPurchases, regionVatBills, canEditTab, reload } = useFin();
  const money = useMoney();
  const uid = useId();
  const root = useRef(null);
  const editable = canEditTab("vat bills");
  const [pick, setPick] = useState(given?.id || "");
  const [file, setFile] = useState(null);

  useEffect(() => { focusFirst(root.current?.closest("form")); }, []);

  // those that still need a bill first, then the rest, newest first
  const options = useMemo(() => {
    const has = new Set(regionVatBills.map((b) => b.purchaseId).filter(Boolean));
    const rank = (p) => (p.vatBill === true && !has.has(p.id) ? 0 : 1);
    return [...regionPurchases]
      .sort((a, b) => rank(a) - rank(b) || (b.date || "").localeCompare(a.date || "") || (b.expenseId || "").localeCompare(a.expenseId || ""))
      .map((p) => optionOf(p, money));
  }, [regionPurchases, regionVatBills, money]);
  const purchase = regionPurchases.find((p) => p.id === pick) || null;

  async function save() {
    if (!purchase) return { ok: false, message: "Choose the purchase this bill is for." };
    if (!file) return { ok: false, message: "Choose the bill's file." };
    const res = await uploadVatBill({ purchase, file, profile, region });
    if (!res.ok) return res;
    await reload();
    return { ok: true };
  }

  const main = (
    <div className="fn-flow" ref={root}>
      <Field label="Purchase" htmlFor={`${uid}-p`} wide hint="Purchases that are marked as having a VAT bill and have none filed come first.">
        <Select id={`${uid}-p`} label="Purchase" value={pick} onChange={setPick} options={options} placeholder="Choose the purchase" disabled={!editable} searchPlaceholder="Search by number, supplier or amount" />
      </Field>
      <div className="ec-f ec-wide">
        <span className="ec-lbl">Bill</span>
        <FileDrop file={file} onFile={setFile} disabled={!editable} label="Choose the bill" />
      </div>
    </div>
  );

  const side = (
    <div className="fn-flow">
      {purchase ? (
        <>
          <div className="ec-block ec-wide"><span className="ec-cap">Amount</span><div className="ec-fig">{money(Number(purchase.amountNPR) || 0)}</div></div>
          <KV rows={[
            ["Number", purchase.expenseId],
            ["Supplier", (purchase.expenseItem || "").trim() || "—"],
            ["Date", purchase.date || "—"],
            ["VAT", purchase.vatBill === true ? <Tag key="v" tone="good">13%</Tag> : purchase.vatBill === false ? "No VAT" : "N/A"],
          ]} />
        </>
      ) : <p className="ec-note ec-wide">Choose a purchase to see what it is.</p>}
    </div>
  );

  return (
    <EditCard
      title="Upload a VAT bill" subtitle="File the bill against the purchase it is for"
      main={main} side={side} canEdit={editable} creating dirty={Boolean(file) || (pick !== (given?.id || ""))}
      onClose={onClose} onSave={save} submitLabel="Upload"
    />
  );
}

/** A filed bill: what it is for and a way to open it. With edit rights it can be deleted. */
export function VatBillCard({ bill, purchase, onClose }) {
  const { canEditTab, reload, show } = useFin();
  const money = useMoney();
  const editable = canEditTab("vat bills");
  const when = tsDate(bill.uploadedAt);
  const isImage = String(bill.fileType || "").startsWith("image/");

  const main = (
    <div className="fn-flow">
      <div className="ec-wide fn-bill">
        {isImage ? (
          <a href={bill.fileUrl} target="_blank" rel="noopener noreferrer" className="fn-bill-img" aria-label={`Open ${bill.fileName}`}>
            <img src={bill.fileUrl} alt={`The bill ${bill.fileName}`} />
          </a>
        ) : (
          <p className="ec-note">This bill is a file, not a picture.</p>
        )}
        <a className="fn-link" href={bill.fileUrl} target="_blank" rel="noopener noreferrer">Open {bill.fileName || "the bill"} ↗</a>
      </div>
    </div>
  );

  const side = (
    <div className="fn-flow">
      {purchase && <div className="ec-block ec-wide"><span className="ec-cap">Purchase</span><div className="ec-fig">{money(Number(purchase.amountNPR) || 0)}</div></div>}
      <KV rows={[
        ["Number", bill.expenseId || "—"],
        ["For", (bill.expenseItem || "").trim() || "—"],
        ["Uploaded by", (bill.uploadedBy || "").trim() || "—"],
        ["Uploaded on", when ? show(kathmanduDate(when)) : "—"],
      ]} />
    </div>
  );

  return (
    <EditCard
      title={`${bill.expenseId || "VAT bill"}`} subtitle={(bill.expenseItem || "").trim() || bill.fileName}
      main={main} side={side} canEdit={editable} onClose={onClose} closeLabel="Close"
      footerExtra={<ShareButton type="vat_bill" record={bill} title="Send this bill to someone in Chat" />}
      onDelete={async () => { const r = await removeVatBill(bill); if (r.ok) await reload(); return r; }}
      deleteName={bill.fileName || "this bill"} deleteNote="The file is removed too. This can't be undone."
    />
  );
}
