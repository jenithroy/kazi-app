import { Finance } from '@/screens/finance/finance';

/**
 * The reference `Accounting.jsx` is `Finance.jsx` minus 5 tabs — same
 * `journal_entries` + `accounts` data, just Journal / Ledger / P&L / Balance
 * sheet. Rather than a parallel implementation (the old delta-based
 * `adjustments` mock is retired), Accounting is the shared Finance hub in
 * `variant="accounting"` (plan item 12).
 */
export function Accounting() {
  return <Finance variant="accounting" />;
}
