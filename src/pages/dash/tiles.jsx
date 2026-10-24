/**
 * The Dashboard's tiles. Each one is a small, self-contained answer to a
 * question the page is asked every day, and each goes to the page that has the
 * rest of the answer. Which ones a role gets, and where they sit, is decided in
 * that role's own file (OwnerDash, OpsDash, …).
 *
 * Tiles show only what the data says. Where there is nothing, they say so
 * plainly instead of drawing a zero or a made-up trend.
 */
import { useMemo, useState } from "react";
import { Avatar, Icons, cn, hueFromName } from "../../components/ui";
import {
  Tile, Figure, Sub, Meter, Money, RowList, EmptyNote, TileButton,
} from "../../components/bento/Bento";
import { Ring, Trend, MiniBars, StackBar } from "../../components/bento/charts";
import { Bank, TrendUp } from "../../components/bento/icons";
import ClockInCard from "../../components/ClockInCard";
import PersonLink from "../../components/profile/PersonLink";
import { useAuth } from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import { useRegion } from "../../context/RegionContext";
import { useHolidays } from "../../hooks/useHolidays";
import { dayOff, holidayOn } from "../../lib/attendance";
import { updateRow } from "../../lib/db";
import { todayDate } from "../../utils/date";
import { financeTabAllowed, marketingTabAllowed, sectionCanEdit, sectionVisible } from "../../utils/permissions";
import { ago, countByStage, daysFromToday, isInProgress, newestFirst, shortDate, useAssignments } from "./shared";

const ico = { size: 14, sw: 1.8 };

/* ══ Attendance and clock-in ════════════════════════════════ */

/**
 * How many of the team are in today. Tall, it is a ring with a key; short, it
 * is one figure and a bar. `clock` is the signed-in person's own clock-in, for
 * the managers who have one.
 */
export function AttendanceTile({ area = "today", title = "Attendance today", counts, loading, clock }) {
  const { present = 0, late = 0, leave = 0, absent = 0, total = 0 } = counts || {};
  // On a holiday or a Saturday nobody is expected, so "everybody absent" would be a lie; say what the day is
  // (unless somebody was marked in anyway, in which case the count is the news).
  const { rows: holidays } = useHolidays();
  const { region } = useRegion();
  const off = dayOff(todayDate(), holidays, region);
  const closed = Boolean(off) && present === 0 && leave === 0;
  const parts = [
    // `present` already counts the late arrivals, so the ring takes them out of it once.
    { label: "Present", v: Math.max(0, present - late), color: "var(--kb-good-fill)" },
    { label: "Late", v: late, color: "var(--kb-warn-fill)" },
    { label: "On leave", v: leave, color: "var(--kb-info-fill)" },
    { label: "Absent", v: absent, color: "var(--kb-mute-fill)" },
  ];
  return (
    <Tile area={area} to="/attendance" section="attendance" icon={<Icons.Attendance {...ico} />} title={title}
      loading={loading} align="top" className={cn("kb-tile--att", clock && "kb-tile--clock")}>
      {closed ? (
        <EmptyNote icon={<Icons.Calendar size={22} sw={1.5} />}>
          {off.kind === "holiday" ? `${off.name} is a holiday. Nobody is expected in.` : "Saturday: the office is closed."}
        </EmptyNote>
      ) : (
        <div className="kb-att kb-fill">
          <div className="kb-att-big">
            <div className="kb-att-ring">
              <Ring segments={parts} />
              <div className="kb-att-c">
                <b>{present}<i>/{total}</i></b>
                <span>in today</span>
              </div>
            </div>
            <ul className="kb-att-key">
              {parts.map((s) => (
                <li key={s.label}>
                  <span className="kb-dot" style={{ background: s.color }} />
                  <span className="kb-att-l">{s.label}</span>
                  <b>{s.v}</b>
                </li>
              ))}
            </ul>
          </div>
          <div className="kb-att-stat">
            <Figure unit={`/${total}`}>{present}</Figure>
            <div className="kb-att-stat-r">
              <StackBar parts={parts.map((p) => ({ v: p.v, color: p.color }))} />
              <p>{parts.filter((p) => p.v > 0).map((p) => `${p.v} ${p.label.toLowerCase()}`).join(" · ") || "No one marked yet"}</p>
            </div>
          </div>
        </div>
      )}
      {clock && <div className="kb-att-clock">{clock}</div>}
    </Tile>
  );
}

/** The signed-in person's own clock-in: one circle, pressed once. */
export function ClockRingTile({ area = "clock", profile, onClockChange }) {
  return (
    <Tile area={area} to="/attendance" section="attendance" icon={<Icons.Clock {...ico} />} title="Clock in" align="top">
      <ClockInCard variant="ring" profile={profile} onClockChange={onClockChange} />
    </Tile>
  );
}

/* ══ Production ═════════════════════════════════════════════ */

const stageTone = (stage) => {
  const s = (stage || "").toLowerCase();
  if (s.includes("sample") || s.includes("design")) return "info";
  if (/cut|sew|stitch|production|in progress|qc|quality/.test(s)) return "warn";
  if (/ship|dispatch|deliver|complet|done|pack/.test(s)) return "good";
  return "";
};

