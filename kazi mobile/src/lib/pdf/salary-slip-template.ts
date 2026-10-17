/**
 * The Kazi salary slip — a direct port of the web ERP's own print output
 * (kazi-app `src/components/SalarySlipModal.jsx` → `handlePrint`), so a slip
 * printed from the phone is the same document as one printed from the website:
 * same A4 portrait / 15mm margins, same Arial, the same green company line and
 * red net-salary figure, the same two-column Earnings|Deduction table with the
 * same row labels, the same `-` placeholders, and the same signature block.
 *
 * One builder serves both the in-app viewer (WebView) and `expo-print`, the
 * same arrangement `doc-template.ts` uses for invoices — preview and PDF
 * cannot drift apart.
 *
 * Reference behaviours kept deliberately:
 *   - `roundAmount` is sign-preserving round-half-away-from-zero, then grouped
 *     with `toLocaleString()`;
 *   - every figure except Basic Salary and the totals prints `-` when zero,
 *     and Leave Day prints `0` (not `-`) — an inconsistency in the original
 *     that is reproduced rather than tidied, so the sheets match;
 *   - net salary is clamped at zero.
 */

const GREEN = '#2e7d32';
const RED = '#d32f2f';

/** Everything the sheet prints. Figures are plain numbers in NPR. */
export interface SalarySlipData {
  /** Used for the PDF filename, not printed on the sheet. */
  fileName: string;
  empId: string;
  empName: string;
  designation: string;
  /** The reference's `Jul-26` short form. */
  monthYear: string;
  basicSalary: number;
  allowances: number;
  otSalary: number;
  receivableDue: number;
  advance: number;
  /** Printed in the row label, e.g. `Income Tax (1%)`. */
  taxRatePct: number;
  /** Overrides the rate calculation, mirroring the reference's custom-tax field. */
  incomeTax?: number | null;
  leaveDayDeduction: number;
  otherPayment: number;
}

