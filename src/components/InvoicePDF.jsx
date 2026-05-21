/**
 * InvoicePDF — vector-quality PDF via @react-pdf/renderer
 * Produces real PDF text (infinitely sharp, copy-pasteable).
 * Used by DocPreview's "Download PDF" button.
 */
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { fmtCurrency, fmtDate, numWords, COMPANY_PAN, COMPANY_NAME } from "../utils/billing.jsx";

/* ── Colours ─────────────────────────────────────── */
const G   = "#1a5c1a";
const GB  = "#bcdabc";
const GS  = "#deeede";
const RED = "#c0392b";

/* ── Styles ──────────────────────────────────────── */
const S = StyleSheet.create({
  page:       { position: "relative", backgroundColor: "#fff", fontFamily: "Helvetica" },
  letterhead: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },

  // Content area — matches letterhead margins (A4 = 595×842 pt; HTML page 794×1123px → scale ≈ 0.749)
  body: { position: "absolute", top: 112, left: 37, right: 37, bottom: 89, display: "flex", flexDirection: "column" },

  /* Title */
  titleWrap:  { alignItems: "center", marginBottom: 8 },
  titleUnder: { borderBottomWidth: 2, borderBottomColor: G, paddingBottom: 3, marginBottom: 2 },
  titleText:  { fontSize: 13, fontFamily: "Helvetica-Bold", color: G, letterSpacing: 3 },
  panLine:    { fontSize: 7.5, color: "#555", textAlign: "center" },

  /* Bill-to + meta two-column */
  topRow:   { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  billTo:   { flex: 1, marginRight: 14 },
  billHd:   { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: G, textTransform: "uppercase",
               letterSpacing: 1, borderBottomWidth: 1, borderBottomColor: GB, paddingBottom: 2, marginBottom: 4 },
  billName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 2 },
  billSub:  { fontSize: 9, color: "#555", lineHeight: 1.5 },
  metaCol:  { width: 155, alignItems: "flex-end" },
  metaRow:  { marginBottom: 4 },
  metaLbl:  { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#999", textTransform: "uppercase" },
  metaVal:  { fontSize: 9.5, color: "#222" },

  /* Divider */
  hr: { borderTopWidth: 1, borderTopColor: GB, marginBottom: 8 },

  /* Items table */
  tblHead: { flexDirection: "row", backgroundColor: G, paddingVertical: 4, paddingHorizontal: 5 },
  tblHd:   { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#fff", textTransform: "uppercase" },
  tblRow:  { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 5,
              borderBottomWidth: 1, borderBottomColor: GS },
  tblEven: { backgroundColor: "rgba(26,92,26,0.025)" },
  tblCell: { fontSize: 9, color: "#333" },

  /* Column widths (must sum to content width) */
  cNo:   { width: 18 },
  cDesc: { flex: 1 },
  cQty:  { width: 32, textAlign: "center" },
  cUnit: { width: 38, textAlign: "center" },
  cRate: { width: 68, textAlign: "right" },
  cAmt:  { width: 68, textAlign: "right" },

  /* Totals */
  totalsWrap: { alignItems: "flex-end", marginTop: 7, marginBottom: 8 },
  totalsBox:  { width: 210 },
  totRow:     { flexDirection: "row", justifyContent: "space-between",
                paddingVertical: 2.5, borderBottomWidth: 1, borderBottomColor: GS },
  totLbl:     { fontSize: 9.5, color: "#555" },
  totVal:     { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#333" },
  totRed:     { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: RED },
  grandRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4,
                borderTopWidth: 2, borderTopColor: G, borderBottomWidth: 2, borderBottomColor: G, marginTop: 2 },
  grandLbl:   { fontSize: 11, fontFamily: "Helvetica-Bold", color: G },
  grandVal:   { fontSize: 11, fontFamily: "Helvetica-Bold", color: G },
  creditRow:  { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5,
                borderBottomWidth: 1, borderBottomColor: GS, marginTop: 2 },
  creditLbl:  { fontSize: 9, fontFamily: "Helvetica-Bold" },
  creditVal:  { fontSize: 9, fontFamily: "Helvetica-Bold" },

  /* Amount in words */
  wordsBox: { backgroundColor: "rgba(26,92,26,0.04)", borderWidth: 1, borderColor: "#c4dac4",
               borderRadius: 3, padding: 6, marginBottom: 7 },
  wordsLbl: { fontSize: 7, fontFamily: "Helvetica-Bold", color: G, textTransform: "uppercase" },
  wordsVal: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#333", marginTop: 2 },

  /* Notes / terms */
  secLbl: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#777", textTransform: "uppercase", marginBottom: 2 },
  secTxt: { fontSize: 8.5, color: "#555", lineHeight: 1.5 },

  /* IRD compliance footer */
  irdNote: { fontSize: 7, color: "#888", textAlign: "center", marginBottom: 4 },

  /* Signatures */
  sigWrap: { flexDirection: "row", justifyContent: "space-between", marginTop: "auto", paddingTop: 6 },
  sigBox:  { alignItems: "center", width: 130 },
  sigSpc:  { height: 28 },
  sigLine: { borderTopWidth: 1, borderTopColor: "#555", width: "100%", marginBottom: 3 },
  sigName: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#444" },
  sigSub:  { fontSize: 7, color: "#888", marginTop: 1 },
});

/* ── Helpers ─────────────────────────────────────── */
function MetaRow({ label, value }) {
  return (
    <View style={S.metaRow}>
      <Text style={S.metaLbl}>{label}</Text>
      <Text style={S.metaVal}>{value || "—"}</Text>
    </View>
  );
}

function TotRow({ label, value, labelStyle, valueStyle, isGrand }) {
  if (isGrand) {
    return (
      <View style={S.grandRow}>
        <Text style={S.grandLbl}>{label}</Text>
        <Text style={S.grandVal}>{value}</Text>
      </View>
    );
  }
  return (
    <View style={S.totRow}>
      <Text style={[S.totLbl, labelStyle]}>{label}</Text>
      <Text style={[S.totVal, valueStyle]}>{value}</Text>
    </View>
  );
}

/* ── Main PDF Document ───────────────────────────── */
export function InvoicePDFDoc({ data, docType, letterheadUrl }) {
  const docNum = data.invoiceNumber || data.challanNumber || data.quotationNumber || "—";
  const TITLES = { invoice: "TAX INVOICE", challan: "CHALLAN / DELIVERY NOTE", quotation: "QUOTATION" };
  const title  = TITLES[docType] || "DOCUMENT";

  /* Computed values */
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
  const showDisc    = discountAmt > 0;
  const wordsText   = total > 0 ? numWords(total, currency) : "—";

  /* Meta rows */
  const metaRows = [];
  const titleWord = title.split(" ")[0];
  metaRows.push([`${titleWord} No.`, docNum]);
  if (data.fiscalYear) metaRows.push(["Fiscal Year (B.S.)", data.fiscalYear]);
  if (docType === "invoice") {
    if (data.relatedChallan)   metaRows.push(["Challan Ref",   data.relatedChallan]);
    if (data.relatedQuotation) metaRows.push(["Quotation Ref", data.relatedQuotation]);
    metaRows.push(["Invoice Date",  fmtDate(data.date)]);
    metaRows.push(["Due Date",      fmtDate(data.dueDate)]);
    metaRows.push(["Payment Terms", data.paymentTerms || "Net 30"]);
    metaRows.push(["Supplier PAN",  COMPANY_PAN]);
  } else if (docType === "challan") {
    if (data.relatedInvoice)   metaRows.push(["Invoice Ref",   data.relatedInvoice]);
    if (data.relatedQuotation) metaRows.push(["Quotation Ref", data.relatedQuotation]);
    metaRows.push(["Date", fmtDate(data.date)]);
    if (data.vehicleNo)          metaRows.push(["Vehicle No.",  data.vehicleNo]);
    if (data.driverName)         metaRows.push(["Driver",       data.driverName]);
    if (data.routeFrom)          metaRows.push(["From",         data.routeFrom]);
    if (data.routeTo)            metaRows.push(["To",           data.routeTo]);
    if (!data.vehicleNo && data.transportDetails) metaRows.push(["Transport", data.transportDetails]);
  } else {
    if (data.relatedInvoice) metaRows.push(["Invoice Ref", data.relatedInvoice]);
    metaRows.push(["Date",        fmtDate(data.date)]);
    metaRows.push(["Valid Until", fmtDate(data.validUntil)]);
  }

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* Letterhead background */}
        {letterheadUrl && <Image src={letterheadUrl} style={S.letterhead} />}

        {/* Content area */}
        <View style={S.body}>

          {/* ── Title ── */}
          <View style={S.titleWrap}>
            <View style={S.titleUnder}>
              <Text style={S.titleText}>{title}</Text>
            </View>
            {docType === "invoice" && (
              <Text style={S.panLine}>PAN / VAT Reg. No.: {COMPANY_PAN}  |  {COMPANY_NAME}</Text>
            )}
          </View>

          {/* ── Bill To + Meta ── */}
          <View style={S.topRow}>
            <View style={S.billTo}>
              <Text style={S.billHd}>Bill To</Text>
              <Text style={S.billName}>{data.clientName || "—"}</Text>
              {!!data.clientAddress && <Text style={S.billSub}>{data.clientAddress}</Text>}
              {!!data.clientPAN    && <Text style={S.billSub}>PAN: {data.clientPAN}</Text>}
              {!!data.clientPhone  && <Text style={S.billSub}>Tel: {data.clientPhone}</Text>}
            </View>
            <View style={S.metaCol}>
              {metaRows.map(([lbl, val]) => <MetaRow key={lbl} label={lbl} value={val} />)}
            </View>
          </View>

          {/* ── Divider ── */}
          <View style={S.hr} />

          {/* ── Items Table ── */}
          {/* Header */}
          <View style={S.tblHead}>
            <Text style={[S.tblHd, S.cNo]}>#</Text>
            <Text style={[S.tblHd, S.cDesc]}>Description</Text>
            <Text style={[S.tblHd, S.cQty]}>Qty</Text>
            <Text style={[S.tblHd, S.cUnit]}>Unit</Text>
            <Text style={[S.tblHd, S.cRate]}>{`Rate (${currency})`}</Text>
            <Text style={[S.tblHd, S.cAmt]}>{`Amount (${currency})`}</Text>
          </View>
          {items.length > 0 ? items.map((it, i) => (
            <View key={i} style={[S.tblRow, i % 2 === 1 ? S.tblEven : {}]}>
              <Text style={[S.tblCell, S.cNo]}>{i + 1}</Text>
              <Text style={[S.tblCell, S.cDesc]}>{it.description || "—"}</Text>
              <Text style={[S.tblCell, S.cQty]}>{Number(it.qty) % 1 === 0 ? it.qty : Number(it.qty).toFixed(2)}</Text>
              <Text style={[S.tblCell, S.cUnit]}>{it.unit || "Pcs"}</Text>
              <Text style={[S.tblCell, S.cRate]}>{fmtCurrency(Number(it.rate || 0), currency)}</Text>
              <Text style={[S.tblCell, S.cAmt]}>{fmtCurrency(Number(it.qty || 0) * Number(it.rate || 0), currency)}</Text>
            </View>
          )) : (
            <View style={S.tblRow}>
              <Text style={[S.tblCell, { flex: 1, textAlign: "center", color: "#999" }]}>No items</Text>
            </View>
          )}

          {/* ── Totals ── */}
          <View style={S.totalsWrap}>
            <View style={S.totalsBox}>
              <TotRow label="Subtotal" value={fmtCurrency(subtotal, currency)} />
              {showDisc && (
                <>
                  <TotRow label={`Discount (${discountPct}%)`} value={`− ${fmtCurrency(discountAmt, currency)}`} labelStyle={{ color: RED }} valueStyle={S.totRed} />
                  <TotRow label="Taxable Amount" value={fmtCurrency(taxableAmt, currency)} />
                </>
              )}
              {showVAT && <TotRow label="VAT @ 13% (Nepal IRD)" value={fmtCurrency(vatAmt, currency)} />}
              <TotRow label="Grand Total" value={fmtCurrency(total, currency)} isGrand />
              {docType === "invoice" && amountPaid > 0 && (
                <>
                  <View style={[S.creditRow, { borderBottomColor: GB }]}>
                    <Text style={[S.creditLbl, { color: G }]}>Amount Paid</Text>
                    <Text style={[S.creditVal, { color: G }]}>{fmtCurrency(amountPaid, currency)}</Text>
                  </View>
                  <View style={S.creditRow}>
                    <Text style={[S.creditLbl, { color: creditDue > 0 ? RED : G }]}>Credit Balance Due</Text>
                    <Text style={[S.creditVal, { color: creditDue > 0 ? RED : G }]}>{fmtCurrency(creditDue, currency)}</Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* ── Amount in Words ── */}
          <View style={S.wordsBox}>
            <Text style={S.wordsLbl}>Amount in Words</Text>
            <Text style={S.wordsVal}>{wordsText}</Text>
          </View>

          {/* ── Terms (quotation) ── */}
          {docType === "quotation" && !!data.terms && (
            <View style={{ marginBottom: 7 }}>
              <Text style={S.secLbl}>Terms &amp; Conditions</Text>
              <Text style={S.secTxt}>{data.terms}</Text>
            </View>
          )}

          {/* ── Notes ── */}
          {!!data.note && (
            <View style={{ marginBottom: 7 }}>
              <Text style={S.secLbl}>Notes / Payment Instructions</Text>
              <Text style={S.secTxt}>{data.note}</Text>
            </View>
          )}

          {/* ── IRD compliance line ── */}
          {docType === "invoice" && (
            <Text style={S.irdNote}>
              Computer-generated tax invoice as per Nepal VAT Act, 2052.  PAN: {COMPANY_PAN}
            </Text>
          )}

          {/* ── Signatures ── */}
          <View style={S.sigWrap}>
            <View style={S.sigBox}>
              <View style={S.sigSpc} />
              <View style={S.sigLine} />
              <Text style={S.sigName}>Received By</Text>
              <Text style={S.sigSub}>Name &amp; Stamp</Text>
            </View>
            <View style={S.sigBox}>
              <View style={S.sigSpc} />
              <View style={S.sigLine} />
              <Text style={S.sigName}>Authorized Signature</Text>
              <Text style={S.sigSub}>Kazi Manufacturing Pvt. Ltd.</Text>
            </View>
          </View>

        </View>
      </Page>
    </Document>
  );
}
