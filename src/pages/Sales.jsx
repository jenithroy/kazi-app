import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { KPI } from "../components/ui";

const STAGES = [
  "Order Received",
  "Fabric Sourcing",
  "Cutting",
  "Stitching",
  "Finishing & Pressing",
  "Quality Check",
  "Packing",
  "Shipped",
  "Delivered",
];

const STAGE_COLORS = {
  "Order Received":      "#94a3b8",
  "Fabric Sourcing":     "#60a5fa",
  "Cutting":             "#34d399",
  "Stitching":           "#a78bfa",
  "Finishing & Pressing":"#f59e0b",
  "Quality Check":       "#f97316",
  "Packing":             "#10b981",
  "Shipped":             "#3b82f6",
  "Delivered":           "#22c55e",
};

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isThisWeek(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now - d) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff < 7;
}

export default function Sales() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(query(collection(db, "production"), orderBy("date", "desc")))
      .then(snap => {
        setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
      .finally(() => setLoading(false));
  }, []);

  const active     = orders.filter(o => o.status === "Active");
  const delivered  = orders.filter(o => o.stage === "Delivered" && isThisMonth(o.date));
  const newThisWeek= orders.filter(o => isThisWeek(o.date));
  const totalUnits = active.reduce((s, o) => s + Number(o.quantity || 0), 0);
  const pipelineVal= active.reduce((s, o) => s + Number(o.quantity || 0) * Number(o.pricePerPcNPR || 0), 0);

  // Stage breakdown (active only, excluding Delivered)
  const stageCounts = STAGES.slice(0, -1).map(s => ({
    stage: s,
    count: active.filter(o => o.stage === s).length,
  }));
  const maxCount = Math.max(...stageCounts.map(s => s.count), 1);

  // Top customers by active order count
  const customerMap = {};
  for (const o of active) {
    const name = o.customerName || "Unknown";
    customerMap[name] = (customerMap[name] || 0) + 1;
  }
  const topCustomers = Object.entries(customerMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Recent orders (last 10 active)
  const recent = active.slice(0, 10);

  return (
      <div style={{ padding: "28px 32px", maxWidth: 1100 }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-1)", margin: 0 }}>Sales Overview</h1>
          <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "4px 0 0" }}>Live pipeline from production orders</p>
        </div>

        {/* KPI row */}
        <div className="krsp-4" style={{ gap: 14, marginBottom: 28 }}>
          <KPI label="Active Orders"       value={loading ? "—" : active.length}        accent="var(--mint-deep)" />
          <KPI label="Units in Pipeline"   value={loading ? "—" : totalUnits.toLocaleString()} accent="#6366f1" />
          <KPI label="Delivered This Month" value={loading ? "—" : delivered.length}    accent="#22c55e" />
          <KPI label="New This Week"        value={loading ? "—" : newThisWeek.length}  accent="#f59e0b" />
        </div>

        <div className="krsp-2" style={{ gap: 18, marginBottom: 28 }}>

          {/* Pipeline by stage */}
          <div style={{ background: "var(--surface)", borderRadius: 12, padding: "20px 22px", border: "1px solid var(--line)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-1)", margin: "0 0 16px" }}>Pipeline by Stage</h3>
            {loading ? (
              <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Loading…</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {stageCounts.map(({ stage, count }) => (
                  <div key={stage} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--ink-2)", width: 148, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {stage}
                    </span>
                    <div style={{ flex: 1, height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{
                        width: `${(count / maxCount) * 100}%`,
                        height: "100%",
                        background: STAGE_COLORS[stage] || "var(--mint-deep)",
                        borderRadius: 4,
                        transition: "width .4s ease",
                        minWidth: count > 0 ? 8 : 0,
                      }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)", width: 20, textAlign: "right" }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top customers */}
          <div style={{ background: "var(--surface)", borderRadius: 12, padding: "20px 22px", border: "1px solid var(--line)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-1)", margin: "0 0 16px" }}>Top Customers (Active)</h3>
            {loading ? (
              <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Loading…</p>
            ) : topCustomers.length === 0 ? (
              <p style={{ color: "var(--ink-3)", fontSize: 13 }}>No active orders</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {topCustomers.map(([name, count], i) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", width: 18 }}>#{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 13, color: "var(--ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--mint-deep)", background: "var(--mint-wash)", padding: "2px 8px", borderRadius: 20 }}>
                      {count} order{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent active orders table */}
        <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--line)", overflow: "hidden" }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--line)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-1)", margin: 0 }}>Recent Active Orders</h3>
          </div>
          {loading ? (
            <p style={{ padding: "20px 22px", color: "var(--ink-3)", fontSize: 13 }}>Loading…</p>
          ) : recent.length === 0 ? (
            <p style={{ padding: "20px 22px", color: "var(--ink-3)", fontSize: 13 }}>No active orders</p>
          ) : (
            <div className="table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg)" }}>
                  {["Customer", "Style", "Qty", "Stage", "Date"].map(h => (
                    <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((o, i) => (
                  <tr key={o.id} style={{ borderTop: "1px solid var(--line)", background: i % 2 === 1 ? "var(--bg)" : undefined }}>
                    <td style={{ padding: "9px 16px", fontWeight: 500, color: "var(--ink-1)" }}>{o.customerName || "—"}</td>
                    <td style={{ padding: "9px 16px", color: "var(--ink-2)" }}>{o.styleName || "—"}</td>
                    <td style={{ padding: "9px 16px", color: "var(--ink-2)" }}>{o.quantity ? Number(o.quantity).toLocaleString() : "—"}</td>
                    <td style={{ padding: "9px 16px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                        background: (STAGE_COLORS[o.stage] || "#94a3b8") + "22",
                        color: STAGE_COLORS[o.stage] || "#94a3b8",
                      }}>{o.stage || "—"}</span>
                    </td>
                    <td style={{ padding: "9px 16px", color: "var(--ink-3)" }}>{o.date || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

      </div>
  );
}
