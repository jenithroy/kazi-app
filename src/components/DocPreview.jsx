/**
 * DocPreview: a Billing document (a VAT invoice, a challan or a quotation) as the A4 sheet it prints on, in the document viewer.
 *
 * The viewer around it is components/viewer/DocViewer.jsx (the glass dialog, zoom, Print and Download PDF buttons). Everything on the
 * sheet is a legal record and is exactly what it was: the markup below, the print window's page and the PDF (InvoicePDF.jsx) are not
 * the viewer's, so none of them changes with how the viewer looks. The sheet is only ever scaled, by the viewer, on a wrapper outside
 * `printRef`, so what the print window copies (`outerHTML`) is the sheet as drawn here.
 */
import { useLayoutEffect, useRef, useState } from "react";
import DocViewer from "./viewer/DocViewer";
import ShareButton from "./share/ShareButton";
import { fmtCurrency, fmtCurrencyExact, fmtDate, fmtDateBSLabel, numWords, COMPANY_PAN, COMPANY_NAME, formatDescription } from "../utils/billing.jsx";
import { roundAmount } from "../utils/format";
import { statusTone } from "../lib/billing";

const TITLES = {
  invoice:   "Tax Invoice",
  challan:   "Challan / Delivery Note",
  quotation: "Quotation",
};

