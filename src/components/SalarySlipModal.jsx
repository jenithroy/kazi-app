import { useState } from "react";
import { roundAmount } from "../utils/format";

export default function SalarySlipModal({ initialData, employees = [], onClose }) {
  const [empId, setEmpId] = useState(initialData?.empId || "EMP-001");
  const [empName, setEmpName] = useState(initialData?.empName || initialData?.name || initialData?.staffName || "");
  const [designation, setDesignation] = useState(initialData?.designation || initialData?.role || "");
  
  // Format default month & year (e.g. Jul-26 or July 2026)
  const defaultMonthYear = () => {
    if (initialData?.month && initialData?.year) {
      const shortMonth = initialData.month.slice(0, 3);
      const shortYear = String(initialData.year).slice(-2);
      return `${shortMonth}-${shortYear}`;
    }
    const d = new Date();
    const shortMonth = d.toLocaleString("default", { month: "short" });
    const shortYear = String(d.getFullYear()).slice(-2);
    return `${shortMonth}-${shortYear}`;
  };

  const [monthYear, setMonthYear] = useState(initialData?.monthYear || defaultMonthYear());

  // Earnings
  const [basicSalary, setBasicSalary] = useState(initialData?.basicSalaryNPR ?? initialData?.basicNPR ?? 0);
  const [allowances, setAllowances] = useState(initialData?.bonusNPR ?? 0);
  const [otSalary, setOtSalary] = useState(initialData?.otSalary ?? 0);
  const [receivableDue, setReceivableDue] = useState(initialData?.receivableDue ?? 0);

  // Deductions
  const [advance, setAdvance] = useState(initialData?.advance ?? 0);
  const [taxRatePct, setTaxRatePct] = useState(initialData?.taxRatePct ?? 1); // default 1% tax
  const [incomeTaxCustom, setIncomeTaxCustom] = useState(initialData?.incomeTax ?? null);
  const [leaveDayDeduction, setLeaveDayDeduction] = useState(initialData?.lateDeductionNPR ?? 0);
  const [otherPayment, setOtherPayment] = useState(initialData?.pfDeductionNPR ?? 0);

  // Sync when employee is chosen from dropdown in modal
  const handleEmployeeSelect = (selectedName) => {
    const emp = employees.find((e) => e.name === selectedName);
    if (emp) {
      setEmpName(emp.name || "");
      setDesignation(emp.role || "");
      setBasicSalary(Number(emp.basicSalaryNPR || 0));
      // Auto assign emp ID if available
      if (emp.id) {
        const shortId = "EMP-" + emp.id.slice(-4).toUpperCase();
        setEmpId(shortId);
      }
    }
  };

  // Auto-calculated Tax (1% of basic or custom)
  const computedTax = incomeTaxCustom !== null ? Number(incomeTaxCustom) : Math.round((Number(basicSalary) * (Number(taxRatePct) / 100)) * 100) / 100;

  // Earnings Total
  const totalEarnings = Number(basicSalary || 0) + Number(allowances || 0) + Number(otSalary || 0) + Number(receivableDue || 0);

  // Deductions Total
  const totalDeductions = Number(advance || 0) + computedTax + Number(leaveDayDeduction || 0) + Number(otherPayment || 0);

  // Net Salary
  const netSalary = Math.max(0, totalEarnings - totalDeductions);

  /* ── Direct Print Function ── */
  const handlePrint = () => {
    const printWin = window.open("", "_blank", "width=850,height=1100");
    if (!printWin) {
      alert("Please allow pop-ups to print the salary slip.");
      return;
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Salary Slip - ${empName || "Employee"} (${monthYear})</title>
  <style>
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
  </style>
</head>
<body>
  <div class="slip-container">
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
  </div>
</body>
</html>
    `;

    printWin.document.write(htmlContent);
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
  };

  return (
    <div className="modal-overlay" style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0, 0, 0, 0.65)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 9999,
      padding: 16, overflowY: "auto"
    }}>
      <div className="modal-content" style={{
        background: "var(--card, #fff)", borderRadius: 12,
        width: "100%", maxWidth: 960, maxHeight: "92vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 40px rgba(0,0,0,0.3)", border: "1.5px solid var(--line, #e2e8f0)",
        overflow: "hidden"
      }}>
        {/* Modal Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1.5px solid var(--line, #e2e8f0)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "var(--bg-2, #f8fafc)"
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--ink, #0f172a)" }}>
              🖨️ Monthly Salary Slip Generator
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-4, #64748b)" }}>
              Customize fields manually or select an employee, then print directly.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="primary-button" onClick={handlePrint} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span>🖨️ Print Salary Slip</span>
            </button>
            <button className="ghost-button" onClick={onClose} style={{ fontSize: 16, padding: "4px 12px" }}>
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body: Left Inputs | Right Preview */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, padding: 20, overflowY: "auto" }}>
          
          {/* Editable Inputs Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--mint-deep, #2e7d32)", borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
              ✏️ Editable Fields
            </h4>

            {employees.length > 0 && (
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Quick Select Employee
                <select
                  style={{ width: "100%", padding: "7px 10px", marginTop: 4, borderRadius: 6, border: "1px solid var(--line)" }}
                  onChange={(e) => handleEmployeeSelect(e.target.value)}
                  value={empName}
                >
                  <option value="">— Custom Input / Select Staff —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.name}>
                      {e.name} ({e.role || "Employee"})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Employee ID
                <input
                  type="text"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  placeholder="e.g. EMP-001"
                  style={{ width: "100%", padding: "6px 8px", marginTop: 2, borderRadius: 6, border: "1px solid var(--line)", fontSize: 13 }}
                />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Employee Name
                <input
                  type="text"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  placeholder="Employee Name"
                  style={{ width: "100%", padding: "6px 8px", marginTop: 2, borderRadius: 6, border: "1px solid var(--line)", fontSize: 13 }}
                />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Designation
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. CEO / Manager"
                  style={{ width: "100%", padding: "6px 8px", marginTop: 2, borderRadius: 6, border: "1px solid var(--line)", fontSize: 13 }}
                />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Month & Year
                <input
                  type="text"
                  value={monthYear}
                  onChange={(e) => setMonthYear(e.target.value)}
                  placeholder="e.g. Jul-26"
                  style={{ width: "100%", padding: "6px 8px", marginTop: 2, borderRadius: 6, border: "1px solid var(--line)", fontSize: 13 }}
                />
              </label>
            </div>

            <div style={{ background: "rgba(46, 125, 50, 0.04)", padding: 12, borderRadius: 8, border: "1px solid rgba(46, 125, 50, 0.2)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--mint-deep, #2e7d32)", marginBottom: 8 }}>
                💰 Earnings (NPR)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 12 }}>
                  Basic Salary
                  <input
                    type="number"
                    min="0"
                    value={basicSalary}
                    onChange={(e) => setBasicSalary(e.target.value)}
                    style={{ width: "100%", padding: "5px 8px", marginTop: 2, borderRadius: 4, border: "1px solid var(--line)", fontSize: 13 }}
                  />
                </label>
                <label style={{ fontSize: 12 }}>
                  Allowances
                  <input
                    type="number"
                    min="0"
                    value={allowances}
                    onChange={(e) => setAllowances(e.target.value)}
                    placeholder="0"
                    style={{ width: "100%", padding: "5px 8px", marginTop: 2, borderRadius: 4, border: "1px solid var(--line)", fontSize: 13 }}
                  />
                </label>
                <label style={{ fontSize: 12 }}>
                  OT Salary
                  <input
                    type="number"
                    min="0"
                    value={otSalary}
                    onChange={(e) => setOtSalary(e.target.value)}
                    placeholder="0"
                    style={{ width: "100%", padding: "5px 8px", marginTop: 2, borderRadius: 4, border: "1px solid var(--line)", fontSize: 13 }}
                  />
                </label>
                <label style={{ fontSize: 12 }}>
                  Receivable Due
                  <input
                    type="number"
                    min="0"
                    value={receivableDue}
                    onChange={(e) => setReceivableDue(e.target.value)}
                    placeholder="0"
                    style={{ width: "100%", padding: "5px 8px", marginTop: 2, borderRadius: 4, border: "1px solid var(--line)", fontSize: 13 }}
                  />
                </label>
              </div>
            </div>

            <div style={{ background: "rgba(211, 47, 47, 0.04)", padding: 12, borderRadius: 8, border: "1px solid rgba(211, 47, 47, 0.2)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--terra, #d32f2f)", marginBottom: 8 }}>
                🔻 Deductions (NPR)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 12 }}>
                  Advance
                  <input
                    type="number"
                    min="0"
                    value={advance}
                    onChange={(e) => setAdvance(e.target.value)}
                    placeholder="0"
                    style={{ width: "100%", padding: "5px 8px", marginTop: 2, borderRadius: 4, border: "1px solid var(--line)", fontSize: 13 }}
                  />
                </label>
                <label style={{ fontSize: 12 }}>
                  Income Tax Rate (%)
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={taxRatePct}
                    onChange={(e) => { setTaxRatePct(e.target.value); setIncomeTaxCustom(null); }}
                    placeholder="1"
                    style={{ width: "100%", padding: "5px 8px", marginTop: 2, borderRadius: 4, border: "1px solid var(--line)", fontSize: 13 }}
                  />
                </label>
                <label style={{ fontSize: 12 }}>
                  Leave Day Deduction
                  <input
                    type="number"
                    min="0"
                    value={leaveDayDeduction}
                    onChange={(e) => setLeaveDayDeduction(e.target.value)}
                    placeholder="0"
                    style={{ width: "100%", padding: "5px 8px", marginTop: 2, borderRadius: 4, border: "1px solid var(--line)", fontSize: 13 }}
                  />
                </label>
                <label style={{ fontSize: 12 }}>
                  Other Payment / Deduction
                  <input
                    type="number"
                    min="0"
                    value={otherPayment}
                    onChange={(e) => setOtherPayment(e.target.value)}
                    placeholder="0"
                    style={{ width: "100%", padding: "5px 8px", marginTop: 2, borderRadius: 4, border: "1px solid var(--line)", fontSize: 13 }}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Live Preview Card */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <h4 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 600, color: "var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📄 Live Print Preview</span>
              <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-4)" }}>Exactly as printed</span>
            </h4>

            <div style={{
              background: "#ffffff", color: "#000000", border: "1.5px solid #000000",
              padding: 16, borderRadius: 4, fontFamily: "Arial, sans-serif", fontSize: 13
            }}>
              {/* Header */}
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 18, fontWeight: "bold", color: "#2e7d32" }}>
                  Kazi Manufacturing Pvt.Ltd
                </div>
                <div style={{ fontSize: 15, fontWeight: "bold", color: "#000", marginTop: 2 }}>
                  Monthly Salary Slip
                </div>
              </div>

              {/* Table 1: Emp Details */}
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12, border: "1.5px solid #000" }}>
                <tbody>
                  <tr>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", fontWeight: "bold", width: "25%" }}>Employee ID</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", width: "25%" }}>{empId || "-"}</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", fontWeight: "bold", width: "25%" }}>Employee Name</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", fontWeight: "bold", width: "25%" }}>{empName || "-"}</td>
                  </tr>
                  <tr>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", fontWeight: "bold" }}>Designation</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", fontWeight: "bold" }}>{designation || "-"}</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", fontWeight: "bold" }}>Month & Year</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "center", fontWeight: "bold" }}>{monthYear || "-"}</td>
                  </tr>
                </tbody>
              </table>

              {/* Table 2: Pay details */}
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14, border: "1.5px solid #000" }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    <th style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "left", fontSize: 13 }}>Earnings</th>
                    <th style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right", width: "20%" }}></th>
                    <th style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "left", fontSize: 13 }}>Deduction</th>
                    <th style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right", width: "20%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: "1px solid #000", padding: "4px 8px" }}>Basic Salary</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right", fontWeight: "bold" }}>{roundAmount(basicSalary || 0).toLocaleString()}</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px" }}>Advance</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right", fontWeight: "bold" }}>{Number(advance || 0) > 0 ? roundAmount(advance).toLocaleString() : "-"}</td>
                  </tr>
                  <tr>
                    <td style={{ border: "1px solid #000", padding: "4px 8px" }}>Allowances</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right", fontWeight: "bold" }}>{Number(allowances || 0) > 0 ? roundAmount(allowances).toLocaleString() : "-"}</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px" }}>Income Tax ({taxRatePct}%)</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right", fontWeight: "bold" }}>{computedTax > 0 ? roundAmount(computedTax).toLocaleString() : "-"}</td>
                  </tr>
                  <tr>
                    <td style={{ border: "1px solid #000", padding: "4px 8px" }}>Ot Salary</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right", fontWeight: "bold" }}>{Number(otSalary || 0) > 0 ? roundAmount(otSalary).toLocaleString() : "-"}</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px" }}>Leave Day</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right", fontWeight: "bold" }}>{Number(leaveDayDeduction || 0) > 0 ? roundAmount(leaveDayDeduction).toLocaleString() : "0"}</td>
                  </tr>
                  <tr>
                    <td style={{ border: "1px solid #000", padding: "4px 8px" }}>Receivable Due</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right", fontWeight: "bold" }}>{Number(receivableDue || 0) > 0 ? roundAmount(receivableDue).toLocaleString() : "-"}</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px" }}>Other Payment</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right", fontWeight: "bold" }}>{Number(otherPayment || 0) > 0 ? roundAmount(otherPayment).toLocaleString() : "-"}</td>
                  </tr>
                  <tr style={{ background: "#fafafa" }}>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", fontWeight: "bold" }}>Total</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right", fontWeight: "bold" }}>{roundAmount(totalEarnings).toLocaleString()}</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", fontWeight: "bold" }}>Total</td>
                    <td style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right", fontWeight: "bold" }}>{roundAmount(totalDeductions).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style={{ border: "1px solid #000", padding: "6px 8px", fontWeight: "bold", fontSize: 14 }}>Net Salary</td>
                    <td style={{ border: "1px solid #000", padding: "6px 8px", textAlign: "center", fontWeight: "bold", color: "#d32f2f", fontSize: 15 }}>
                      {roundAmount(netSalary).toLocaleString()}
                    </td>
                    <td colSpan="2" style={{ border: "1px solid #000" }}></td>
                  </tr>
                </tbody>
              </table>

              {/* Signatures */}
              <div style={{ marginTop: 30, display: "flex", justifyContent: "space-between", padding: "0 10px", fontSize: 12, fontWeight: "bold" }}>
                <div>Signature .................................</div>
                <div>Director .................................</div>
              </div>
            </div>

            <button
              className="primary-button"
              onClick={handlePrint}
              style={{ marginTop: 14, padding: "10px 16px", display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}
            >
              <span>🖨️ Print Salary Slip</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
