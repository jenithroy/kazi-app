/**
 * What the Billing page reads: the three kinds of document, the stock items an invoice line may be linked to, and the customers a client
 * can be picked from. Each is read on its own, so one that cannot be read (or that this position may not read) does not blank the others,
 * and a list that cannot be re-read keeps what it had (an open card must not lose its document to a blip).
 *
 * Newest document first, by its own date. The Nepali and English calendars order identically, so one comparison serves both. Numbers follow
 * dates (see resequenceDocNumbers), so within a day the higher number is the later one; that also keeps a day's documents in a stable order.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAll } from "../lib/db";

const NAMES = ["invoices", "challans", "quotations", "inventory", "customers"];
const EMPTY = { invoices: [], challans: [], quotations: [], inventoryItems: [], customers: [] };

const seqNum = (row) => {
  const m = /(\d+)\s*$/.exec(row.invoiceNumber || row.challanNumber || row.quotationNumber || "");
  return m ? parseInt(m[1], 10) : -1;
};
const newestFirst = (a, b) => (b.date || "").localeCompare(a.date || "") || (seqNum(b) - seqNum(a));

export default function useBillingData() {
  const [data, setData] = useState(EMPTY);
  const [status, setStatus] = useState("loading");        // loading | ready | error
  const [failed, setFailed] = useState([]);
  const seq = useRef(0);
  const lastGood = useRef({});

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    const settled = await Promise.allSettled(NAMES.map((n) => fetchAll(n)));
    if (mine !== seq.current) return;                       // a newer look is on its way
    const lost = [];
    const got = {};
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") { got[NAMES[i]] = r.value; lastGood.current[NAMES[i]] = r.value; }
      else { lost.push(NAMES[i]); got[NAMES[i]] = lastGood.current[NAMES[i]] || []; console.error(`Billing: failed to load ${NAMES[i]}:`, r.reason); }
    });
    if (lost.length === NAMES.length) { setFailed(lost); setStatus((s) => (s === "ready" ? "ready" : "error")); return; }
    setData({
      invoices: [...got.invoices].sort(newestFirst),
      challans: [...got.challans].sort(newestFirst),
      quotations: [...got.quotations].sort(newestFirst),
      inventoryItems: got.inventory,
      customers: got.customers,
    });
    setFailed(lost);
    setStatus("ready");
  }, []);

  useEffect(() => { reload().catch((err) => { console.error(err); setStatus((s) => (s === "ready" ? s : "error")); }); }, [reload]);

  // somebody else may have raised a document while this tab was in the background
  useEffect(() => {
    let timer = 0;
    const back = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      timer = setTimeout(() => reload().catch(console.error), 600);
    };
    document.addEventListener("visibilitychange", back);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", back); };
  }, [reload]);

  /** A customer added from the client picker is in the list at once, before the next look. */
  const addCustomer = useCallback((c) => {
    lastGood.current.customers = [...(lastGood.current.customers || []), c];
    setData((d) => ({ ...d, customers: [...d.customers, c] }));
  }, []);

  return { ...data, status, failed, reload, addCustomer };
}