function AssignTag({ a }) {
  if (!a) return null;
  // The worker's name opens their profile (plain text when the hand-off names nobody we know). The words round it sit in one
  // inner span, so the pill is as wide as it was with plain text.
  const who = <PersonLink personId={a.personId || undefined} name={a.workerName}>{a.workerName || "someone"}</PersonLink>;
  if (a.status === "timed_out") return <span className="kb-tag kb-tag--bad">No response</span>;
  if (a.status === "pending") return <span className="kb-tag kb-tag--warn"><span>Awaiting {who}</span></span>;
  if (a.status === "accepted") return <span className="kb-tag kb-tag--good"><span>{who} on it</span></span>;
  if (a.status === "in_progress") return <span className="kb-tag kb-tag--good"><span>{who} working</span></span>;
  return null;
}

/** The orders on the floor: how many sit at each stage, and the newest few. */
export function OrdersTile({ area = "orders", title = "Production", orders, loading }) {
  const assign = useAssignments();
  const today = todayDate();
  const active = useMemo(() => orders.filter(isInProgress), [orders]);
  const stages = useMemo(() => countByStage(active), [active]);
  const rows = useMemo(() => newestFirst(active).slice(0, 5), [active]);
  const max = Math.max(1, ...stages.map((s) => s.n));
  const { timedOut, pending } = assign.counts;

  return (
    <Tile area={area} to="/production" section="production" icon={<Icons.Production {...ico} />} title={title}
      note={`${active.length} in progress`} loading={loading} align="top">
      <div className="kb-pipe">
        {stages.map((s, i) => (
          <div className="kb-pipe-c" key={s.id}>
            <span className="kb-pipe-l">{s.label}</span>
            <b className="kb-pipe-n">{s.n}</b>
            <span className="kb-pipe-b"><i className={`r${i + 1}`} style={{ "--p": `${(s.n / max) * 100}%` }} /></span>
          </div>
        ))}
      </div>

      {(timedOut > 0 || pending > 0) && (
        <div className="kb-dispatch kb-h-240">
          {timedOut > 0 && <span className="kb-tag kb-tag--bad">{timedOut} no response</span>}
          {pending > 0 && <span className="kb-tag kb-tag--warn">{pending} awaiting a reply</span>}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyNote icon={<Icons.Production size={22} sw={1.5} />}>No orders in progress</EmptyNote>
      ) : (
        <RowList className="kb-fill">
          {rows.map((o) => {
            const due = o.deliveryDate || o.dueDate;
            const late = Boolean(due) && due < today;
            const tone = stageTone(o.stage || o.status);
            return (
              <li className="kb-row" key={o.id}>
                <span className="kb-ord-id mono">{o.orderId || o.id?.slice(-8) || "—"}</span>
                <span className="kb-ord-main">
                  <b>{o.styleName || "—"}</b>
                  <span><i className={tone}>{o.stage || o.status || "—"}</i> · {o.customerName || o.clientName || o.customer || "—"}</span>
                </span>
                <span className={cn("kb-ord-due", late && "is-late")}>
                  {late && <Icons.Alert size={12} sw={2} />}{shortDate(due)}
                </span>
                <span className="kb-ord-who"><AssignTag a={assign.byOrder[o.id]} /></span>
              </li>
            );
          })}
        </RowList>
      )}
    </Tile>
  );
}

/** Orders on the floor and orders sent; stands in for the cash tile when this person may not see the bank. */
export function ActiveOrdersTile({ area = "cash", data, loading }) {
  const d = data || {};
  return (
    <Tile area={area} to="/production" section="production" icon={<Icons.Production {...ico} />} title="Active orders" loading={loading}>
      <Figure unit={`/${d.orders?.length ?? 0}`}>{d.inProgress ?? 0}</Figure>
      <Sub>{d.dispatched ?? 0} dispatched</Sub>
    </Tile>
  );
}

/* ══ Money ══════════════════════════════════════════════════ */

/** Every invoice by where it stands, and what is still owed. */
export function InvoicesTile({ area = "inv", data, loading }) {
  const b = data?.invoiceBuckets;
  const rows = b && [
    { label: "Paid", ...b.paid, color: "var(--kb-good-fill)" },
    { label: "Open", ...b.open, color: "var(--kb-warn-fill)" },
    { label: "Overdue", ...b.overdue, color: "var(--kb-bad-fill)" },
    { label: "Draft", ...b.draft, color: "var(--kb-mute-fill)" },
  ];
  const total = rows ? rows.reduce((s, r) => s + r.n, 0) : 0;
  const late = b?.overdue.npr || 0;
  return (
    <Tile area={area} to="/billing" section="billing" icon={<Icons.Billing {...ico} />} title="Invoices"
      note={total ? `${total} in all` : undefined} loading={loading} align="top">
      {rows && (
        <>
          <div className="kb-inv-top">
            <span className="kb-lbl">Still owed</span>
            <Figure><Money npr={data.outstandingNPR} /></Figure>
            <Sub>{late > 0 ? <><b className="kb-bad"><Money npr={late} compact /></b> of it overdue</> : "None overdue"}</Sub>
          </div>
          <StackBar parts={rows.map((r) => ({ v: r.npr, color: r.color }))} />
          <ul className="kb-inv-key kb-h-200">
            {rows.map((r) => (
              <li key={r.label}>
                <span className="kb-dot" style={{ background: r.color }} />
                <span className="kb-att-l">{r.label}</span>
                <span className="kb-inv-n">{r.n}</span>
                <b className="kb-w-300"><Money npr={r.npr} compact /></b>
              </li>
            ))}
          </ul>
        </>
      )}
    </Tile>
  );
}

