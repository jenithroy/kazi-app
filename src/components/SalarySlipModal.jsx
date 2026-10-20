import { useId, useState } from "react";
import EditCard, { Field, NumberInput } from "./EditCard";
import { enterAdvance, thenAdvance } from "./finance/flow";
import Select from "./Select";
import { roundAmount } from "../utils/format";
import "./salary-slip.css";

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

  const uid = useId();
  const id = (k) => `${uid}-${k}`;
  const type = (setter) => (e) => setter(e.target.value);

  // A slip is a throwaway, but not one to lose by a stray Escape or a click outside: the card asks first once anything was typed
  // (and not again once it has been printed). Enter moves to the next field and never prints (the old dialog had no form, so Enter did nothing).
  const snap = JSON.stringify([empId, empName, designation, monthYear, basicSalary, allowances, otSalary, receivableDue, advance, taxRatePct, incomeTaxCustom, leaveDayDeduction, otherPayment]);
  const [saved, setSaved] = useState(snap);          // what the fields held when the card opened, or when it was last printed
  const flow = { onKeyDown: (e) => enterAdvance(e) };

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
    if (!printWin) return false;

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


  const picked = employees.some((e) => e.name === empName) ? empName : "";

  const personMain = (
    <div className="ss-flow" {...flow}>
      {employees.length > 0 && (
        <Field label="Pick someone" htmlFor={id("who")} wide hint="Fills in their name, position and basic pay. Every field stays editable.">
          <Select
            id={id("who")} label="Pick someone" value={picked} onChange={thenAdvance(handleEmployeeSelect)} placeholder="Custom (type it in)"
            options={[{ value: "", label: "Custom (type it in)" }, ...employees.map((e) => ({ value: e.name, label: e.name, hint: e.role || "Employee" }))]}
          />
        </Field>
      )}
      <Field label="Employee ID" htmlFor={id("eid")}>
        <input id={id("eid")} type="text" autoComplete="off" value={empId} placeholder="e.g. EMP-001" onChange={type(setEmpId)} />
      </Field>
      <Field label="Employee name" htmlFor={id("name")}>
        <input id={id("name")} type="text" autoComplete="off" value={empName} placeholder="Employee name" onChange={type(setEmpName)} />
      </Field>
      <Field label="Designation" htmlFor={id("des")}>
        <input id={id("des")} type="text" autoComplete="off" value={designation} placeholder="e.g. Manager" onChange={type(setDesignation)} />
      </Field>
      <Field label="Month and year" htmlFor={id("my")}>
        <input id={id("my")} type="text" autoComplete="off" value={monthYear} placeholder="e.g. Jul-26" onChange={type(setMonthYear)} />
      </Field>
    </div>
  );

  const payMain = (
    <div className="ss-flow" {...flow}>
      <span className="ec-cap ec-wide">Earnings</span>
      <Field label="Basic salary" htmlFor={id("basic")}>
        <NumberInput min={undefined} id={id("basic")} unit="NPR" value={basicSalary} onChange={type(setBasicSalary)} />
      </Field>
      <Field label="Allowances" htmlFor={id("allow")}>
        <NumberInput min={undefined} id={id("allow")} unit="NPR" value={allowances} placeholder="0" onChange={type(setAllowances)} />
      </Field>
      <Field label="OT salary" htmlFor={id("ot")}>
        <NumberInput min={undefined} id={id("ot")} unit="NPR" value={otSalary} placeholder="0" onChange={type(setOtSalary)} />
      </Field>
      <Field label="Receivable due" htmlFor={id("rec")}>
        <NumberInput min={undefined} id={id("rec")} unit="NPR" value={receivableDue} placeholder="0" onChange={type(setReceivableDue)} />
      </Field>
      <span className="ec-cap ec-wide ss-gap">Deductions</span>
      <Field label="Advance" htmlFor={id("adv")}>
        <NumberInput min={undefined} id={id("adv")} unit="NPR" value={advance} placeholder="0" onChange={type(setAdvance)} />
      </Field>
      <Field label="Income tax rate" htmlFor={id("tax")}>
        <NumberInput min={undefined} id={id("tax")} unit="%" value={taxRatePct} placeholder="1" onChange={(e) => { setTaxRatePct(e.target.value); setIncomeTaxCustom(null); }} />
      </Field>
      <Field label="Leave day deduction" htmlFor={id("leave")}>
        <NumberInput min={undefined} id={id("leave")} unit="NPR" value={leaveDayDeduction} placeholder="0" onChange={type(setLeaveDayDeduction)} />
      </Field>
      <Field label="Other payment or deduction" htmlFor={id("other")}>
        <NumberInput min={undefined} id={id("other")} unit="NPR" value={otherPayment} placeholder="0" onChange={type(setOtherPayment)} />
      </Field>
    </div>
  );

  // The white sheet is the printed document, drawn as it will print: it keeps its own paper colours in both themes.
  const preview = (
    <div className="ec-block ec-wide ss-paper">
      <span className="ec-cap">Preview, exactly as printed</span>
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
    </div>
  );

  return (
    <EditCard
      className="ss-card"
      title="Monthly salary slip"
      subtitle="Fill it in or pick someone, then print"
      sections={[
        { id: "who", label: "Employee", main: personMain },
        { id: "pay", label: "Earnings and deductions", main: payMain },
      ]}
      side={preview}
      closeLabel="Close"
      submitLabel="Print salary slip"
      savingLabel="Opening…"
      dirty={snap !== saved}
      onSave={async () => {
        if (handlePrint() === false) return { ok: false, message: "Your browser blocked the print window. Allow pop-ups for this site, then print again." };
        setSaved(snap);
        return { ok: true, keepOpen: true };
      }}
      onClose={onClose}
    />
  );
}
