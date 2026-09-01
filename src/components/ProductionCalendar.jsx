import { useState, useMemo } from "react";
import { updateRow } from "../lib/db";
import { todayDate } from "../utils/date";
import { cn, Pill, Progress, Icons, KPI } from "./ui";

const STAGES = [
  "Order Received",
  "Fabric Sourcing",
  "Cutting",
  "Stitching",
  "Finishing & Pressing",
  "Embellishment",
  "Quality Check",
  "Packing",
  "Shipped",
  "Delivered"
];

function getStageColor(stage) {
  switch (stage) {
    case "Order Received":
      return { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe", accent: "#3b82f6" };
    case "Fabric Sourcing":
    case "Cutting":
      return { bg: "#fffbeb", text: "#92400e", border: "#fde68a", accent: "var(--amber)" };
    case "Stitching":
    case "Finishing & Pressing":
      return { bg: "#fff5f5", text: "#9b1c1c", border: "#feb2b2", accent: "var(--terra)" };
    case "Embellishment":
      return { bg: "#fdf2f8", text: "#9d174d", border: "#fbcfe8", accent: "#db2777" };
    case "Quality Check":
      return { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0", accent: "var(--mint-2)" };
    case "Packing":
    case "Shipped":
    case "Delivered":
      return { bg: "#f5f3ff", text: "#5b21b6", border: "#ddd6fe", accent: "#8b5cf6" };
    default:
      return { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb", accent: "#9ca3af" };
  }
}

// Convert YYYY-MM-DD to a readable local string
function formatDateString(str) {
  if (!str) return "Unscheduled";
  const dateObj = new Date(str);
  if (isNaN(dateObj.getTime())) return str;
  return dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProductionCalendar({ orders = [], canEdit, onUpdate }) {
  const [viewMode, setViewMode] = useState("calendar"); // calendar, week-timeline, month-timeline
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Filters state
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Active"); // Default to Active to keep calendar clean
  
  // Reschedule state
  const [rescheduleOrder, setRescheduleOrder] = useState(null);
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [savingReschedule, setSavingReschedule] = useState(false);

  // 1. Calculate KPI Metrics
  const metrics = useMemo(() => {
    const todayStr = todayDate();
    const active = orders.filter(o => o.status === "Active" || o.status === "On Hold");
    
    let overdueCount = 0;
    let dueThisWeekCount = 0;
    let activeUnits = 0;
    
    active.forEach(o => {
      activeUnits += Number(o.quantity || 0);
      
      if (o.deliveryDate) {
        if (o.deliveryDate < todayStr && o.stage !== "Delivered") {
          overdueCount++;
        }
        
        // Due within next 7 days
        const dueTime = new Date(o.deliveryDate).getTime();
        const todayTime = new Date(todayStr).getTime();
        const sevenDaysLaterTime = todayTime + 7 * 24 * 60 * 60 * 1000;
        if (dueTime >= todayTime && dueTime <= sevenDaysLaterTime) {
          dueThisWeekCount++;
        }
      }
    });

    return {
      activeCount: active.length,
      activeUnits,
      dueThisWeekCount,
      overdueCount
    };
  }, [orders]);

  // 2. Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = 
        (order.customerName || "").toLowerCase().includes(search.toLowerCase()) ||
        (order.styleName || "").toLowerCase().includes(search.toLowerCase()) ||
        (order.orderId || "").toLowerCase().includes(search.toLowerCase());
      
      const matchesStage = stageFilter === "All" || order.stage === stageFilter;
      const matchesStatus = statusFilter === "All" || order.status === statusFilter;
      
      return matchesSearch && matchesStage && matchesStatus;
    });
  }, [orders, search, stageFilter, statusFilter]);

  // 3. Reschedule logic
  const handleOpenReschedule = (order) => {
    setRescheduleOrder(order);
    setEditStartDate(order.date || todayDate());
    setEditDueDate(order.deliveryDate || todayDate());
  };

  const handleSaveReschedule = async () => {
    if (!canEdit || !rescheduleOrder) return;
    setSavingReschedule(true);
    try {
      await updateRow("orders", rescheduleOrder.id, {
        date: editStartDate,
        deliveryDate: editDueDate,
        updatedAt: new Date().toISOString(),
      });
      setRescheduleOrder(null);
      if (onUpdate) await onUpdate();
    } catch (err) {
      console.error("Failed to reschedule order:", err);
      alert("Error saving schedule changes: " + err.message);
    } finally {
      setSavingReschedule(false);
    }
  };

  // 4. Monthly Calendar Math & Rendering
  const calendarCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    
    // Mon is 1, Sun is 0 in JS. We want Mon=0, Tue=1, ..., Sun=6.
    let startOffset = firstDayOfMonth.getDay();
    startOffset = startOffset === 0 ? 6 : startOffset - 1;
    
    const cells = [];
    
    // Fill previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      const dateStr = d.toISOString().slice(0, 10);
      cells.push({
        date: d,
        dateStr,
        isCurrentMonth: false
      });
    }
    
    // Fill current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      const dateStr = d.toISOString().slice(0, 10);
      cells.push({
        date: d,
        dateStr,
        isCurrentMonth: true
      });
    }
    
    // Fill next month days to get multiple of 7 (maximum 42 cells)
    let nextMonthDay = 1;
    while (cells.length < 42) {
      const d = new Date(year, month + 1, nextMonthDay++);
      const dateStr = d.toISOString().slice(0, 10);
      cells.push({
        date: d,
        dateStr,
        isCurrentMonth: false
      });
    }
    
    return cells;
  }, [currentDate]);

  // Group filtered orders by deliveryDate for fast calendar retrieval
  const ordersByDueDate = useMemo(() => {
    const map = {};
    filteredOrders.forEach(o => {
      if (o.deliveryDate) {
        if (!map[o.deliveryDate]) map[o.deliveryDate] = [];
        map[o.deliveryDate].push(o);
      }
    });
    return map;
  }, [filteredOrders]);

  // 5. Timeline (Gantt View) Math & Navigation
  const timelineConfig = useMemo(() => {
    const rangeStart = new Date(currentDate);
    let numDays = 7;
    
    if (viewMode === "week-timeline") {
      // Find Monday of the current selected date
      const day = rangeStart.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      rangeStart.setDate(rangeStart.getDate() + diff);
      numDays = 7;
    } else if (viewMode === "month-timeline") {
      // Start of the month
      rangeStart.setDate(1);
      numDays = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0).getDate();
    }
    
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + numDays - 1);
    rangeEnd.setHours(23, 59, 59, 999);
    
    // Generate dates array
    const dates = [];
    for (let i = 0; i < numDays; i++) {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    
    return {
      start: rangeStart,
      end: rangeEnd,
      dates,
      numDays
    };
  }, [currentDate, viewMode]);

  // Filter orders that overlap with the visible timeline range
  const timelineOrders = useMemo(() => {
    if (viewMode === "calendar") return [];
    
    return filteredOrders.filter(order => {
      const start = new Date(order.date || order.deliveryDate || todayDate());
      const end = new Date(order.deliveryDate || order.date || todayDate());
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      return start <= timelineConfig.end && end >= timelineConfig.start;
    });
  }, [filteredOrders, viewMode, timelineConfig]);

  // Navigation handlers
  const handleNavigate = (direction) => {
    const newDate = new Date(currentDate);
    if (viewMode === "calendar") {
      newDate.setMonth(newDate.getMonth() + direction);
    } else if (viewMode === "week-timeline") {
      newDate.setDate(newDate.getDate() + (direction * 7));
    } else if (viewMode === "month-timeline") {
      newDate.setMonth(newDate.getMonth() + direction);
    }
    setCurrentDate(newDate);
  };

  const handleGoToToday = () => {
    setCurrentDate(new Date());
  };

  const renderMonthCalendar = () => {
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const todayStr = todayDate();

    return (
      <div className="fade-in">
        {/* Month grid headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, textAlign: "center", marginBottom: 8 }}>
          {dayLabels.map(d => (
            <div key={d} style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{d}</div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="kcal-month-grid">
          {calendarCells.map((cell, idx) => {
            const isToday = cell.dateStr === todayStr;
            const dayOrders = ordersByDueDate[cell.dateStr] || [];
            
            return (
              <div 
                key={`${cell.dateStr}-${idx}`}
                className={cn(
                  "kcal-day-cell", 
                  !cell.isCurrentMonth && "other-month",
                  isToday && "today"
                )}
              >
                <div className="kcal-day-header">
                  <span className="kcal-day-number">{cell.date.getDate()}</span>
                  {dayOrders.length > 0 && (
                    <span className="tab-badge" style={{ background: "var(--accent-soft)", color: "var(--mint-deep)", padding: "1px 5px", fontSize: 10 }}>
                      {dayOrders.length}
                    </span>
                  )}
                </div>
                <div className="kcal-day-events">
                  {dayOrders.map(order => {
                    const colors = getStageColor(order.stage);
                    return (
                      <button
                        key={order.id}
                        className="kcal-event-item"
                        style={{
                          backgroundColor: colors.bg,
                          color: colors.text,
                          borderColor: colors.border
                        }}
                        onClick={() => handleOpenReschedule(order)}
                        title={`${order.orderId}: ${order.customerName} · ${order.styleName}`}
                      >
                        {order.orderId} · {order.customerName.slice(0, 10)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTimeline = () => {
    const todayStr = todayDate();
    const todayTime = new Date(todayStr).getTime();
    const colWidth = viewMode === "week-timeline" ? (100 / timelineConfig.numDays) : 70; // Fixed width for month timeline to enable scrolling
    const totalGridWidth = viewMode === "week-timeline" ? "100%" : `${timelineConfig.numDays * 70}px`;

    // Today indicator percentage
    let todayPct = -1;
    if (todayTime >= timelineConfig.start.getTime() && todayTime <= timelineConfig.end.getTime()) {
      const totalMs = timelineConfig.end.getTime() - timelineConfig.start.getTime() + 86400000;
      const offsetMs = todayTime - timelineConfig.start.getTime();
      todayPct = (offsetMs / totalMs) * 100;
    }

    return (
      <div className="kcal-timeline-container fade-in">
        {/* Left Side: Order Labels */}
        <div className="kcal-timeline-sidebar">
          <div className="kcal-timeline-sidebar-header">Production Order</div>
          {timelineOrders.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: "var(--ink-4)", fontStyle: "italic" }}>No orders listed</div>
          ) : (
            timelineOrders.map(order => (
              <div key={order.id} className="kcal-timeline-sidebar-row" onClick={() => handleOpenReschedule(order)} style={{ cursor: "pointer" }}>
                <span className="kcal-timeline-sidebar-order-id">{order.orderId}</span>
                <span className="kcal-timeline-sidebar-client" title={order.customerName}>{order.customerName}</span>
              </div>
            ))
          )}
        </div>

        {/* Right Side: Scrollable Timeline Grid */}
        <div className="kcal-timeline-grid-area">
          <div style={{ width: totalGridWidth, position: "relative" }}>
            
            {/* Header Dates Row */}
            <div className="kcal-timeline-grid-header">
              {timelineConfig.dates.map(date => {
                const dateStr = date.toISOString().slice(0, 10);
                const isToday = dateStr === todayStr;
                return (
                  <div 
                    key={dateStr}
                    className={cn("kcal-timeline-header-cell", isToday && "today")}
                    style={{ width: viewMode === "week-timeline" ? `${colWidth}%` : `${colWidth}px` }}
                  >
                    <span className="kcal-timeline-header-day">
                      {date.toLocaleDateString("en-GB", { weekday: viewMode === "week-timeline" ? "short" : "narrow" })}
                    </span>
                    <span className="kcal-timeline-header-date">
                      {date.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Grid Body */}
            <div className="kcal-timeline-grid-body">
              {/* Today vertical line */}
              {todayPct >= 0 && (
                <div className="kcal-timeline-today-line" style={{ left: `${todayPct}%` }} />
              )}

              {timelineOrders.length === 0 ? (
                <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--ink-4)" }}>
                  No active orders in this date range.
                </div>
              ) : (
                timelineOrders.map(order => {
                  const colors = getStageColor(order.stage);
                  
                  // Progress pct of stage
                  const stageIdx = STAGES.indexOf(order.stage);
                  const progressPct = stageIdx < 0 ? 0 : Math.round((stageIdx / (STAGES.length - 1)) * 100);

                  // Calculate Gantt bar bounds
                  const oStart = new Date(order.date || order.deliveryDate || todayStr);
                  const oEnd = new Date(order.deliveryDate || order.date || todayStr);
                  oStart.setHours(0, 0, 0, 0);
                  oEnd.setHours(23, 59, 59, 999);

                  // Clamp to screen range
                  const barStart = oStart < timelineConfig.start ? timelineConfig.start : oStart;
                  const barEnd = oEnd > timelineConfig.end ? timelineConfig.end : oEnd;

                  const totalMs = timelineConfig.end.getTime() - timelineConfig.start.getTime() + 86400000;
                  const startOffsetMs = barStart.getTime() - timelineConfig.start.getTime();
                  const durationMs = barEnd.getTime() - barStart.getTime() + 86400000;

                  const leftPct = (startOffsetMs / totalMs) * 100;
                  const widthPct = (durationMs / totalMs) * 100;

                  return (
                    <div key={order.id} className="kcal-timeline-grid-row">
                      <div 
                        className="kcal-timeline-bar-wrapper"
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: colors.bg,
                          color: colors.text,
                          borderLeft: `4px solid ${colors.accent}`,
                          borderTop: `1px solid ${colors.border}`,
                          borderBottom: `1px solid ${colors.border}`,
                          borderRight: `1px solid ${colors.border}`
                        }}
                        onClick={() => handleOpenReschedule(order)}
                        title={`${order.orderId}: ${order.customerName} · ${order.styleName}\nDates: ${formatDateString(order.date)} to ${formatDateString(order.deliveryDate)}\nStage: ${order.stage} (${progressPct}%)`}
                      >
                        {/* Progress overlay */}
                        <div 
                          className="kcal-timeline-bar-progress"
                          style={{ width: `${progressPct}%` }}
                        />
                        {/* Content text */}
                        <div className="kcal-timeline-bar-content">
                          {order.orderId} · {order.styleName} ({order.quantity} pcs)
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 6. Navigation Label String
  const navigationLabel = useMemo(() => {
    if (viewMode === "calendar") {
      return currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    } else if (viewMode === "week-timeline") {
      const monday = new Date(timelineConfig.start);
      const sunday = new Date(timelineConfig.end);
      return `${monday.getDate()} ${monday.toLocaleDateString("en-GB", { month: "short" })} - ${sunday.getDate()} ${sunday.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`;
    } else if (viewMode === "month-timeline") {
      return currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    }
    return "";
  }, [currentDate, viewMode, timelineConfig]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      
      {/* Metrics Ribbon */}
      <section className="stats-grid">
        <KPI 
          label="Active Orders" 
          value={metrics.activeCount}
          icon={<Icons.Production size={14} sw={1.8}/>}
        />
        <KPI 
          label="Total Units in Pipeline" 
          value={metrics.activeUnits.toLocaleString()}
          icon={<Icons.Truck size={14} sw={1.8}/>}
        />
        <KPI 
          label="Due This Week" 
          value={metrics.dueThisWeekCount} 
          accent="var(--amber)"
          icon={<Icons.Calendar size={14} sw={1.8}/>}
        />
        <KPI 
          label="Overdue Orders" 
          value={metrics.overdueCount} 
          accent="var(--terra)"
          icon={<Icons.Alert size={14} sw={1.8}/>}
        />
      </section>

      {/* Filters Ribbon */}
      <section className="kcal-filters-ribbon">
        <div className="kcal-filters-left">
          
          {/* Search bar */}
          <div className="kcal-filter-item">
            <span className="kcal-filter-label">Search Orders</span>
            <input 
              type="text" 
              className="kcal-input" 
              placeholder="ID, customer, style..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Stage filter */}
          <div className="kcal-filter-item">
            <span className="kcal-filter-label">Stage</span>
            <select 
              className="kcal-input"
              style={{ minWidth: 140 }}
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value)}
            >
              <option value="All">All Stages</option>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Status filter */}
          <div className="kcal-filter-item">
            <span className="kcal-filter-label">Status</span>
            <select 
              className="kcal-input"
              style={{ minWidth: 120 }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="On Hold">On Hold</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* View Mode Toggle Buttons */}
        <div className="kcal-view-toggles">
          <button 
            className={cn("kcal-toggle-btn", viewMode === "calendar" && "active")}
            onClick={() => setViewMode("calendar")}
          >
            <Icons.Calendar size={13} /> Month Grid
          </button>
          <button 
            className={cn("kcal-toggle-btn", viewMode === "week-timeline" && "active")}
            onClick={() => setViewMode("week-timeline")}
          >
            Week Timeline
          </button>
          <button 
            className={cn("kcal-toggle-btn", viewMode === "month-timeline" && "active")}
            onClick={() => setViewMode("month-timeline")}
          >
            Month Gantt
          </button>
        </div>
      </section>

      {/* Main navigation controls */}
      <div className="panel" style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{navigationLabel}</h3>
          {viewMode === "calendar" && (
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Due Date Calendar</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ghost-button" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => handleNavigate(-1)}>
            <Icons.ChevronLeft size={14} /> Prev
          </button>
          <button className="ghost-button" style={{ padding: "6px 12px", fontSize: 12 }} onClick={handleGoToToday}>
            Today
          </button>
          <button className="ghost-button" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => handleNavigate(1)}>
            Next <Icons.ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Render Main Selected View */}
      {viewMode === "calendar" ? renderMonthCalendar() : renderTimeline()}

      {/* Reschedule Modal */}
      {rescheduleOrder && (
        <div className="kbrf-overlay" onClick={e => { if (e.target === e.currentTarget) setRescheduleOrder(null); }}>
          <div className="kbrf-modal" style={{ maxWidth: 440 }}>
            <div className="kbrf-modal-hd">
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Reschedule Production Order</div>
                <div style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 400, marginTop: 2 }}>
                  {rescheduleOrder.orderId} · {rescheduleOrder.customerName}
                </div>
              </div>
              <button className="kbrf-modal-close" onClick={() => setRescheduleOrder(null)}>✕</button>
            </div>

            <div style={{ background: "var(--bg-2)", padding: 12, borderRadius: 10, marginBottom: 16, fontSize: 12.5 }}>
              <div style={{ marginBottom: 4 }}><strong>Item style:</strong> {rescheduleOrder.styleName}</div>
              <div style={{ marginBottom: 4 }}><strong>Quantity:</strong> {rescheduleOrder.quantity} pcs</div>
              <div style={{ marginBottom: 4 }}>
                <strong>Current Stage:</strong> <Pill tone={getStageColor(rescheduleOrder.stage).accent === "var(--mint-2)" ? "mint" : getStageColor(rescheduleOrder.stage).accent === "var(--amber)" ? "amber" : getStageColor(rescheduleOrder.stage).accent === "var(--terra)" ? "terra" : "blue"}>{rescheduleOrder.stage}</Pill>
              </div>
              <div><strong>Status:</strong> {rescheduleOrder.status}</div>
            </div>

            <div className="grid-form" style={{ gridTemplateColumns: "1fr", gap: 14 }}>
              <label>
                Start Date (Production Launch)
                <input 
                  type="date" 
                  value={editStartDate} 
                  onChange={e => setEditStartDate(e.target.value)}
                  disabled={!canEdit}
                />
              </label>

              <label>
                Due Date (Delivery Target)
                <input 
                  type="date" 
                  value={editDueDate} 
                  onChange={e => setEditDueDate(e.target.value)}
                  disabled={!canEdit}
                />
              </label>
            </div>

            {!canEdit && (
              <p className="banner-warning" style={{ margin: "14px 0 0", fontSize: 12 }}>
                UK admin read-only view. You do not have permissions to reschedule dates.
              </p>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button className="ghost-button" onClick={() => setRescheduleOrder(null)}>
                {canEdit ? "Cancel" : "Close"}
              </button>
              {canEdit && (
                <button 
                  className="primary-button" 
                  disabled={savingReschedule} 
                  onClick={handleSaveReschedule}
                >
                  {savingReschedule ? "Saving…" : "Save Reschedule"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
