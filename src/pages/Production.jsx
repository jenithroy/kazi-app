/**
 * Production, on the same frosted-glass bento frame as the Dashboard, Tasks and Attendance: one
 * screen, no page scroll, the list scrolls inside its tile. The old page was four tabs (Pipeline,
 * Order Management, Timeline & Calendar, Batch Tracking); it is one screen now:
 *
 *   pipeline strip   the ten stages with their counts; press one to filter the list
 *   at a glance      open orders, pieces, due this week, what they are worth
 *   orders           the list, or the same orders on a calendar by delivery date
 *   needs attention  late, on hold, or waiting on stock
 *
 * An order opens in a card (OrderCard) where it is moved on, held, edited and annotated. The sums
 * live in lib/production.js, the reading in hooks/useProductionData.js; this file keeps what is
 * selected and does every write (the same writes the old page did, in the same order).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useAuth } from "../context/AuthContext";
import { useRegion } from "../context/RegionContext";
import { useReward } from "../context/RewardContext";
import { sectionCanEdit } from "../utils/permissions";
import { deleteRow, insertRow, updateRow } from "../lib/db";
import { kathmanduDate, todayDate } from "../utils/date";
import { tsMillis } from "../utils/date";
import { clientsFromDocuments } from "../utils/billingClients";
import { notifyStageChange } from "../utils/telegram";
import { awardPoints, resolveUidByName } from "../utils/rewardService";
import { orderRefOf } from "../utils/productionConsumption";
import { countUntagged, filterByRegion } from "../utils/region";
import { RegionSwitch } from "../components/RegionSwitch";
import { Icons } from "../components/ui";
import { BentoGrid, BentoPage } from "../components/bento/Bento";
import ConfirmDialog from "../components/tasks/ConfirmDialog";
import MaterialsUsedModal from "../components/MaterialsUsedModal";
import PipelineTile from "../components/production/PipelineTile";
import GlanceTile from "../components/production/GlanceTile";
import OrdersTile from "../components/production/OrdersTile";
import AttentionTile from "../components/production/AttentionTile";
import OrderCard from "../components/production/OrderCard";
import OrderFormDialog, { emptyInvFields } from "../components/production/OrderFormDialog";
import InvoiceDialog from "../components/production/InvoiceDialog";
import useProductionData from "../hooks/useProductionData";
import {
  LAST_STAGE, MATERIALS_STAGE, STAGES, STAGES_AWAITING_STOCK_DEDUCTION, attention, dueIn30, glance, inMonth,
  invoiceOf, nextInvoiceNumber, nextOrderNumber, pipelineCounts, selectOrders, stageIndex,
} from "../lib/production";
import "../components/production/production.css";
import "../components/production/production-dialogs.css";

const VAT_RATE = 0.13;
const NOTICE_MS = 9000;

/** The office's today, kept current so "late" flips at midnight without a reload. */
function useToday() {
  const [today, setToday] = useState(() => kathmanduDate());
  useEffect(() => {
    const id = setInterval(() => setToday(kathmanduDate()), 60000);
    return () => clearInterval(id);
  }, []);
  return today;
}

const findFabric = (fabrics, name) => {
  const n = (name || "").trim().toLowerCase();
  return n ? fabrics.find((f) => (f.name || "").trim().toLowerCase() === n) || null : null;
};

