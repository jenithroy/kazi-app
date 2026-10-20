/**
 * Payroll, on the same glass frame as Finance: one screen, the records scroll in their pane under a head that stays put, a month at a
 * time, and a person's pay is entered and changed in the card in the middle of the screen. It is the old Payroll tab of Employees & HR,
 * and is still reached the same way (/employees?tab=payroll, and the Payroll entry in the Finance menu).
 *
 *   top row   what this month's (or the period's) payroll comes to: net pay, gross pay, what came off it, and how many people
 *   pane      one line per person per month, grouped by month with the month's totals; a row opens the card; "Slip" prints the salary slip
 *
 * The salary maths, who may see or change payroll, the attendance-driven late cut and the salary slip are the old tab's.
 */
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BentoGrid, BentoPage, EmptyNote, Figure, Money, Sub, Tile } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import DataTable from "../components/table/DataTable";
import { SearchBox } from "../components/table/Bar";
import PeriodBar from "../components/finance/PeriodBar";
import FinPane from "../components/finance/FinPane";
import PayrollCard from "../components/finance/cards/PayrollCard";
import SalarySlipModal from "../components/SalarySlipModal";
import { ExportButton, Foot, FootSum, NameCell, plural, useMoney, usePhoneRows, useShiftN } from "../components/finance/parts";
import "../components/finance/finance.css";
import usePayrollData from "../hooks/usePayrollData";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit, financeTabAllowed } from "../utils/permissions";
import { filterByDateRange, filterByFiscalYear, fiscalYearsIn, isDateRangeActive, isFiscalYearLabel, payrollPeriodDate } from "../utils/fiscalYear";
import { useFiscalYearFilter } from "../components/FiscalYearFilter";
import { useDateRangeFilter } from "../components/DateRangeFilter";
import { describePeriod } from "../lib/period";
import { groupByMonth, headline, totalsOf } from "../lib/payroll";
import useDateMode from "../hooks/useDateMode";

const ico = { size: 14, sw: 1.8 };
const has = (hay, q) => String(hay || "").toLowerCase().includes(q);

