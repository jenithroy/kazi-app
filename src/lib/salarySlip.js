/**
 * The printed salary slip, as plain functions: what a slip adds up to, the page it prints on, and how it is opened for printing.
 * The Salary slip card (components/SalarySlipModal.jsx) and the monthly payroll run (components/finance/cards/PayrollRunCard.jsx)
 * both print through here, so a slip is the same document whichever way it was made. One slip prints exactly as it always has
 * (it is a compliance document); several print one to a page.
 *
 * A "view" is everything a slip prints: the person, the month, each line, the tax, and the three totals.
 */
import { roundAmount } from "../utils/format";

/** "Jul-26": the month a slip is for, from a record's month name and year, else this month. */
export function monthYearOf(d = {}) {
  if (d.month && d.year) return `${String(d.month).slice(0, 3)}-${String(d.year).slice(-2)}`;
  const now = new Date();
  return `${now.toLocaleString("default", { month: "short" })}-${String(now.getFullYear()).slice(-2)}`;
}

/**
 * What the lines add up to. Tax is 1% of the basic at `taxRatePct`, unless a figure was given (`incomeTaxCustom`: a record that
 * carries its own TDS), which is used as it is. The net is never below nothing.
 */
export function slipTotals({ basicSalary, allowances, otSalary, receivableDue, advance, taxRatePct, incomeTaxCustom, leaveDayDeduction, otherPayment }) {
  // Auto-calculated Tax (1% of basic or custom)
  const computedTax = incomeTaxCustom !== null ? Number(incomeTaxCustom) : Math.round((Number(basicSalary) * (Number(taxRatePct) / 100)) * 100) / 100;
  // Earnings Total
  const totalEarnings = Number(basicSalary || 0) + Number(allowances || 0) + Number(otSalary || 0) + Number(receivableDue || 0);
  // Deductions Total
  const totalDeductions = Number(advance || 0) + computedTax + Number(leaveDayDeduction || 0) + Number(otherPayment || 0);
  // Net Salary
  const netSalary = Math.max(0, totalEarnings - totalDeductions);
  return { computedTax, totalEarnings, totalDeductions, netSalary };
}

/** A slip's starting values from a record (or from nothing): the same defaults whether the card opens it or the run prints it. */
export function slipView(d) {
  const initialData = d || {};
  const base = {
    empId: initialData.empId || "EMP-001",
    empName: initialData.empName || initialData.name || initialData.staffName || "",
    designation: initialData.designation || initialData.role || "",
    monthYear: initialData.monthYear || monthYearOf(initialData),
    basicSalary: initialData.basicSalaryNPR ?? initialData.basicNPR ?? 0,
    allowances: initialData.bonusNPR ?? 0,
    otSalary: initialData.otSalary ?? 0,
    receivableDue: initialData.receivableDue ?? 0,
    advance: initialData.advance ?? 0,
    taxRatePct: initialData.taxRatePct ?? 1, // default 1% tax
    incomeTaxCustom: initialData.incomeTax ?? null,
    leaveDayDeduction: initialData.lateDeductionNPR ?? 0,
    otherPayment: initialData.pfDeductionNPR ?? 0,
  };
  return { ...base, ...slipTotals(base) };
}

const SLIP_CSS = `
    @page {
      size: A4 portrait;
      margin: 15mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      background: #fff;
      color: #000;
      padding: 20px;
    }
    .slip-container {
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      padding: 10px;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 22px;
      font-weight: bold;
      color: #2e7d32;
      margin-bottom: 4px;
    }
    .header h2 {
      font-size: 18px;
      font-weight: 600;
      color: #000;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      border: 1.5px solid #000;
      padding: 6px 10px;
      font-size: 14px;
      vertical-align: middle;
    }
    .emp-table td {
      width: 25%;
    }
    .emp-table .label {
      font-weight: bold;
    }
    .emp-table .value {
      font-weight: 600;
    }
    .pay-table th {
      font-size: 15px;
      font-weight: bold;
      background-color: #f5f5f5;
    }
    .pay-table td.col-title {
      font-weight: 500;
      width: 30%;
    }
    .pay-table td.col-val {
      text-align: right;
      font-weight: bold;
      width: 20%;
    }
    .text-center {
      text-align: center;
    }
    .net-salary-row td {
      font-size: 16px;
      font-weight: bold;
    }
    .net-salary-val {
      color: #d32f2f;
      font-size: 18px;
      font-weight: bold;
      text-align: center;
    }
    .footer {
      margin-top: 50px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 0 20px;
    }
    .sig-block {
      font-size: 14px;
      font-weight: bold;
    }
    .sig-line {
      display: inline-block;
      min-width: 200px;
      border-bottom: 1.5px dotted #000;
      margin-left: 10px;
    }
`;

