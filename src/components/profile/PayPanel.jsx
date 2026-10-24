/**
 * The Pay tab of a profile card: the person's basic pay (where the directory lets it through) and their payroll records, the latest
 * month in full and the earlier months below, each with a button that opens the salary slip for it.
 *
 * The records are the Payroll page's own (`finance_payroll`), and the slip is the same salary slip the Payroll and Employees pages open,
 * started from the same values, so what is printed from here is what is printed from there. The card only shows this tab to someone
 * the database lets read them: the person themselves, or a position with the Payroll tab (lib/personProfile.js `seesOf`).
 */
import { lazy, Suspense, useState } from "react";
import { Icons, fmt } from "../ui";
import { usePersonPay } from "../../hooks/usePersonProfile";
import { slipOf } from "../../lib/personPay";
import { Skel } from "./ProfileBits";

// The slip is a whole editor and its print template: fetched only when somebody opens one.
const SalarySlipModal = lazy(() => import("../SalarySlipModal"));

const FIRST_MONTHS = 6;      // earlier months shown before "Show all"

const amount = (n) => (Number(n) ? fmt.npr(n) : "—");

function Latest({ r, onSlip }) {
  const lines = [
    ["Basic", r.basicNPR], ["Bonus", r.bonusNPR], ["Gross", r.grossNPR || null],
    ["Late cut", r.lateDeductionNPR ? -r.lateDeductionNPR : null], ["PF or other", r.pfDeductionNPR ? -r.pfDeductionNPR : null],
  ].filter(([, v]) => Number(v));
  return (
    <div className="kpp-latest">
      <div className="kpp-latest-h">
        <span className="kpp-latest-m">{r.month} {r.year}</span>
        <button type="button" className="ghost-button kpp-slipbtn" onClick={() => onSlip(r)}>
          <Icons.File size={14} sw={1.9} aria-hidden="true" /> Salary slip
        </button>
      </div>
      <div className="kpp-fig"><b>{amount(r.netNPR)}</b><span>net pay</span></div>
      {lines.length > 0 && (
        <dl className="kpp-kv">
          {lines.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd className={v < 0 ? "is-neg" : undefined}>{v < 0 ? `− ${fmt.npr(-v)}` : fmt.npr(v)}</dd></div>
          ))}
        </dl>
      )}
    </div>
  );
}

export default function PayPanel({ person, basicPay, enabled = true }) {
  const pay = usePersonPay(person.id, { enabled });
  const [slip, setSlip] = useState(null);
  const [all, setAll] = useState(false);

  const [latest, ...older] = pay.rows;
  const earlier = all ? older : older.slice(0, FIRST_MONTHS);

  return (
    <section className="kprof-sec kpp-pay" aria-label="Pay">
      {basicPay != null && Number(basicPay) > 0 && (
        <div className="kprof-row">
          <span className="kprof-k">Basic pay</span>
          <span className="kprof-v">{fmt.npr(basicPay)} <span className="kprof-note kpp-inline">a month</span></span>
        </div>
      )}

      {pay.status === "error" && (
        <div role="alert">
          <p className="kprof-note kprof-note--err">{pay.error}</p>
          <button type="button" className="ghost-button" onClick={pay.reload}>Try again</button>
        </div>
      )}
      {(pay.status === "loading" || pay.status === "idle") && <div className="kpp-wait" aria-hidden="true"><Skel w="55%" /><Skel w="100%" /><Skel w="80%" /></div>}

      {pay.status === "ready" && !latest && <p className="kprof-note">No pay records yet.</p>}

      {pay.status === "ready" && latest && (
        <>
          <Latest r={latest} onSlip={(r) => setSlip(slipOf(r))} />
          {older.length > 0 && (
            <>
              <h4 className="kprof-h kpp-earlier">Earlier months</h4>
              <ul className="kpp-pays">
                {earlier.map((r) => (
                  <li key={r.id}>
                    <span className="kpp-pays-m">{r.month} {r.year}</span>
                    <span className="kpp-pays-n">{amount(r.netNPR)}</span>
                    <button type="button" className="kpp-link" onClick={() => setSlip(slipOf(r))} aria-label={`Salary slip for ${r.month} ${r.year}`}>Slip</button>
                  </li>
                ))}
              </ul>
              {older.length > FIRST_MONTHS && (
                <button type="button" className="kpp-link kpp-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
                  {all ? "Show fewer months" : `Show all ${older.length} earlier months`}
                </button>
              )}
            </>
          )}
        </>
      )}

      {slip && (
        <Suspense fallback={null}>
          <SalarySlipModal initialData={slip} employees={[]} onClose={() => setSlip(null)} />
        </Suspense>
      )}
    </section>
  );
}
