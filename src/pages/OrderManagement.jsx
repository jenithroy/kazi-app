import { useEffect, useState, useMemo } from "react";
import { deleteRow, fetchAll, insertRow, updateRow } from "../lib/db";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { Icons } from "../components/ui";
// eslint-disable-next-line no-unused-vars
import { KANBAN_STAGES, ORDER_STATUSES, ATTENDANCE_STATUSES, ORDER_PRIORITIES } from "../constants/enums";

const STAGES = ["Ordered", "Cutting", "Sewing", "Printing", "QC", "Shipping", "Delivered"];

const STAGE_TONES = ["neutral", "amber", "terra", "blue", "mint", "blue", "ghost"];
const TONE_DOT = { neutral: "var(--ink-4)", mint: "var(--mint-2)", terra: "var(--terra)", ghost: "var(--ink-5)", amber: "var(--amber)", blue: "var(--blue)" };
const TONE_BG  = { neutral: "var(--bg-2)",  mint: "var(--mint-soft)", terra: "var(--terra-soft)", ghost: "var(--bg-2)", amber: "var(--amber-soft)", blue: "var(--blue-soft)" };

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

const PRIORITY_COLOR = {
  Urgent: { bg: "rgba(196,101,74,.12)",  text: "#c4654a", dot: "var(--terra)" },
  High:   { bg: "rgba(216,164,65,.16)",  text: "#a87a18", dot: "var(--amber)" },
  Normal: { bg: "rgba(86,136,176,.1)",   text: "#5688b0", dot: "var(--blue)" },
  Low:    { bg: "rgba(110,110,110,.1)",  text: "#777",    dot: "var(--ink-5)" },
};
const PRIORITY_RANK = Object.fromEntries(ORDER_PRIORITIES.map((p, i) => [p, i]));
const priorityRank = (o) => PRIORITY_RANK[o.priority] ?? PRIORITY_RANK.Normal;

