import { useEffect, useState } from "react";

/**
 * What the page area shows while a page's code is on its way (lib/lazyPages.js).
 *
 * Nothing for the first moment, so a page that is already downloaded (nearly always: they are fetched in the background
 * after sign-in) swaps in without a flash; after that, one quiet line, so a slow connection never looks like a frozen app.
 */
export default function PageLoading() {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), 250);
    return () => clearTimeout(timer);
  }, []);
  if (!late) return null;
  return <p role="status" style={{ margin: 0, padding: "24px 28px", fontSize: 14, color: "var(--ink-3)" }}>Loading…</p>;
}
