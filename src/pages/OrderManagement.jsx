import { useEffect, useState } from "react";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy,
} from "firebase/firestore";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";

const STAGES = ["Ordered", "Cutting", "Sewing", "Printing", "QC", "Shipping", "Delivered"];

const SEED_ORDERS = [
  { customer: "RetailCorp",  item: "T-Shirts",  quantity: 500, currentStage: 1, status: "Active" },
  { customer: "StyleBrand",  item: "Hoodies",   quantity: 200, currentStage: 4, status: "Active" },
];

const STATUS_COLOR = {
  Active:    { bg: "rgba(31,110,76,.1)",  text: "#1f6e4c" },
  Cancelled: { bg: "rgba(196,101,74,.1)", text: "#c4654a" },
  Delivered: { bg: "rgba(86,136,176,.1)", text: "#5688b0" },
};

function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || { bg: "#eee", text: "#555" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: c.bg, color: c.text }}>
      {status}
    </span>
  );
}

function OrderManagement() {
  const { profile }  = useAuth();
  const canEdit      = sectionCanEdit(profile, "production");
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [newOrder, setNewOrder]   = useState({ customer: "", item: "", quantity: "" });
  const [saving, setSaving]       = useState(false);
  const [confirmId, setConfirmId] = useState(null); // order id awaiting cancel confirm

  /* ── Load from Firestore ── */
  async function loadOrders() {
    try {
      const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Seed demo data if collection is empty
      if (list.length === 0) {
        for (const o of SEED_ORDERS) {
          await addDoc(collection(db, "orders"), { ...o, createdAt: serverTimestamp() });
        }
        const snap2 = await getDocs(q);
        list = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      }
      setOrders(list);
    } catch (err) {
      console.error("Failed to load orders:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOrders(); }, []);

  /* ── Add new order ── */
  async function handleAddOrder(e) {
    e.preventDefault();
    if (!newOrder.customer.trim() || !newOrder.item.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "orders"), {
        customer:     newOrder.customer.trim(),
        item:         newOrder.item.trim(),
        quantity:     Number(newOrder.quantity) || 0,
        currentStage: 0,
        status:       "Active",
        createdBy:    profile?.name || "Unknown",
        createdAt:    serverTimestamp(),
      });
      setNewOrder({ customer: "", item: "", quantity: "" });
      setShowForm(false);
      await loadOrders();
    } catch (err) {
      alert("Failed to create order: " + err.message);
    }
    setSaving(false);
  }

  /* ── Advance / reverse stage ── */
  async function changeStage(order, delta) {
    const next = Math.min(STAGES.length - 1, Math.max(0, order.currentStage + delta));
    const isDelivered = next === STAGES.length - 1;
    await updateDoc(doc(db, "orders", order.id), {
      currentStage: next,
      status: isDelivered ? "Delivered" : "Active",
    });
    await loadOrders();
  }

  /* ── Cancel / stop order ── */
  async function cancelOrder(order) {
    await updateDoc(doc(db, "orders", order.id), {
      status: "Cancelled",
      cancelledAt: serverTimestamp(),
      cancelledBy: profile?.name || "Unknown",
    });
    setConfirmId(null);
    await loadOrders();
  }

  /* ── Restore cancelled order ── */
  async function restoreOrder(order) {
    await updateDoc(doc(db, "orders", order.id), { status: "Active" });
    await loadOrders();
  }

  /* ── Remove order (permanent delete) ── */
  async function removeOrder(order) {
    if (!window.confirm(`Permanently remove order ${order.id?.slice(0, 6)}… for "${order.customer}"? This cannot be undone.`)) return;
    await deleteDoc(doc(db, "orders", order.id));
    await loadOrders();
  }

  const active    = orders.filter(o => o.status !== "Cancelled" && o.status !== "Delivered");
  const delivered = orders.filter(o => o.status === "Delivered");
  const cancelled = orders.filter(o => o.status === "Cancelled");

  return (
    <AppLayout>
      <PageHeader
        title="Order Management"
        description="Track active orders through production stages · cancel or remove orders."
      />

      {/* ── Add Order Button ── */}
      {canEdit && (
        <div style={{ marginBottom: 20 }}>
          <button
            className="primary-button"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={() => setShowForm(v => !v)}
          >
            {showForm ? "✕ Cancel" : "+ New Order"}
          </button>
        </div>
      )}

      {/* ── New Order Form ── */}
      {showForm && (
        <div className="panel" style={{ padding: 20, marginBottom: 24 }}>
          <h3 style={{ marginBottom: 14, fontSize: "1rem" }}>New Order</h3>
          <form onSubmit={handleAddOrder} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--ink-3)" }}>
              Customer *
              <input
                className="kfin-input"
                style={{ width: 180 }}
                value={newOrder.customer}
                placeholder="Client name"
                required
                onChange={e => setNewOrder(v => ({ ...v, customer: e.target.value }))}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--ink-3)" }}>
              Item *
              <input
                className="kfin-input"
                style={{ width: 160 }}
                value={newOrder.item}
                placeholder="Product type"
                required
                onChange={e => setNewOrder(v => ({ ...v, item: e.target.value }))}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--ink-3)" }}>
              Quantity
              <input
                className="kfin-input"
                style={{ width: 100 }}
                type="number" min="1"
                value={newOrder.quantity}
                placeholder="0"
                onChange={e => setNewOrder(v => ({ ...v, quantity: e.target.value }))}
              />
            </label>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : "Create Order"}</button>
          </form>
        </div>
      )}

      {loading && <p style={{ color: "var(--ink-3)" }}>Loading orders…</p>}

      {/* ── Active Orders ── */}
      {active.length > 0 && (
        <div className="orders-list" style={{ display: "flex", flexDirection: "column", gap: 30, marginTop: 20 }}>
          {active.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              canEdit={canEdit}
              onAdvance={() => changeStage(order, +1)}
              onReverse={() => changeStage(order, -1)}
              onCancel={() => setConfirmId(order.id)}
              onConfirmCancel={() => cancelOrder(order)}
              onDismissCancel={() => setConfirmId(null)}
              confirming={confirmId === order.id}
              onRemove={null}
            />
          ))}
        </div>
      )}

      {/* ── Delivered Orders ── */}
      {delivered.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Delivered ({delivered.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {delivered.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                canEdit={false}
                onRemove={canEdit ? () => removeOrder(order) : null}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Cancelled Orders ── */}
      {cancelled.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Cancelled ({cancelled.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {cancelled.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                canEdit={false}
                onRestore={canEdit ? () => restoreOrder(order) : null}
                onRemove={canEdit ? () => removeOrder(order) : null}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && orders.length === 0 && (
        <p style={{ color: "var(--ink-3)", marginTop: 20 }}>No orders yet. Create your first one above.</p>
      )}
    </AppLayout>
  );
}

/* ── Order Card ────────────────────────────── */
function OrderCard({ order, canEdit, onAdvance, onReverse, onCancel, onConfirmCancel, onDismissCancel, confirming, onRestore, onRemove }) {
  const isCancelled = order.status === "Cancelled";
  const isDelivered = order.status === "Delivered";
  const isActive    = !isCancelled && !isDelivered;

  return (
    <div
      className="panel"
      style={{
        padding: "20px",
        opacity: isCancelled ? 0.6 : 1,
        borderLeft: isCancelled ? "3px solid var(--terra)" : isDelivered ? "3px solid var(--blue)" : "3px solid var(--mint-2)",
        transition: "opacity .2s",
      }}
    >
      {/* ── Header row ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>
            {order.customer}
            {order.id && (
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-4)", marginLeft: 8 }}>
                #{order.id.slice(0, 6)}
              </span>
            )}
          </h3>
          <p style={{ color: "#666", margin: "2px 0 0", fontSize: 13 }}>
            {order.quantity ? `${order.quantity} × ` : ""}{order.item}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusBadge status={order.status || "Active"} />

          {/* ── Stop / Cancel Process button — always visible on active orders ── */}
          {isActive && onCancel && !confirming && (
            <button
              onClick={onCancel}
              title="Stop / Cancel this order"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 13px", borderRadius: 8,
                border: "1.5px solid var(--terra)",
                background: "var(--terra-soft, #fde8e2)",
                color: "var(--terra)", fontWeight: 700, fontSize: "0.8rem",
                cursor: "pointer", transition: "background .15s",
              }}
            >
              {/* Stop icon */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
              Stop Process
            </button>
          )}
        </div>
      </div>

      {/* ── Inline cancel confirmation ── */}
      {isActive && confirming && (
        <div style={{
          margin: "10px 0", padding: "14px 16px", borderRadius: 10,
          background: "var(--terra-soft, #fde8e2)",
          border: "1.5px solid var(--terra)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
        }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: "var(--terra)", fontSize: "0.9rem" }}>
              Stop &amp; cancel this order?
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#7a3020" }}>
              This will halt production for <strong>{order.customer}</strong> — {order.item}. You can restore it later.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onConfirmCancel}
              style={{
                padding: "7px 18px", borderRadius: 7, border: "none",
                background: "var(--terra)", color: "#fff",
                fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
              }}
            >
              Yes, Cancel Order
            </button>
            <button
              onClick={onDismissCancel}
              style={{
                padding: "7px 14px", borderRadius: 7,
                border: "1.5px solid var(--terra)",
                background: "transparent", color: "var(--terra)",
                fontWeight: 600, fontSize: "0.82rem", cursor: "pointer",
              }}
            >
              Keep Active
            </button>
          </div>
        </div>
      )}

      {/* ── Progress tracker (hidden for cancelled) ── */}
      {!isCancelled && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", paddingBottom: 10, marginTop: 24 }}>
          <div style={{ position: "absolute", top: 15, left: 0, right: 0, height: 4, backgroundColor: "#e0e0e0", zIndex: 1 }} />
          <div style={{ position: "absolute", top: 15, left: 0, width: `${(order.currentStage / (STAGES.length - 1)) * 100}%`, height: 4, backgroundColor: isDelivered ? "var(--blue, #5688b0)" : "var(--primary, #0056b3)", zIndex: 1, transition: "width .3s ease" }} />

          {STAGES.map((stage, index) => {
            const isCompleted = index <= order.currentStage;
            const isCurrent   = index === order.currentStage;
            return (
              <div key={stage} style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 2, background: "var(--bg, #f4f6f8)", padding: "0 10px", minWidth: 70 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  backgroundColor: isCompleted ? (isDelivered ? "#5688b0" : "var(--primary, #0056b3)") : "#e0e0e0",
                  color: isCompleted ? "#fff" : "#666",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: "bold",
                  border: isCurrent ? "4px solid #b3d4ff" : "4px solid var(--bg, #f4f6f8)",
                  marginBottom: 8, transition: "all .3s ease",
                }}>
                  {isCompleted ? "✓" : index + 1}
                </div>
                <span style={{ fontSize: "0.8rem", color: isCompleted ? "var(--text-color, #333)" : "#999", fontWeight: isCurrent ? 600 : "normal", textAlign: "center" }}>
                  {stage}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Cancelled reason ── */}
      {isCancelled && order.cancelledBy && (
        <p style={{ fontSize: 12, color: "var(--terra)", margin: "8px 0 4px" }}>
          Cancelled by {order.cancelledBy}
        </p>
      )}

      {/* ── Stage navigation + admin actions ── */}
      <div style={{ marginTop: isCancelled ? 8 : 24, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {isActive && canEdit && onReverse && (
          <button className="secondary-button" onClick={onReverse} disabled={order.currentStage === 0}>
            ← Reverse Stage
          </button>
        )}
        {isActive && canEdit && onAdvance && (
          <button className="primary-button" onClick={onAdvance} disabled={order.currentStage === STAGES.length - 1}>
            Advance Stage →
          </button>
        )}

        {isCancelled && onRestore && (
          <button
            onClick={onRestore}
            style={{ padding: "7px 16px", borderRadius: 8, border: "1.5px solid var(--mint-2)", background: "transparent", color: "var(--mint-deep)", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
          >
            Restore Order
          </button>
        )}

        {onRemove && (
          <button
            onClick={onRemove}
            style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--terra-soft, #fde8e2)", color: "var(--terra)", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export default OrderManagement;
