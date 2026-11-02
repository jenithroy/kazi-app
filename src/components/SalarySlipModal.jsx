import { useId, useState } from "react";
import EditCard, { Field, NumberInput } from "./EditCard";
import { enterAdvance, thenAdvance } from "./finance/flow";
import Select from "./Select";
import { roundAmount } from "../utils/format";
import { openPrintWindow, slipDocument, slipTotals, slipView } from "../lib/salarySlip";
import "./salary-slip.css";

export default function SalarySlipModal({ initialData, employees = [], onClose }) {
  // the starting values (and what they default to) are lib/salarySlip.js's, shared with the monthly payroll run's printing
  const [init] = useState(() => slipView(initialData));
  const [empId, setEmpId] = useState(init.empId);
  const [empName, setEmpName] = useState(init.empName);
  const [designation, setDesignation] = useState(init.designation);
  const [monthYear, setMonthYear] = useState(init.monthYear);        // e.g. Jul-26

  // Earnings
  const [basicSalary, setBasicSalary] = useState(init.basicSalary);
  const [allowances, setAllowances] = useState(init.allowances);
  const [otSalary, setOtSalary] = useState(init.otSalary);
  const [receivableDue, setReceivableDue] = useState(init.receivableDue);

  // Deductions
  const [advance, setAdvance] = useState(init.advance);
  const [taxRatePct, setTaxRatePct] = useState(init.taxRatePct); // default 1% tax
  const [incomeTaxCustom, setIncomeTaxCustom] = useState(init.incomeTaxCustom);
  const [leaveDayDeduction, setLeaveDayDeduction] = useState(init.leaveDayDeduction);
  const [otherPayment, setOtherPayment] = useState(init.otherPayment);

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

  // Tax (1% of basic, or the figure a record carries), the totals and the net: lib/salarySlip.js
  const { computedTax, totalEarnings, totalDeductions, netSalary } = slipTotals({
    basicSalary, allowances, otSalary, receivableDue, advance, taxRatePct, incomeTaxCustom, leaveDayDeduction, otherPayment,
  });

  /* ── Direct Print Function ── */
  const handlePrint = () => openPrintWindow(slipDocument([{
    empId, empName, designation, monthYear, basicSalary, allowances, otSalary, receivableDue, advance, taxRatePct,
    computedTax, leaveDayDeduction, otherPayment, totalEarnings, totalDeductions, netSalary,
  }]));


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
