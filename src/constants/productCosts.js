// Totals from cost.xlsx — source of truth. Individual components are per-unit NPR.
// Note: component sum ≠ total in some rows; difference may be packaging/overhead not shown.
export const PRODUCT_COSTS = [
  { code: "kazi1001", name: "Chinese Terry Tshirt (White)", fabric: 402, rib: 22, trims: 16, labour: 75, others: 20, total: 518 },
  { code: "kazi1002", name: "Chinese Terry Tshirt (Black)", fabric: 307, rib: 22, trims: 16, labour: 75, others: 20, total: 423 },
  { code: "kazi1003", name: "Cotton Terry",                  fabric: 360, rib: 22, trims: 16, labour: 75, others: 20, total: 476 },
  { code: "kazi1004", name: "Lining Cotton Terry",           fabric:   0, rib: 22, trims: 20, labour: 75, others: 20, total: null },
  { code: "kazi1005", name: "Combed Cotton",                 fabric: 290, rib: 22, trims: 20, labour: 75, others: 20, total: 410 },
  { code: "kazi1006", name: "Ligra",                         fabric: 160, rib: 22, trims: 20, labour: 75, others: 20, total: null },
];