export default function Production() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "production");
  // Stock rows are gated on the inventory section by the database, so deducting
  // materials needs inventory edit rights on top of production edit rights.
  const canDeductStock = canEdit && sectionCanEdit(profile, "inventory");
  const { showPointsToast } = useReward();
  const { region } = useRegion();
  const today = useToday();
  const monthKey = today.slice(0, 7);

  const data = useProductionData({ canDeductStock });
  const { status, error: loadError, reload, reloadOrders, addCustomer } = data;
  const allOrders = data.orders;

  /* ── what is on screen ─────────────────────────────────── */

  const [view, setView] = useState("open");            // "open" | "closed"
  const [stage, setStage] = useState("");              // one stage of the working list, or ""
  const [quick, setQuick] = useState("");              // overdue | week | nodate | hold | stock | ""
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("list");            // "list" | "calendar"
  const [monthOnly, setMonthOnly] = useState(false);

  /* ── dialogs, and what is being done ───────────────────── */

  const [cardId, setCardId] = useState(null);
  const [form, setForm] = useState(null);              // { order: the one being edited or null, back: reopen its card after }
  const [invoiceFor, setInvoiceFor] = useState(null);
  const [materials, setMaterials] = useState(null);    // { order, advancing }
  const [confirm, setConfirm] = useState(null);
  // One calendar for every date in the order form (A.D. or B.S.). It lives here rather than in the
  // form so the choice survives closing and reopening it.
  const [dateMode, setDateMode] = useState("ad");
  const [busy, setBusy] = useState(() => new Map());   // order id -> how many changes to it are in flight
  const [notice, setNotice] = useState(null);          // { text, bad, undo }: what just happened
  const [actionError, setActionError] = useState("");
  const noticeTimer = useRef(0);
  const ordersRef = useRef(allOrders);
  ordersRef.current = allOrders;

  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  const say = useCallback((next) => {
    clearTimeout(noticeTimer.current);
    setNotice(next);
    if (next) noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  const working = (id, on) => setBusy((m) => {
    const n = new Map(m);
    const count = (n.get(id) || 0) + (on ? 1 : -1);
    if (count > 0) n.set(id, count); else n.delete(id);
    return n;
  });

  /* ── region-scoped views of everything ─────────────────────
     The switch in the header is the only thing between the raw rows and the page, so every tile,
     count and dropdown narrows to one arm of the business without any of them having to know that.
     Rows with no region set appear on both sides (see utils/region.js). The unfiltered rows stay in
     scope for the two jobs that must span both: numbering the next order and invoice, which has to
     be unique across the company, and counting what is still untagged. */

  const orders = useMemo(() => filterByRegion(allOrders, region), [allOrders, region]);
  const invoices = useMemo(() => filterByRegion(data.invoices, region), [data.invoices, region]);
  const challans = useMemo(() => filterByRegion(data.challans, region), [data.challans, region]);
  const quotations = useMemo(() => filterByRegion(data.quotations, region), [data.quotations, region]);
  const samples = useMemo(() => filterByRegion(data.samples, region), [data.samples, region]);
  const fabrics = useMemo(() => filterByRegion(data.fabrics, region), [data.fabrics, region]);
  const customers = useMemo(() => filterByRegion(data.customers, region), [data.customers, region]);
  // Clients who have been invoiced, sent a challan or quoted in Billing but were never added to
  // Customers, so the customer picker offers them too. Checked against every customer, not just this
  // region's, so one filed on the other side is not offered again as new.
  const billingClients = useMemo(
    () => clientsFromDocuments([...invoices, ...challans, ...quotations], data.customers),
    [invoices, challans, quotations, data.customers],
  );
  const latestInvoice = useMemo(() => {
    if (!invoices.length) return null;
    const stamp = (i) => tsMillis(i.createdAt) || (i.date ? new Date(i.date).getTime() : 0);
    return [...invoices].sort((a, b) => stamp(b) - stamp(a))[0];
  }, [invoices]);

  // "deducted" once any production stock-out exists for the order; "pending" for an active order that
  // is past Quality Check with nothing deducted yet (the usual cause is an order entered late).
  const stockStateFor = useCallback((order) => {
    if (!canDeductStock) return null;
    if (data.deductedRefs.has(orderRefOf(order))) return "deducted";
    if (order.status === "Active" && STAGES_AWAITING_STOCK_DEDUCTION.includes(order.stage)) return "pending";
    return null;
  }, [canDeductStock, data.deductedRefs]);

  const scoped = useMemo(() => (monthOnly ? orders.filter((o) => inMonth(o, monthKey)) : orders), [orders, monthOnly, monthKey]);
  const stockPending = useMemo(() => new Set(scoped.filter((o) => stockStateFor(o) === "pending").map((o) => o.id)), [scoped, stockStateFor]);
  const counts = useMemo(() => pipelineCounts(scoped), [scoped]);
  const stats = useMemo(() => glance(scoped, today), [scoped, today]);
  const attn = useMemo(() => attention(scoped, today, stockPending), [scoped, today, stockPending]);
  const rows = useMemo(
    () => selectOrders(scoped, { view, stage, query, quick, today, stockPending }),
    [scoped, view, stage, query, quick, today, stockPending],
  );
  // how many the list would hold before the search box and the quick filter narrowed it
  const base = useMemo(
    () => selectOrders(scoped, { view, stage, today, stockPending }).length,
    [scoped, view, stage, today, stockPending],
  );

  const cardOrder = cardId ? allOrders.find((o) => o.id === cardId) || null : null;

  const pickStage = (nextView, nextStage) => { setView(nextView); setStage(nextStage); setQuick(""); };
  const showQuick = (key) => { setView("open"); setStage(""); setQuick(key); setMode("list"); };
  const clearAll = () => { setQuery(""); setQuick(""); setMonthOnly(false); };

  /* ── writes ────────────────────────────────────────────── */

  /** Runs one change to one order with its row marked busy; a failure is said, not swallowed. */
  async function runOn(order, fn, failText) {
    working(order.id, true);
    setActionError("");
    try {
      await fn();
      return true;
    } catch (err) {
      console.error(failText, err);
      setActionError(`${failText} ${err?.message || "Check your connection and try again."}`);
      return false;
    } finally {
      working(order.id, false);
    }
  }

  async function performAdvance(order) {
    const curIdx = stageIndex(order.stage);
    if (curIdx >= LAST_STAGE) return null;
    const newStage = STAGES[curIdx + 1];
    const newStatus = newStage === "Delivered" ? "Completed" : order.status;
    const history = [...(order.stageHistory || []), { stage: newStage, date: todayDate(), by: profile?.name || "Unknown" }];
    await updateRow("orders", order.id, { stage: newStage, status: newStatus, stageHistory: history });
    notifyStageChange({ orderId: order.orderId, customerName: order.customerName, stage: newStage, quantity: order.quantity, updatedBy: profile?.name || "Unknown" });
    // Asks the Telegram worker-assignment function ("dispatchStage": give this stage to the least-loaded free
    // worker and message them) to do that for the new stage. It is not delivery, and it has never assigned
    // anyone (order_assignments is empty), so a move does not wait for it.
    try {
      httpsCallable(getFunctions(), "dispatchStage")({ orderId: order.id, stage: newStage })
        .catch((err) => console.warn("Dispatch skipped:", err?.message || err));
    } catch (err) {
      console.warn("Dispatch skipped:", err?.message || err);
    }
    await reloadOrders();
    // The move has happened; a hiccup awarding points must not make it look as if it had not.
    try {
      if (profile?.name) {
        const uid = await resolveUidByName(profile.name);
        if (uid) {
          if (newStage === "Delivered") {
            const day = new Date(); day.setHours(0, 0, 0, 0);
            const isOnTime = order.deliveryDate && day <= new Date(order.deliveryDate);
            const pts = await awardPoints({
              uid, displayName: profile.name, eventType: "order_delivered", sourceId: `${order.id}_delivered`,
              reason: order.orderId || order.id, bonusPoints: isOnTime ? 20 : 0,
            });
            if (pts) showPointsToast(pts, `Order ${order.orderId || order.id} delivered`);
          } else {
            const pts = await awardPoints({
              uid, displayName: profile.name, eventType: "order_stage_advanced", sourceId: `${order.id}_${newStage}`,
              reason: `${order.orderId || order.id} → ${newStage}`,
            });
            if (pts) showPointsToast(pts, `${order.orderId || order.id} → ${newStage}`);
          }
        }
      }
    } catch (err) {
      console.warn("Could not award points:", err?.message || err);
    }
    return newStage;
  }

  async function moveOn(order) {
    let to = null;
    const ok = await runOn(order, async () => { to = await performAdvance(order); }, `Could not move ${order.orderId} on.`);
    if (ok && to) say({ text: `${order.orderId}: ${order.stage} → ${to}`, undo: () => undoMove(order.id, to) });
  }

  // Coming out of Quality Check is when materials leave stock: ask which ones were used before the
  // order moves on. Orders whose materials were already deducted, and people without inventory
  // access, go straight through.
  function advance(order) {
    if (canDeductStock && order.stage === MATERIALS_STAGE && !data.deductedRefs.has(orderRefOf(order))) {
      setMaterials({ order, advancing: true });
      return undefined;
    }
    return moveOn(order);
  }

  async function reverseStage(order) {
    const curIdx = stageIndex(order.stage);
    if (curIdx <= 0) return;
    const newStage = STAGES[curIdx - 1];
    const history = [...(order.stageHistory || []), { stage: `↩ Reverted to ${newStage}`, date: todayDate(), by: profile?.name || "Unknown" }];
    await updateRow("orders", order.id, { stage: newStage, status: "Active", stageHistory: history });
    await reloadOrders();
  }

  const stepBack = (order) => runOn(order, () => reverseStage(order), `Could not move ${order.orderId} back.`);

  // Undo of a move on: only while the order is still where the move left it, or it would drag back
  // somebody else's later move.
  async function undoMove(id, expected) {
    say(null);
    const cur = ordersRef.current.find((o) => o.id === id);
    // Moving on to Delivered also completed the order, so that is the one status Undo may find besides Active.
    const stillRunning = cur && (cur.status === "Active" || (expected === "Delivered" && cur.status === "Completed"));
    if (!cur || cur.stage !== expected || !stillRunning) {
      say({ text: `Can't undo: ${cur?.orderId || "that order"} has changed since.`, bad: true });
      return;
    }
    const ok = await runOn(cur, () => reverseStage(cur), `Could not undo the move of ${cur.orderId}.`);
    if (ok) say({ text: `${cur.orderId}: back to ${STAGES[stageIndex(expected) - 1]}` });
  }

  const setStatus = (order, next) => {
    if (next === "Cancelled") {
      setConfirm({
        title: `Cancel ${order.orderId}?`,
        label: "Cancel order",
        busyLabel: "Cancelling…",
        text: `${order.customerName || "This order"} stays on the books as cancelled. You can reactivate it later.`,
        run: async () => {
          try {
            await updateRow("orders", order.id, { status: "Cancelled" });
            await reloadOrders();
            return true;
          } catch (err) {
            console.error("Failed to cancel order:", err);
            return { ok: false, message: err?.message || "Could not cancel the order." };
          }
        },
      });
      return undefined;
    }
    return runOn(order, async () => {
      await updateRow("orders", order.id, { status: next });
      await reloadOrders();
    }, `Could not change ${order.orderId}.`);
  };

  const askDelete = (order) => setConfirm({
    title: `Delete ${order.orderId}?`,
    label: "Delete order",
    busyLabel: "Deleting…",
    text: `This removes ${order.orderId}${order.customerName ? ` (${order.customerName})` : ""} for good, with its notes and history. It cannot be undone. To keep it on the books, cancel it instead.`,
    run: async () => {
      try {
        await deleteRow("orders", order.id);
        setCardId(null);
        await reload();
        return true;
      } catch (err) {
        console.error("Failed to delete order:", err);
        return { ok: false, message: err?.message || "Could not delete the order." };
      }
    },
  });

  const saveEmbellishments = (order, next) => runOn(order, async () => {
    await updateRow("orders", order.id, { embellishments: next });
    await reloadOrders();
  }, `Could not save the embellishments of ${order.orderId}.`);

  async function reschedule(order, { date, deliveryDate }) {
    try {
      // A blank delivery date is written as null: "" is not a date, and the column refuses it.
      await updateRow("orders", order.id, { date, deliveryDate: deliveryDate || null, updatedAt: new Date().toISOString() });
      await reloadOrders();
      return { ok: true };
    } catch (err) {
      console.error("Failed to reschedule order:", err);
      return { ok: false, message: `Could not save the new dates: ${err?.message || "try again"}` };
    }
  }

  function buildInvoiceDoc(order, fields, invNumber, orderId) {
    const qty = Number(order.quantity || 0);
    const rate = Number(order.pricePerPcNPR || 0);
    const subtotal = qty * rate;
    const vatAmt = fields.applyVAT ? subtotal * VAT_RATE : 0;
    return {
      invoiceNumber:  invNumber,
      date:           order.date || todayDate(),
      dueDate:        fields.dueDate || dueIn30(order.date, today),
      fiscalYear:     "",
      paymentTerms:   fields.paymentTerms || "Net 30",
      clientName:     order.customerName || "",
      // The order already knows which customer it is for (orders read it as customer_id, the form as
      // customerId); carry it so the invoice is not the one record of that sale left unlinked.
      customerId:     order.customerId || order.customer_id || null,
      clientPAN:      fields.clientPAN || "",
      clientAddress:  fields.clientAddress || "",
      clientPhone:    fields.clientPhone || "",
      challanNumber:  order.invoiceRef || "",
      status:         "Draft",
      applyVAT:       !!fields.applyVAT,
      paymentType:    fields.paymentType || "CASH",
      note:           order.notes || "",
      items: [{
        description: `${order.styleName || ""}${order.fabricType ? " — " + order.fabricType : ""}${order.colorway ? " (" + order.colorway + ")" : ""}`,
        qty,
        unit: "Pcs",
        rate,
      }],
      subtotalNPR:    subtotal,
      vatAmountNPR:   vatAmt,
      totalNPR:       subtotal + vatAmt,
      linkedOrderId:  orderId || null,
      createdBy:      profile?.name || "Unknown",
    };
  }

  /** Issue an invoice for an order that exists already. */
  async function issueInvoice(order, fields) {
    try {
      const invNum = nextInvoiceNumber(data.invoices);   // company-wide, for the same reason as order numbers
      const invDoc = buildInvoiceDoc(order, fields, invNum, order.id);
      await insertRow("invoices", { ...invDoc, region: order.region || null });
      await updateRow("orders", order.id, { invoiceRef: invNum });
      await reload();
      return { ok: true };
    } catch (err) {
      console.error("Failed to issue invoice:", err);
      return { ok: false, message: `Could not issue the invoice: ${err?.message || "try again"}` };
    }
  }

  /** The new / edit order form's save. Resolves to `{ ok, message }`. */
  async function saveOrder({ form: f, issueInvoice: withInvoice, invFields, editing }) {
    if (status !== "ready") return { ok: false, message: "The page has not finished loading, so the next order number is not known yet. Try again in a moment." };
    const total = Number(f.quantity || 0) * Number(f.pricePerPcNPR || 0);
    const materialCostTotalNPR = Number(f.quantity || 0) * Number(f.fabricCostPerPcNPR || 0);
    try {
      // A fabric type typed here that isn't in the priced Fabrics library yet gets saved there (no
      // price set) so it's available, and priceable, next time, instead of being a one-off value
      // disconnected from Inventory.
      const typedFabricName = (f.fabricType || "").trim();
      if (typedFabricName && !findFabric(fabrics, typedFabricName)) {
        await insertRow("fabrics", {
          name: typedFabricName, pricePerKg: null, composition: "", gsm: null,
          weight: "", status: "In Stock", swatchImageUrl: "",
          region: f.region || region,
        });
      }

      if (editing) {
        await updateRow("orders", editing.id, {
          customerName:  f.customerName,
          customer_id:   f.customerId || null,
          styleName:     f.styleName,
          fabricType:    f.fabricType,
          colorway:      f.colorway,
          quantity:      Number(f.quantity || 0),
          pricePerPcNPR: Number(f.pricePerPcNPR || 0),
          totalValueNPR: total,
          deliveryDate:  f.deliveryDate || null,       // "" is not a date: a blank one is written as null
          // assigned_to is a foreign key into people; the view exposes the joined name as
          // assignedTo, which is read-only.
          assigned_to:   f.assignedTo || null,
          invoiceRef:    f.invoiceRef,
          notes:         f.notes,
          sampleId:            f.sampleId || null,
          sampleName:          f.sampleName,
          fabricGramsUsed:     Number(f.fabricGramsUsed || 0),
          fabricCostPerPcNPR:  Number(f.fabricCostPerPcNPR || 0),
          materialCostTotalNPR,
          region:              f.region || null,
        });
      } else {
        const orderId = nextOrderNumber(allOrders);        // across both regions: two arms must not both mint ORD-060
        const invNum = withInvoice ? nextInvoiceNumber(data.invoices) : null;
        const orderDoc = {
          ...f,
          orderId,
          // Defaults to the side you are looking at, which is nearly always the answer; the form
          // field is there for when it is not.
          region:        f.region || region,
          deliveryDate:  f.deliveryDate || null,       // "" is not a date: a blank one is written as null
          quantity:      Number(f.quantity || 0),
          pricePerPcNPR: Number(f.pricePerPcNPR || 0),
          totalValueNPR: total,
          fabricGramsUsed:    Number(f.fabricGramsUsed || 0),
          fabricCostPerPcNPR: Number(f.fabricCostPerPcNPR || 0),
          materialCostTotalNPR,
          stageHistory:  [{ stage: "Order Received", date: todayDate(), by: profile?.name || "Unknown" }],
          createdBy:     profile?.name || "Unknown",
          // The order carries the invoice NUMBER as invoiceRef; invoiceNumber is the invoice
          // document's own field, not the order's.
          ...(invNum ? { invoiceRef: invNum } : {}),
        };
        delete orderDoc.assignedTo;
        orderDoc.assigned_to = f.assignedTo || null;
        orderDoc.sampleId = f.sampleId || null;
        // customerId is the form's own key; the column is customer_id, and toRow() drops anything it
        // cannot map rather than erroring, so the link has to be spelled out here or it silently
        // never persists.
        delete orderDoc.customerId;
        orderDoc.customer_id = f.customerId || null;
        const orderRef = await insertRow("orders", orderDoc);
        if (withInvoice && invNum) {
          const invDoc = buildInvoiceDoc({ ...f, quantity: orderDoc.quantity }, invFields, invNum, orderRef.id);
          await insertRow("invoices", { ...invDoc, region: orderDoc.region || null });
        }
      }
      await reload();
      return { ok: true };
    } catch (err) {
      console.error("Failed to save order:", err);
      return { ok: false, message: "Failed to save the order. Please check your connection and try again." };
    }
  }

  /* ── opening and closing things ────────────────────────── */

  const openCard = (order) => { setActionError(""); setCardId(order.id); };
  const closeCard = () => setCardId(null);
  const openNew = () => { if (status === "ready") setForm({ order: null, back: false }); };
  const openEdit = (order) => { setCardId(null); setForm({ order, back: true }); };
  const closeForm = (saved) => {
    const back = form?.back && form.order;
    setForm(null);
    if (back) setCardId(form.order.id);
    if (saved && !back) say({ text: "Order added." });
  };

  /* ── the page ──────────────────────────────────────────── */

  const ready = status === "ready";
  const sub = ready ? (
    <>
      <span>{stats.open} open</span>
      {stats.units > 0 && <span>{stats.units.toLocaleString()} pcs</span>}
      {stats.overdue > 0 && <span className="kb-bad">{stats.overdue} late</span>}
      {!canEdit && <span>View only</span>}
    </>
  ) : status === "error" ? null : <span>Loading…</span>;
  const title = view === "closed" ? "Finished and cancelled" : stage || "Open orders";

  return (
    <BentoPage className="pr-page">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Production</h1>
          <p className="kb-head-sub">{sub}</p>
        </div>
        <div className="kb-head-r">
          <div className="kb-head-row">
            <RegionSwitch untagged={countUntagged(allOrders)} />
          </div>
          {canEdit && (
            <button type="button" className="kb-btn kb-btn--primary pr-newbtn kb-head-act" data-tour="new-order" onClick={openNew} disabled={!ready}>
              <Icons.Plus size={14} sw={2.2} aria-hidden="true" /> New order
            </button>
          )}
        </div>
      </header>

      {loadError && ready && (
        <div className="pr-banner" role="status">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>{loadError}</span>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => reload()}>Try again</button>
        </div>
      )}
      {actionError && (
        <div className="pr-banner is-bad" role="alert">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>{actionError}</span>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => setActionError("")}>Dismiss</button>
        </div>
      )}

      {status === "error" ? (
        <div className="kb-error" role="alert">
          <p>Production could not load: {loadError}</p>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => reload()}>Try again</button>
        </div>
      ) : (
        <BentoGrid layout="prod">
          <PipelineTile counts={counts} view={view} stage={stage} onPick={pickStage} loading={!ready} />
          <GlanceTile stats={stats} onQuick={showQuick} loading={!ready} />
          <OrdersTile
            rows={rows} base={base} title={title} view={view} mode={mode} query={query} quick={quick} monthOnly={monthOnly}
            today={today} canEdit={canEdit} busyIds={busy} hasOrders={scoped.length > 0} loading={!ready} notice={notice}
            onQuery={setQuery} onQuick={setQuick} onMode={setMode} onMonthOnly={setMonthOnly}
            onOpen={openCard} onAdvance={advance} onClearAll={clearAll} onNoDate={() => showQuick("nodate")}
          />
          <AttentionTile items={attn} today={today} showStock={canDeductStock} onOpen={openCard} onQuick={showQuick} loading={!ready} />
        </BentoGrid>
      )}

      {cardOrder && (
        <OrderCard
          order={cardOrder}
          today={today}
          canEdit={canEdit}
          canDeductStock={canDeductStock}
          stockState={stockStateFor(cardOrder)}
          costs={data.orderCosts[cardOrder.orderId || cardOrder.id]}
          labourRatePerUnit={data.labourRatePerUnit}
          invoice={invoiceOf(cardOrder, data.invoices)}
          busy={busy.has(cardOrder.id)}
          error={actionError}
          profile={profile}
          onClose={closeCard}
          onAdvance={advance}
          onReverse={stepBack}
          onStatus={setStatus}
          onEdit={openEdit}
          onDelete={askDelete}
          onMaterials={(order) => setMaterials({ order, advancing: false })}
          onInvoice={(order) => setInvoiceFor(order)}
          onReschedule={(dates) => reschedule(cardOrder, dates)}
          onEmbellishments={(next) => saveEmbellishments(cardOrder, next)}
          onNotesChanged={reloadOrders}
        />
      )}

      {form && canEdit && (
        <OrderFormDialog
          order={form.order}
          today={today}
          samples={samples}
          fabrics={fabrics}
          employees={data.employees}
          customers={customers}
          billingClients={billingClients}
          invoices={invoices}
          challans={challans}
          latestInvoice={latestInvoice}
          canCreateCustomer={sectionCanEdit(profile, "customers")}
          dateMode={dateMode}
          onDateMode={setDateMode}
          onCustomerCreated={addCustomer}
          onSave={saveOrder}
          onClose={closeForm}
        />
      )}

      {invoiceFor && (
        <InvoiceDialog
          order={invoiceFor}
          initial={{ ...emptyInvFields(today), dueDate: dueIn30(invoiceFor.date, today) }}
          today={today}
          onSubmit={(fields) => issueInvoice(invoiceFor, fields)}
          onClose={() => setInvoiceFor(null)}
        />
      )}

      {materials && (
        <MaterialsUsedModal
          order={materials.order}
          advancing={materials.advancing}
          onClose={() => { setMaterials(null); reload(); }}
          onDone={async ({ deducted } = {}) => {
            const { order, advancing } = materials;
            setMaterials(null);
            if (advancing) await moveOn(order);
            // a deduction is in the stock ledger now: read it back, or the order keeps saying "not deducted"
            if (deducted || !advancing) await reload();
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          confirmLabel={confirm.label}
          busyLabel={confirm.busyLabel}
          onConfirm={confirm.run}
          onClose={() => setConfirm(null)}
        >
          {confirm.text}
        </ConfirmDialog>
      )}
    </BentoPage>
  );
}