/** The latest bank balance; only some people may see it. */
export function CashTile({ bank, area = "cash" }) {
  const { txn, loading } = bank;
  const debit = txn?.type?.toLowerCase() === "debit";
  return (
    <Tile area={area} to="/finance" section="finance" icon={<Bank {...ico} />} title="Cash at bank" loading={loading}>
      {!txn ? (
        <Sub>No bank data yet. Waiting for the first transaction from the bank feed.</Sub>
      ) : (
        <>
          <Figure><Money npr={txn.balance} /></Figure>
          <Sub className="kb-h-90">
            <span className={`kb-tag kb-tag--${debit ? "bad" : "good"}`}>{debit ? "Debit" : "Credit"}</span>{" "}
            <Money npr={txn.amount} compact /> · {shortDate(txn.date || txn.timestamp)}
          </Sub>
          {txn.remarks && <Sub className="kb-h-160">{txn.remarks}</Sub>}
        </>
      )}
    </Tile>
  );
}

/** What went out to suppliers this month. */
export function PurchasesTile({ area = "cash", npr = 0, loading }) {
  return (
    <Tile area={area} to="/purchases" section="purchases" icon={<Icons.Cart {...ico} />} title="Purchases" note="this month" loading={loading}>
      <Figure><Money npr={npr} /></Figure>
      <Sub>spent with suppliers this month</Sub>
    </Tile>
  );
}

/** This month's money in and out, and the last seven weeks of spend. */
export function MoneyTile({ data, loading }) {
  const d = data || {};
  const { fmt } = useCurrency();
  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  const hasCosts = d.totalCostNPR > 0;
  return (
    <Tile area="money" to="/finance" section="finance" icon={<Icons.Finance {...ico} />} title="Finance" note={month} loading={loading} align="top">
      <div className="kb-fin-top">
        <div><span className="kb-lbl">Revenue</span><Figure><Money npr={d.thisMonthRevNPR} compact /></Figure></div>
        <div><span className="kb-lbl">Expenses</span><Figure tone="bad"><Money npr={d.monthExpNPR} compact /></Figure></div>
      </div>
      <MiniBars values={d.weeklyExpTrend || []} labels={d.weeklyExpLabels || []} format={(v) => fmt(v)} />
      <Sub className="kb-h-240">Weekly expenses, last 7 weeks. Payroll and purchases are not in the bars.</Sub>
      <div className="kb-fin-foot kb-h-200">
        <Sub>Payroll <b><Money npr={d.monthPayrollNPR} compact /></b>{d.payrollIsEstimate ? " (est.)" : ""}</Sub>
        <Sub>Purchases <b><Money npr={d.monthPurchNPR} compact /></b></Sub>
        <Sub className="kb-h-260">
          {hasCosts
            ? <>Margin <b>{d.avgMargin}%</b> · est. profit <b><Money npr={d.totalProfitNPR} compact /></b></>
            : "Order costs not entered yet, so no profit figure."}
        </Sub>
      </div>
    </Tile>
  );
}

export function PayrollTile({ data, loading }) {
  const d = data || {};
  const npr = d.payrollNPR ?? d.monthPayrollNPR;
  return (
    <Tile area="pay" to="/employees?tab=payroll" can={(p) => sectionVisible(p, "employees") && financeTabAllowed(p, "payroll")}
      icon={<Icons.Wallet {...ico} />} title="Payroll" note={d.payrollIsEstimate ? "estimate" : "this month"} loading={loading}>
      <Figure><Money npr={npr} /></Figure>
      <Sub>{d.payrollIsEstimate ? <>Estimated<span className="kb-w-240"> from base salaries</span></> : "Gross for the month"}</Sub>
    </Tile>
  );
}

/** Paid invoices over the last thirty days. */
export function RevenueTile({ data, loading }) {
  const d = data || {};
  const { fmt } = useCurrency();
  const rev = d.revData || [];
  const peak = Math.max(0, ...rev);
  const peakAt = rev.indexOf(peak);
  return (
    <Tile area="rev" to="/billing" section="billing" icon={<Icons.Finance {...ico} />} title="Revenue"
      note={d.revIsLastMonth ? "last month's paid invoices" : "paid this month"} loading={loading} align="top">
      <Figure><Money npr={d.totalPaidNPR} /></Figure>
      <Trend values={rev} labels={d.dates30 || []} format={(v) => fmt(v)} empty="No paid invoices in the last 30 days" />
      {peak > 0 && (
        <Sub className="kb-h-200">Last 30 days · best day <b>{d.dates30?.[peakAt]}</b>, <Money npr={peak} compact /></Sub>
      )}
    </Tile>
  );
}

