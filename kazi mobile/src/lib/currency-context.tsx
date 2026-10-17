import { useCallback, useEffect, useMemo, type ReactNode } from 'react';

import { moneyParts, toGBP, type Currency, type MoneyParts } from './currency';
import {
  refreshRate,
  setPrimaryCurrency,
  toggleCurrency,
  useCurrencyState,
} from './currency-store';
import { money, moneyCompact } from './money';

interface CurrencyContextValue {
  /** The currency the user wants amounts shown in. Defaults to NPR. */
  primary: Currency;
  /** The other currency, shown muted alongside `primary`. */
  secondary: Currency;
  /** NPR per 1 GBP — live once fetched, the fixed fallback until then. */
  rate: number;
  /** True when `rate` came from the live feed rather than the fallback constant. */
  live: boolean;
  /** When the live rate was fetched, epoch ms, or null. */
  fetchedAt: number | null;
  /** False until the persisted preference has loaded — screens can render NPR meanwhile. */
  ready: boolean;
  setPrimary: (cur: Currency) => void;
  toggle: () => void;
  /** Re-fetch the GBP rate now, ignoring the six-hour cache. */
  refresh: () => Promise<void>;
  /** Format an NPR amount in the user's preferred currency. */
  format: (npr: number, opts?: { compact?: boolean }) => string;
  /** Both display strings for an NPR amount: `{ primary, secondary }`. */
  parts: (npr: number, opts?: { compact?: boolean }) => MoneyParts;
}

/**
 * The preference itself lives in `currency-store.ts` — a module store, so the
 * plain formatters in `money.ts` can read it. This provider only kicks off the
 * rate fetch on boot; `useCurrency()` subscribes to the store directly, which
 * is why flipping the currency updates components the provider never re-renders.
 */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void refreshRate();
  }, []);

  return <>{children}</>;
}

export function useCurrency(): CurrencyContextValue {
  const { primary, secondary, rate, live, fetchedAt, ready } = useCurrencyState();

  const format = useCallback(
    (npr: number, opts?: { compact?: boolean }) => (opts?.compact ? moneyCompact(npr) : money(npr)),
    // `money()` reads the store rather than these values, so the rule can't see
    // that a new currency or rate has to produce a new callback. It does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [primary, rate],
  );

  const parts = useCallback(
    (npr: number, opts?: { compact?: boolean }) => moneyParts(npr, primary, opts?.compact, rate),
    [primary, rate],
  );

  return useMemo(
    () => ({
      primary,
      secondary,
      rate,
      live,
      fetchedAt,
      ready,
      setPrimary: setPrimaryCurrency,
      toggle: toggleCurrency,
      refresh: () => refreshRate(true),
      format,
      parts,
    }),
    [primary, secondary, rate, live, fetchedAt, ready, format, parts],
  );
}

/** The GBP value of an NPR amount at the live rate — for the few places that need the number, not the string. */
export function useGBP(): (npr: number) => number {
  const { rate } = useCurrencyState();
  return useCallback((npr: number) => toGBP(npr, rate), [rate]);
}