export default function Payroll() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const money = useMoney();
  const [dateMode] = useDateMode();
  const canView = financeTabAllowed(profile, "payroll");
  const canEdit = sectionCanEdit(profile, "employees") && canView;
  const fromFinance = location.state?.tab === "payroll";
  const data = usePayrollData({ enabled: canView });
  const loading = data.status === "loading";

  const [query, setQuery] = useState("");
  const [card, setCard] = useState(null);                  // null, or { id } (null id = a new record)
  const [slip, setSlip] = useState(null);                  // a salary slip's starting values
  useShiftN(canEdit ? () => setCard({ id: null }) : null);

  // The fiscal year and a From / To narrow the records. A record carries a month name and a year, not a date, so the period is judged on
  // the first of its month.
  const [fy] = useFiscalYearFilter();
  const [dateRange] = useDateRangeFilter();
  const periodActive = isFiscalYearLabel(fy) || isDateRangeActive(dateRange);
  const inPeriod = useMemo(
    () => filterByDateRange(filterByFiscalYear(data.payroll, fy, payrollPeriodDate), dateRange, payrollPeriodDate),
    [data.payroll, fy, dateRange],
  );
  const years = useMemo(() => fiscalYearsIn(data.payroll, payrollPeriodDate), [data.payroll]);

  const q = query.trim().toLowerCase();
  const found = useMemo(
    () => inPeriod.filter((r) => !q || has(r.staffName, q) || has(r.role, q) || has(r.month, q) || has(r.year, q)),
    [inPeriod, q],
  );
  const head = useMemo(() => headline(inPeriod, { periodActive }), [inPeriod, periodActive]);
  const sums = useMemo(() => totalsOf(found), [found]);

  // a heading for each month (with its totals), then its people
  const list = useMemo(() => {
    const out = [];
    for (const g of groupByMonth(found)) {
      out.push({
        kind: "group", key: `g-${g.key}`,
        label: `${g.month} ${g.year} · ${g.totals.records} ${plural(g.totals.records, "person", "people")} · gross ${money(g.totals.gross)} · net ${money(g.totals.net)}`,
      });
      g.rows.forEach((r) => out.push({ ...r, key: r.id }));
    }
    return out;
  }, [found, money]);
  const [shown, more] = usePhoneRows(list, 24);

  const open = card?.id ? data.payroll.find((r) => r.id === card.id) || null : null;
  const slipOf = (r) => ({
    empName: r.staffName, designation: r.role, month: r.month, year: r.year,
    basicNPR: r.basicNPR, bonusNPR: r.bonusNPR, lateDeductionNPR: r.lateDeductionNPR, pfDeductionNPR: r.pfDeductionNPR,
  });

  const columns = useMemo(() => [
    {
      // a narrow table has no room for the late cut or the gross: they go under the name
      id: "who", label: "Staff", grow: true, min: 160, max: 460,
      render: (r, { dropped }) => (
        <NameCell
          main={(r.staffName || "").trim() || "—"} rest={r.role}
          extra={[dropped.has("late") && r.lateDeductionNPR > 0 && `Late cut − ${money(r.lateDeductionNPR)}`, dropped.has("gross") && r.grossNPR > 0 && `Gross ${money(r.grossNPR)}`]}
        />
      ),
    },
    { id: "basic", label: "Basic", width: 116, align: "end", drop: 5, render: (r) => <span className="dt-num">{r.basicNPR ? money(r.basicNPR) : "—"}</span> },
    { id: "bonus", label: "Bonus", width: 100, align: "end", drop: 6, render: (r) => <span className="dt-num dt-dim">{r.bonusNPR ? money(r.bonusNPR) : "—"}</span> },
    {
      id: "late", label: "Late cut", width: 116, align: "end", drop: 4,
      render: (r) => (r.lateDeductionNPR ? <span className="dt-num dt-bad" title={r.lateCutsCount ? `${r.lateCutsCount} quarter-day cuts` : undefined}>− {money(r.lateDeductionNPR)}</span> : <span className="dt-dim">—</span>),
    },
    { id: "pf", label: "PF or other", width: 108, align: "end", drop: 7, render: (r) => (r.pfDeductionNPR ? <span className="dt-num dt-bad">− {money(r.pfDeductionNPR)}</span> : <span className="dt-dim">—</span>) },
    { id: "gross", label: "Gross", width: 120, align: "end", drop: 3, render: (r) => <span className="dt-num">{r.grossNPR ? money(r.grossNPR) : "—"}</span> },
    { id: "net", label: "Net pay", width: 124, align: "end", render: (r) => <span className="dt-num dt-strong">{money(r.netNPR || 0)}</span> },
    {
      id: "slip", label: <span className="fn-sr">Salary slip</span>, width: 70, align: "end", drop: 2,
      render: (r) => (
        <button type="button" className="dt-act dt-mini" title="Print the salary slip" onClick={() => setSlip(slipOf(r))}>
          <Icons.File size={13} sw={1.9} aria-hidden="true" /> Slip
        </button>
      ),
    },
  ], [money]);

  const csv = useMemo(() => [
    { label: "Staff", value: (r) => (r.staffName || "").trim() }, { label: "Role", value: (r) => r.role }, { label: "Month", value: (r) => r.month },
    { label: "Year", value: (r) => r.year }, { label: "Basic NPR", value: (r) => r.basicNPR }, { label: "Bonus NPR", value: (r) => r.bonusNPR },
    { label: "Late deduction NPR", value: (r) => r.lateDeductionNPR }, { label: "PF or other NPR", value: (r) => r.pfDeductionNPR },
    { label: "Gross NPR", value: (r) => r.grossNPR }, { label: "Net NPR", value: (r) => r.netNPR },
  ], []);

  if (!canView) {
    return (
      <BentoPage className="fn-page fn-page--pay">
        <header className="kb-head"><div className="kb-head-l"><h1>Payroll</h1></div></header>
        <div className="kb-error" role="status"><p>Your position doesn't open Payroll.</p></div>
      </BentoPage>
    );
  }

  const empty = isFiscalYearLabel(fy) && data.payroll.length > 0
    ? `No payroll records in FY ${fy} (${data.payroll.length} in other years).`
    : "No payroll records yet.";

  return (
    <BentoPage className="fn-page fn-page--pay">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Payroll</h1>
          <p className="kb-head-sub"><span>{describePeriod({ fy, range: dateRange, mode: dateMode })}</span></p>
        </div>
        <div className="kb-head-r fn-head-r">
          <div className="kb-head-act">
            {fromFinance && (
              <button type="button" className="kb-pillbtn" onClick={() => navigate("/finance")}>
                <Icons.ChevronLeft size={14} sw={2} aria-hidden="true" /> Finance
              </button>
            )}
            <button type="button" className="kb-pillbtn" onClick={() => navigate("/employees")}>
              <Icons.ChevronLeft size={14} sw={2} aria-hidden="true" /> Employees &amp; HR
            </button>
          </div>
          <PeriodBar years={years} />
        </div>
      </header>

      {data.status === "ready" && data.failed.length > 0 && (
        <div className="fn-banner" role="status">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>Could not load {data.failed.map((c) => (c === "finance_payroll" ? "payroll records" : "staff")).join(" and ")}, so some figures may be missing or out of date.</span>
        </div>
      )}

      {data.status === "error" ? (
        <div className="kb-error" role="alert">
          <p>Payroll could not load. Check your connection and try again.</p>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={data.reload}>Try again</button>
        </div>
      ) : (
        <BentoGrid layout="payroll">
          <Tile area="t1" icon={<Icons.Wallet {...ico} />} title="Net pay" note={head.label} loading={loading} className="fn-t">
            <Figure><Money npr={head.net} compact={Math.abs(head.net) >= 1e7} /></Figure>
            <Sub>paid out</Sub>
          </Tile>
          <Tile area="t2" icon={<Icons.File {...ico} />} title="Gross pay" note={head.label} loading={loading} className="fn-t">
            <Figure><Money npr={head.gross} compact={Math.abs(head.gross) >= 1e7} /></Figure>
            <Sub>basic and bonus</Sub>
          </Tile>
          <Tile area="t3" icon={<Icons.Alert {...ico} />} title="Taken off" note={head.label} loading={loading} className="fn-t">
            <Figure><Money npr={head.deductions} compact={Math.abs(head.deductions) >= 1e7} /></Figure>
            <Sub>late cuts, PF and other</Sub>
          </Tile>
          <Tile area="t4" icon={<Icons.Employees {...ico} />} title="People paid" note={head.label} loading={loading} className="fn-t">
            <Figure>{head.people}</Figure>
            <Sub><b>{head.records}</b> {plural(head.records, "record")}</Sub>
          </Tile>

          <FinPane
            title="Payroll records" note={q ? `${found.length} of ${inPeriod.length}` : `${inPeriod.length} ${plural(inPeriod.length, "record")}`} id="fin-pane"
            tools={<SearchBox value={query} onChange={setQuery} placeholder="Search payroll" label="Search payroll by name, role or month" />}
            actions={(
              <>
                <ExportButton name="payroll" columns={csv} rows={found} />
                <button type="button" className="kb-pillbtn" onClick={() => setSlip({})} title="Make a salary slip for anyone">
                  <Icons.File size={14} sw={1.9} aria-hidden="true" /> Salary slip
                </button>
                {canEdit && (
                  <button type="button" className="kb-btn kb-btn--primary" onClick={() => setCard({ id: null })} title="Shift + N">
                    <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> Add payroll
                  </button>
                )}
              </>
            )}
            foot={(
              <Foot>
                <FootSum count label={plural(found.length, "record")} value={found.length} />
                <FootSum label="Gross" value={money(sums.gross)} />
                <FootSum label="Taken off" value={money(sums.deductions)} tone={sums.deductions > 0 ? "bad" : undefined} />
                <FootSum label="Net" value={money(sums.net)} tone="good" />
              </Foot>
            )}
          >
            {!canEdit && <p className="fn-viewonly">View only. You do not have permission to add or change payroll.</p>}
            <DataTable
              className="fn-dense fn-book" label="Payroll records" rows={shown} rowKey={(r) => r.key} columns={columns}
              kindOf={(r) => r.kind} onOpen={(r) => setCard({ id: r.id })} rowLabel={(r) => `Open ${r.staffName}'s payroll for ${r.month} ${r.year}`}
              activeKey={card?.id || undefined} loading={loading}
              empty={<EmptyNote icon={<Icons.Wallet size={22} sw={1.5} />}>{inPeriod.length === 0 ? empty : "Nothing matches that."}</EmptyNote>}
            />
            {more}
          </FinPane>
        </BentoGrid>
      )}

      {card && (!card.id || open) && (
        <PayrollCard
          key={card.id || "new"} record={open} employees={data.employees} canEdit={canEdit} profile={profile}
          reload={data.reload} onClose={() => setCard(null)}
        />
      )}
      {slip !== null && <SalarySlipModal initialData={slip} employees={data.employees} onClose={() => setSlip(null)} />}
    </BentoPage>
  );
}