/** Revenue booked on orders, less the costs entered against them. */
export function ProfitTile({ area = "profit", data, loading }) {
  const d = data || {};
  const hasCosts = d.totalCostNPR > 0;
  const profit = d.estProfitNPR || 0;
  return (
    <Tile area={area} to="/finance" section="finance" icon={<TrendUp {...ico} />} title="Estimated profit"
      note={d.estMargin ? `${d.estMargin}% margin` : undefined} loading={loading}>
      {d.totalRevAllNPR > 0 ? (
        <>
          {hasCosts
            ? <Figure tone={profit >= 0 ? "good" : "bad"}><Money npr={profit} /></Figure>
            : <Figure>—</Figure>}
          <Sub className="kb-h-90">
            {hasCosts
              ? <>On <b><Money npr={d.totalRevAllNPR} compact /></b> of orders, <b><Money npr={d.totalCostNPR} compact /></b> costs</>
              : "No order costs entered yet. Add them under Finance → Order P&L."}
          </Sub>
        </>
      ) : (
        <Sub>No orders yet</Sub>
      )}
    </Tile>
  );
}

/**
 * One request and its two buttons. `canDecide` is the same permission the
 * database checks (Edit on Budget): without it the buttons are not offered,
 * because pressing them could only fail.
 */
function ApprovalRow({ br, canDecide, reviewer }) {
  const { moneyAlt } = useCurrency();
  const [state, setState] = useState(br.status === "Approved" ? "approved" : br.status === "Rejected" ? "rejected" : null);
  const [saving, setSaving] = useState(null);   // "approved" | "rejected" while that write is in flight
  const [problem, setProblem] = useState("");
  const amt = Number(br.amountNPR || br.amount || 0);
  const who = br.requestedBy || br.submittedBy || br.name || "—";
  const what = br.title || br.item || "request";

  async function decide(decision) {
    if (saving) return;
    const status = decision === "approved" ? "Approved" : "Rejected";
    setSaving(decision);
    setProblem("");
    try {
      const saved = await updateRow("budget_requests", br.id, { status, reviewedBy: reviewer, reviewedAt: new Date().toISOString() });
      // A write the database does not allow is dropped without an error, and the row
      // comes back as it was. Only the stored status proves the decision took.
      if (saved?.status !== status) {
        console.error("Budget request not changed by the database:", br.id, saved?.status);
        setProblem("Not saved. You may not have permission to decide this.");
        return;
      }
      setState(decision);
    } catch (err) {
      console.error("Failed to update budget request:", err);
      setProblem("Not saved. Check your connection and try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <li className="kb-row kb-appr">
      <PersonLink decor personId={br.requested_by_id || undefined} name={who}>
        <Avatar name={who} personId={br.requested_by_id || undefined} hue={60} size={28} />
      </PersonLink>
      <span className="kb-appr-t">
        <b>{br.title || br.item || "Budget request"}</b>
        {problem
          ? <span className="kb-appr-err" role="alert">{problem}</span>
          : (
            // the name is cut with "…" when the line is short, and "urgent" stays beside it
            <span style={br.urgency === "high" ? { display: "flex" } : undefined}>
              <PersonLink className="kpl--clip" personId={br.requested_by_id || undefined} name={who} />
              {br.urgency === "high" && <span style={{ flex: "none", whiteSpace: "pre" }}>{" · urgent"}</span>}
            </span>
          )}
      </span>
      <span className="kb-appr-amt"><b><Money npr={amt} compact /></b><span>{moneyAlt(amt)}</span></span>
      {state !== null ? (
        <span className={`kb-tag kb-tag--${state === "approved" ? "good" : "bad"}`}>{state === "approved" ? "Approved" : "Rejected"}</span>
      ) : canDecide ? (
        <span className="kb-appr-acts">
          <TileButton kind="bad" disabled={saving !== null} aria-busy={saving === "rejected"} aria-label={`Reject ${what}`} onClick={() => decide("rejected")}>
            {saving === "rejected" ? <span className="kb-spin" aria-hidden="true" /> : <Icons.X size={14} sw={2.2} />}
            <span className="kb-w-460">Reject</span>
          </TileButton>
          <TileButton kind="good" disabled={saving !== null} aria-busy={saving === "approved"} aria-label={`Approve ${what}`} onClick={() => decide("approved")}>
            {saving === "approved" ? <span className="kb-spin" aria-hidden="true" /> : <Icons.Check size={14} sw={2.4} />}
            <span className="kb-w-460">Approve</span>
          </TileButton>
        </span>
      ) : (
        <span className="kb-tag">View only</span>
      )}
    </li>
  );
}

/** Budget requests from Kathmandu that are waiting on the director, approvable from the tile. */
export function ApprovalsTile({ pending = [], loading }) {
  const { profile } = useAuth();
  const canDecide = sectionCanEdit(profile, "budget");
  const reviewer = profile?.name || "Admin";
  const n = pending.length;
  return (
    <Tile area="appr" tone={n > 0 ? "amber" : "default"} to="/content" section="budget" icon={<Icons.Budget {...ico} />}
      title={canDecide ? "Awaiting your approval" : "Awaiting approval"} note={n > 0 ? `${n} pending` : undefined} loading={loading} align="top">
      {n === 0 ? (
        <EmptyNote icon={<Icons.Check size={22} sw={1.6} />}>No requests waiting for you</EmptyNote>
      ) : (
        <RowList className="kb-fill">
          {pending.slice(0, 6).map((br) => <ApprovalRow key={br.id} br={br} canDecide={canDecide} reviewer={reviewer} />)}
        </RowList>
      )}
    </Tile>
  );
}

/**
 * Budget requests still waiting for a decision (the view from the people who ask: it is the UK that decides).
 * `list` is for a tile with room to spare: it names the waiting requests under the count instead of just the first.
 */
export function BudgetTile({ pending = [], loading, list = false }) {
  const n = pending.length;
  const first = pending[0];
  return (
    <Tile area="budget" tone={n > 0 ? "amber" : "default"} to="/content" section="budget" icon={<Icons.Budget {...ico} />}
      title="Budget requests" loading={loading}>
      <Figure>{n}</Figure>
      <Sub>{n === 0 ? "Nothing waiting" : <>awaiting <span className="kb-h-90">UK director </span>sign-off</>}</Sub>
      {list && n > 0 ? (
        <RowList className="kb-fill kb-h-160">
          {pending.slice(0, 5).map((br) => (
            <li className="kb-row" key={br.id}>
              <span className="kb-appr-t">
                <b>{br.title || br.item || "Budget request"}</b>
                <span><PersonLink className="kpl--clip" personId={br.requested_by_id || undefined} name={br.requestedBy || br.submittedBy || br.name || "—"} /></span>
              </span>
              <span className="kb-bud-amt"><Money npr={Number(br.amountNPR || br.amount || 0)} compact /></span>
            </li>
          ))}
        </RowList>
      ) : first && (
        <Sub className="kb-h-160"><b>{first.title || first.item || "Budget request"}</b> · <Money npr={Number(first.amountNPR || first.amount || 0)} compact /></Sub>
      )}
    </Tile>
  );
}

/* ══ Work ═══════════════════════════════════════════════════ */

/** Task counts and the next few open tasks. */
export function TasksTile({ data, loading }) {
  const c = data?.tasksByCol || {};
  const overdue = data?.overdueTasks?.length || 0;
  const open = (c.todo || 0) + (c.in_progress || 0) + (c.blocked || 0);
  const stats = [
    { n: c.todo || 0, f: "To do", s: "To do" },
    { n: c.in_progress || 0, f: "In progress", s: "Doing" },
    { n: c.blocked || 0, f: "Blocked", s: "Blocked", bad: (c.blocked || 0) > 0 },
    { n: overdue, f: "Overdue", s: "Late", bad: overdue > 0 },
  ];
  const done = data?.totalDone || 0;
  const target = data?.totalTarget || 0;
  const pct = target ? Math.min(Math.round((done / target) * 100), 100) : 0;
  const rows = data?.recentTasks || [];

  return (
    <Tile area="tasks" to="/tasks" section="tasks" icon={<Icons.Tasks {...ico} />} title="Tasks" note={`${open} open`} loading={loading} align="top">
      <div className="kb-tk-stats">
        {stats.map((s) => (
          <div key={s.f} className={s.bad ? "is-bad" : undefined}>
            <b>{s.n}</b>
            <span><span className="f">{s.f}</span><span className="s">{s.s}</span></span>
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyNote icon={<Icons.Check size={22} sw={1.6} />}>No open tasks</EmptyNote>
      ) : (
        <RowList className="kb-fill">
          {rows.map((t) => (
            <li className="kb-row" key={t.id}>
              <i className={cn("kb-prio", t.priority === "High" && "kb-prio--high", t.priority === "Medium" && "kb-prio--med")} />
              <span className="kb-tk-t">
                <b>{t.title}</b>
                <span><PersonLink className="kpl--clip" personId={t.assignee_id || undefined} name={t.assignee}>{t.assignee || "Unassigned"}</PersonLink></span>
              </span>
              <PersonLink decor personId={t.assignee_id || undefined} name={t.assignee}>
                <Avatar name={t.assignee || "?"} personId={t.assignee_id || undefined} hue={92} size={22} />
              </PersonLink>
            </li>
          ))}
        </RowList>
      )}
      {target > 0 && (
        <div className="kb-goal kb-h-300">
          <div className="kb-goal-h"><span>Tickets done</span><b>{done} of {target}</b></div>
          <Meter pct={pct} tone="info" />
        </div>
      )}
    </Tile>
  );
}

const STATUS_RANK = { Blocked: 0, "In Progress": 1, "To Do": 2, Done: 9 };
const statusTone = (s) => (s === "In Progress" ? "good" : s === "Blocked" ? "bad" : "");

/** Tasks assigned to the signed-in person, open ones first. */
export function MyTasksTile({ tasks = [], loading }) {
  const today = todayDate();
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3)),
    [tasks],
  );
  const open = tasks.filter((t) => t.status !== "Done").length;
  return (
    <Tile area="tasks" to="/tasks" section="tasks" icon={<Icons.Tasks {...ico} />} title="Your tasks"
      note={tasks.length ? `${open} open` : undefined} loading={loading} align="top">
      {sorted.length === 0 ? (
        <EmptyNote icon={<Icons.Check size={26} sw={1.6} />}>You're all caught up. Nothing is assigned to you.</EmptyNote>
      ) : (
        <RowList className="kb-fill">
          {sorted.map((t) => {
            const late = t.dueDate && t.dueDate < today && t.status !== "Done";
            const tone = statusTone(t.status);
            return (
              <li className="kb-row" key={t.id}>
                <i className={cn("kb-prio", t.priority === "High" && "kb-prio--high", t.priority === "Medium" && "kb-prio--med")} />
                <span className="kb-tk-t">
                  <b>{t.title}</b>
                  <span className="mono">{t.id?.slice(-6)}</span>
                </span>
                <span className={cn("kb-tag", tone && `kb-tag--${tone}`)}>{t.status || "To Do"}</span>
                {t.dueDate && (
                  <span className={cn("kb-ord-due kb-w-320", late && "is-late")}><Icons.Clock size={12} sw={1.8} />{shortDate(t.dueDate)}</span>
                )}
              </li>
            );
          })}
        </RowList>
      )}
    </Tile>
  );
}

