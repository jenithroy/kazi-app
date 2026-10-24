/**
 * A VAT bill is already a file (a picture or a PDF of the supplier's bill), so what is sent is that file itself, untouched.
 */
import { extOf, fetchBlob, safeFileName } from "./helpers";

export default {
  label: "VAT bill",

  describe(bill) {
    const supplier = (bill.expenseItem || "").trim();
    return { title: `${bill.expenseId || "VAT bill"}${supplier ? ` · ${supplier}` : ""}`, subtitle: bill.fileName || "" };
  },

  async build(bill) {
    if (!bill.fileUrl) throw new Error("This bill has no file to send.");
    const blob = await fetchBlob(bill.fileUrl);
    const type = bill.fileType || blob.type || "application/octet-stream";
    const supplier = (bill.expenseItem || "").trim();
    const name = safeFileName(`VAT bill ${bill.expenseId || ""}${supplier ? ` ${supplier}` : ""}`, extOf(bill.fileName, type));
    return new File([blob], name, { type });
  },
};
