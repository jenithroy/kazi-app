import { useEffect, useState, useMemo } from "react";
import { addDoc, collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
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
import BankBalanceWidget from "../components/BankBalanceWidget";
import { PRODUCT_COSTS } from "../constants/productCosts";

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
  const targetGBP = 2000;
  const targetNPR = targetGBP * GBP_RATE;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const lastMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();

  // Try current month first, fall back to last month if no invoices yet
  let monthKey = thisMonth;
  let monthInvoices = invoices.filter(inv => (inv.date || "").slice(0, 7) === thisMonth && inv.status !== "Cancelled");
  if (monthInvoices.length === 0) {
    monthKey = lastMonth;
    monthInvoices = invoices.filter(inv => (inv.date || "").slice(0, 7) === lastMonth && inv.status !== "Cancelled");
  }

  const currentSalesNPR = monthInvoices.reduce((sum, inv) => sum + Number(inv.totalNPR || 0), 0);
  const pct = Math.min(Math.round((currentSalesNPR / targetNPR) * 100), 100);
  const isLastMonth = monthKey === lastMonth && monthKey !== thisMonth;

  return { currentSalesNPR, targetNPR, pct, isLastMonth };
}

function SalesTargetCard({ salesTarget }) {
  if (!salesTarget) return null;
  const { currentSalesNPR, targetNPR, pct, isLastMonth } = salesTarget;
  const { fmt: fmtC } = useCurrency();
  return (
    <Card title="Monthly Sales Target" sub={isLastMonth ? "Showing last month — no invoices this month yet" : "Target vs Actual Revenue"} accent="var(--mint-deep)">
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

/* ── Ops Alerts Strip ─────────────────────────────── */
function OpsAlerts({ overdueInvoices = [], overdueInvoiceTotalNPR = 0, overdueTasks = [], presentToday = 0, lateToday = 0, absent = 0, totalStaff = 0, lowInventoryCount = 0 }) {
  const { fmt: fmtC } = useCurrency();
  const alerts = [
    {
      key: "invoices",
      hide: overdueInvoices.length === 0,
      tone: "terra",
      icon: <Icons.Billing size={15} sw={1.8}/>,
      value: overdueInvoices.length,
      label: "overdue invoice" + (overdueInvoices.length !== 1 ? "s" : ""),
      sub: fmtC(overdueInvoiceTotalNPR),
      href: "/billing",
    },
    {
      key: "tasks",
      hide: overdueTasks.length === 0,
      tone: "amber",
      icon: <Icons.Tasks size={15} sw={1.8}/>,
      value: overdueTasks.length,
      label: "overdue task" + (overdueTasks.length !== 1 ? "s" : ""),
      sub: "past due date",
      href: "/tasks",
    },
    {
      key: "attendance",
      hide: false,
      tone: absent > 0 ? "amber" : "mint",
      icon: <Icons.Attendance size={15} sw={1.8}/>,
      value: presentToday,
      label: `/${totalStaff} present today`,
      sub: `${lateToday} late · ${absent} absent`,
      href: "/attendance",
    },
    {
      key: "inventory",
      hide: lowInventoryCount === 0,
      tone: "amber",
      icon: <Icons.Inventory size={15} sw={1.8}/>,
      value: lowInventoryCount,
      label: "low stock item" + (lowInventoryCount !== 1 ? "s" : ""),
      sub: "at or below reorder point",
      href: "/inventory",
    },
  ];

  const visible = alerts.filter(a => !a.hide);
  if (visible.length === 0) return null;

  const toneStyles = {
    terra: { bg: "var(--terra-soft)", border: "rgba(196,101,74,.25)", color: "#6a2e1c", iconBg: "rgba(196,101,74,.15)" },
    amber: { bg: "var(--amber-soft)", border: "rgba(212,160,74,.3)",  color: "#7a5418", iconBg: "rgba(212,160,74,.18)" },
    mint:  { bg: "var(--mint-soft)",  border: "rgba(90,185,138,.3)",  color: "var(--mint-deep)", iconBg: "rgba(90,185,138,.18)" },
  };

  return (
    <div className="kops-alerts">
      {visible.map(a => {
        const s = toneStyles[a.tone] || toneStyles.amber;
        return (
          <button key={a.key} className="kops-alert-card" onClick={() => window.location.href = a.href}
            style={{ background: s.bg, borderColor: s.border, color: s.color }}>
            <span className="kops-alert-ico" style={{ background: s.iconBg, color: s.color }}>{a.icon}</span>
            <div className="kops-alert-body">
              <span className="kops-alert-val">{a.value}</span>
              <span className="kops-alert-lbl">{a.label}</span>
            </div>
            {a.sub && <span className="kops-alert-sub">{a.sub}</span>}
            <Icons.ArrowRight size={13} sw={2}/>
          </button>
        );
      })}
    </div>
  );
}

/* ── Active Orders Row ────────────────────────────── */
function ActiveOrdersRow({ orders = [] }) {
  if (orders.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);

  const stageTone = (stage) => {
    if (!stage) return "neutral";
    const s = stage.toLowerCase();
    if (s.includes("sample") || s.includes("design")) return "blue";
    if (s.includes("cut") || s.includes("sew") || s.includes("production") || s.includes("in progress")) return "amber";
    if (s.includes("qc") || s.includes("quality")) return "amber";
    if (s.includes("ship") || s.includes("dispatch") || s.includes("deliver")) return "mint";
    if (s.includes("complet") || s.includes("done")) return "mint";
    return "neutral";
  };

  return (
    <Card title="Active orders" sub="5 most recent in-progress orders" accent="var(--mint-deep)"
      action={<Btn kind="ghost" size="sm" iconRight={<Icons.ArrowRight size={13}/>} onClick={() => window.location.href='/production'}>View all</Btn>}>
      <div className="kactive-orders">
        <div className="kactive-orders-hd">
          <span>Order ref</span>
          <span>Customer</span>
          <span>Stage</span>
          <span>Due date</span>
        </div>
        {orders.map(o => {
          const isOverdue = o.dueDate && o.dueDate < today;
          return (
            <div key={o.id} className="kactive-order-row" onClick={() => window.location.href='/production'}>
              <span className="mono kactive-order-ref">{o.orderNumber || o.id?.slice(-8) || "—"}</span>
              <span className="kactive-order-client">{o.clientName || o.customer || "—"}</span>
              <span><Pill tone={stageTone(o.stage || o.status)}>{o.stage || o.status || "—"}</Pill></span>
              <span className="kactive-order-due" style={{ color: isOverdue ? "var(--terra)" : undefined }}>
                {o.dueDate ? o.dueDate : "—"}
                {isOverdue && <Icons.Alert size={12} sw={2} style={{ marginLeft: 4 }}/>}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════
   NEPAL ADMIN DASHBOARD
══════════════════════════════════════════════════════ */
/* ── Product P&L Card ────────────────────────────────── */
const EMPTY_PRODUCT = { code: "", name: "", fabric: "", rib: "", trims: "", labour: "", others: "" };
const COST_COLS = ["fabric", "rib", "trims", "labour", "others"];

function ProductPnLCard({ canEdit }) {
  const GBP = n => (n != null && n !== "" && !isNaN(n)) ? `£${(Number(n) / GBP_RATE).toFixed(2)}` : "—";
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editId, setEditId]     = useState(null); // doc id being edited, or "new"
  const [form, setForm]         = useState(EMPTY_PRODUCT);
  const [saving, setSaving]     = useState(false);

  // Load from Firestore; seed from constants if empty
  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(db, "product_costs"));
      if (snap.empty) {
        // First load — seed from constants
        const batch = [];
        for (const p of PRODUCT_COSTS) {
          batch.push(setDoc(doc(db, "product_costs", p.code), { ...p, updatedAt: new Date().toISOString() }));
        }
        await Promise.all(batch);
        setProducts(PRODUCT_COSTS.map(p => ({ id: p.code, ...p })));
      } else {
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.code.localeCompare(b.code)));
      }
      setLoading(false);
    }
    load();
  }, []);

  const computedTotal = f => {
    const vals = COST_COLS.map(c => Number(f[c]) || 0);
    return vals.reduce((s, v) => s + v, 0);
  };

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) return;
    setSaving(true);
    const total = computedTotal(form);
    const data = { ...form, total, updatedAt: new Date().toISOString() };
    COST_COLS.forEach(c => { data[c] = Number(data[c]) || 0; });
    await setDoc(doc(db, "product_costs", form.code.trim()), data);
    setProducts(prev => {
      const exists = prev.find(p => p.id === form.code.trim());
      const updated = { id: form.code.trim(), ...data };
      return exists
        ? prev.map(p => p.id === form.code.trim() ? updated : p)
        : [...prev, updated].sort((a, b) => a.code.localeCompare(b.code));
    });
    setEditId(null);
    setForm(EMPTY_PRODUCT);
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm(`Delete ${id}?`)) return;
    const { deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "product_costs", id));
    setProducts(prev => prev.filter(p => p.id !== id));
  }

  const inp = { border: "1px solid var(--line-strong)", borderRadius: 5, padding: "3px 6px", fontSize: 12, fontFamily: "var(--font)", background: "#fff", width: "100%" };

  return (
    <Card
      title="Product Costing (COGS)"
      sub="Per unit cost breakdown · editable by admins"
      accent="var(--mint-deep)"
      action={canEdit && editId !== "new" && (
        <Btn kind="ghost" size="sm" onClick={() => { setForm(EMPTY_PRODUCT); setEditId("new"); }}>
          + Add product
        </Btn>
      )}
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Item</th>
              <th style={{ textAlign: "right" }}>Fabric</th>
              <th style={{ textAlign: "right" }}>Rib</th>
              <th style={{ textAlign: "right" }}>Trims</th>
              <th style={{ textAlign: "right" }}>Labour</th>
              <th style={{ textAlign: "right" }}>Others</th>
              <th style={{ textAlign: "right", fontWeight: 700 }}>Total</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canEdit ? 9 : 8} style={{ padding: "16px 8px" }}><div className="kskel kskel-row" /></td></tr>
            ) : products.map(p => (
              editId === p.id ? (
                <tr key={p.id} style={{ background: "var(--mint-soft)" }}>
                  <td><input style={inp} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="kazi100x" /></td>
                  <td><input style={{ ...inp, width: 160 }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Product name" /></td>
                  {COST_COLS.map(c => (
                    <td key={c}><input style={{ ...inp, textAlign: "right", width: 60 }} type="number" value={form[c]} onChange={e => setForm(f => ({ ...f, [c]: e.target.value }))} /></td>
                  ))}
                  <td style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-4)" }}>{GBP(computedTotal(form))}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button style={{ ...inp, background: "var(--mint-deep)", color: "#fff", border: "none", cursor: "pointer", marginRight: 4 }} onClick={handleSave} disabled={saving}>{saving ? "…" : "Save"}</button>
                    <button style={{ ...inp, cursor: "pointer" }} onClick={() => setEditId(null)}>✕</button>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-4)" }}>#{p.code}</td>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  {COST_COLS.map(c => (
                    <td key={c} style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 13 }}>{GBP(p[c])}</td>
                  ))}
                  <td style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700 }}>{GBP(p.total)}</td>
                  {canEdit && (
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button style={{ ...inp, cursor: "pointer", marginRight: 4, fontSize: 11 }} onClick={() => { setForm({ ...p }); setEditId(p.id); }}>Edit</button>
                      <button style={{ ...inp, cursor: "pointer", fontSize: 11, color: "var(--terra)" }} onClick={() => handleDelete(p.id)}>✕</button>
                    </td>
                  )}
                </tr>
              )
            ))}
            {/* New row form */}
            {editId === "new" && (
              <tr style={{ background: "var(--mint-soft)" }}>
                <td><input style={inp} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="kazi100x" /></td>
                <td><input style={{ ...inp, width: 160 }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Product name" /></td>
                {COST_COLS.map(c => (
                  <td key={c}><input style={{ ...inp, textAlign: "right", width: 60 }} type="number" value={form[c]} onChange={e => setForm(f => ({ ...f, [c]: e.target.value }))} /></td>
                ))}
                <td style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-4)" }}>{GBP(computedTotal(form))}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button style={{ ...inp, background: "var(--mint-deep)", color: "#fff", border: "none", cursor: "pointer", marginRight: 4 }} onClick={handleSave} disabled={saving}>{saving ? "…" : "Save"}</button>
                  <button style={{ ...inp, cursor: "pointer" }} onClick={() => setEditId(null)}>✕</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 10 }}>
        All values in GBP (÷{GBP_RATE} NPR) · Total auto-calculated from components
      </div>
    </Card>
  );
}

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

      // KPI targets — task completion by assignee
      const TASK_TARGET = 10; // tickets per person per month
      const doneTasks = tasks.filter(t => t.status === "Done");
      const taskByAssignee = {};
      doneTasks.forEach(t => {
        const name = t.assignee || "Unassigned";
        taskByAssignee[name] = (taskByAssignee[name] || 0) + 1;
      });
      const kpiAssignees = Object.entries(taskByAssignee)
        .map(([name, count]) => ({ name, count, pct: Math.min(Math.round((count / TASK_TARGET) * 100), 100) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
      const totalDone = doneTasks.length;
      const totalTarget = Math.max(users.length, 1) * TASK_TARGET;

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

      // Ops alerts
      const todayStr = today;
      const overdueInvoices = invoices.filter(inv => inv.dueDate && inv.dueDate < todayStr && inv.status !== "Paid" && inv.status !== "Cancelled");
      const overdueInvoiceTotalNPR = overdueInvoices.reduce((s, inv) => s + Number(inv.totalNPR || 0), 0);
      const overdueTasks = tasks.filter(t => t.dueDate && t.dueDate < todayStr && t.status !== "Done");
      const lowInventoryCount = inventory.filter(item => {
        const qty = Number(item.quantity ?? (Number(item.openingStock || 0) + Number(item.stockIn || 0) - Number(item.stockUsed || 0)));
        const reorder = Number(item.reorderPoint ?? item.minLevel ?? 0);
        return reorder > 0 && qty <= reorder;
      }).length;

      // Active orders row — 5 most recent non-completed, sorted by date desc
      const activeOrdersRow = [...orders]
        .filter(o => !["Completed","Cancelled","Delivered"].includes(o.status) && !["Delivered","Cancelled"].includes(o.stage))
        .sort((a, b) => (b.date || b.createdAt || "").localeCompare(a.date || a.createdAt || ""))
        .slice(0, 5);

      setData({
        presentToday, lateToday, leaveToday, absent, totalStaff, weeklyUnits, qcPassRate,
        lowStockItems, tasksByCol, recentTasks, pendingBudget, activeOrders, orders, monthExpNPR,
        weeklyExpTrend, weeklyExpLabels, thisMonthRevNPR, totalRevNPR, totalCostNPR, totalProfitNPR, avgMargin,
        recentBatches, attTrend, salesTarget, kpiAssignees, totalDone, totalTarget,
        overdueInvoices, overdueInvoiceTotalNPR, overdueTasks, lowInventoryCount, activeOrdersRow,
      });
    }
    load().catch(e => { console.error(e); setLoadErr(e.message || "Failed to load."); });
  }, []);

  // Live listener — sales target updates the moment any invoice is created/updated
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "invoices"), (snap) => {
      const invoices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setData(prev => prev ? { ...prev, salesTarget: getSalesTargetInfo(invoices) } : prev);
    });
    return () => unsub();
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
        {/* Quick actions */}
        <div className="kdash-qa">
          <span className="kdash-qa-label">Quick actions</span>
          <Btn kind="ghost" size="sm" icon={<Icons.Billing size={13}/>} onClick={() => window.location.href='/billing'}>New Invoice</Btn>
          <Btn kind="ghost" size="sm" icon={<Icons.Production size={13}/>} onClick={() => window.location.href='/production'}>New Order</Btn>
          <Btn kind="ghost" size="sm" icon={<Icons.Attendance size={13}/>} onClick={() => window.location.href='/attendance'}>Log Attendance</Btn>
          <Btn kind="ghost" size="sm" icon={<Icons.Tasks size={13}/>} onClick={() => window.location.href='/tasks'}>Add Task</Btn>
        </div>

        {/* Ops Alerts */}
        <OpsAlerts
          overdueInvoices={data.overdueInvoices}
          overdueInvoiceTotalNPR={data.overdueInvoiceTotalNPR}
          overdueTasks={data.overdueTasks}
          presentToday={data.presentToday}
          lateToday={data.lateToday}
          absent={data.absent}
          totalStaff={data.totalStaff}
          lowInventoryCount={data.lowInventoryCount}
        />

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

        <div className="kgrid kgrid--3-2">
          <SalesTargetCard salesTarget={data.salesTarget} />
          <BankBalanceWidget />
        </div>

        {/* Active Orders at a glance */}
        <ActiveOrdersRow orders={data.activeOrdersRow} />

        {/* Product COGS */}
        <ProductPnLCard canEdit={["nepal_admin","uk_admin","super_admin"].includes(profile?.appRole || profile?.role)} />

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
                  <div>
                    <div className="kna-fin-l">Estimated profit</div>
                    <div className="num-xl" style={{ fontSize: 20, color: data.totalCostNPR > 0 ? (data.totalProfitNPR >= 0 ? "var(--mint-deep)" : "var(--terra)") : "var(--ink-4)" }}>
                      {data.totalCostNPR > 0 ? fmtC(data.totalProfitNPR) : "—"}
                    </div>
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

        {/* Ticket Targets */}
        <Card title="Ticket Targets" sub="Tickets completed — team performance" accent="var(--blue)"
          action={<Btn kind="ghost" size="sm" iconRight={<Icons.ArrowRight size={13}/>} onClick={() => window.location.href='/tasks'}>Tasks</Btn>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Team total bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Team total</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{data.totalDone} / {data.totalTarget} target</span>
              </div>
              <Progress pct={Math.min(Math.round((data.totalDone / data.totalTarget) * 100), 100)} color="var(--blue)" h={10} />
            </div>
            <Divider />
            {/* Per-person bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.kpiAssignees.length === 0
                ? <p style={{ fontSize: 13, color: "var(--ink-4)", textAlign: "center", padding: "12px 0" }}>No completed tasks yet — move tasks to Done to track progress</p>
                : data.kpiAssignees.map(({ name, count, pct }) => (
                  <div key={name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{name}</span>
                      <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{count} done</span>
                    </div>
                    <Progress pct={pct} color={pct >= 100 ? "var(--mint-deep)" : pct >= 50 ? "var(--blue)" : "var(--amber)"} h={6} />
                  </div>
                ))
              }
            </div>
          </div>
        </Card>
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
        getDocs(collection(db, "finance_payroll")),
        getDocs(collection(db, "order_costs")),
        getDocs(collection(db, "tasks")),
        getDocs(collection(db, "inventory")),
      ]);
      const docs = (r) => r.status === "fulfilled" ? r.value.docs : [];
      const [invoicesSnap, ordersSnap, qcSnap, attSnap, budgetSnap, usersSnap, payrollSnap, costsSnap, tasksSnap, inventorySnap] = results.map(docs);

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
      const lastMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();

      // Revenue MTD — this month's paid invoices, fall back to last month if none yet
      let revMonth = thisMonth;
      let paidInvoices = invoices.filter(i => i.status === "Paid" && (i.date || "").slice(0, 7) === thisMonth);
      if (paidInvoices.length === 0) {
        revMonth = lastMonth;
        paidInvoices = invoices.filter(i => i.status === "Paid" && (i.date || "").slice(0, 7) === lastMonth);
      }
      const totalPaidNPR = paidInvoices.reduce((s, i) => s + Number(i.totalNPR || 0), 0);
      const outstandingNPR = invoices.filter(i => !["Paid","Cancelled"].includes(i.status)).reduce((s, i) => s + Number(i.totalNPR || 0), 0);
      const overdueNPR = invoices.filter(i => i.status === "Overdue").reduce((s, i) => s + Number(i.totalNPR || 0), 0);

      // Payroll — same fallback pattern
      const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const payrollData = payrollSnap.map(d => d.data());
      const curMonthName = MONTH_NAMES[new Date().getMonth()];
      const curYear = new Date().getFullYear();
      let payrollRecs = payrollData.filter(p => p.month === curMonthName && Number(p.year) === curYear);
      if (payrollRecs.length === 0) {
        const lastDate = new Date(); lastDate.setDate(1); lastDate.setMonth(lastDate.getMonth() - 1);
        const lastMName = MONTH_NAMES[lastDate.getMonth()];
        payrollRecs = payrollData.filter(p => p.month === lastMName && Number(p.year) === lastDate.getFullYear());
      }

      // Estimated profit from order_costs
      const orderCostsData = costsSnap.map(d => d.data());
      const totalCostNPR = orderCostsData.reduce((s, c) => s + Number(c.material || 0) + Number(c.labour || 0) + Number(c.overhead || 0) + Number(c.shipping || 0), 0);
      const totalRevAllNPR = orders.reduce((s, o) => s + Number(o.totalValueNPR || 0), 0);
      const estProfitNPR = totalRevAllNPR - totalCostNPR;
      const estMargin = totalRevAllNPR > 0 ? ((estProfitNPR / totalRevAllNPR) * 100).toFixed(1) : null;

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

      const payrollNPR = payrollRecs.reduce((s, p) => s + Number(p.netNPR || p.amountNPR || p.amount || 0), 0);
      const salesTarget = getSalesTargetInfo(invoices);

      // Ops alerts
      const tasks = tasksSnap.map(d => ({ id: d.id, ...d.data() }));
      const inventory = inventorySnap.map(d => ({ id: d.id, ...d.data() }));
      const overdueInvoices = invoices.filter(inv => inv.dueDate && inv.dueDate < today && inv.status !== "Paid" && inv.status !== "Cancelled");
      const overdueInvoiceTotalNPR = overdueInvoices.reduce((s, inv) => s + Number(inv.totalNPR || 0), 0);
      const overdueTasks = tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== "Done");
      const lowInventoryCount = inventory.filter(item => {
        const qty = Number(item.quantity ?? (Number(item.openingStock || 0) + Number(item.stockIn || 0) - Number(item.stockUsed || 0)));
        const reorder = Number(item.reorderPoint ?? item.minLevel ?? 0);
        return reorder > 0 && qty <= reorder;
      }).length;

      // Active orders row — 5 most recent non-completed
      const activeOrdersRow = [...orders]
        .filter(o => !["Completed","Cancelled","Delivered"].includes(o.status) && !["Delivered","Cancelled"].includes(o.stage))
        .sort((a, b) => (b.date || b.createdAt || "").localeCompare(a.date || a.createdAt || ""))
        .slice(0, 5);

      setData({
        totalPaidNPR, outstandingNPR, overdueNPR, inProgress, dispatched, presentToday, lateToday, leaveToday,
        pendingBudget, dates30, revData, recentInvoices, invoiceSegments, orders, totalStaff, payrollNPR,
        salesTarget, estProfitNPR, estMargin, totalRevAllNPR, totalCostNPR,
        overdueInvoices, overdueInvoiceTotalNPR, overdueTasks, lowInventoryCount, activeOrdersRow,
      });
    }
    load().catch(e => { console.error(e); setData({}); });
  }, []);

  // Live invoice listener — updates revenue MTD, outstanding, and sales target instantly
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "invoices"), (snap) => {
      const invoices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const tm = new Date().toISOString().slice(0, 7);
      const lm = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); })();
      let paid = invoices.filter(i => i.status === "Paid" && (i.date||"").slice(0,7) === tm);
      if (paid.length === 0) paid = invoices.filter(i => i.status === "Paid" && (i.date||"").slice(0,7) === lm);
      const totalPaidNPR = paid.reduce((s, i) => s + Number(i.totalNPR || 0), 0);
      const outstandingNPR = invoices.filter(i => !["Paid","Cancelled"].includes(i.status)).reduce((s, i) => s + Number(i.totalNPR || 0), 0);
      const overdueNPR = invoices.filter(i => i.status === "Overdue").reduce((s, i) => s + Number(i.totalNPR || 0), 0);
      const salesTarget = getSalesTargetInfo(invoices);
      setData(prev => prev ? { ...prev, totalPaidNPR, outstandingNPR, overdueNPR, salesTarget } : prev);
    });
    return () => unsub();
  }, []);

  const { fmt: fmtC } = useCurrency();

  if (!data) return <Loading />;

  return (
    <AppLayout>
      <div className="kdash fade-in">
        {/* Quick actions */}
        <div className="kdash-qa">
          <span className="kdash-qa-label">Quick actions</span>
          <Btn kind="ghost" size="sm" icon={<Icons.Billing size={13}/>} onClick={() => window.location.href='/billing'}>New Invoice</Btn>
          <Btn kind="ghost" size="sm" icon={<Icons.Production size={13}/>} onClick={() => window.location.href='/production'}>New Order</Btn>
          <Btn kind="ghost" size="sm" icon={<Icons.Attendance size={13}/>} onClick={() => window.location.href='/attendance'}>Log Attendance</Btn>
          <Btn kind="ghost" size="sm" icon={<Icons.Tasks size={13}/>} onClick={() => window.location.href='/tasks'}>Add Task</Btn>
        </div>

        {/* Ops Alerts */}
        <OpsAlerts
          overdueInvoices={data.overdueInvoices}
          overdueInvoiceTotalNPR={data.overdueInvoiceTotalNPR}
          overdueTasks={data.overdueTasks}
          presentToday={data.presentToday}
          lateToday={data.lateToday}
          absent={Math.max(0, data.totalStaff - data.presentToday - data.leaveToday)}
          totalStaff={data.totalStaff}
          lowInventoryCount={data.lowInventoryCount}
        />

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

        <div className="kgrid kgrid--3-2">
          <SalesTargetCard salesTarget={data.salesTarget} />
          <BankBalanceWidget />
        </div>

        {/* Active Orders at a glance */}
        <ActiveOrdersRow orders={data.activeOrdersRow} />

        {/* Estimated Profit */}
        {data.totalRevAllNPR > 0 && (
          <div className="kgrid kgrid--3">
            <Card title="Total Revenue" sub="All orders · incl. unpaid" accent="var(--mint-deep)">
              <div className="num-xl" style={{ fontSize: 32, fontWeight: 700, color: "var(--mint-deep)" }}>{fmtC(data.totalRevAllNPR)}</div>
            </Card>
            <Card title="Total Costs" sub="From Order P&L entries" accent="var(--terra)">
              <div className="num-xl" style={{ fontSize: 32, fontWeight: 700, color: data.totalCostNPR > 0 ? "var(--terra)" : "var(--ink-4)" }}>
                {data.totalCostNPR > 0 ? fmtC(data.totalCostNPR) : "No costs entered yet"}
              </div>
            </Card>
            <Card title="Estimated Profit" sub={data.estMargin ? `${data.estMargin}% margin` : "Enter costs in Finance → Order P&L"} accent={data.estProfitNPR >= 0 ? "var(--mint-deep)" : "var(--terra)"}>
              <div className="num-xl" style={{ fontSize: 32, fontWeight: 700, color: data.totalCostNPR > 0 ? (data.estProfitNPR >= 0 ? "var(--mint-deep)" : "var(--terra)") : "var(--ink-4)" }}>
                {data.totalCostNPR > 0 ? fmtC(data.estProfitNPR) : "—"}
              </div>
            </Card>
          </div>
        )}

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
    const myDone = myTasks.filter(t => t.status === "Done").length;
    const PERSONAL_TARGET = 10;
    setData({ myRecord, myTasks, counts, monthAtt, salesTarget, myDone, PERSONAL_TARGET });
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

        {/* Ticket Targets */}
        <Card title="Ticket Targets" sub="Your completed tasks" accent="var(--blue)">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="num-xl" style={{ fontSize: 36, fontWeight: 700, color: "var(--blue)" }}>{data.myDone}</span>
              <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Target: {data.PERSONAL_TARGET} tickets</span>
            </div>
            <Progress
              pct={Math.min(Math.round((data.myDone / data.PERSONAL_TARGET) * 100), 100)}
              color={data.myDone >= data.PERSONAL_TARGET ? "var(--mint-deep)" : "var(--blue)"}
              h={14}
            />
            <p style={{ fontSize: 12, color: "var(--ink-4)" }}>
              {data.myDone >= data.PERSONAL_TARGET
                ? "🎉 Target hit! Great work."
                : `${data.PERSONAL_TARGET - data.myDone} more to hit your target`}
            </p>
          </div>
        </Card>
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
