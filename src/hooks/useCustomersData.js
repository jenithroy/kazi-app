/**
 * What the Customers page reads: the customers and everything that belongs to them (orders, invoices, payments, and the costs
 * that were entered against orders). Each collection is read on its own, so one that fails (or that this position cannot read) never
 * blanks the others.
 *
 *   lost    the collections the last look could not read (the page says so, and what it already had stays on screen)
 *   known   the collections that have been read at least once. A collection that has never been read is empty, and an empty
 *           invoice list reads as "nothing owed", so the page must not draw money from one (it draws no money at all until it is)
 *   status  "loading", "ready", or "error": the customers themselves could not be read, so there is nothing to draw
 *
 * Orders and invoices are in the live feed, so the page follows them; everything else is looked at again when the tab comes back.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAll, subscribe } from "../lib/db";

const SOURCES = [
  { key: "customers", collection: "customers", opts: { orderBy: "name", orderDir: "asc" } },
  { key: "orders", collection: "orders" },
  { key: "invoices", collection: "invoices" },
  { key: "payments", collection: "payments" },
  { key: "orderCosts", collection: "order_costs" },
];

const EMPTY_RAW = { customers: [], orders: [], invoices: [], payments: [], orderCosts: [] };

export default function useCustomersData() {
  const [raw, setRaw] = useState(EMPTY_RAW);
  const [status, setStatus] = useState("loading");        // loading | ready | error
  const [lost, setLost] = useState([]);                   // collections the last look could not read
  const [known, setKnown] = useState({});                 // keys (customers, orders, invoices, payments, orderCosts) read at least once
  const seq = useRef(0);
  const knownRef = useRef({});

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const settled = await Promise.allSettled(SOURCES.map((s) => fetchAll(s.collection, s.opts)));
    if (mine !== seq.current) return;                // a newer look is on its way
    const got = {};
    const missed = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") got[SOURCES[i].key] = r.value;
      else {
        missed.push(SOURCES[i].collection);
        console.error(`Customers: could not load ${SOURCES[i].collection}:`, r.reason);
      }
    });
    knownRef.current = { ...knownRef.current, ...Object.fromEntries(Object.keys(got).map((k) => [k, true])) };
    setLost(missed);
    setKnown(knownRef.current);
    // without the customers there is nothing to draw (a failed refresh after a good look keeps what was there)
    if (!knownRef.current.customers) { setStatus((s) => (s === "ready" ? "ready" : "error")); return; }
    setRaw((prev) => ({ ...prev, ...got }));
    setStatus("ready");
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(load, 800); };
    const offs = ["orders", "invoices"].map((c) => subscribe(c, later));
    const back = () => { if (!document.hidden) later(); };
    document.addEventListener("visibilitychange", back);
    return () => {
      clearTimeout(timer);
      offs.forEach((off) => off());
      document.removeEventListener("visibilitychange", back);
    };
  }, [load]);

  return { raw, status, lost, known, reload: load };
}
