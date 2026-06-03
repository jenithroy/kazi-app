import { useEffect, useState, useMemo } from "react";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import AppLayout from "../components/AppLayout";
import { db } from "../firebase";
import { loadCollections } from "../utils/firestore";
import { useAuth } from "../context/AuthContext";
import { GBP_RATE, WORK_SITE, GEOFENCE_RADIUS_M, GPS_ACCURACY_THRESHOLD_M } from "../constants";
import { todayDate, startOfWeekDate } from "../utils/date";
import { haversineDistance } from "../utils/geo";
import { Card, KPI, Pill, Btn, Avatar, Progress, Spark, Divider, Icons, fmt, cn } from "../components/ui";
import { useCurrency } from "../context/CurrencyContext";
import { AreaChart, AttendanceRing, ProductionPipeline, QCDial, Donut, Bars } from "../components/viz";
import ClockInCard from "../components/ClockInCard";

/* ── Helpers ─────────────────────────────────────────── */
function getLast6Months() {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }) };
  });
}
function buildMonthlyTrend(rows, dateField, valueField, label) {
  const months = getLast6Months();
  const map = {};
  rows.forEach(r => { const k = (r[dateField] || "").slice(0, 7); map[k] = (map[k] || 0) + Number(r[valueField] || 0); });
  return months.map(m => ({ month: m.label, [label]: map[m.key] || 0 }));
}

const Dot = () => <span className="kdot">·</span>;

/* ── Loading state ───────────────────────────────────── */
function Loading() {
  return (
    <AppLayout>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "var(--ink-4)", fontSize: 14 }}>
        Loading dashboard…
      </div>
    </AppLayout>
  );
}

/* ── Sales Target Helper & Card ──────────────────────── */
function getSalesTargetInfo(invoices) {
  const targetGBP = 2000; // Monthly target of £2,000 (NPR 400,000)
  const targetNPR = targetGBP * GBP_RATE;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const currentMonthInvoices = invoices.filter(inv => (inv.date || "").slice(0, 7) === thisMonth);
  const currentSalesNPR = currentMonthInvoices
    .filter(inv => inv.status !== "Cancelled")
    .reduce((sum, inv) => sum + Number(inv.totalNPR || 0), 0);
  const currentSalesGBP = currentSalesNPR / GBP_RATE;
  const pct = Math.min(Math.round((currentSalesNPR / targetNPR) * 100), 100);
  
  return {
    currentSalesNPR,
    currentSalesGBP,
    targetNPR,
    targetGBP,
    pct
  };
}

