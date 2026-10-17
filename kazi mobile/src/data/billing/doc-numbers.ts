/**
 * IRD document numbers come from Postgres, never from the loaded list.
 *
 * `next_doc_number(kind, fiscal_year)` is `security definer` and allocates in a
 * single `INSERT … ON CONFLICT DO UPDATE … RETURNING`, so two people raising an
 * invoice at the same moment queue on the row lock and take consecutive numbers
 * instead of both taking the same one. It also refuses callers who may not edit
 * billing, so nobody can burn a number and leave a gap in the books.
 * Formatting (prefix + 3-digit pad, growing past it) is the function's job too.
 *
 * Mirrors `getNextNumber` / `resequenceDocNumbers` in the web app's
 * `src/utils/billing.jsx`.
 */

import { currentFiscalYear, fiscalYearForAD } from '@/lib/nepaliDate';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

import type { DocType } from './types';

const PREFIX: Record<DocType, string> = { invoice: 'INV', challan: 'CH', quotation: 'QT' };

export interface AllocatedNumber {
  /** e.g. `INV-027`. */
  number: string;
  /** e.g. `2083/84` — stored on the row, so its number and its year always agree. */
  fiscalYear: string;
}

/** Local dev with no Supabase: max+1 over what's loaded. Never used against live data. */
function localNext(kind: DocType, existing: string[]): string {
  const re = new RegExp(`^${PREFIX[kind]}-(\\d+)$`);
  const max = existing.reduce((hi, n) => {
    const m = re.exec(n);
    return m ? Math.max(hi, parseInt(m[1], 10)) : hi;
  }, 0);
  return `${PREFIX[kind]}-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Draw the next number for a document dated `dateISO`. The fiscal year comes
 * from the document's own date (falling back to today's), so a backdated
 * document is numbered into the year it belongs to. Quotations are a single
 * all-time series and the counter ignores the year — it is still passed, and
 * still stored on the row, exactly as the web app does it.
 */
export async function allocateDocNumber(kind: DocType, dateISO: string, existing: string[]): Promise<AllocatedNumber> {
  const fiscalYear = (dateISO ? fiscalYearForAD(dateISO) : currentFiscalYear()).label;
  if (!isSupabaseConfigured) return { number: localNext(kind, existing), fiscalYear };
  const { data, error } = await getSupabase().rpc('next_doc_number', { kind, fiscal_year: fiscalYear });
  if (error) throw error;
  return { number: String(data), fiscalYear };
}

/**
 * Put a series back in date order so the earliest document is 001 — what makes
 * a backdated document's number right. Idempotent, and quotations pass no year
 * because they are one series for all time.
 */
export async function resequenceDocNumbers(kind: DocType, fiscalYear: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const { data, error } = await getSupabase().rpc('resequence_doc_numbers', {
    p_kind: kind,
    p_fiscal_year: kind === 'quotation' ? null : fiscalYear,
  });
  if (error) throw error;
  return Number(data) || 0;
}