function PriorityBadge({ priority = "Normal", editable, onChange, compact }) {
  const c = PRIORITY_COLOR[priority] || PRIORITY_COLOR.Normal;
  const base = {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: compact ? "1px 8px" : "2px 10px", borderRadius: 20,
    fontSize: compact ? 10 : 12, fontWeight: 700,
    background: c.bg, color: c.text,
  };
  const dot = <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />;

  if (!editable) {
    return <span style={base} title="Priority">{dot}{priority}</span>;
  }
  return (
    <span style={{ ...base, position: "relative", cursor: "pointer" }} title="Change priority" onClick={e => e.stopPropagation()}>
      {dot}{priority}
      <svg width={compact ? 8 : 9} height={compact ? 8 : 9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
      <select
        value={priority}
        onChange={e => onChange(e.target.value)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
        aria-label="Order priority"
      >
        {ORDER_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    </span>
  );
}

function OrderManagement() {
  const { profile }  = useAuth();
  const canEdit      = sectionCanEdit(profile, "production");
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [newOrder, setNewOrder]   = useState({ customer: "", item: "", quantity: "", priority: "Normal" });
  const [saving, setSaving]       = useState(false);
  const [confirmId, setConfirmId] = useState(null); // order id awaiting cancel confirm
  const [viewMode, setViewMode]   = useState("kanban"); // default view mode

  /* ── Load from Firestore ── */
  async function loadOrders() {
    try {
      // NOTE: this page is not reachable — /orders redirects to /production
      // and nothing else routes here. It also models the pipeline as a
      // numeric `currentStage` with its own priority/cancellation fields,
      // none of which exist on the orders table; Production.jsx owns the
      // real named-stage model. Converted so it compiles and cannot crash
      // the app, but the stage writes below will not persist until someone
      // decides whether this page should exist at all.
      const list = await fetchAll("orders", { orderBy: "createdAt", orderDir: "desc" });
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
      await insertRow("orders", {
        customer:     newOrder.customer.trim(),
        item:         newOrder.item.trim(),
        quantity:     Number(newOrder.quantity) || 0,
        priority:     newOrder.priority || "Normal",
        currentStage: 0,
        status:       "Active",
        createdBy:    profile?.name || "Unknown",
      });
      setNewOrder({ customer: "", item: "", quantity: "", priority: "Normal" });
      setShowForm(false);
      await loadOrders();
    } catch (err) {
      console.error("Failed to create order:", err);
      alert("Failed to create order: " + err.message);
    }
    setSaving(false);
  }

  /* ── Add order directly to stage ── */
  async function handleAddOrderToStage(customer, item, quantity, stageIdx, priority = "Normal") {
    if (!customer.trim() || !item.trim()) return;
    setSaving(true);
    try {
      await insertRow("orders", {
        customer:     customer.trim(),
        item:         item.trim(),
        quantity:     Number(quantity) || 0,
        priority,
        currentStage: stageIdx,
        status:       stageIdx === STAGES.length - 1 ? "Delivered" : "Active",
        createdBy:    profile?.name || "Unknown",
      });
      await loadOrders();
    } catch (err) {
      console.error("Failed to create order:", err);
      alert("Failed to create order: " + err.message);
    }
    setSaving(false);
  }

  /* ── Drop order on stage ── */
  async function handleDropOrder(orderId, stageIdx) {
    const isDelivered = stageIdx === STAGES.length - 1;
    await updateRow("orders", orderId, {
      currentStage: stageIdx,
      status: isDelivered ? "Delivered" : "Active",
    });
    await loadOrders();
  }

  /* ── Advance / reverse stage ── */
  async function changeStage(order, delta) {
    const next = Math.min(STAGES.length - 1, Math.max(0, order.currentStage + delta));
    const isDelivered = next === STAGES.length - 1;
    await updateRow("orders", order.id, {
      currentStage: next,
      status: isDelivered ? "Delivered" : "Active",
    });
    await loadOrders();
  }

  /* ── Change order priority ── */
  async function changePriority(order, priority) {
    setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, priority } : o)));
    try {
      await updateRow("orders", order.id, { priority });
    } catch (err) {
      console.error("Failed to update priority:", err);
      await loadOrders();
    }
  }

  /* ── Cancel / stop order ── */
  async function cancelOrder(order) {
    await updateRow("orders", order.id, {
      status: "Cancelled",
      cancelledAt: new Date().toISOString(),
      cancelledBy: profile?.name || "Unknown",
    });
    setConfirmId(null);
    await loadOrders();
  }

  /* ── Restore cancelled order ── */
  async function restoreOrder(order) {
    await updateRow("orders", order.id, { status: "Active" });
    await loadOrders();
  }

  /* ── Remove order (permanent delete) ── */
  async function removeOrder(order) {
    if (!window.confirm(`Permanently remove order ${order.id?.slice(0, 6)}… for "${order.customer}"? This cannot be undone.`)) return;
    await deleteRow("orders", order.id);
    await loadOrders();
  }

  // Urgent first within each stage; ties keep newest-first order from the query
  const active    = useMemo(
    () => orders
      .filter(o => o.status !== "Cancelled" && o.status !== "Delivered")
      .sort((a, b) => priorityRank(a) - priorityRank(b)),
    [orders]
  );
  const delivered = useMemo(() => orders.filter(o => o.status === "Delivered"), [orders]);
  const cancelled = useMemo(() => orders.filter(o => o.status === "Cancelled"), [orders]);

  return (
      <PageHeader
        title="Order Management"
        description="Track active orders through production stages · cancel or remove orders."
      />

      {/* ── View & Actions Control Row ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div className="tab-row" style={{ margin: 0 }}>
          <button
            className={`tab-button ${viewMode === "kanban" ? "active" : ""}`}
            onClick={() => setViewMode("kanban")}
          >
            Board View
          </button>
          <button
            className={`tab-button ${viewMode === "list" ? "active" : ""}`}
            onClick={() => setViewMode("list")}
          >
            List View
          </button>
        </div>

        {canEdit && (
          <button
            className="primary-button"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={() => setShowForm(v => !v)}
          >
            {showForm ? "✕ Cancel" : "+ New Order"}
          </button>
        )}
      </div>

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
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--ink-3)" }}>
              Priority
              <select
                className="kfin-input"
                style={{ width: 120 }}
                value={newOrder.priority}
                onChange={e => setNewOrder(v => ({ ...v, priority: e.target.value }))}
              >
                {ORDER_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : "Create Order"}</button>
          </form>
        </div>
      )}

      {loading && <p style={{ color: "var(--ink-3)" }}>Loading orders…</p>}

      {/* ── Views Rendering ── */}
      {!loading && viewMode === "kanban" && (
        <div className="ktasks-board" style={{ gridTemplateColumns: "repeat(7, minmax(220px, 1fr))", overflowX: "auto", paddingBottom: 16, alignItems: "flex-start" }}>
          {STAGES.map((stage, idx) => (
            <OrderKanbanColumn
              key={stage}
              label={stage}
              stageIdx={idx}
              orders={idx === STAGES.length - 1 ? delivered : active.filter(o => o.currentStage === idx)}
              canEdit={canEdit}
              onAddOrder={handleAddOrderToStage}
              onDrop={handleDropOrder}
              onChangePriority={changePriority}
              onAdvanceCard={(order) => changeStage(order, 1)}
              onReverseCard={(order) => changeStage(order, -1)}
              onCancelCard={(id) => setConfirmId(id)}
              onConfirmCancelCard={(order) => cancelOrder(order)}
              onDismissCancelCard={() => setConfirmId(null)}
              confirmingId={confirmId}
              onRemoveCard={idx === STAGES.length - 1 && canEdit ? (order) => removeOrder(order) : null}
            />
          ))}
        </div>
      )}

      {!loading && viewMode === "list" && (
        <>
          {/* ── Active Orders (List View) ── */}
          {active.length > 0 ? (
            <div className="orders-list" style={{ display: "flex", flexDirection: "column", gap: 30, marginTop: 20 }}>
              {active.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  canEdit={canEdit}
                  onChangePriority={p => changePriority(order, p)}
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
          ) : (
            <p style={{ color: "var(--ink-3)", marginTop: 20 }}>No active orders. Create one above.</p>
          )}

          {/* ── Delivered Orders (List View) ── */}
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
        </>
      )}

      {/* ── Cancelled Orders (Visible in both views) ── */}
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
  );
}