export interface SalarySlipTotals {
  incomeTax: number;
  totalEarnings: number;
  totalDeductions: number;
  netSalary: number;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** kazi-app `utils/format.js` — sign-preserving round to a whole rupee. */
export function roundAmount(n: number): number {
  const num = Number(n) || 0;
  return Math.sign(num) * Math.round(Math.abs(num));
}

const money = (n: number) => roundAmount(n).toLocaleString('en-US');
/** The reference prints `-` for an empty figure rather than a zero. */
const moneyOrDash = (n: number, zero = '-') => (Number(n || 0) > 0 ? money(n) : zero);

/** The reference's arithmetic, verbatim. */
export function salarySlipTotals(s: SalarySlipData): SalarySlipTotals {
  const incomeTax =
    s.incomeTax != null
      ? Number(s.incomeTax)
      : Math.round(Number(s.basicSalary || 0) * (Number(s.taxRatePct || 0) / 100) * 100) / 100;
  const totalEarnings =
    Number(s.basicSalary || 0) + Number(s.allowances || 0) + Number(s.otSalary || 0) + Number(s.receivableDue || 0);
  const totalDeductions =
    Number(s.advance || 0) + incomeTax + Number(s.leaveDayDeduction || 0) + Number(s.otherPayment || 0);
  return { incomeTax, totalEarnings, totalDeductions, netSalary: Math.max(0, totalEarnings - totalDeductions) };
}

/** The sheet itself, without the surrounding viewport chrome. */
export function buildSalarySlipPage(s: SalarySlipData): string {
  const t = salarySlipTotals(s);
  return `<div class="slip-container">
    <div class="header">
      <h1>Kazi Manufacturing Pvt.Ltd</h1>
      <h2>Monthly Salary Slip</h2>
    </div>

    <table class="emp-table">
      <tr>
        <td class="label">Employee ID</td>
        <td class="value">${esc(s.empId) || '-'}</td>
        <td class="label">Employee Name</td>
        <td class="value">${esc(s.empName) || '-'}</td>
      </tr>
      <tr>
        <td class="label">Designation</td>
        <td class="value">${esc(s.designation) || '-'}</td>
        <td class="label">Month &amp; Year</td>
        <td class="value text-center" style="font-weight: bold;">${esc(s.monthYear) || '-'}</td>
      </tr>
    </table>

    <table class="pay-table">
      <thead>
        <tr>
          <th style="width: 30%; text-align: left;">Earnings</th>
          <th style="width: 20%; text-align: right;"></th>
          <th style="width: 30%; text-align: left;">Deduction</th>
          <th style="width: 20%; text-align: right;"></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="col-title">Basic Salary</td>
          <td class="col-val">${money(s.basicSalary || 0)}</td>
          <td class="col-title">Advance</td>
          <td class="col-val">${moneyOrDash(s.advance)}</td>
        </tr>
        <tr>
          <td class="col-title">Allowances</td>
          <td class="col-val">${moneyOrDash(s.allowances)}</td>
          <td class="col-title">Income Tax (${esc(String(s.taxRatePct))}%)</td>
          <td class="col-val">${moneyOrDash(t.incomeTax)}</td>
        </tr>
        <tr>
          <td class="col-title">Ot Salary</td>
          <td class="col-val">${moneyOrDash(s.otSalary)}</td>
          <td class="col-title">Leave Day</td>
          <td class="col-val">${moneyOrDash(s.leaveDayDeduction, '0')}</td>
        </tr>
        <tr>
          <td class="col-title">Receivable Due</td>
          <td class="col-val">${moneyOrDash(s.receivableDue)}</td>
          <td class="col-title">Other Payment</td>
          <td class="col-val">${moneyOrDash(s.otherPayment)}</td>
        </tr>
        <tr style="background: #fafafa;">
          <td class="col-title" style="font-weight: bold;">Total</td>
          <td class="col-val" style="font-size: 15px;">${money(t.totalEarnings)}</td>
          <td class="col-title" style="font-weight: bold;">Total</td>
          <td class="col-val" style="font-size: 15px;">${money(t.totalDeductions)}</td>
        </tr>
        <tr class="net-salary-row">
          <td class="col-title" style="font-weight: bold;">Net Salary</td>
          <td class="net-salary-val">${money(t.netSalary)}</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <div class="sig-block">
        Signature <span class="sig-line"></span>
      </div>
      <div class="sig-block">
        Director <span class="sig-line"></span>
      </div>
    </div>
  </div>`;
}

export interface SalarySlipHtmlOptions {
  /** Viewer only: grey ground, pinch-zoom, and an initial scale that fits the phone. */
  forScreen?: boolean;
  /** Viewer only: how much of the 800px sheet fits across the device. */
  screenScale?: number;
}

/**
 * Full HTML document. `forScreen` wraps the sheet for the in-app viewer;
 * otherwise it is the reference's print geometry, for `expo-print`.
 */
export function buildSalarySlipHtml(s: SalarySlipData, options: SalarySlipHtmlOptions = {}): string {
  const { forScreen, screenScale } = options;
  const fit = Math.min(1, Math.max(0.1, screenScale ?? 0.45));
  const viewport = forScreen
    ? `<meta name="viewport" content="width=840, initial-scale=${fit.toFixed(3)}, minimum-scale=${(fit * 0.75).toFixed(3)}, maximum-scale=5, user-scalable=yes" />`
    : '';
  const ground = forScreen
    ? 'background: #d4e2d4; padding: 14px 0;'
    : 'background: #fff;';
  const sheet = forScreen
    ? '.slip-container { background: #fff; box-shadow: 0 6px 20px rgba(0,0,0,0.25); padding: 28px; }'
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />${viewport}
<title>Salary Slip - ${esc(s.empName) || 'Employee'} (${esc(s.monthYear)})</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: Arial, Helvetica, sans-serif; ${ground} color: #000; padding: 20px; }
  .slip-container { width: 100%; max-width: 800px; margin: 0 auto; background: #fff; padding: 10px; }
  ${sheet}
  .header { text-align: center; margin-bottom: 20px; }
  .header h1 { font-size: 22px; font-weight: bold; color: ${GREEN}; margin-bottom: 4px; }
  .header h2 { font-size: 18px; font-weight: 600; color: #000; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th, td { border: 1.5px solid #000; padding: 6px 10px; font-size: 14px; vertical-align: middle; }
  .emp-table td { width: 25%; }
  .emp-table .label { font-weight: bold; }
  .emp-table .value { font-weight: 600; }
  .pay-table th { font-size: 15px; font-weight: bold; background-color: #f5f5f5; }
  .pay-table td.col-title { font-weight: 500; width: 30%; }
  .pay-table td.col-val { text-align: right; font-weight: bold; width: 20%; }
  .text-center { text-align: center; }
  .net-salary-row td { font-size: 16px; font-weight: bold; }
  .net-salary-val { color: ${RED}; font-size: 18px; font-weight: bold; text-align: center; }
  .footer { margin-top: 50px; display: flex; justify-content: space-between; align-items: flex-end; padding: 0 20px; }
  .sig-block { font-size: 14px; font-weight: bold; }
  .sig-line { display: inline-block; min-width: 200px; border-bottom: 1.5px dotted #000; margin-left: 10px; }
</style></head><body>${buildSalarySlipPage(s)}</body></html>`;
}
