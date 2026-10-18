/**
 * What the Purchases page reads: the purchases, the VAT bills filed against them, and the stock items a purchase's lines may name.
 * Each is read on its own, so one that cannot be read (or that this position may not read) does not blank the others. The purchases
 * come back newest first, a bill's number breaking a tie on the same day, as the old page listed them.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAll } from "../lib/db";
import { createdAfterCutoff } from "../constants";

const EMPTY = { purchases: [], vatBills: [], inventoryItems: [] };

export default function usePurchasesData() {
  const [data, setData] = useState(EMPTY);
  const [status, setStatus] = useState("loading");        // loading | ready | error
  const [failed, setFailed] = useState([]);
  const seq = useRef(0);
  const lastGood = useRef({});                              // the last successful read of each list

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    const names = ["finance_purchases", "vat_bills", "inventory"];
    const settled = await Promise.allSettled(names.map((n) => fetchAll(n)));
    if (mine !== seq.current) return;                       // a newer look is on its way
    const lost = [];
    const got = {};
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") { got[names[i]] = r.value; lastGood.current[names[i]] = r.value; }
      // a list that cannot be read this time keeps what it had: an open card must not lose its row, and what was typed in it, to a blip
      else { lost.push(names[i]); got[names[i]] = lastGood.current[names[i]] || []; console.error(`Purchases: failed to load ${names[i]}:`, r.reason); }
    });
    if (lost.length === names.length) { setFailed(lost); setStatus((s) => (s === "ready" ? "ready" : "error")); return; }
    const purchases = got.finance_purchases
      .filter((r) => createdAfterCutoff(r))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.expenseId || "").localeCompare(a.expenseId || ""));
    setData({ purchases, vatBills: got.vat_bills, inventoryItems: got.inventory });
    setFailed(lost);
    setStatus("ready");
  }, []);

  useEffect(() => { reload().catch((err) => { console.error(err); setStatus((s) => (s === "ready" ? s : "error")); }); }, [reload]);

  // somebody else may have entered something while this tab was in the background
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

  return { ...data, status, failed, reload };
}