/** One slip's page, as html. */
export function slipBodyHtml(view) {
  const {
    empId, empName, designation, monthYear, basicSalary, allowances, otSalary, receivableDue, advance, taxRatePct,
    computedTax, leaveDayDeduction, otherPayment, totalEarnings, totalDeductions, netSalary,
  } = view;
  return `  <div class="slip-container">
    <div class="header">
      <h1>Kazi Manufacturing Pvt.Ltd</h1>
      <h2>Monthly Salary Slip</h2>
    </div>

    <!-- Employee Details Table -->
    <table class="emp-table">
      <tr>
        <td class="label">Employee ID</td>
        <td class="value">${empId || "-"}</td>
        <td class="label">Employee Name</td>
        <td class="value">${empName || "-"}</td>
      </tr>
      <tr>
        <td class="label">Designation</td>
        <td class="value">${designation || "-"}</td>
        <td class="label">Month & Year</td>
        <td class="value text-center" style="font-weight: bold;">${monthYear || "-"}</td>
      </tr>
    </table>

    <!-- Earnings & Deductions Table -->
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
          <td class="col-val">${roundAmount(basicSalary || 0).toLocaleString()}</td>
          <td class="col-title">Advance</td>
          <td class="col-val">${Number(advance || 0) > 0 ? roundAmount(advance).toLocaleString() : "-"}</td>
        </tr>
        <tr>
          <td class="col-title">Allowances</td>
          <td class="col-val">${Number(allowances || 0) > 0 ? roundAmount(allowances).toLocaleString() : "-"}</td>
          <td class="col-title">Income Tax (${taxRatePct}%)</td>
          <td class="col-val">${computedTax > 0 ? roundAmount(computedTax).toLocaleString() : "-"}</td>
        </tr>
        <tr>
          <td class="col-title">Ot Salary</td>
          <td class="col-val">${Number(otSalary || 0) > 0 ? roundAmount(otSalary).toLocaleString() : "-"}</td>
          <td class="col-title">Leave Day</td>
          <td class="col-val">${Number(leaveDayDeduction || 0) > 0 ? roundAmount(leaveDayDeduction).toLocaleString() : "0"}</td>
        </tr>
        <tr>
          <td class="col-title">Receivable Due</td>
          <td class="col-val">${Number(receivableDue || 0) > 0 ? roundAmount(receivableDue).toLocaleString() : "-"}</td>
          <td class="col-title">Other Payment</td>
          <td class="col-val">${Number(otherPayment || 0) > 0 ? roundAmount(otherPayment).toLocaleString() : "-"}</td>
        </tr>
        <tr style="background: #fafafa;">
          <td class="col-title" style="font-weight: bold;">Total</td>
          <td class="col-val" style="font-size: 15px;">${roundAmount(totalEarnings).toLocaleString()}</td>
          <td class="col-title" style="font-weight: bold;">Total</td>
          <td class="col-val" style="font-size: 15px;">${roundAmount(totalDeductions).toLocaleString()}</td>
        </tr>
        <tr class="net-salary-row">
          <td class="col-title" style="font-weight: bold;">Net Salary</td>
          <td class="net-salary-val">${roundAmount(netSalary).toLocaleString()}</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>

    <!-- Footer Signatures -->
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

/**
 * The whole document for one slip or several. One slip is byte for byte the page the card has always printed; several are the
 * same pages, each starting on a new sheet.
 */
export function slipDocument(views) {
  const one = views.length === 1;
  const first = views[0];
  const empName = first.empName;
  const monthYear = first.monthYear;
  const title = one ? `Salary Slip - ${empName || "Employee"} (${monthYear})` : `Salary Slips - ${monthYear} (${views.length} people)`;
  const css = one ? SLIP_CSS : `${SLIP_CSS}    .slip-container + .slip-container { page-break-before: always; break-before: page; }\n`;
  const bodies = views.map(slipBodyHtml).join("\n");
  return `\n<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <title>${title}</title>\n  <style>${css}  </style>\n</head>\n<body>\n${bodies}\n</body>\n</html>\n    `;
}

/**
 * Open the print window and print. False when the browser blocked the window (the caller says so), else true.
 * It asks to print once the page has loaded and again after a moment, as the card always did, in case the load event is missed.
 */
export function openPrintWindow(html) {
  const printWin = window.open("", "_blank", "width=850,height=1100");
  if (!printWin) return false;
  printWin.document.write(html);
  printWin.document.close();
  printWin.onload = () => {
    setTimeout(() => {
      printWin.focus();
      printWin.print();
    }, 300);
  };
  setTimeout(() => {
    printWin.focus();
    printWin.print();
  }, 800);
  return true;
}