/** Tickets the signed-in person has finished, against their target: a ring when the tile is tall, a bar when it is short. */
export function TicketTile({ area = "ticket", done = 0, target = 10, loading }) {
  const hit = done >= target;
  const left = Math.max(0, target - done);
  const message = hit ? "Target hit. Great work." : `${left} more to hit your target`;
  return (
    <Tile area={area} to="/tasks" section="tasks" icon={<Icons.Check {...ico} />} title="Ticket target" loading={loading} align="top">
      <div className="kb-goalring kb-fill">
        <div className="kb-att-ring">
          <Ring thickness={11} segments={[
            { v: done, color: hit ? "var(--kb-good-fill)" : "var(--kb-accent)" },
            { v: left, color: "transparent" },
          ]} />
          <div className="kb-att-c"><b>{done}<i>/{target}</i></b><span>tickets done</span></div>
        </div>
        <p className="kb-goalring-note">{message}</p>
      </div>
      <div className="kb-goalbar">
        <Figure unit={`of ${target}`} tone={hit ? "good" : undefined}>{done}</Figure>
        <Meter pct={Math.min(Math.round((done / target) * 100), 100)} tone={hit ? "good" : "info"} />
        <Sub>{message}</Sub>
      </div>
    </Tile>
  );
}

/** The month so far, day by day. */
export function MyAttendanceTile({ area = "cal", counts, monthAtt = [], loading }) {
  const { profile } = useAuth();
  const { rows: holidays } = useHolidays();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDay = now.getDate();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first

  // day of month → how it went
  const byDay = {};
  monthAtt.forEach((r) => {
    if (!r.date) return;
    const day = parseInt(r.date.slice(8, 10), 10);
    const s = (r.status || "").toLowerCase();
    if (s === "present" || s === "half-day") byDay[day] = "present";
    else if (s === "late") byDay[day] = "late";
    else if (s === "leave") byDay[day] = "leave";
    else if (s === "absent") byDay[day] = "absent";
  });
  // A holiday is marked all month, so the days still to come show it too. Saturday is the office's
  // weekly holiday (marked up to today); Sunday is a normal working day.
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!byDay[d] && holidayOn(iso, holidays, profile?.location)) byDay[d] = "holiday";
    else if (!byDay[d] && d <= todayDay && new Date(year, month, d).getDay() === 6) byDay[d] = "weekend";
  }

  const weeks = Math.ceil((lead + daysInMonth) / 7);
  return (
    <Tile area={area} to="/attendance" section="attendance" icon={<Icons.Calendar {...ico} />} title="Your attendance"
      note={now.toLocaleString("en-GB", { month: "long" })} loading={loading} align="top">
      <div className="kb-cal-counts">
        <div><b>{counts?.present ?? 0}</b><span>Present</span></div>
        <div className="late"><b>{counts?.late ?? 0}</b><span>Late</span></div>
        <div className="leave"><b>{counts?.leave ?? 0}</b><span>Leave</span></div>
      </div>
      <div className="kb-cal kb-fill">
        <div className="kb-cal-dow">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="kb-cal-grid" style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 52px))` }}>
          {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            return <span key={d} className={cn("kb-cal-d", byDay[d], d === todayDay && "today")}>{d}</span>;
          })}
        </div>
        <div className="kb-cal-key kb-h-300">
          <span><i style={{ "--c": "var(--kb-good-fill)" }} />Present</span>
          <span><i style={{ "--c": "var(--kb-warn-fill)" }} />Late</span>
          <span><i style={{ "--c": "var(--kb-info-fill)" }} />Leave</span>
          <span><i style={{ "--c": "var(--kb-bad-fill)" }} />Absent</span>
        </div>
      </div>
    </Tile>
  );
}

/* ══ Orders and people ═════════════════════════════════════ */

const dueLabel = (days) => (days < 0 ? `${-days} d late` : days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`);

