/**
 * A Billing document (a VAT invoice, a challan or a quotation) as the PDF its own "Download PDF" button makes, and nothing else.
 *
 * It is a legal record, so there is no second layout of it here: `build` does what DocPreview's `handleDownloadPDF` does, step for step
 * (the letterhead as a data address, the PDF maker and components/InvoicePDF.jsx fetched on demand, `pdf(<InvoicePDFDoc />).toBlob()`) and
 * returns that PDF under the same file name (`<number>.pdf`). It gets no "a copy taken by" footer: the PDF is the document, as it would be
 * downloaded. It does not import pdfKit.jsx (a second PDF layout, with a global setting of its own: pdfKit turns react-pdf's hyphenation
 * off for the whole page once it is loaded, which also changes how InvoicePDF wraps a long word; Download PDF and this file are affected
 * alike, so what is sent is always what would be downloaded at that moment).
 *
 * `record` is `{ data, docType }`, exactly what DocPreview receives: `data` the document's row, `docType` "invoice" | "challan" | "quotation".
 * The copy is the saved document as the viewer shows it. Who may see it is the viewer's rule (the Billing page), the same as Download PDF.
 */
import { fetchBlob, safeFileName } from "./helpers";

// the heading the viewer gives each kind (DocPreview's TITLES)
const TITLES = { invoice: "Tax Invoice", challan: "Challan / Delivery Note", quotation: "Quotation" };

const numberOf = (data) => data?.invoiceNumber || data?.challanNumber || data?.quotationNumber || "—";

/** The letterhead as a data address, the way DocPreview fetches it (react-pdf cannot draw a picture it has to go and get). */
async function letterheadDataUrl() {
  let blob;
  try {
    blob = await fetchBlob(`${window.location.origin}/letterhead.jpg`);
  } catch {
    throw new Error("The letterhead could not be loaded, so the PDF could not be made. Try again.");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default {
  label: "Document",

  describe({ data, docType }) {
    const client = String(data?.clientName || "").trim();
    return { title: `${TITLES[docType] || "Document"} ${numberOf(data)}${client ? ` · ${client}` : ""}`, subtitle: client };
  },

  async build({ data, docType }) {
    // The PDF maker itself is about 2.6 MB of code: fetched here, alongside the letterhead, and not before (as Download PDF does it).
    const [letterheadUrl, { pdf }, { InvoicePDFDoc }] = await Promise.all([
      letterheadDataUrl(),
      import("@react-pdf/renderer"),
      import("../../components/InvoicePDF"),
    ]);
    const blob = await pdf(<InvoicePDFDoc data={data} docType={docType} letterheadUrl={letterheadUrl} />).toBlob();
    return new File([blob], safeFileName(numberOf(data), "pdf"), { type: "application/pdf" });
  },
};