function SalesTargetCard({ salesTarget }) {
  if (!salesTarget) return null;
  const { currentSalesNPR, targetNPR, pct } = salesTarget;
  const { fmt: fmtC } = useCurrency();
  return (
    <Card title="Monthly Sales Target" sub="Target vs Actual Revenue" accent="var(--mint-deep)">
      <div className="ksales-target" style={{ padding: "4px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em" }}>Revenue MTD</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span className="num-xl" style={{ fontSize: 24, fontWeight: 700 }}>{fmtC(currentSalesNPR)}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em" }}>Target: {fmtC(targetNPR)}</div>
            <div className="num-xl" style={{ fontSize: 18, color: "var(--mint-deep)", marginTop: 4 }}>{pct}% Achieved</div>
          </div>
        </div>

        <div style={{ background: "rgba(15,46,34,.07)", borderRadius: 10, padding: "2px", position: "relative", marginBottom: 8 }}>
          <Progress pct={pct} color="var(--mint-deep)" h={12} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--mono)" }}>
          <span>{fmtC(0)}</span>
          <span>50%</span>
          <span>{fmtC(targetNPR)}</span>
        </div>
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════
   NEPAL ADMIN DASHBOARD
══════════════════════════════════════════════════════ */
function NepalAdminDash() {
  const { profile } = useAuth();
  const [data, setData]       = useState(null);
  const [loadErr, setLoadErr] = useState(null);

  useEffect(() => {
    async function load() {
      const today = todayDate();
      const weekStart = startOfWeekDate();

      // loadCollections uses Promise.allSettled internally — a permissions error
      // on one collection returns [] for that key and never crashes the dashboard.
      const {
        attendance, production: prodRows, qc_logs: qcLogs, inventory,
        tasks, budget_requests: budgetRequests, orders, finance_expenses: expenses, users,
        order_costs: orderCosts, invoices,
      } = await loadCollections({
        attendance:       "attendance",
        production:       "production",
        qc_logs:          "qc_logs",
        inventory:        "inventory",
        tasks:            "tasks",
        budget_requests:  "budget_requests",
        orders:           "orders",
        finance_expenses: "finance_expenses",
        users:            "users",
        order_costs:      "order_costs",
        invoices:         "invoices",
      });

      const todayAtt = attendance.filter(r => r.date === today);
      const presentToday = todayAtt.filter(r => ["Present", "Late", "Half-day"].includes(r.status)).length;
      const lateToday = todayAtt.filter(r => r.status === "Late").length;
      const leaveToday = todayAtt.filter(r => r.status === "Leave").length;
      const totalStaff = users.filter(u => ["nepal_admin","employee","nepal_staff"].includes(u.role)).length || users.length || 7;
      const absent = Math.max(0, totalStaff - presentToday - leaveToday);

      const weeklyUnits = prodRows.filter(b => b.date >= weekStart).reduce((s, b) => s + Number(b.passed || 0), 0);

      const totalInsp = qcLogs.reduce((s, r) => s + Number(r.inspected || r.checked || 0), 0);
      const totalPass = qcLogs.reduce((s, r) => s + Number(r.passed || 0), 0);
      const qcPassRate = totalInsp ? ((totalPass / totalInsp) * 100).toFixed(1) : "0.0";

      const lowStockItems = inventory.filter(item => {
        const closing = Number(item.openingStock || 0) + Number(item.stockIn || 0) - Number(item.stockUsed || 0);
        return closing <= Number(item.minLevel || 0);
      }).slice(0, 4);

      const tasksByCol = {
        todo:       tasks.filter(t => t.status === "To Do").length,
        in_progress:tasks.filter(t => t.status === "In Progress").length,
        blocked:    tasks.filter(t => t.status === "Blocked").length,
        done:       tasks.filter(t => t.status === "Done").length,
      };
      const recentTasks = tasks.filter(t => t.status !== "Done").slice(0, 5);

      const pendingBudget = budgetRequests.filter(b => b.status === "Pending" || !b.status);

      // Fix: filter by status not stage so On Hold orders aren't counted as active
      const activeOrders = orders.filter(o => o.status === "Active");

      const thisMonth = new Date().toISOString().slice(0, 7);
      const monthExpNPR = expenses.filter(e => (e.date || "").slice(0, 7) === thisMonth).reduce((s, e) => s + Number(e.amountNPR || 0), 0);

      // Real weekly expense trend (last 7 weeks)
      const weeklyExpTrend = Array.from({ length: 7 }, (_, i) => {
        const wEnd = new Date(); wEnd.setDate(wEnd.getDate() - i * 7);
        const wStart = new Date(wEnd); wStart.setDate(wStart.getDate() - 6);
        const wKey = wStart.toISOString().slice(0, 10);
        const wKeyEnd = wEnd.toISOString().slice(0, 10);
        return expenses.filter(e => e.date >= wKey && e.date <= wKeyEnd).reduce((s, e) => s + Number(e.amountNPR || 0), 0);
      }).reverse();
      const weeklyExpLabels = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i) * 7);
        return `W${Math.ceil(d.getDate() / 7)}`;
      });

      // Revenue & P&L from orders + order_costs
      const costsMap = Object.fromEntries(orderCosts.map(c => [c.id, c]));
      const totalRevNPR = orders.reduce((s, o) => s + Number(o.totalValueNPR || 0), 0);
      const thisMonthRevNPR = orders.filter(o => (o.date || "").slice(0, 7) === thisMonth).reduce((s, o) => s + Number(o.totalValueNPR || 0), 0);
      const totalCostNPR = orderCosts.reduce((s, c) => s + Number(c.material || 0) + Number(c.labour || 0) + Number(c.overhead || 0) + Number(c.shipping || 0), 0);
      const totalProfitNPR = totalRevNPR - totalCostNPR;
      const avgMargin = totalRevNPR > 0 ? ((totalProfitNPR / totalRevNPR) * 100).toFixed(1) : "0.0";

      const recentBatches = [...qcLogs].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5).map(b => {
        const insp = Number(b.inspected || b.checked || 0);
        const pass = Number(b.passed || 0);
        return { ...b, pct: insp ? (pass / insp) * 100 : 0 };
      });

      // Attendance trend (last 14 days rolling)
      const attTrend = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (13 - i));
        const key = d.toISOString().slice(0, 10);
        return attendance.filter(r => r.date === key && ["Present","Late","Half-day"].includes(r.status)).length;
      });

      const salesTarget = getSalesTargetInfo(invoices);

      setData({
        presentToday, lateToday, leaveToday, absent, totalStaff, weeklyUnits, qcPassRate,
        lowStockItems, tasksByCol, recentTasks, pendingBudget, activeOrders, orders, monthExpNPR,
        weeklyExpTrend, weeklyExpLabels, thisMonthRevNPR, totalRevNPR, totalCostNPR, totalProfitNPR, avgMargin,
        recentBatches, attTrend, salesTarget,
      });
    }
    load().catch(e => { console.error(e); setLoadErr(e.message || "Failed to load."); });
  }, []);

  const { fmt: fmtC } = useCurrency();

  if (loadErr) return (
    <AppLayout>
      <div style={{ padding: 32, color: "var(--terra)", fontSize: 14 }}>
        ⚠️ Dashboard failed to load: {loadErr}<br />
        <button style={{ marginTop: 12, padding: "6px 16px", borderRadius: 8, border: "1px solid var(--terra)", background: "transparent", color: "var(--terra)", cursor: "pointer" }} onClick={() => { setLoadErr(null); setData(null); }}>Retry</button>
      </div>
    </AppLayout>
  );
  if (!data) return <Loading />;

  return (
    <AppLayout>
      <div className="kdash fade-in">
        {/* KPI Row */}
        <div className="kgrid kgrid--4">
          <KPI label="Staff in today" value={data.presentToday} unit={`/${data.totalStaff}`}
            deltaLabel={`${data.lateToday} late · ${data.leaveToday} on leave`}
            icon={<Icons.Attendance size={14} sw={1.8}/>}
            spark={<Spark data={data.attTrend} color="var(--mint-2)" fill="var(--mint-soft)" />}
          />
          <KPI label="Active orders" value={data.activeOrders.length} unit={`/${data.orders.length}`}
            deltaLabel={`${data.orders.filter(o => o.status === "Completed").length} completed`}
            icon={<Icons.Production size={14} sw={1.8}/>}
          />
          <KPI label="Open tasks" value={data.tasksByCol.todo + data.tasksByCol.in_progress}
            deltaLabel={`${data.tasksByCol.blocked} blocked`}
            icon={<Icons.Tasks size={14} sw={1.8}/>}
            spark={<Spark data={[12,11,10,9,9,8,data.tasksByCol.todo+data.tasksByCol.in_progress]} color="var(--blue)" fill="var(--blue-soft)" />}
          />
          <KPI label="QC pass rate" value={data.qcPassRate} unit="%"
            icon={<Icons.QC size={14} sw={1.8}/>}
            spark={<Spark data={[94,93,95,96,95,97,Number(data.qcPassRate)]} color="var(--mint-2)" fill="var(--mint-soft)" />}
          />
        </div>

        <SalesTargetCard salesTarget={data.salesTarget} />

        {/* Production pipeline */}
        <Card
          title="Production pipeline"
          sub="Active orders by stage"
          accent="var(--mint-deep)"
          action={
            <>
              <Pill tone="mint" dot>Live</Pill>
              <Btn kind="ghost" size="sm" iconRight={<Icons.ArrowRight size={14}/>}
                onClick={() => window.location.href='/production'}>View board</Btn>
            </>
          }
        >
          <ProductionPipeline orders={data.orders} />
        </Card>

        {/* Row 2: Attendance + Tasks + Inventory */}
        <div className="kgrid kgrid--3">
          <Card title="Attendance today" sub="Staff at the workshop" accent="var(--mint-2)"
            action={<Btn kind="ghost" size="sm" iconRight={<Icons.ArrowRight size={13}/>} onClick={() => window.location.href='/attendance'}>Open</Btn>}>
            <div className="kna-att">
              <AttendanceRing present={data.presentToday} late={data.lateToday} leave={data.leaveToday} absent={data.absent} total={data.totalStaff} size={170} />
              <div className="kna-att-list">
                {[
                  { label: "Present", count: data.presentToday - data.lateToday, status: "present" },
                  { label: "Late", count: data.lateToday, status: "late" },
                  { label: "On leave", count: data.leaveToday, status: "leave" },
                  { label: "Absent", count: data.absent, status: "absent" },
                ].map(row => (
                  <div key={row.status} className="kna-att-row">
                    <span className={`kna-att-dot kna-att-dot--${row.status}`} />
                    <div className="kna-att-meta">
                      <div className="kna-att-n">{row.label}</div>
                    </div>
                    <div className="kna-att-end">
                      <span className="mono" style={{ fontWeight: 600 }}>{row.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card title="Task board" sub={`${Object.values(data.tasksByCol).reduce((a,b)=>a+b,0)} tasks`} accent="var(--blue)"
            action={<Btn kind="ghost" size="sm" iconRight={<Icons.ArrowRight size={13}/>} onClick={() => window.location.href='/tasks'}>Open</Btn>}>
            <div className="kna-tasks">
              <div className="kna-task-stats">
                {[
                  { label: "To do",      n: data.tasksByCol.todo,        color: "var(--ink)" },
                  { label: "In progress",n: data.tasksByCol.in_progress,  color: "var(--mint-deep)" },
                  { label: "Blocked",    n: data.tasksByCol.blocked,      color: "var(--terra)" },
                  { label: "Done · 7d",  n: data.tasksByCol.done,         color: "var(--ink-4)" },
                ].map(s => (
                  <div key={s.label} className="kna-stat">
                    <span className="kna-stat-n num-xl" style={{ color: s.color }}>{s.n}</span>
                    <span className="kna-stat-l">{s.label}</span>
                  </div>
                ))}
              </div>
              <Divider />
              <div className="kna-task-list">
                {data.recentTasks.map(t => (
                  <div key={t.id} className="kna-task">
                    <span className={`kna-task-prio kna-task-prio--${t.priority === "High" ? "high" : t.priority === "Medium" ? "med" : "low"}`} />
                    <div className="kna-task-t">
                      <div className="kna-task-title">{t.title}</div>
                      <div className="kna-task-sub">
                        <span className="mono">{t.id?.slice(-6)}</span>
                        {t.assignee && <><Dot/><span>{t.assignee}</span></>}
                      </div>
                    </div>
                    <Avatar name={t.assignee || "?"} hue={92} size={22} />
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card title="Inventory alerts" sub="Below reorder threshold" accent="var(--amber)"
            action={<Pill tone="amber" dot>{data.lowStockItems.length} low</Pill>}>
            <div className="kna-inv">
              {data.lowStockItems.length === 0
                ? <p style={{ fontSize: 13, color: "var(--ink-4)", textAlign: "center", padding: "20px 0" }}>All stock levels OK</p>
                : data.lowStockItems.map((item, i) => {
                    const closing = Number(item.openingStock||0) + Number(item.stockIn||0) - Number(item.stockUsed||0);
                    const ratio = item.minLevel ? closing / item.minLevel : 0.3;
                    return (
                      <div key={i} className="kna-inv-row">
                        <div className="kna-inv-l">
                          <div className="kna-inv-n">{item.item}</div>
                          <div className="kna-inv-s mono">{item.category || "Stock"}</div>
                        </div>
                        <div className="kna-inv-r">
                          <div className="kna-inv-q">
                            <span className="num-xl" style={{ fontSize: 16, color: ratio < 0.4 ? "var(--terra)" : "var(--amber)" }}>{closing}</span>
                            <span className="kna-inv-u mono">/{item.minLevel} {item.unit}</span>
                          </div>
                          <Progress pct={Math.min(ratio * 100, 100)} color={ratio < 0.4 ? "var(--terra)" : "var(--amber)"} h={4}/>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </Card>
        </div>

        {/* Row 3: Finance + QC */}
        <div className="kgrid kgrid--2">
          <Card title="Finance snapshot" sub={`${new Date().toLocaleString("en-US",{month:"long"})} ${new Date().getFullYear()} to date`} accent="var(--mint-deep)"
            action={<Btn kind="ghost" size="sm" iconRight={<Icons.ArrowRight size={13}/>} onClick={() => window.location.href='/finance'}>Finance</Btn>}>
            <div className="kna-fin">
              <div className="kna-fin-top">
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div className="kna-fin-l">This month revenue</div>
                    <div className="num-xl" style={{ fontSize: 24 }}>{fmtC(data.thisMonthRevNPR)}</div>
                  </div>
                  <div>
                    <div className="kna-fin-l">This month expenses</div>
                    <div className="num-xl" style={{ fontSize: 24, color: "var(--terra)" }}>{fmtC(data.monthExpNPR)}</div>
                  </div>
                  <div>
                    <div className="kna-fin-l">Overall margin</div>
                    <div className="num-xl" style={{ fontSize: 20, color: Number(data.avgMargin) >= 20 ? "var(--mint-deep)" : "var(--amber)" }}>{data.avgMargin}%</div>
                  </div>
                </div>
                <div className="kna-fin-bar">
                  <Bars data={data.weeklyExpTrend} labels={data.weeklyExpLabels} color="var(--mint-deep)" height={80}/>
                </div>
              </div>
              <Divider />
              <div className="kna-fin-br">
                <div className="kna-fin-br-h">
                  <div>
                    <div className="kna-fin-br-l">Pending budget requests</div>
                    <div className="kna-fin-br-s">Awaiting UK director sign-off</div>
                  </div>
                  <Pill tone="amber" dot>{data.pendingBudget.length}</Pill>
                </div>
                {data.pendingBudget.slice(0, 2).map(br => (
                  <div key={br.id} className="kna-br-row">
                    <Avatar name={br.submittedBy || br.name || "?"} hue={60} size={24}/>
                    <div className="kna-br-t">
                      <div>{br.title || br.item || "Budget request"}</div>
                      <div className="kna-br-s"><span className="mono">{br.id?.slice(-8)}</span> · {br.submittedBy || "—"}</div>
                    </div>
                    <div className="mono kna-br-amt">{fmtC(Number(br.amountNPR || br.amount || 0))}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card title="QC quality" sub="Pass rate across all batches" accent="var(--mint-2)"
            action={<Btn kind="ghost" size="sm" iconRight={<Icons.ArrowRight size={13}/>} onClick={() => window.location.href='/qc'}>QC log</Btn>}>
            <div className="kna-qc">
              <QCDial batches={data.recentBatches} size={220} />
              <div className="kna-qc-list">
                <div className="kna-qc-l-h">Recent batches</div>
                {data.recentBatches.slice(0, 4).map((b, i) => {
                  const tone = b.pct >= 98 ? "mint" : b.pct >= 92 ? "amber" : "terra";
                  return (
                    <div key={i} className="kna-qc-row">
                      <span className="mono kna-qc-id">{b.batchId || b.id || `#${i+1}`}</span>
                      <div className="kna-qc-bar">
                        <Progress pct={b.pct} color={`var(--${tone === "mint" ? "mint-2" : tone})`} h={5}/>
                      </div>
                      <span className="num-xl mono" style={{ fontSize: 13 }}>{b.pct.toFixed(1)}%</span>
                      <span className="kna-qc-d mono">{b.passed}/{b.inspected || b.checked || 0}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

/* ══════════════════════════════════════════════════════
   UK ADMIN DASHBOARD
══════════════════════════════════════════════════════ */
function UKAdminDash() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    async function load() {
      const today = todayDate();

      const results = await Promise.allSettled([
        getDocs(collection(db, "invoices")),
        getDocs(collection(db, "orders")),
        getDocs(collection(db, "qc_logs")),
        getDocs(collection(db, "attendance")),
        getDocs(collection(db, "budget_requests")),
        getDocs(collection(db, "users")),
      ]);
      const docs = (r) => r.status === "fulfilled" ? r.value.docs : [];
      const [invoicesSnap, ordersSnap, qcSnap, attSnap, budgetSnap, usersSnap] = results.map(docs);

      const totalStaff = usersSnap.filter(d => {
        const r = d.data().role;
        return ["nepal_admin","employee","nepal_staff"].includes(r);
      }).length || 7;

      const invoices = invoicesSnap.map(d => ({ id: d.id, ...d.data() }));
      const orders = ordersSnap.map(d => ({ id: d.id, ...d.data() }));
      const qcLogs = qcSnap.map(d => d.data());
      const attendance = attSnap.map(d => d.data());
      const budgetRequests = budgetSnap.map(d => ({ id: d.id, ...d.data() }));

      const thisMonth = new Date().toISOString().slice(0, 7);
      const monthInvoices = invoices.filter(inv => (inv.date || "").slice(0, 7) === thisMonth);
      const totalPaidNPR = invoices.filter(i => i.status === "Paid").reduce((s, i) => s + Number(i.totalNPR || 0), 0);
      const outstandingNPR = invoices.filter(i => !["Paid","Cancelled"].includes(i.status)).reduce((s, i) => s + Number(i.totalNPR || 0), 0);
      const overdueNPR = invoices.filter(i => i.status === "Overdue").reduce((s, i) => s + Number(i.totalNPR || 0), 0);

      const presentToday = attendance.filter(r => r.date === today && ["Present","Late","Half-day"].includes(r.status)).length;
      const lateToday    = attendance.filter(r => r.date === today && r.status === "Late").length;
      const leaveToday   = attendance.filter(r => r.date === today && r.status === "Leave").length;

      const inProgress = orders.filter(o => !["Delivered","Cancelled","Shipped"].includes(o.stage)).length;
      const dispatched = orders.filter(o => ["Shipped","Delivered"].includes(o.stage)).length;

      const pendingBudget = budgetRequests.filter(b => b.status === "Pending" || !b.status);

      // 30-day revenue trend
      const dates30 = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (29-i));
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      });
      const revData = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (29-i));
        const key = d.toISOString().slice(0,10);
        return invoices.filter(inv => inv.date === key && inv.status === "Paid").reduce((s, inv) => s + Math.round(Number(inv.totalNPR||0) / GBP_RATE), 0);
      });

      const recentInvoices = [...invoices].sort((a,b) => (b.date||"").localeCompare(a.date||"")).slice(0, 5);
      const invoiceSegments = [
        { v: invoices.filter(i=>i.status==="Paid").reduce((s,i)=>s+Number(i.totalNPR||0),0) / GBP_RATE, color: "var(--mint-2)" },
        { v: invoices.filter(i=>i.status==="Outstanding"||i.status==="Sent").reduce((s,i)=>s+Number(i.totalNPR||0),0) / GBP_RATE, color: "var(--amber)" },
        { v: overdueNPR / GBP_RATE, color: "var(--terra)" },
        { v: invoices.filter(i=>i.status==="Draft").reduce((s,i)=>s+Number(i.totalNPR||0),0) / GBP_RATE, color: "var(--ink-5)" },
      ];

      const results2 = await Promise.allSettled([getDocs(collection(db, "finance_payroll"))]);
      const payrollDocs = results2[0].status === "fulfilled" ? results2[0].value.docs.map(d => d.data()) : [];
      const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const nowDate = new Date();
      const curMonthName = MONTH_NAMES[nowDate.getMonth()];
      const curYear = nowDate.getFullYear();
      // Try current month first, fall back to most recent month with data
      let payrollDocs2 = payrollDocs.filter(p => p.month === curMonthName && Number(p.year) === curYear);
      if (payrollDocs2.length === 0) {
        // Find the most recent month that has records
        const sorted = [...payrollDocs].sort((a, b) => {
          const aIdx = MONTH_NAMES.indexOf(a.month) + (Number(a.year) || 0) * 12;
          const bIdx = MONTH_NAMES.indexOf(b.month) + (Number(b.year) || 0) * 12;
          return bIdx - aIdx;
        });
        const latest = sorted[0];
        if (latest) payrollDocs2 = payrollDocs.filter(p => p.month === latest.month && Number(p.year) === Number(latest.year));
      }
      const payrollNPR = payrollDocs2.reduce((s, p) => s + Number(p.netNPR || p.amountNPR || p.amount || 0), 0);

      const salesTarget = getSalesTargetInfo(invoices);

      setData({
        totalPaidNPR, outstandingNPR, overdueNPR, inProgress, dispatched, presentToday, lateToday, leaveToday,
        pendingBudget, dates30, revData, recentInvoices, invoiceSegments, orders, totalStaff, payrollNPR,
        salesTarget,
      });
    }
    load().catch(e => { console.error(e); setData({}); });
  }, []);

  const { fmt: fmtC } = useCurrency();

  if (!data) return <Loading />;

  return (
    <AppLayout>
      <div className="kdash fade-in">
        {/* KPI Row */}
        <div className="kgrid kgrid--4">
          <KPI label="Revenue · MTD" value={fmtC(data.totalPaidNPR || 0)} delta={18.4} deltaLabel="vs last month"
            icon={<Icons.Finance size={14} sw={1.8}/>}
            spark={<Spark data={data.revData.slice(-14)} color="var(--mint-deep)" fill="var(--mint-soft)" />}
          />
          <KPI label="Outstanding" value={fmtC(data.outstandingNPR)}
            deltaLabel={data.overdueNPR > 0 ? `${fmtC(data.overdueNPR)} overdue` : "None overdue"}
            icon={<Icons.Billing size={14} sw={1.8}/>}
            spark={<Spark data={[14,15,14,12,11,12,11]} color="var(--terra)" fill="var(--terra-soft)" />}
          />
          <KPI label="Active orders" value={data.inProgress} unit={`/${data.orders.length}`}
            deltaLabel={`${data.dispatched} dispatched`}
            icon={<Icons.Production size={14} sw={1.8}/>}
            spark={<Spark data={[2,3,3,4,4,5,data.inProgress]} color="var(--mint-2)" fill="var(--mint-soft)" />}
          />
          <KPI label="Payroll · month" value={fmtC(data.payrollNPR)}
            icon={<Icons.Employees size={14} sw={1.8}/>}
            spark={<Spark data={[3.0,3.1,3.2,3.1,3.2,3.2,3.2]} color="var(--blue)" fill="var(--blue-soft)" />}
          />
        </div>

        <SalesTargetCard salesTarget={data.salesTarget} />

        {/* Revenue chart */}
        <Card title="Revenue · 30 days" sub="Paid invoices · in GBP" accent="var(--mint-deep)"
          action={
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div className="kuk-leg">
                <span><span className="kuk-leg-d" style={{ background: "var(--mint-deep)" }}/>This period</span>
              </div>
              <Btn kind="outline" size="sm" icon={<Icons.Send size={13}/>}>Export</Btn>
            </div>
          }
        >
          <AreaChart
            series={[{ label: "Revenue", data: data.revData, color: "var(--mint-deep)", fillOpacity: 0.3 }]}
            dates={data.dates30}
            height={240}
          />
        </Card>

        {/* Row 2: Budget + Invoices */}
        <div className="kgrid kgrid--3-2">
          <Card title="Awaiting your approval" sub="Budget requests from Kathmandu" accent="var(--amber)"
            action={<Pill tone="amber" dot>{data.pendingBudget.length} pending</Pill>}>
            <div className="kuk-br">
              {data.pendingBudget.length === 0
                ? <p style={{ fontSize: 13, color: "var(--ink-4)", padding: "20px 0", textAlign: "center" }}>No pending requests</p>
                : data.pendingBudget.slice(0, 4).map(br => <BudgetApprovalCard key={br.id} br={br} />)
              }
            </div>
          </Card>

          <Card title="Invoices" sub="By status · GBP" accent="var(--mint-deep)"
            action={<Btn kind="ghost" size="sm" iconRight={<Icons.ArrowRight size={13}/>} onClick={() => window.location.href='/billing'}>Billing</Btn>}>
            <div className="kuk-inv">
              <div className="kuk-inv-top">
                <Donut size={140} thickness={18} segments={data.invoiceSegments}/>
                <div className="kuk-inv-leg">
                  {[
                    { label: "Paid",        color: "var(--mint-2)",  v: fmtC(data.totalPaidNPR) },
                    { label: "Outstanding", color: "var(--amber)",   v: fmtC(data.outstandingNPR - data.overdueNPR) },
                    { label: "Overdue",     color: "var(--terra)",   v: fmtC(data.overdueNPR) },
                  ].map(r => (
                    <div key={r.label} className="klegrow">
                      <span className="klegrow-d" style={{ background: r.color }}/>
                      <span>{r.label}</span>
                      <strong className="mono">{r.v}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <Divider />
              <div className="kuk-inv-list">
                {data.recentInvoices.slice(0, 3).map(i => {
                  const tone = i.status === "Paid" ? "mint" : i.status === "Overdue" ? "terra" : i.status === "Outstanding" || i.status === "Sent" ? "amber" : "neutral";
                  return (
                    <div key={i.id} className="kuk-inv-row">
                      <div>
                        <div className="kuk-inv-id mono">{i.invoiceNumber || i.id}</div>
                        <div className="kuk-inv-c">{i.clientName || "—"}</div>
                      </div>
                      <div className="kuk-inv-end">
                        <div className="num-xl mono" style={{ fontSize: 15 }}>{fmtC(Number(i.totalNPR||0))}</div>
                        <Pill tone={tone}>{i.status || "Draft"}</Pill>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        {/* Row 3: Pipeline + Workshop */}
        <div className="kgrid kgrid--3-2">
          <Card title="Order pipeline" sub="From Kathmandu floor" accent="var(--mint-deep)"
            action={<Btn kind="ghost" size="sm" iconRight={<Icons.ArrowRight size={13}/>} onClick={() => window.location.href='/production'}>Production</Btn>}>
            <ProductionPipeline orders={data.orders} />
          </Card>

          <Card title="Today at the workshop" accent="var(--mint-2)">
            <div className="kuk-floor">
              <div className="kuk-floor-h">
                <div>
                  <div className="num-xl" style={{ fontSize: 42 }}>
                    {data.presentToday}<span style={{ color: "var(--ink-4)", fontSize: 24 }}>/{data.totalStaff}</span>
                  </div>
                  <div className="kuk-floor-l">staff in today</div>
                </div>
                <AttendanceRing present={data.presentToday} late={data.lateToday} leave={data.leaveToday} absent={Math.max(0, data.totalStaff - data.presentToday - data.leaveToday)} total={data.totalStaff} size={90} />
              </div>
              <Divider />
              <div className="kuk-floor-meta">
                <div>
                  <div className="kuk-floor-meta-l">Late this week</div>
                  <div className="num-xl mono" style={{ fontSize: 18, color: "var(--amber)" }}>{data.lateToday}</div>
                </div>
                <div>
                  <div className="kuk-floor-meta-l">On leave</div>
                  <div className="num-xl mono" style={{ fontSize: 18 }}>{data.leaveToday}</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function BudgetApprovalCard({ br }) {
  const [state, setState] = useState(br.status === "Approved" ? "approved" : br.status === "Rejected" ? "rejected" : null);
  const [saving, setSaving] = useState(false);
  const { fmt: fmtC } = useCurrency();
  const amtNPR = Number(br.amountNPR || br.amount || 0);
  const urgencyTone = br.urgency === "high" ? "terra" : br.urgency === "med" || br.urgency === "medium" ? "amber" : "neutral";

  async function handleDecision(decision) {
    setSaving(true);
    try {
      await updateDoc(doc(db, "budget_requests", br.id), {
        status: decision === "approved" ? "Approved" : "Rejected",
        reviewedAt: serverTimestamp(),
      });
      setState(decision);
    } catch (err) {
      console.error("Failed to update budget request:", err);
      alert("Failed to update budget request: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("kbr", state && `kbr--${state}`)}>
      <div className="kbr-h">
        <Avatar name={br.submittedBy || br.name || "?"} hue={60} size={28}/>
        <div className="kbr-h-t">
          <div className="kbr-h-n">{br.submittedBy || "—"}</div>
          <div className="kbr-h-r"><span className="mono">{br.id?.slice(-8)}</span></div>
        </div>
        <Pill tone={urgencyTone}>{br.urgency || "normal"}</Pill>
      </div>
      <div className="kbr-what">{br.title || br.item || "Budget request"}</div>
      {br.reason && <div className="kbr-reason">{br.reason}</div>}
      <div className="kbr-amt-row">
        <div>
          <div className="num-xl" style={{ fontSize: 22 }}>{fmtC(amtNPR)}</div>
          <div className="kbr-amt-s mono">₨ {amtNPR.toLocaleString("en-IN")}</div>
        </div>
        {state === null && (
          <div className="kbr-actions">
            <Btn kind="soft" size="sm" icon={<Icons.X size={13} sw={2.2}/>} disabled={saving} onClick={() => handleDecision("rejected")}>Reject</Btn>
            <Btn kind="mint" size="sm" icon={<Icons.Check size={13} sw={2.4}/>} disabled={saving} onClick={() => handleDecision("approved")}>Approve</Btn>
          </div>
        )}
        {state === "approved" && <Pill tone="mint" icon={<Icons.Check size={12} sw={2.4}/>}>Approved</Pill>}
        {state === "rejected"  && <Pill tone="terra" icon={<Icons.X size={12} sw={2.2}/>}>Rejected</Pill>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   EMPLOYEE DASHBOARD
══════════════════════════════════════════════════════ */
function EmployeeDash() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);

  async function load() {
    const today = todayDate();
    const name = profile?.name || "";
    const results = await Promise.allSettled([
      getDocs(query(collection(db, "attendance"), where("date", "==", today))),
      getDocs(collection(db, "tasks")),
      getDocs(collection(db, "invoices")),
    ]);
    const docs = (r) => r.status === "fulfilled" ? r.value.docs : [];
    const [attSnap, tasksSnap, invoicesSnap] = results.map(docs);
    const myRecord = attSnap.map(d => d.data()).find(r => r.staffName === name);
    const tasks = tasksSnap.map(d => ({ id: d.id, ...d.data() }));
    const myTasks = tasks.filter(t => (t.assignee || "").toLowerCase() === name.toLowerCase());
    const invoices = invoicesSnap.map(d => ({ id: d.id, ...d.data() }));
    const salesTarget = getSalesTargetInfo(invoices);

    // Month attendance — real data from Firestore
    let allAtt = [];
    try { allAtt = (await getDocs(collection(db, "attendance"))).docs.map(d => d.data()).filter(r => r.staffName === name); } catch (_) {}

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthAtt = allAtt.filter(r => r.date?.slice(0, 7) === monthKey);
    const counts = {
      present: monthAtt.filter(r => r.status === "Present").length,
      late:    monthAtt.filter(r => r.status === "Late").length,
      leave:   monthAtt.filter(r => r.status === "Leave").length,
    };
    setData({ myRecord, myTasks, counts, monthAtt, salesTarget });
  }

  useEffect(() => {
    load().catch(console.error);
  }, [profile]);

  if (!data) return <Loading />;

  return (
    <AppLayout>
      <div className="kdash fade-in">
        {/* Clock-in hero */}
        <ClockInCard profile={profile} onClockChange={load} />

        <SalesTargetCard salesTarget={data.salesTarget} />

        {/* Tasks + Attendance */}
        <div className="kgrid kgrid--2-3">
          <Card title="Your tasks" sub={`${data.myTasks.length} assigned to you`} accent="var(--blue)"
            action={<Btn kind="ghost" size="sm" iconRight={<Icons.ArrowRight size={13}/>} onClick={() => window.location.href='/tasks'}>Task board</Btn>}>
            <div className="kem-tasks">
              {data.myTasks.length === 0
                ? (
                  <div className="kem-empty">
                    <Icons.Check size={28} sw={1.8}/>
                    <div>You're all caught up.</div>
                    <span>Nothing assigned to you today.</span>
                  </div>
                )
                : data.myTasks.map(t => {
                    const col = t.status === "In Progress" ? "in_progress" : t.status === "Blocked" ? "blocked" : "todo";
                    const tone = t.status === "In Progress" ? "mint" : t.status === "Blocked" ? "terra" : "neutral";
                    return (
                      <div key={t.id} className={cn("kem-task", `kem-task--${col}`)}>
                        <span className={`kem-task-prio kem-task-prio--${t.priority === "High" ? "high" : t.priority === "Medium" ? "med" : "low"}`} />
                        <div className="kem-task-t">
                          <div className="kem-task-title">{t.title}</div>
                          <div className="kem-task-sub"><span className="mono">{t.id?.slice(-6)}</span></div>
                        </div>
                        <Pill tone={tone}>{t.status || "To Do"}</Pill>
                        {t.dueDate && (
                          <div className="kem-task-due"><Icons.Clock size={12}/><span>{t.dueDate}</span></div>
                        )}
                      </div>
                    );
                  })
              }
            </div>
          </Card>

          <Card title="Your attendance" sub={`${new Date().toLocaleString("en-US",{month:"long",year:"numeric"})}`} accent="var(--mint-2)">
            <div className="kem-att">
              <div className="kem-att-stats">
                <div className="kem-att-stat"><span className="num-xl">{data.counts.present}</span><span>Present</span></div>
                <div className="kem-att-stat"><span className="num-xl" style={{color:"var(--amber)"}}>{data.counts.late}</span><span>Late</span></div>
                <div className="kem-att-stat"><span className="num-xl" style={{color:"var(--blue)"}}>{data.counts.leave}</span><span>Leave</span></div>
              </div>
              <MyAttendanceCalendar monthAtt={data.monthAtt} />
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function MyAttendanceCalendar({ monthAtt = [] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDay = now.getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Build a lookup: day-of-month → status from real Firestore data
  const statusMap = {};
  monthAtt.forEach(r => {
    if (!r.date) return;
    const day = parseInt(r.date.slice(8, 10), 10);
    const s = (r.status || "").toLowerCase();
    if (s === "present")         statusMap[day] = "present";
    else if (s === "late")       statusMap[day] = "late";
    else if (s === "half-day")   statusMap[day] = "present";
    else if (s === "leave")      statusMap[day] = "leave";
    else if (s === "absent")     statusMap[day] = "absent";
  });

  // Mark weekends for days without a record
  days.forEach(d => {
    if (d > todayDay || statusMap[d]) return;
    const dow = (new Date(year, month, d).getDay() + 6) % 7; // 0=Mon
    if (dow >= 5) statusMap[d] = "weekend";
  });

  return (
    <div className="kem-att-cal">
      <div className="kem-att-cal-dow">
        {["M","T","W","T","F","S","S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="kem-att-cal-grid">
        {days.map(d => {
          const s = statusMap[d];
          return (
            <div key={d} className={cn("kem-att-day", s && `kem-att-day--${s}`, d === todayDay && "kem-att-day--today")}>
              <span>{d}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════ */
function Dashboard() {
  const { profile } = useAuth();
  const role = profile?.appRole || profile?.role;
  if (role === "uk_admin") return <UKAdminDash />;
  if (role === "employee" || role === "nepal_staff") return <EmployeeDash />;
  return <NepalAdminDash />;
}

export default Dashboard;