/* ── Order Card (List View) ────────────────────────────── */
function OrderCard({ order, canEdit, onChangePriority, onAdvance, onReverse, onCancel, onConfirmCancel, onDismissCancel, confirming, onRestore, onRemove }) {
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
          <PriorityBadge
            priority={order.priority || "Normal"}
            editable={canEdit && isActive && !!onChangePriority}
            onChange={onChangePriority}
          />
          <StatusBadge status={order.status || "Active"} />

          {/* ── Stop / Cancel Process button ── */}
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

/* ── Inline Add Order Form (Kanban View) ─────────────────────────── */
function AddOrderCardForm({ onAdd, onCancel }) {
  const [customer, setCustomer] = useState("");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("");
  const [priority, setPriority] = useState("Normal");

  const submit = () => {
    if (!customer.trim() || !item.trim()) return;
    onAdd({
      customer: customer.trim(),
      item: item.trim(),
      quantity: Number(quantity) || 0,
      priority,
    });
  };

  return (
    <div className="ktasks-card" style={{ gap: 8, marginTop: 4 }}>
      <input
        autoFocus
        placeholder="Customer *"
        value={customer}
        onChange={e => setCustomer(e.target.value)}
        style={{ border: "1.5px solid var(--mint-2)", borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "var(--font)", outline: "none", width: "100%" }}
        onKeyDown={e => { if (e.key === "Escape") onCancel(); if (e.key === "Enter") submit(); }}
      />
      <input
        placeholder="Item *"
        value={item}
        onChange={e => setItem(e.target.value)}
        style={{ border: "1px solid var(--line-strong)", borderRadius: 6, padding: "5px 8px", fontSize: 11.5, fontFamily: "var(--font)", outline: "none", width: "100%" }}
        onKeyDown={e => { if (e.key === "Escape") onCancel(); if (e.key === "Enter") submit(); }}
      />
      <input
        placeholder="Quantity (optional)"
        type="number"
        min="1"
        value={quantity}
        onChange={e => setQuantity(e.target.value)}
        style={{ border: "1px solid var(--line-strong)", borderRadius: 6, padding: "5px 8px", fontSize: 11.5, fontFamily: "var(--font)", outline: "none", width: "100%" }}
        onKeyDown={e => { if (e.key === "Escape") onCancel(); if (e.key === "Enter") submit(); }}
      />
      <select
        value={priority}
        onChange={e => setPriority(e.target.value)}
        style={{ border: "1px solid var(--line-strong)", borderRadius: 6, padding: "5px 8px", fontSize: 11.5, fontFamily: "var(--font)", outline: "none", width: "100%", color: "var(--ink-2)", background: "transparent" }}
      >
        {ORDER_PRIORITIES.map(p => <option key={p} value={p}>{p} priority</option>)}
      </select>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={submit}
          style={{ flex: 1, background: "var(--mint-deep)", color: "#fff", border: "none", borderRadius: 6, padding: "7px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)" }}>
          Add Order
        </button>
        <button onClick={onCancel}
          style={{ background: "transparent", border: "1px solid var(--line-strong)", borderRadius: 6, padding: "7px 10px", fontSize: 11, cursor: "pointer", color: "var(--ink-3)", fontFamily: "var(--font)" }}>
          ✕
        </button>
      </div>
    </div>
  );
}

/* ── Order Kanban Card (Kanban View) ────────────────────────────── */
function OrderKanbanCard({ order, canEdit, onDragStart, onChangePriority, onAdvance, onReverse, onCancel, onConfirmCancel, onDismissCancel, confirming, onRemove, onRestore }) {
  const [hover, setHover] = useState(false);
  const isCancelled = order.status === "Cancelled";
  const isDelivered = order.status === "Delivered";
  const isActive    = !isCancelled && !isDelivered;
  const shortId = order.id ? `#${order.id.slice(0, 6)}` : "";

  return (
    <div
      draggable={canEdit && isActive}
      onDragStart={onDragStart}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="ktasks-card"
      style={{
        cursor: canEdit && isActive ? "grab" : "default",
        position: "relative",
        borderLeft: isCancelled ? "3px solid var(--terra)" : isDelivered ? "3px solid var(--blue)" : "3px solid var(--mint-2)",
        opacity: isCancelled ? 0.6 : 1,
        transition: "opacity .2s, border-left .2s",
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <div className="ktasks-card-h" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{order.customer}</span>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>{shortId}</span>
      </div>

      <div className="ktasks-card-t" style={{ fontSize: 12, color: "var(--ink-2)" }}>
        {order.quantity ? `${order.quantity} × ` : ""}{order.item}
      </div>

      <div>
        <PriorityBadge
          compact
          priority={order.priority || "Normal"}
          editable={canEdit && isActive && !!onChangePriority}
          onChange={onChangePriority}
        />
      </div>

      {confirming ? (
        <div style={{
          marginTop: 6, padding: 6, borderRadius: 6,
          background: "var(--terra-soft)", border: "1px solid var(--terra)",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--terra)" }}>Stop this order?</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={e => { e.stopPropagation(); onConfirmCancel(); }}
              style={{ flex: 1, padding: "4px", borderRadius: 4, border: "none", background: "var(--terra)", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
            >
              Yes
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDismissCancel(); }}
              style={{ flex: 1, padding: "4px", borderRadius: 4, border: "1px solid var(--terra)", background: "transparent", color: "var(--terra)", fontSize: 10, fontWeight: 600, cursor: "pointer" }}
            >
              No
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <StatusBadge status={order.status || "Active"} />

          {/* Quick Manual navigation arrows + Stop / Cancel button */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {isActive && canEdit && onReverse && (
              <button
                onClick={e => { e.stopPropagation(); onReverse(); }}
                disabled={order.currentStage === 0}
                style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: order.currentStage === 0 ? "var(--ink-5)" : "var(--ink-3)", display: "flex" }}
                title="Reverse Stage"
              >
                <Icons.ChevronLeft size={14} />
              </button>
            )}

            {isActive && canEdit && onAdvance && (
              <button
                onClick={e => { e.stopPropagation(); onAdvance(); }}
                disabled={order.currentStage === STAGES.length - 1}
                style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: order.currentStage === STAGES.length - 1 ? "var(--ink-5)" : "var(--ink-3)", display: "flex" }}
                title="Advance Stage"
              >
                <Icons.ChevronRight size={14} />
              </button>
            )}

            {isActive && canEdit && onCancel && (
              <button
                onClick={e => { e.stopPropagation(); onCancel(); }}
                style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: "var(--terra)", display: "flex" }}
                title="Stop / Cancel Order"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            )}

            {onRemove && canEdit && (
              <button
                onClick={e => { e.stopPropagation(); onRemove(); }}
                style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: "var(--terra)", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center" }}
                title="Permanently Delete Order"
              >
                <Icons.X size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Kanban Column (Kanban View) ────────────────────────────────── */
function OrderKanbanColumn({ label, stageIdx, orders, canEdit, onAddOrder, onDrop, onChangePriority, onAdvanceCard, onReverseCard, onCancelCard, onConfirmCancelCard, onDismissCancelCard, confirmingId, onRemoveCard, onRestoreCard }) {
  const [adding, setAdding] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const tone = STAGE_TONES[stageIdx] || "neutral";
  const dotColor = TONE_DOT[tone] || "var(--ink-4)";
  const bgColor = TONE_BG[tone] || "var(--bg-2)";

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const orderId = e.dataTransfer.getData("orderId");
    if (orderId) {
      onDrop(orderId, stageIdx);
    }
  }

  return (
    <div
      className="ktasks-col"
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{
        background: dragOver ? bgColor : "var(--bg-2)",
        outline: dragOver ? `2px dashed ${dotColor}` : "none",
        minHeight: 480,
        flex: "1 0 220px",
        maxWidth: 260,
      }}
    >
      <div className="ktasks-col-h" style={{ padding: "4px", display: "flex", alignSelf: "stretch", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
          <span style={{ fontWeight: 600, fontSize: 12.5, color: "var(--ink-2)" }}>{label}</span>
        </div>
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>{orders.length}</span>
      </div>

      <div className="ktasks-col-body" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", padding: "4px 0" }}>
        {orders.map(order => (
          <OrderKanbanCard
            key={order.id}
            order={order}
            canEdit={canEdit}
            onDragStart={e => e.dataTransfer.setData("orderId", order.id)}
            onChangePriority={p => onChangePriority(order, p)}
            onAdvance={() => onAdvanceCard(order)}
            onReverse={() => onReverseCard(order)}
            onCancel={() => onCancelCard(order.id)}
            onConfirmCancel={() => onConfirmCancelCard(order)}
            onDismissCancel={onDismissCancelCard}
            confirming={confirmingId === order.id}
            onRemove={onRemoveCard ? () => onRemoveCard(order) : null}
            onRestore={onRestoreCard ? () => onRestoreCard(order) : null}
          />
        ))}

        {adding && (
          <AddOrderCardForm
            onAdd={data => {
              onAddOrder(data.customer, data.item, data.quantity, stageIdx, data.priority);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {orders.length === 0 && !adding && (
          <div className="ktasks-empty" style={{ margin: "auto 0" }}>No orders</div>
        )}
      </div>

      {canEdit && !adding && (
        <button
          onClick={() => setAdding(true)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", fontSize: 12, fontWeight: 500, padding: "6px 4px", textAlign: "left", display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font)" }}
        >
          <Icons.Plus size={13} sw={2} /> Add order
        </button>
      )}
    </div>
  );
}

export default OrderManagement;
