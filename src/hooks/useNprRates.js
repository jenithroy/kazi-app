/**
 * What one unit of each of these currencies is worth in NPR today, for the attribution table's ROAS (order value is in NPR, spend is in the
 * ad account's own currency, and the two cannot be divided as they are). Fetched for the currencies that actually show up, here and nowhere
 * else. A currency that could not be fetched is stored as null, so its ROAS shows "—" rather than a wrong number or a "converting…" that
 * never ends; `retry()` asks again.
 *
 *   rates      { USD: 133.2, GBP: null }: a currency not in the map is still being fetched
 *   fetchedAt  when the last answer came
 *   hasError   at least one currency has no rate
 */
import { useEffect, useState } from "react";

export default function useNprRates(currencies) {
  const [rates, setRates] = useState({});
  const [fetchedAt, setFetchedAt] = useState(null);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const key = currencies.join(",");

  useEffect(() => {
    const missing = currencies.filter((c) => c && c !== "NPR" && !(c in rates));
    if (missing.length === 0) return undefined;
    let alive = true;
    setHasError(false);
    Promise.all(
      missing.map((c) => fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(c)}`)
        .then((r) => r.json())
        .then((d) => [c, d?.rates?.NPR || null])
        .catch(() => [c, null])),
    ).then((pairs) => {
      if (!alive) return;
      setRates((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
      setFetchedAt(new Date());
      if (pairs.some(([, v]) => v == null)) setHasError(true);
    });
    return () => { alive = false; };
    // `rates` is read to see what is still missing, not to run again when it fills in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retryCount]);

  // a retry asks again for the currencies that failed, so they are taken out of the map first
  const retry = () => {
    setRates((prev) => Object.fromEntries(Object.entries(prev).filter(([, v]) => v != null)));
    setRetryCount((n) => n + 1);
  };

  return { rates, fetchedAt, hasError, retry };
}
