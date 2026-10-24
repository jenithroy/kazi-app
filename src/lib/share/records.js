/**
 * What can be sent to Chat, and how each kind of record becomes a file.
 *
 * An adapter is one small module that knows one kind of record:
 *
 *   export default {
 *     label: "Tech pack",                                  what it is called in the dialog
 *     describe(record) -> { title, subtitle }              what the dialog says it is sending
 *     build(record, ctx) -> Promise<File>                  the file that goes into the conversation (name and type set)
 *   }                                                      ctx = { profile }: who is sending (the footer of a generated PDF says so)
 *
 * The file is a COPY as of the moment it is sent: a PDF of the record (a generated one says when it was taken, and by whom), or the
 * original file when the record IS a file (a VAT bill) or already has a document of its own (a Billing document: the same PDF its
 * Download PDF makes, untouched). Adapters are loaded when wanted, because the ones that make a PDF bring the PDF maker with them
 * (about 2.6 MB of code that must never ride in the first download): never import an adapter or pdfKit.jsx statically.
 *
 * A copy has to show no more than the sender's own card shows: an adapter reads the same visibility rules the card reads (who may see
 * prices, contact details...) and leaves out what the card leaves out for that person.
 *
 * To make another kind sendable: add its module under lib/share/, add one line here, and put a <ShareButton type="..." record={...}/>
 * on its card (components/share/ShareButton.jsx). DESIGN.md "Send to chat" has the whole recipe.
 */
const ADAPTERS = {
  techpack: () => import("./techpack.jsx"),
  vat_bill: () => import("./vatBill.js"),
  document: () => import("./document.jsx"),                 // a Billing invoice, challan or quotation: record = { data, docType }
  order: () => import("./order.jsx"),                       // a production order and its pipeline
  purchase: () => import("./purchase.jsx"),
  expense: () => import("./expense.jsx"),
  task: () => import("./task.jsx"),
  customer: () => import("./customer.jsx"),
  fabric: () => import("./fabric.jsx"),
  sample: () => import("./sample.jsx"),
  budget_request: () => import("./budgetRequest.jsx"),
};

/** The adapter for a kind, or an error that says there is none. */
export async function loadAdapter(type) {
  const load = ADAPTERS[type];
  if (!load) throw new Error(`Nothing is set up to send a "${type}" yet.`);
  return (await load()).default;
}

export const sendableTypes = () => Object.keys(ADAPTERS);