/** Orders on the floor by delivery date: what is late, and what is coming. */
export function DueSoonTile({ area = "due", orders = [], loading }) {
  const rows = useMemo(
    () => orders
      .filter(isInProgress)
      .map((o) => ({ o, days: (o.deliveryDate || o.dueDate) ? daysFromToday(o.deliveryDate || o.dueDate) : null }))
      .filter((r) => r.days != null && !Number.isNaN(r.days))
      .sort((a, b) => a.days - b.days),
    [orders],
  );
  const late = rows.filter((r) => r.days < 0).length;
  const week = rows.filter((r) => r.days >= 0 && r.days <= 7).length;
  return (
    <Tile area={area} to="/production" section="production" icon={<Icons.Truck {...ico} />} title="Due soon"
      note={late > 0 ? `${late} late` : `${week} this week`} loading={loading} align="top">
      {rows.length === 0 ? (
        <EmptyNote icon={<Icons.Check size={22} sw={1.6} />}>No delivery dates to watch</EmptyNote>
      ) : (
        <RowList className="kb-fill">
          {rows.slice(0, 8).map(({ o, days }) => (
            <li className="kb-row" key={o.id}>
              <span className={cn("kb-up-when", days < 0 && "is-late")}>{dueLabel(days)}</span>
              <span className="kb-tk-t">
                <b>{o.styleName || "—"}</b>
                <span><span className="mono">{o.orderId || o.id?.slice(-8)}</span> · {o.customerName || o.clientName || o.customer || "—"}</span>
              </span>
            </li>
          ))}
        </RowList>
      )}
    </Tile>
  );
}

