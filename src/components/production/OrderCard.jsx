import { useEffect, useId, useState } from "react";
import Modal from "../Modal";
import DatePicker from "../DatePicker";
import { Avatar, Icons, cn, hueFromName } from "../ui";
import { fmtField } from "../../lib/calendar";
import { useCurrency } from "../../context/CurrencyContext";
import { regionLabel } from "../../utils/region";
import NotesSection from "./NotesSection";
import StageHistory from "./StageHistory";
import {
  EMBELLISHMENT_TYPES, LAST_STAGE, PRIORITY_LABEL, STAGES, dueInfo, isOpen, nextStageOf, orderPnl, priorityOf, stageIndex,
} from "../../lib/production";

function Fact({ label, children, wide }) {
  return (
    <div className={cn("pr-fact", wide && "is-wide")}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * One order, in a card in the middle of the screen like the profile card and the task card: where it
 * is and how to move it on the left (the ten stages, each a button that shows what happened at that stage;
 * the embellishments; the notes), what it is and what it earns on the right. It does not scroll on a
 * normal window; on a phone the two halves are two tabs in the same sheet.
 *
 * It only draws and asks. Every change goes back to the page through the `on…` callbacks, which
 * resolve to `{ ok, message }` where the card needs to know how it went.
 */
export default function OrderCard({
  order, today, canEdit, canDeductStock, stockState, costs, labourRatePerUnit, invoice, busy, error, profile,
  onClose, onAdvance, onReverse, onStatus, onEdit, onDelete, onMaterials, onInvoice, onReschedule, onEmbellishments, onNotesChanged,
}) {
  const uid = useId();
  const { fmt } = useCurrency();
  const [tab, setTab] = useState("progress");          // on a phone: "progress" | "details"
  const [dates, setDates] = useState(null);            // the reschedule editor: { date, deliveryDate, saving, error } or null
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [picked, setPicked] = useState(null);        // the stage whose dot was pressed; null = the one the order is at
  const [savingEmb, setSavingEmb] = useState(false);

  const open = isOpen(order);
  const hold = order.status === "On Hold";
  const active = open && !hold;        // Active, or a status nobody planned for: the move buttons must not strand it
  const at = stageIndex(order.stage);
  const next = nextStageOf(order.stage);
  const due = dueInfo(order, today);
  const priority = open ? priorityOf(order, today) : null;
  const qty = Number(order.quantity || 0);
  const pnl = orderPnl(order, costs, labourRatePerUnit);
  const embellishments = Array.isArray(order.embellishments) ? order.embellishments : [];
  const fid = (name) => `${uid}-${name}`;
  const shown = picked || order.stage;

  // When the order moves (from this card or somebody else's), the panel goes back to where it is now.
  useEffect(() => { setPicked(null); }, [order.id, order.stage]);

  // Left and Right move between the stage dots; each is its own button.
  function onStepKey(e) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step === undefined && e.key !== "Home" && e.key !== "End") return;
    const dots = [...e.currentTarget.querySelectorAll(".pr-step")];
    const i = dots.indexOf(document.activeElement);
    if (i < 0) return;
    const next = e.key === "Home" ? 0 : e.key === "End" ? dots.length - 1 : i + step;
    if (next < 0 || next >= dots.length) return;
    e.preventDefault();
    dots[next].focus();
  }

  async function toggleEmbellishment(type) {
    if (!canEdit || savingEmb) return;
    // Keep the stored order matching EMBELLISHMENT_TYPES so chips read the same everywhere.
    const nextList = embellishments.includes(type)
      ? embellishments.filter((t) => t !== type)
      : EMBELLISHMENT_TYPES.filter((t) => embellishments.includes(t) || t === type);
    setSavingEmb(true);
    try { await onEmbellishments(nextList); } finally { setSavingEmb(false); }
  }

  async function saveDates() {
    setDates((d) => ({ ...d, saving: true, error: "" }));
    const res = await onReschedule({ date: dates.date, deliveryDate: dates.deliveryDate });
    if (res?.ok) setDates(null);
    else setDates((d) => ({ ...d, saving: false, error: res?.message || "Could not save the new dates." }));
  }

  const showEmb = order.stage === "Embellishment" || embellishments.length > 0;
  const money = (n) => fmt(n);

  const footer = (
    <>
      {canEdit && (
        <div className="pr-ft-l">
          <button type="button" className="ghost-button pr-danger" onClick={() => onDelete(order)} disabled={busy}>Delete</button>
          {open && <button type="button" className="ghost-button pr-danger" onClick={() => onStatus(order, "Cancelled")} disabled={busy}>Cancel order</button>}
        </div>
      )}
      {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
      <button type="button" className="ghost-button" onClick={onClose}>Close</button>
      {canEdit && <button type="button" className="primary-button" onClick={() => onEdit(order)} disabled={busy}>Edit order</button>}
    </>
  );

  return (
    <Modal
      title={order.customerName || "Order"}
      subtitle={[order.orderId, order.styleName, `${qty.toLocaleString()} pcs`].filter(Boolean).join(" · ")}
      size="card"
      className="pr-dlg kmodal--order"
      glass
      onClose={onClose}
      footer={footer}
    >
      {/* phones only: the two halves as tabs, so the sheet needs no scrolling */}
      <div className="pr-oc-tabs kregion-seg" role="tablist" aria-label="Order sections">
        {[["progress", "Progress"], ["details", "Details"]].map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={fid(`tab-${id}`)}
            aria-selected={tab === id}
            aria-controls={fid(`pane-${id}`)}
            className={cn("kregion-seg-btn", tab === id && "is-on")}
            onClick={() => setTab(id)}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="pr-oc">
        {/* ── Progress ── */}
        <div className={cn("pr-oc-pane pr-oc-main", tab !== "progress" && "is-off")} id={fid("pane-progress")} role="tabpanel" aria-labelledby={fid("tab-progress")}>
          <div className="pr-now">
            <div className="pr-now-top">
              <div>
                <span className="pr-eyebrow">{open ? "Now at" : order.status}</span>
                <b className="pr-now-stage">{order.stage}</b>
              </div>
              <div className="pr-now-step">
                <span className="pr-eyebrow">Step</span>
                <b>{at + 1} / {STAGES.length}</b>
              </div>
            </div>
            <div className="pr-now-tags">
              <span className={cn("pr-tag", hold ? "pr-tag--warn" : active ? "pr-tag--good" : order.status === "Cancelled" ? "pr-tag--bad" : "pr-tag--mute")}>{order.status || "Active"}</span>
              {priority && priority !== "normal" && <span className={cn("pr-tag", priority === "urgent" ? "pr-tag--bad" : "pr-tag--warn")}>{PRIORITY_LABEL[priority]}</span>}
              {stockState && <span className={cn("pr-tag", stockState === "deducted" ? "pr-tag--good" : "pr-tag--warn")}>{stockState === "deducted" ? "Stock deducted" : "Stock not deducted"}</span>}
              <span className={cn("pr-now-due", due.tone && `is-${due.tone}`)}>
                {due.left == null ? "No delivery date" : due.note || `Due ${fmtField(order.deliveryDate)}`}
              </span>
            </div>
          </div>

          {canEdit && (
            <div className="pr-move">
              {active && (
                <>
                  <button type="button" className="ghost-button" onClick={() => onReverse(order)} disabled={busy || at <= 0}>
                    <Icons.ChevronLeft size={14} sw={2} aria-hidden="true" /> Previous
                  </button>
                  <button type="button" className="ghost-button" onClick={() => onStatus(order, "On Hold")} disabled={busy}>
                    <Icons.Pause size={13} sw={1.9} aria-hidden="true" /> Hold
                  </button>
                  <button type="button" className="primary-button pr-advance" onClick={() => onAdvance(order)} disabled={busy || at >= LAST_STAGE}>
                    {at === LAST_STAGE - 1 ? "Mark delivered" : "Advance"} <Icons.ArrowRight size={14} sw={2} aria-hidden="true" />
                  </button>
                </>
              )}
              {hold && (
                <button type="button" className="primary-button" onClick={() => onStatus(order, "Active")} disabled={busy}>
                  <Icons.Play size={13} sw={1.9} aria-hidden="true" /> Resume
                </button>
              )}
              {order.status === "Cancelled" && (
                <button type="button" className="primary-button" onClick={() => onStatus(order, "Active")} disabled={busy}>Reactivate</button>
              )}
              {order.status === "Completed" && <p className="pr-move-note">This order is complete.</p>}
            </div>
          )}
          {canEdit && hold && <p className="pr-move-note">On hold: resume it to move it to the next stage.</p>}
          {canEdit && active && next && <p className="pr-move-note">Next up: <b>{next}</b></p>}

          {/* each dot is a button: press one to see when the order came into that stage and who moved it */}
          <ol className="pr-steps" aria-label="Stages. Press one to see what happened there." onKeyDown={onStepKey}>
            {STAGES.map((s, i) => {
              const state = i < at ? "done" : i === at ? "here now" : "not reached";
              return (
                <li key={s} className={cn(i < at && "is-done", i === at && "is-now")} aria-current={i === at ? "step" : undefined}>
                  <button
                    type="button"
                    className={cn("pr-step", shown === s && "is-picked")}
                    aria-pressed={shown === s}
                    aria-label={`${i + 1}, ${s}, ${state}`}
                    title={s}
                    onClick={() => setPicked(s)}
                  >
                    <span aria-hidden="true">{i < at ? <Icons.Check size={11} sw={2.6} /> : i + 1}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <StageHistory key={shown} order={order} stage={shown} today={today} />

          {showEmb && (
            <section className="pr-emb" aria-label="Embellishment">
              <h3 className="pr-h">Embellishment</h3>
              <div className="pr-chips" role="group" aria-label="Embellishments on this order">
                {EMBELLISHMENT_TYPES.map((t) => {
                  const on = embellishments.includes(t);
                  return (
                    <button key={t} type="button" className={cn("pr-chip", on && "is-on")} aria-pressed={on} disabled={!canEdit || savingEmb || busy} onClick={() => toggleEmbellishment(t)}>
                      {on && <Icons.Check size={12} sw={2.4} aria-hidden="true" />} {t}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <NotesSection order={order} canEdit={canEdit} profile={profile} onChanged={onNotesChanged} />
        </div>

        {/* ── Details ── */}
        <div className={cn("pr-oc-pane pr-oc-side", tab !== "details" && "is-off")} id={fid("pane-details")} role="tabpanel" aria-labelledby={fid("tab-details")}>
          <dl className="pr-facts">
            <Fact label="Order date">{order.date ? fmtField(order.date) : "—"}</Fact>
            <Fact label="Delivery date">
              {order.deliveryDate ? fmtField(order.deliveryDate) : "Not set"}
              {canEdit && !dates && (
                <button type="button" className="pr-link" onClick={() => setDates({ date: order.date || today, deliveryDate: order.deliveryDate || "", saving: false, error: "" })}>
                  {order.deliveryDate ? "Change" : "Set"}
                </button>
              )}
            </Fact>

            <Fact label="Quantity">{qty.toLocaleString()} pcs</Fact>
            <Fact label="Price per piece">{order.pricePerPcNPR ? money(order.pricePerPcNPR) : "—"}</Fact>
            <Fact label="Order value">{order.totalValueNPR ? money(order.totalValueNPR) : "—"}</Fact>
            <Fact label="Fabric">{order.fabricType || "—"}</Fact>
            <Fact label="Colorway">{order.colorway || "—"}</Fact>
            <Fact label="Assigned to">
              {order.assignedTo
                ? <span className="pr-who"><Avatar name={order.assignedTo} personId={order.assigned_to || undefined} hue={hueFromName(order.assignedTo)} size={20} />{order.assignedTo}</span>
                : "Nobody yet"}
            </Fact>
            <Fact label="Invoice / challan">
              {order.invoiceRef || (invoice ? invoice.invoiceNumber : "—")}
              {canEdit && !invoice && (
                <button type="button" className="pr-link" onClick={() => onInvoice(order)}>+ Invoice</button>
              )}
            </Fact>
            <Fact label="Sample">{order.sampleName || "—"}</Fact>
            {order.region && <Fact label="Region">{regionLabel(order.region)}</Fact>}
            {order.notes && <Fact label="Note" wide>{order.notes}</Fact>}
          </dl>

          {dates && (
            <div className="pr-resched">
              <div className="pr-resched-f">
                <label htmlFor={fid("d-order")}>Order date</label>
                <DatePicker id={fid("d-order")} label="Order date" value={dates.date} onChange={(v) => setDates((d) => ({ ...d, date: v, error: "" }))} today={today} clearable={false} />
              </div>
              <div className="pr-resched-f">
                <label htmlFor={fid("d-due")}>Delivery date</label>
                <DatePicker id={fid("d-due")} label="Delivery date" value={dates.deliveryDate} onChange={(v) => setDates((d) => ({ ...d, deliveryDate: v, error: "" }))} today={today} placeholder="No delivery date" />
              </div>
              <div className="pr-resched-a">
                {dates.error && <p className="kmodal-msg kmodal-msg--err" role="alert">{dates.error}</p>}
                <button type="button" className="ghost-button" onClick={() => setDates(null)} disabled={dates.saving}>Cancel</button>
                <button type="button" className="primary-button" onClick={saveDates} disabled={dates.saving || !dates.date}>{dates.saving ? "Saving…" : "Save dates"}</button>
              </div>
            </div>
          )}

          <section className="pr-money" aria-label="Profit and loss">
            <button type="button" className="pr-money-h" aria-expanded={moneyOpen} onClick={() => setMoneyOpen((v) => !v)}>
              <span>Profit and loss</span>
              <b className={cn(pnl.known && (pnl.profit >= 0 ? "is-good" : "is-bad"))}>
                {pnl.known ? `${money(pnl.profit)}${pnl.margin != null ? ` · ${pnl.margin}%` : ""}` : "Not entered yet"}
              </b>
              <Icons.ChevronDown size={14} sw={2} aria-hidden="true" className={moneyOpen ? "is-open" : undefined} />
            </button>
            {moneyOpen && (
              <>
                <dl className="pr-money-g">
                  <div><dt>Revenue</dt><dd>{money(pnl.revenue)}</dd></div>
                  <div><dt>Materials</dt><dd>{pnl.known ? money(pnl.material) : "—"}</dd></div>
                  <div><dt>{pnl.labourAuto ? "Labour (worked out)" : "Labour"}</dt><dd>{pnl.known ? money(pnl.labour) : "—"}</dd></div>
                  <div><dt>Overhead</dt><dd>{pnl.known ? money(pnl.overhead) : "—"}</dd></div>
                  <div><dt>Shipping</dt><dd>{pnl.known ? money(pnl.shipping) : "—"}</dd></div>
                  <div><dt>Profit</dt><dd>{pnl.known ? money(pnl.profit) : "—"}</dd></div>
                </dl>
                <p className="pr-hint">
                  {pnl.labourAuto
                    ? "Labour is worked out from last month's payroll divided by the pieces made."
                    : !pnl.known ? "No costs yet. Enter them in Finance, under Order P&L." : ""}
                </p>
              </>
            )}
          </section>

          {canDeductStock && active && (
            <div className="pr-stockrow">
              <span>{stockState === "deducted" ? "Materials were taken out of stock." : "Materials have not been taken out of stock."}</span>
              <button type="button" className="ghost-button" onClick={() => onMaterials(order)} disabled={busy}>Materials used</button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
