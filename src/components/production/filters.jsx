/**
 * What the Filters panel offers on the Production page (components/filters: the button, the panel and the engine).
 *
 * Two of the choices are the page's own and are only mirrored here (`controlled`), so the panel never disagrees with what the
 * strip and the tiles show:
 *   Stage      the pipeline strip's choice (a stage, all the open orders, or the finished ones): the page keeps `view` and `stage`
 *   This month the switch that scopes the whole page (the strip's counts, the four numbers and the attention list follow it)
 * The quick views ("Focus on": overdue, due this week, no delivery date, on hold, stock not deducted) are the panel's own, so they
 * are a pill and carry counts like every filter; the glance and attention tiles start them by pressing the panel's choice
 * (Production.jsx `focusOn`), which is why the tiles and the panel cannot disagree either.
 * Everything else narrows the list, applied to what the page's own `selectOrders` (lib/production.js: the strip's choice and the
 * search) returns, so an order that passes keeps its place in the list.
 */
import { Avatar, hueFromName } from "../ui";
import foldNames from "../../lib/foldNames";
import {
  QUICK, STAGES, inMonth, invoiceOf, isOpen, matchesQuick, shortDate, stageShort,
} from "../../lib/production";

/** The "Stage" choice's value for the finished and cancelled orders (the others are a stage's own name, "" for all the open ones). */
export const DONE = "__done";

/** The filters, as the engine's definitions (components/filters/useFilters.js). `orders` are the ones on this side of the business. */
export function orderFilters({
  orders, invoices, today, monthKey, canDeductStock, stockPending, counts,
  view, stage, onStage, monthOnly, onMonthOnly,
}) {
  const customers = foldNames(orders, (o) => o.customerName);
  const styles = foldNames(orders, (o) => o.styleName);
  const fabrics = foldNames(orders, (o) => o.fabricType);
  const colours = foldNames(orders, (o) => o.colorway);
  const people = new Map();                                    // person id -> name, as the orders carry them
  orders.forEach((o) => { if (o.assigned_to && o.assignedTo) people.set(String(o.assigned_to), o.assignedTo); });
  // a day in the way the page writes one ("16 Oct"), with the year only when it is not this year's
  const day = (iso) => (String(iso).slice(0, 4) === today.slice(0, 4) ? shortDate(iso) : `${shortDate(iso)} ${String(iso).slice(0, 4)}`);

  const quick = ["overdue", "week", "nodate", "hold", ...(canDeductStock ? ["stock"] : [])];
  const tone = { overdue: "bad", hold: "warn", stock: "warn" };

  return [
    {
      // what the two tiles beside the list set ("Due this week", "See in list"): one at a time, as they always were. An order that is
      // finished is never late, on hold or waiting on stock, so only the open ones pass.
      id: "focus", label: "Focus on", kind: "chips",
      options: [{ value: "", label: "Everything" }, ...quick.map((k) => ({ value: k, label: QUICK[k], tone: tone[k] }))],
      test: (o, k) => isOpen(o) && matchesQuick(o, k, today, stockPending),
    },
    // the switches, together under one heading: "This month" is the page's own (it scopes the tiles as well), the other is a filter of the list
    {
      id: "month", label: "This month", kind: "toggle", text: "This month only", pill: "This month",
      test: (o) => inMonth(o, monthKey), controlled: { value: monthOnly, set: onMonthOnly },
    },
    { id: "noinvoice", label: "No invoice yet", kind: "toggle", text: "No invoice yet", pill: "No invoice yet", test: (o) => !invoiceOf(o, invoices) },
    { id: "customer", label: "Customer", kind: "select", of: (o) => customers.keyOf(o.customerName), nameOf: customers.nameOf, any: "Any customer", none: "No customer" },
    {
      id: "who", label: "Assigned to", kind: "select", of: (o) => (o.assigned_to ? String(o.assigned_to) : ""), any: "Anyone", none: "Not assigned",
      nameOf: (id) => people.get(id) || id,
      icon: (id) => (people.has(id) ? <Avatar name={people.get(id)} personId={id} hue={hueFromName(people.get(id))} size={22} /> : undefined),
    },
    { id: "fabric", label: "Fabric", kind: "select", of: (o) => fabrics.keyOf(o.fabricType), nameOf: fabrics.nameOf, any: "Any fabric", none: "No fabric" },
    { id: "style", label: "Style", kind: "select", of: (o) => styles.keyOf(o.styleName), nameOf: styles.nameOf, any: "Any style", none: "No style" },
    { id: "due", label: "Delivery between", kind: "dates", get: (o) => o.deliveryDate || "", show: day, pill: "Due" },
    { id: "qty", label: "Pieces", kind: "range", get: (o) => o.quantity, unit: "pcs" },
    { id: "value", label: "Order value", kind: "range", get: (o) => o.totalValueNPR, unit: "NPR", pill: "Order value" },
    { id: "placed", label: "Order placed between", kind: "dates", get: (o) => o.date || "", show: day, pill: "Placed" },
    { id: "colour", label: "Colour", kind: "select", of: (o) => colours.keyOf(o.colorway), nameOf: colours.nameOf, any: "Any colour", none: "No colour" },
    {
      // the strip's choice, drawn here with the same numbers the strip shows
      id: "stage", label: "Stage", kind: "chips",
      controlled: { value: view === "closed" ? DONE : stage, set: onStage },
      options: [
        { value: "", label: "All open", count: counts.open },
        ...STAGES.filter((s) => s !== "Delivered" || counts.byStage[s] > 0).map((s) => ({ value: s, label: stageShort(s), count: counts.byStage[s] })),
        { value: DONE, label: "Done", count: counts.closed },
      ],
    },
  ];
}
