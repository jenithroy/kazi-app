/**
 * Shared enum constants for order stages, statuses, and attendance.
 * Import from here rather than duplicating magic strings across pages.
 */

// Production.jsx pipeline stages (10-stage garment flow)
export const ORDER_STAGES = [
  "Order Received",
  "Fabric Sourcing",
  "Cutting",
  "Stitching",
  "Finishing & Pressing",
  "Embellishment",
  "Quality Check",
  "Packing",
  "Shipped",
  "Delivered",
];

// OrderManagement.jsx kanban stages (7-stage simplified flow)
export const KANBAN_STAGES = [
  "Ordered",
  "Cutting",
  "Sewing",
  "Printing",
  "QC",
  "Shipping",
  "Delivered",
];

// Order priority levels (OrderManagement.jsx) — index = urgency rank (lower = more urgent)
export const ORDER_PRIORITIES = ["Urgent", "High", "Normal", "Low"];

export const ORDER_STATUSES = {
  ACTIVE:    "Active",
  ON_HOLD:   "On Hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DELIVERED: "Delivered",
};

export const ATTENDANCE_STATUSES = {
  PRESENT:  "Present",
  LATE:     "Late",
  HALF_DAY: "Half-day",
  LEAVE:    "Leave",
  ABSENT:   "Absent",
};