export default function DocPreview({ data, docType, onClose }) {
  const printRef   = useRef(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState(null);           // { tone, text }: what the last Download PDF or Print had to say
  const [tooLong, setTooLong] = useState(false);        // the sheet's content runs past its bottom edge
  const docNum = data.invoiceNumber || data.challanNumber || data.quotationNumber || "—";
  const title  = TITLES[docType] || "Document";

  /* ── Pre-fetch image → base64 data URL (react-pdf needs this to embed images) ── */
  async function fetchAsDataURL(url) {
    const res  = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror  = reject;
      reader.readAsDataURL(blob);
    });
  }

  /* ── Vector PDF download via @react-pdf/renderer ── */
  async function handleDownloadPDF() {
    setGenerating(true);
    setNotice(null);
    try {
      // Convert letterhead to base64 so react-pdf can embed it reliably. The PDF maker itself is about 2.6 MB of code, so it
      // is fetched here, alongside the letterhead, the first time Download PDF is pressed, and not with every page.
      const [letterheadData, { pdf }, { InvoicePDFDoc }] = await Promise.all([
        fetchAsDataURL(`${window.location.origin}/letterhead.jpg`),
        import("@react-pdf/renderer"),
        import("./InvoicePDF"),
      ]);

      const blob = await pdf(
        <InvoicePDFDoc data={data} docType={docType} letterheadUrl={letterheadData} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href    = url;
      a.download = `${docNum}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);      // not at once: a browser that has not started reading the file would lose it
      setNotice({ tone: "good", text: `${docNum}.pdf is ready. Look in your downloads.` });
    } catch (err) {
      console.error("PDF generation failed:", err);
      setNotice({ tone: "bad", text: "The PDF could not be made. Press Print and choose Save as PDF instead." });
    } finally {
      setGenerating(false);
    }
  }

  function openPrintWindow() {
    const pageEl = printRef.current;
    if (!pageEl) return;
    const printWin = window.open("", "_blank", "width=800,height=1130");
    if (!printWin) { setNotice({ tone: "bad", text: "Your browser blocked the print window. Allow pop-ups for this site, then press Print again." }); return; }
    setNotice(null);
    const letterheadUrl = new URL("/letterhead.jpg", window.location.origin).href;
    printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} — ${docNum}</title><style>
@page { margin: 0; size: A4 portrait; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; }
.invoice-page { width: 210mm; min-height: 297mm; position: relative; background-image: url('${letterheadUrl}'); background-size: 100% 100%; background-repeat: no-repeat; }
</style></head><body>${pageEl.outerHTML}</body></html>`);
    printWin.document.close();
    // Whichever of the two comes first prints; the other (the fallback for a window that never fires onload) must not print a second time.
    let printed = false;
    const printOnce = () => { if (printed) return; printed = true; printWin.focus(); printWin.print(); };
    printWin.onload = () => { setTimeout(printOnce, 400); };
    setTimeout(printOnce, 1200);
  }

  /* ── Computed values ── */
  const currency    = data.currency || "NPR";
  const items       = (data.items || []).filter(it => it.description || Number(it.rate) > 0);
  const subtotal    = data.subtotalNPR    || 0;
  const discountAmt = data.discountAmtNPR || 0;
  const discountPct = data.discountPct    || 0;
  const discountLabel = data.discountMode === "amount" ? "Discount" : `Discount (${discountPct}%)`;
  const taxableAmt  = data.taxableAmtNPR  != null ? data.taxableAmtNPR : subtotal - discountAmt;
  const vatAmt      = data.vatAmountNPR   || 0;
  const total       = data.totalNPR       || 0;
  const amountPaid  = data.amountPaid     || 0;
  const creditDue   = Math.max(0, total - amountPaid);
  const showVAT     = docType === "invoice" && data.applyVAT;
  const showDiscount = discountAmt > 0;
  const wordsTotal  = total > 0 ? numWords(roundAmount(total), currency) : "—";

  /* ── Meta rows (right column) ── */
  const metaRows = [];
  metaRows.push([`${title.split(" ")[0]} No.`, docNum]);
  if (data.fiscalYear) metaRows.push(["Fiscal Year (B.S.)", data.fiscalYear]);
  if (docType === "invoice") {
    if (data.relatedChallan)   metaRows.push(["Challan Ref",   data.relatedChallan]);
    if (data.relatedQuotation) metaRows.push(["Quotation Ref", data.relatedQuotation]);
    metaRows.push(["Invoice Date",   fmtDate(data.date), fmtDateBSLabel(data.date)]);
    metaRows.push(["Due Date",       fmtDate(data.dueDate), fmtDateBSLabel(data.dueDate)]);
    metaRows.push(["Payment Terms",  data.paymentTerms || "Net 30"]);
    metaRows.push(["Supplier PAN",   COMPANY_PAN]);          // IRD requirement
  } else if (docType === "challan") {
    if (data.relatedInvoice)   metaRows.push(["Invoice Ref",   data.relatedInvoice]);
    if (data.relatedQuotation) metaRows.push(["Quotation Ref", data.relatedQuotation]);
    metaRows.push(["Date", fmtDate(data.date), fmtDateBSLabel(data.date)]);
    // New structured transport fields (fall back to legacy transportDetails)
    if (data.vehicleNo)   metaRows.push(["Vehicle No.",  data.vehicleNo]);
    if (data.driverName)  metaRows.push(["Driver",       data.driverName]);
    if (data.routeFrom)   metaRows.push(["From",         data.routeFrom]);
    if (data.routeTo)     metaRows.push(["To",           data.routeTo]);
    if (!data.vehicleNo && data.transportDetails) metaRows.push(["Transport", data.transportDetails]);
  } else {
    if (data.relatedInvoice) metaRows.push(["Invoice Ref", data.relatedInvoice]);
    metaRows.push(["Date",        fmtDate(data.date), fmtDateBSLabel(data.date)]);
    metaRows.push(["Valid Until", fmtDate(data.validUntil), fmtDateBSLabel(data.validUntil)]);
  }

  const g  = "#1a5c1a";
  const gb = "#bcdabc";
  const gs = "#deeede";

  // The sheet has a fixed box for its contents. A document with more lines than it holds is cut off at its bottom edge, here and in
  // Print (the PDF is laid out on its own and crushes a very long one): say so, rather than let someone send a page that is missing its
  // last lines. The sheet cannot grow or run on to a second page (it is the legal copy), so the viewer can only warn.
  useLayoutEffect(() => {
    const box = printRef.current?.firstElementChild;
    setTooLong(!!box && box.scrollHeight > box.clientHeight + 1);
  }, [data, docType]);

  const status = data.status ? { text: data.status, tone: statusTone(data.status) } : null;

  return (
    <DocViewer
      title={title}
      number={docNum}
      meta={[data.clientName, data.date ? fmtDate(data.date) : ""]}
      status={status}
      banner={tooLong ? "This document does not fit on one sheet, so the bottom of it is cut off here and when printing. Check the downloaded PDF before it goes out." : null}
      notice={notice}
      busy={generating}
      onClose={onClose}
      onPrint={openPrintWindow}
      onDownload={handleDownloadPDF}
      footerExtra={<ShareButton type="document" record={{ data, docType }} compact className="ghost-button dv-print" title="Send this document to someone in Chat" />}
    >
      <>
        {/* ── The sheet: A4 at 96 dpi. Nothing between here and the closing fragment is the viewer's; it is the legal copy. ── */}
        <div ref={printRef} className="invoice-page" style={{ width: 794, minHeight: 1123, margin: "0 auto", position: "relative", backgroundImage: "url('/letterhead.jpg')", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", boxShadow: "0 6px 28px rgba(0,0,0,0.25)", flexShrink: 0, fontFamily: "'Segoe UI', Arial, sans-serif" }}>
          <div style={{ position: "absolute", top: 150, left: 50, right: 50, bottom: 118, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Title */}
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <h2 style={{ display: "inline-block", fontSize: 16, fontWeight: 800, color: g, letterSpacing: 5, textTransform: "uppercase", borderBottom: `2.5px solid ${g}`, paddingBottom: 5 }}>{title}</h2>
              {/* IRD Nepal — PAN on invoice header */}
              {docType === "invoice" && (
                <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>
                  PAN / VAT Reg. No.: <strong style={{ color: g }}>{COMPANY_PAN}</strong> &nbsp;|&nbsp; {COMPANY_NAME}
                </div>
              )}
            </div>

            {/* Bill-to + meta */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: g, textTransform: "uppercase", letterSpacing: 1, borderBottom: `1px solid ${gb}`, paddingBottom: 3, marginBottom: 5 }}>Bill To</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#111", marginBottom: 2 }}>{data.clientName || "—"}</div>
                {data.clientAddress && <div style={{ fontSize: 11, color: "#555", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{data.clientAddress}</div>}
                {data.clientPAN    && <div style={{ fontSize: 11, color: "#555" }}>PAN: {data.clientPAN}</div>}
                {data.clientPhone  && <div style={{ fontSize: 11, color: "#555" }}>Tel: {data.clientPhone}</div>}
              </div>
              <div style={{ textAlign: "right", minWidth: 200 }}>
                {metaRows.map(([label, value, sub]) => (
                  <div key={label} style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
                    <div style={{ fontSize: 12, color: "#222", fontWeight: 500 }}>{value || "—"}</div>
                    {!!sub && <div style={{ fontSize: 9.5, color: "#777" }}>{sub}</div>}
                  </div>
                ))}
              </div>
            </div>

            <hr style={{ border: "none", borderTop: `1px solid ${gb}`, marginBottom: 10 }} />

            {/* Items table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 8 }}>
              <thead>
                <tr>
                  <th style={{ background: g, color: "#fff", padding: "6px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", width: 26 }}>#</th>
                  <th style={{ background: g, color: "#fff", padding: "6px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", textAlign: "left" }}>Description</th>
                  <th style={{ background: g, color: "#fff", padding: "6px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", textAlign: "center", width: 42 }}>Qty</th>
                  <th style={{ background: g, color: "#fff", padding: "6px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", textAlign: "center", width: 52 }}>Unit</th>
                  <th style={{ background: g, color: "#fff", padding: "6px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", textAlign: "right", width: 92 }}>Rate ({currency})</th>
                  <th style={{ background: g, color: "#fff", padding: "6px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", textAlign: "right", width: 92 }}>Amount ({currency})</th>
                </tr>
              </thead>
              <tbody>
                {items.length > 0 ? items.map((it, i) => (
                  <tr key={i} style={{ background: i % 2 === 1 ? "rgba(26,92,26,0.025)" : "transparent" }}>
                    <td style={{ padding: "5.5px 8px", borderBottom: `1px solid ${gs}`, color: "#333" }}>{i + 1}</td>
                    <td style={{ padding: "5.5px 8px", borderBottom: `1px solid ${gs}`, color: "#333" }}>
                      {formatDescription(it.description)}
                    </td>
                    <td style={{ padding: "5.5px 8px", borderBottom: `1px solid ${gs}`, color: "#333", textAlign: "center" }}>{Number(it.qty) % 1 === 0 ? it.qty : Number(it.qty).toFixed(2)}</td>
                    <td style={{ padding: "5.5px 8px", borderBottom: `1px solid ${gs}`, color: "#333", textAlign: "center" }}>{it.unit || "Pcs"}</td>
                    <td style={{ padding: "5.5px 8px", borderBottom: `1px solid ${gs}`, color: "#333", textAlign: "right" }}>{fmtCurrencyExact(Number(it.rate || 0), currency)}</td>
                    <td style={{ padding: "5.5px 8px", borderBottom: `1px solid ${gs}`, color: "#333", textAlign: "right" }}>{fmtCurrencyExact(Number(it.qty || 0) * Number(it.rate || 0), currency)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} style={{ padding: "5.5px 8px", borderBottom: `1px solid ${gs}`, color: "#999", textAlign: "center" }}>No items</td></tr>
                )}
              </tbody>
            </table>

            {/* Totals block */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 9 }}>
              <div style={{ width: 270 }}>
                {/* Subtotal */}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3.5px 0", borderBottom: `1px solid ${gs}`, fontSize: 11.5 }}>
                  <span style={{ color: "#555" }}>Subtotal</span>
                  <span style={{ fontWeight: 600, color: "#333" }}>{fmtCurrencyExact(subtotal, currency)}</span>
                </div>

                {/* Discount (Nepal IRD: must show separately) */}
                {showDiscount && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3.5px 0", borderBottom: `1px solid ${gs}`, fontSize: 11.5 }}>
                      <span style={{ color: "#c0392b" }}>{discountLabel}</span>
                      <span style={{ fontWeight: 600, color: "#c0392b" }}>− {fmtCurrencyExact(discountAmt, currency)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3.5px 0", borderBottom: `1px solid ${gs}`, fontSize: 11.5 }}>
                      <span style={{ color: "#555" }}>Taxable Amount</span>
                      <span style={{ fontWeight: 600, color: "#333" }}>{fmtCurrencyExact(taxableAmt, currency)}</span>
                    </div>
                  </>
                )}

                {/* VAT */}
                {showVAT && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3.5px 0", borderBottom: `1px solid ${gs}`, fontSize: 11.5 }}>
                    <span style={{ color: "#555" }}>VAT @ 13% (Nepal IRD)</span>
                    <span style={{ fontWeight: 600, color: "#333" }}>{fmtCurrencyExact(vatAmt, currency)}</span>
                  </div>
                )}

                {/* Grand Total */}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, fontWeight: 800, borderTop: `2px solid ${g}`, borderBottom: `2px solid ${g}`, marginTop: 2 }}>
                  <span style={{ color: g }}>Grand Total</span>
                  <span style={{ color: g }}>{fmtCurrency(total, currency)}</span>
                </div>

                {/* Credit / payment summary (if partial) */}
                {docType === "invoice" && amountPaid > 0 && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3.5px 0", borderBottom: `1px solid ${gs}`, fontSize: 11, marginTop: 3 }}>
                      <span style={{ color: "#1a5c1a" }}>Amount Paid</span>
                      <span style={{ fontWeight: 600, color: "#1a5c1a" }}>{fmtCurrencyExact(amountPaid, currency)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3.5px 0", fontSize: 11.5, fontWeight: 800 }}>
                      <span style={{ color: creditDue > 0 ? "#c0392b" : "#1a5c1a" }}>Credit Balance Due</span>
                      <span style={{ color: creditDue > 0 ? "#c0392b" : "#1a5c1a" }}>{fmtCurrencyExact(creditDue, currency)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Amount in words */}
            <div style={{ background: "rgba(26,92,26,0.04)", border: "1px solid #c4dac4", borderRadius: 3, padding: "6px 10px", marginBottom: 9 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: g, textTransform: "uppercase", letterSpacing: 0.5 }}>Amount in Words</div>
              <div style={{ fontSize: 11, color: "#333", fontWeight: 600, marginTop: 2 }}>{wordsTotal}</div>
            </div>

            {/* Terms (quotation only) */}
            {docType === "quotation" && data.terms && (
              <div style={{ marginBottom: 9 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: "#777", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Terms &amp; Conditions</div>
                <div style={{ fontSize: 10.5, color: "#555", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{data.terms}</div>
              </div>
            )}

            {/* Notes */}
            {data.note && (
              <div style={{ marginBottom: 9 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: "#777", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Notes / Payment Instructions</div>
                <div style={{ fontSize: 10.5, color: "#555", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{data.note}</div>
              </div>
            )}

            {/* IRD compliance note (invoice only) */}
            {docType === "invoice" && (
              <div style={{ fontSize: 9, color: "#888", textAlign: "center", marginBottom: 6 }}>
                This is a computer-generated tax invoice as per Nepal VAT Act, 2052. PAN: {COMPANY_PAN}
              </div>
            )}

            {/* Signatures */}
            <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", paddingTop: 8 }}>
              <div style={{ textAlign: "center", width: 165 }}>
                <div style={{ height: 36 }} />
                <div style={{ borderTop: "1px solid #555", marginBottom: 4 }} />
                <div style={{ fontSize: 10, color: "#444", fontWeight: 600 }}>Received By</div>
                <div style={{ fontSize: 9, color: "#888", marginTop: 1 }}>Name &amp; Stamp</div>
              </div>
              <div style={{ textAlign: "center", width: 165 }}>
                <div style={{ height: 36 }} />
                <div style={{ borderTop: "1px solid #555", marginBottom: 4 }} />
                <div style={{ fontSize: 10, color: "#444", fontWeight: 600 }}>Authorized Signature</div>
                <div style={{ fontSize: 9, color: "#888", marginTop: 1 }}>Kazi Manufacturing Pvt. Ltd.</div>
              </div>
            </div>

          </div>
        </div>
      </>
    </DocViewer>
  );
}
