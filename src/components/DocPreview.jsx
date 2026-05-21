import { useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { InvoicePDFDoc } from "./InvoicePDF";
import { fmtCurrency, fmtDate, numWords, COMPANY_PAN, COMPANY_NAME } from "../utils/billing.jsx";

const TITLES = {
  invoice:   "Tax Invoice",
  challan:   "Challan / Delivery Note",
  quotation: "Quotation",
};

export default function DocPreview({ data, docType, onClose }) {
  const printRef   = useRef(null);
  const [generating, setGenerating] = useState(false);
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
    try {
      // Convert letterhead to base64 so react-pdf can embed it reliably
      const letterheadData = await fetchAsDataURL(`${window.location.origin}/letterhead.jpg`);

      const blob = await pdf(
        <InvoicePDFDoc data={data} docType={docType} letterheadUrl={letterheadData} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href    = url;
      a.download = `${docNum}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("PDF generation failed. Please use Print → Save as PDF instead.");
    } finally {
      setGenerating(false);
    }
  }

  function openPrintWindow() {
    const pageEl = printRef.current;
    if (!pageEl) return;
    const printWin = window.open("", "_blank", "width=800,height=1130");
    if (!printWin) { alert("Please allow pop-ups to print/download."); return; }
    const letterheadUrl = new URL("/letterhead.jpg", window.location.origin).href;
    printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} — ${docNum}</title><style>
@page { margin: 0; size: A4 portrait; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; }
.invoice-page { width: 210mm; min-height: 297mm; position: relative; background-image: url('${letterheadUrl}'); background-size: 100% 100%; background-repeat: no-repeat; }
</style></head><body>${pageEl.outerHTML}</body></html>`);
    printWin.document.close();
    printWin.onload = () => { setTimeout(() => { printWin.focus(); printWin.print(); }, 400); };
    setTimeout(() => { printWin.focus(); printWin.print(); }, 1200);
  }

  /* ── Computed values ── */
  const currency    = data.currency || "NPR";
  const items       = (data.items || []).filter(it => it.description || Number(it.rate) > 0);
  const subtotal    = data.subtotalNPR    || 0;
  const discountAmt = data.discountAmtNPR || 0;
  const discountPct = data.discountPct    || 0;
  const taxableAmt  = data.taxableAmtNPR  != null ? data.taxableAmtNPR : subtotal - discountAmt;
  const vatAmt      = data.vatAmountNPR   || 0;
  const total       = data.totalNPR       || 0;
  const amountPaid  = data.amountPaid     || 0;
  const creditDue   = Math.max(0, total - amountPaid);
  const showVAT     = docType === "invoice" && data.applyVAT;
  const showDiscount = discountAmt > 0;
  const wordsTotal  = total > 0 ? numWords(total, currency) : "—";

  /* ── Meta rows (right column) ── */
  const metaRows = [];
  metaRows.push([`${title.split(" ")[0]} No.`, docNum]);
  if (data.fiscalYear) metaRows.push(["Fiscal Year (B.S.)", data.fiscalYear]);
  if (docType === "invoice") {
    if (data.relatedChallan)   metaRows.push(["Challan Ref",   data.relatedChallan]);
    if (data.relatedQuotation) metaRows.push(["Quotation Ref", data.relatedQuotation]);
    metaRows.push(["Invoice Date",   fmtDate(data.date)]);
    metaRows.push(["Due Date",       fmtDate(data.dueDate)]);
    metaRows.push(["Payment Terms",  data.paymentTerms || "Net 30"]);
    metaRows.push(["Supplier PAN",   COMPANY_PAN]);          // IRD requirement
  } else if (docType === "challan") {
    if (data.relatedInvoice)   metaRows.push(["Invoice Ref",   data.relatedInvoice]);
    if (data.relatedQuotation) metaRows.push(["Quotation Ref", data.relatedQuotation]);
    metaRows.push(["Date", fmtDate(data.date)]);
    // New structured transport fields (fall back to legacy transportDetails)
    if (data.vehicleNo)   metaRows.push(["Vehicle No.",  data.vehicleNo]);
    if (data.driverName)  metaRows.push(["Driver",       data.driverName]);
    if (data.routeFrom)   metaRows.push(["From",         data.routeFrom]);
    if (data.routeTo)     metaRows.push(["To",           data.routeTo]);
    if (!data.vehicleNo && data.transportDetails) metaRows.push(["Transport", data.transportDetails]);
  } else {
    if (data.relatedInvoice) metaRows.push(["Invoice Ref", data.relatedInvoice]);
    metaRows.push(["Date",        fmtDate(data.date)]);
    metaRows.push(["Valid Until", fmtDate(data.validUntil)]);
  }

  const g  = "#1a5c1a";
  const gb = "#bcdabc";
  const gs = "#deeede";
  const btnBase = { padding: "8px 18px", borderRadius: 6, fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7, transition: "opacity .15s" };

  return (
    <div id="__kazi_doc_root__" style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(0,0,0,0.55)" }}>

      {/* ── Toolbar ── */}
      <div className="doc-toolbar" style={{ width: "100%", background: g, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px", flexShrink: 0, flexWrap: "wrap", gap: 10 }}>
        <span style={{ color: "#fff", fontWeight: 600, fontSize: "0.95rem" }}>{title} — {docNum}</span>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={handleDownloadPDF} disabled={generating} style={{ ...btnBase, background: "#fff", color: g, border: "none", opacity: generating ? 0.7 : 1 }}>
            {generating ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>
                Generating…
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M12 15l-4-4M12 15l4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
                Download PDF
              </>
            )}
          </button>
          <button onClick={openPrintWindow} style={{ ...btnBase, background: "rgba(255,255,255,0.15)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.4)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print
          </button>
          <button onClick={onClose} style={{ ...btnBase, background: "transparent", color: "#fff", border: "1.5px solid rgba(255,255,255,0.35)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M5 12l6-6M5 12l6 6"/></svg>
            Go Back
          </button>
        </div>
      </div>

      {/* ── A4 Page ── */}
      <div style={{ flex: 1, overflowY: "auto", width: "100%", display: "flex", justifyContent: "center", padding: "28px 32px", background: "#d4e2d4" }}>
        <div ref={printRef} className="invoice-page" style={{ width: 794, minHeight: 1123, position: "relative", backgroundImage: "url('/letterhead.jpg')", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", boxShadow: "0 6px 28px rgba(0,0,0,0.25)", flexShrink: 0, fontFamily: "'Segoe UI', Arial, sans-serif" }}>
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
                {metaRows.map(([label, value]) => (
                  <div key={label} style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
                    <div style={{ fontSize: 12, color: "#222", fontWeight: 500 }}>{value || "—"}</div>
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
                    <td style={{ padding: "5.5px 8px", borderBottom: `1px solid ${gs}`, color: "#333" }}>{it.description || "—"}</td>
                    <td style={{ padding: "5.5px 8px", borderBottom: `1px solid ${gs}`, color: "#333", textAlign: "center" }}>{Number(it.qty) % 1 === 0 ? it.qty : Number(it.qty).toFixed(2)}</td>
                    <td style={{ padding: "5.5px 8px", borderBottom: `1px solid ${gs}`, color: "#333", textAlign: "center" }}>{it.unit || "Pcs"}</td>
                    <td style={{ padding: "5.5px 8px", borderBottom: `1px solid ${gs}`, color: "#333", textAlign: "right" }}>{fmtCurrency(Number(it.rate || 0), currency)}</td>
                    <td style={{ padding: "5.5px 8px", borderBottom: `1px solid ${gs}`, color: "#333", textAlign: "right" }}>{fmtCurrency(Number(it.qty || 0) * Number(it.rate || 0), currency)}</td>
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
                  <span style={{ fontWeight: 600, color: "#333" }}>{fmtCurrency(subtotal, currency)}</span>
                </div>

                {/* Discount (Nepal IRD: must show separately) */}
                {showDiscount && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3.5px 0", borderBottom: `1px solid ${gs}`, fontSize: 11.5 }}>
                      <span style={{ color: "#c0392b" }}>Discount ({discountPct}%)</span>
                      <span style={{ fontWeight: 600, color: "#c0392b" }}>− {fmtCurrency(discountAmt, currency)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3.5px 0", borderBottom: `1px solid ${gs}`, fontSize: 11.5 }}>
                      <span style={{ color: "#555" }}>Taxable Amount</span>
                      <span style={{ fontWeight: 600, color: "#333" }}>{fmtCurrency(taxableAmt, currency)}</span>
                    </div>
                  </>
                )}

                {/* VAT */}
                {showVAT && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3.5px 0", borderBottom: `1px solid ${gs}`, fontSize: 11.5 }}>
                    <span style={{ color: "#555" }}>VAT @ 13% (Nepal IRD)</span>
                    <span style={{ fontWeight: 600, color: "#333" }}>{fmtCurrency(vatAmt, currency)}</span>
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
                      <span style={{ fontWeight: 600, color: "#1a5c1a" }}>{fmtCurrency(amountPaid, currency)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3.5px 0", fontSize: 11.5, fontWeight: 800 }}>
                      <span style={{ color: creditDue > 0 ? "#c0392b" : "#1a5c1a" }}>Credit Balance Due</span>
                      <span style={{ color: creditDue > 0 ? "#c0392b" : "#1a5c1a" }}>{fmtCurrency(creditDue, currency)}</span>
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
      </div>
    </div>
  );
}