/** Who is late, away or not in yet, by name. */
export function WhosOutTile({ area = "money", people: all = [], loading }) {
  const { rows: holidays } = useHolidays();
  const { region } = useRegion();
  const off = dayOff(todayDate(), holidays, region);
  // on a day off nobody is "not in yet"; only the people somebody marked (leave, absent, late) are worth naming
  const people = off ? all.filter((p) => p.note !== "Not in yet") : all;
  return (
    <Tile area={area} to="/attendance" section="attendance" icon={<Icons.Employees {...ico} />} title="Not in today"
      note={people.length ? `${people.length}` : undefined} loading={loading} align="top">
      {people.length === 0 ? (
        off
          ? <EmptyNote icon={<Icons.Calendar size={22} sw={1.5} />}>{off.kind === "holiday" ? `${off.name} is a holiday` : "Saturday: the office is closed"}</EmptyNote>
          : <EmptyNote icon={<Icons.Check size={22} sw={1.6} />}>Everyone is in</EmptyNote>
      ) : (
        <RowList className="kb-fill">
          {people.slice(0, 10).map((p, i) => (
            <li className="kb-row" key={`${p.name}-${i}`}>
              <PersonLink decor personId={p.personId} name={p.name}>
                <Avatar name={p.name} personId={p.personId} hue={hueFromName(p.name)} size={26} />
              </PersonLink>
              <span className="kb-tk-t"><b><PersonLink className="kpl--clip" personId={p.personId} name={p.name} /></b></span>
              <span className={`kb-tag kb-tag--${p.kind === "late" ? "warn" : p.kind === "leave" ? "info" : "bad"}`}>{p.note}</span>
            </li>
          ))}
        </RowList>
      )}
    </Tile>
  );
}

