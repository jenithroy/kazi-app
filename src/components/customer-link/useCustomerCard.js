/**
 * What one customer's card reads: the customer and everything that belongs to them (orders, invoices, payments, and the costs entered
 * against orders). It is the Customers page's reading (hooks/useCustomersData.js) for one customer instead of all of them: each
 * collection is read on its own, so one that fails (or that this position may not read) never blanks the others.
 *
 *   raw      { customer, orders, invoices, payments, orderCosts }: what has been read (an unread collection is empty)
 *   status   "loading"  the customer is on its way
 *            "ready"    the customer is here (a later look that fails keeps what is shown)
 *            "missing"  the database does not hand them over: deleted or merged away, or never visible to this position
 *            "error"    the customer could not be read at all (nothing to draw)
 *   lost     the collections the last look could not read (the card says so, and what it already had stays on screen)
 *   known    the collections read at least once. A collection that was never read is empty, and an empty invoice list reads as
 *            "nothing owed", so the card must not draw money from one: it draws no money at all until both invoices and payments are known
 *   reload   look again now (the tab coming back does it by itself)
 *
 * A position only reads what it may see (invoices and payments are Billing's, orders are Orders'): the database would answer an empty
 * list for the rest, and an empty list is not the same as "none".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { fetchAll } from "../../lib/db";
import { sectionVisible } from "../../utils/permissions";

const NONE = Object.freeze([]);
const EMPTY_RAW = Object.freeze({ customer: null, orders: NONE, invoices: NONE, payments: NONE, orderCosts: NONE });

export default function useCustomerCard(customerId) {
  const { profile } = useAuth();
  const billing = sectionVisible(profile, "billing");
  const orders = sectionVisible(profile, "orders");

  const [raw, setRaw] = useState(EMPTY_RAW);
  const [status, setStatus] = useState("loading");
  const [lost, setLost] = useState(NONE);
  const [known, setKnown] = useState({});
  const seq = useRef(0);
  const knownRef = useRef({});
  const hadCustomer = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // [key, collection, filters]: only what this position may see
  const sources = useMemo(() => [
    ["customer", "customers", [{ field: "id", value: customerId }]],
    ...(orders ? [["orders", "orders", [{ field: "customer_id", value: customerId }]], ["orderCosts", "order_costs", []]] : []),
    ...(billing ? [["invoices", "invoices", [{ field: "customerId", value: customerId }]], ["payments", "payments", [{ field: "customerId", value: customerId }]]] : []),
  ], [customerId, billing, orders]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const settled = await Promise.allSettled(sources.map(([, collection, filters]) => fetchAll(collection, { filters })));
    if (mine !== seq.current || !alive.current) return;          // a newer look is on its way, or the card is gone
    const got = {};
    const missed = [];
    settled.forEach((r, i) => {
      const [key, collection] = sources[i];
      if (r.status === "fulfilled") got[key] = r.value;
      else {
        missed.push(collection);
        console.error(`Customer card: could not load ${collection}:`, r.reason);
      }
    });
    knownRef.current = { ...knownRef.current, ...Object.fromEntries(Object.keys(got).map((k) => [k, true])) };
    setKnown(knownRef.current);
    setLost(missed.length ? missed : NONE);

    // the customer: found, not there, or not readable (which, once they have been shown, keeps what is on screen)
    if ("customer" in got) {
      const row = got.customer.find((c) => String(c.id) === String(customerId)) || null;
      if (!row) { hadCustomer.current = false; setStatus("missing"); return; }
      hadCustomer.current = true;
      const { customer: _drop, ...rest } = got;
      setRaw((prev) => ({ ...prev, ...rest, customer: row }));
      setStatus("ready");
    } else if (!hadCustomer.current) {
      setStatus("error");
    }
  }, [sources, customerId]);

  useEffect(() => { load(); }, [load]);

  // The tab coming back after a while (the numbers may have moved on while the card stood open).
  useEffect(() => {
    let timer = 0;
    const back = () => { if (!document.hidden) { clearTimeout(timer); timer = setTimeout(load, 600); } };
    document.addEventListener("visibilitychange", back);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", back); };
  }, [load]);

  return { raw, status, lost, known, reload: load };
}