/** The newest invoices across the strip, each with where it stands. */
export function RecentInvoicesTile({ area = "recent", rows = [], loading }) {
  return (
    <Tile area={area} to="/billing" section="billing" icon={<Icons.Billing {...ico} />} title="Latest invoices" loading={loading} align="top">
      {rows.length === 0 ? (
        <Sub>No invoices yet</Sub>
      ) : (
        <div className="kb-strip kb-fill">
          {rows.map((i) => (
            <div className="kb-strip-c" key={i.id}>
              <span className="kb-strip-t"><b className="mono">{i.number}</b><span>{i.client}</span></span>
              <span className="kb-strip-r">
                <b><Money npr={i.npr} compact /></b>
                <span className={cn("kb-tag", i.tone && `kb-tag--${i.tone}`)}>{i.label}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Tile>
  );
}

/** Samples still waiting on a decision, and how the rest stand. */
export function SamplesTile({ area = "samples", data, loading }) {
  const c = data?.sampleCounts || {};
  const open = (c.Pending || 0) + (c["In Revision"] || 0);
  const rows = data?.openSamples || [];
  const stats = [
    { f: "Pending", n: c.Pending || 0 },
    { f: "In revision", n: c["In Revision"] || 0 },
    { f: "Approved", n: c.Approved || 0 },
    { f: "Rejected", n: c.Rejected || 0, bad: (c.Rejected || 0) > 0 },
  ];
  return (
    <Tile area={area} to="/inventory" section={["inventory", "library"]} icon={<Icons.Scissors {...ico} />} title="Samples"
      note={open ? `${open} open` : undefined} loading={loading} align="top">
      <div className="kb-tk-stats">
        {stats.map((s) => (
          <div key={s.f} className={s.bad ? "is-bad" : undefined}><b>{s.n}</b><span>{s.f}</span></div>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyNote icon={<Icons.Check size={22} sw={1.6} />}>Nothing is waiting on a decision</EmptyNote>
      ) : (
        <RowList className="kb-fill">
          {rows.map((r) => (
            <li className="kb-row" key={r.id}>
              <span className="kb-tk-t"><b>{r.name}</b><span>{[r.product_type, r.fabric_used].filter(Boolean).join(" · ") || "—"}</span></span>
              <span className="kb-tag kb-w-340">{r.stage}</span>
              <span className={`kb-tag kb-tag--${r.status === "In Revision" ? "info" : "warn"}`}>{r.status}</span>
            </li>
          ))}
        </RowList>
      )}
    </Tile>
  );
}

const leadTone = (status) => {
  const s = (status || "new").toLowerCase();
  return s === "new" ? "info" : s === "contacted" ? "warn" : s === "qualified" ? "good" : "";
};

/** The newest Meta lead-form sign-ups, for whoever may see Meta Ads. */
export function LeadsTile({ area = "leads", leads = [], loading }) {
  const rows = useMemo(
    () => [...leads].sort((a, b) => String(b.leadCreatedAt || b.createdAt || "").localeCompare(String(a.leadCreatedAt || a.createdAt || ""))).slice(0, 8),
    [leads],
  );
  const fresh = leads.filter((l) => (l.status || "new") === "new").length;
  return (
    <Tile area={area} to="/marketing/meta-ads" can={(p) => sectionVisible(p, "marketing") && marketingTabAllowed(p, "meta_ads")}
      icon={<Icons.Marketing {...ico} />} title="Meta leads" note={fresh ? `${fresh} new` : undefined} loading={loading} align="top">
      {rows.length === 0 ? (
        <EmptyNote icon={<Icons.Marketing size={22} sw={1.5} />}>No leads yet. They arrive from your Meta lead forms.</EmptyNote>
      ) : (
        <RowList className="kb-fill">
          {rows.map((l) => (
            <li className="kb-row" key={l.id}>
              <Avatar name={l.fullName || "?"} hue={hueFromName(l.fullName || "")} size={26} />
              <span className="kb-tk-t">
                <b>{l.fullName || "Unknown"}</b>
                <span>{[l.campaignName || l.formName, ago(l.leadCreatedAt || l.createdAt)].filter(Boolean).join(" · ")}</span>
              </span>
              <span className={cn("kb-tag", leadTone(l.status) && `kb-tag--${leadTone(l.status)}`)}>{l.status || "new"}</span>
            </li>
          ))}
        </RowList>
      )}
    </Tile>
  );
}

/* ══ Floor and content ══════════════════════════════════════ */

/** Stock at or under its reorder point. */
export function StockTile({ area = "stock", items = [], loading }) {
  const n = items.length;
  return (
    <Tile area={area} tone={n > 0 ? "amber" : "wash"} to="/inventory" section={["inventory", "library"]}
      icon={<Icons.Inventory {...ico} />} title="Stock alerts" note={n > 0 ? `${n} below reorder` : undefined} loading={loading} align="top">
      {n === 0 ? (
        <EmptyNote icon={<Icons.Check size={22} sw={1.6} />}>All stock is above its reorder level</EmptyNote>
      ) : (
        <RowList className="kb-fill">
          {items.slice(0, 8).map(({ item, qty, reorder }, i) => {
            const ratio = reorder ? qty / reorder : 0;
            return (
              <li className="kb-row" key={item.id || i}>
                <span className="kb-stock-n"><b>{item.item}</b><span>{item.category || "Stock"}</span></span>
                <span className="kb-stock-q">
                  <b>{qty}<small>/{reorder} {item.unit}</small></b>
                  <Meter pct={Math.min(ratio * 100, 100)} tone={ratio < 0.4 ? "bad" : "warn"} />
                </span>
              </li>
            );
          })}
        </RowList>
      )}
    </Tile>
  );
}

const whenLabel = (inDays) => (inDays === 0 ? "Today" : inDays === 1 ? "Tomorrow" : `In ${inDays} days`);

/** What is booked on the content calendar next. */
export function UpcomingTile({ area = "upcoming", items = [], monthCount = 0, loading }) {
  return (
    <Tile area={area} to="/marketing" section="marketing" icon={<Icons.Calendar {...ico} />} title="Coming up"
      note={`${monthCount} this month`} loading={loading} align="top">
      {items.length === 0 ? (
        <EmptyNote icon={<Icons.Calendar size={22} sw={1.5} />}>Nothing scheduled. No posts or campaigns are booked ahead.</EmptyNote>
      ) : (
        <RowList className="kb-fill">
          {items.map((e) => (
            <li className="kb-row" key={e.id}>
              <span className="kb-up-when">{whenLabel(e.inDays)}</span>
              <span className="kb-tk-t"><b>{e.title}</b><span>{[e.timeSlot, e.status].filter(Boolean).join(" · ") || shortDate(e.scheduledDate)}</span></span>
              {e.type && <span className="kb-tag">{e.type}</span>}
            </li>
          ))}
        </RowList>
      )}
    </Tile>
  );
}
