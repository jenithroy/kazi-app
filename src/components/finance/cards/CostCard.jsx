/**
 * The costs of one order: material, labour, overhead and shipping, against what the order is worth. The right pane works out the
 * profit as the figures are typed. Labour starts from the automatic rate (last month's payroll over last month's pieces passed) times
 * the order's pieces, unless a labour cost has been entered, which then wins.
 */
import { useEffect, useId, useRef } from "react";
import EditCard, { Field, KV, NumberInput } from "../../EditCard";
import { useFin } from "../FinanceContext";
import { Chip, useMoney } from "../parts";
import useCardForm from "./useCardForm";
import { saveOrderCosts } from "../../../lib/financeWrites";
import { enterAdvance, focusFirst } from "../flow";

const FIELDS = [
  ["material", "Material", "Fabric, trims, thread…"],
  ["labour", "Labour", "Cutting, sewing, finishing…"],
  ["overhead", "Overhead", "Factory, utilities, depreciation…"],
  ["shipping", "Shipping", "Freight, packaging, customs…"],
];

export default function CostCard({ order, onClose }) {
  const { canEditTab, reload, orderCosts, labourRate } = useFin();
  const money = useMoney();
  const uid = useId();
  const root = useRef(null);
  const editable = canEditTab("order p&l");

  const existing = orderCosts[order.orderId || order.id] || orderCosts[order.id] || {};
  const autoLabour = existing.labour == null && labourRate ? String(Math.round(labourRate * Number(order.quantity || 0))) : "";
  const { form, set, dirty } = useCardForm(() => ({
    material: existing.material != null ? String(existing.material) : "",
    labour: existing.labour != null ? String(existing.labour) : autoLabour,
    overhead: existing.overhead != null ? String(existing.overhead) : "",
    shipping: existing.shipping != null ? String(existing.shipping) : "",
  }));

  useEffect(() => { focusFirst(root.current?.closest("form")); }, []);

  const revenue = Number(order.totalValueNPR || 0);
  const n = (k) => Number(form[k] || 0);
  const total = n("material") + n("labour") + n("overhead") + n("shipping");
  const profit = revenue - total;
  const margin = revenue > 0 ? (profit / revenue) * 100 : null;

  async function save() {
    const res = await saveOrderCosts({ order, form });
    if (!res.ok) return res;
    await reload();
    return { ok: true };
  }

  const flow = { onKeyDown: (e) => enterAdvance(e, () => e.target.closest("form")?.requestSubmit()) };
  const main = (
    <div className="fn-flow" ref={root} {...flow}>
      {FIELDS.map(([key, label, hint]) => (
        <Field key={key} label={label} htmlFor={`${uid}-${key}`}>
          <NumberInput id={`${uid}-${key}`} unit="NPR" value={form[key]} placeholder={hint} disabled={!editable} onChange={(e) => set({ [key]: e.target.value })} step="1" />
        </Field>
      ))}
      {labourRate && existing.labour == null && (
        <p className="ec-note ec-wide">Labour starts from the automatic rate of {money(labourRate)} a piece. Type a labour cost to replace it.</p>
      )}
      {!editable && <p className="ec-note ec-wide">View only. Only staff with edit rights can change costs.</p>}
    </div>
  );

  const side = (
    <div className="fn-flow">
      <div className="ec-block ec-wide">
        <span className="ec-cap">{profit >= 0 ? "Profit" : "Loss"}</span>
        <div className={`ec-fig ${profit >= 0 ? "ec-good" : "ec-bad"}`}>{money(Math.abs(profit))}</div>
        {margin !== null && <span><Chip tone={margin >= 20 ? "good" : margin >= 0 ? "warn" : "bad"}>{margin.toFixed(1)}% margin</Chip></span>}
      </div>
      <KV rows={[
        ["Order is worth", money(revenue)],
        ["Material", money(n("material"))],
        ["Labour", money(n("labour"))],
        ["Overhead", money(n("overhead"))],
        ["Shipping", money(n("shipping"))],
        ["Total cost", money(total), "bad"],
      ]} />
    </div>
  );

  return (
    <EditCard
      title={`${order.orderId || order.id}: costs`} subtitle={`${order.customerName || "—"} · ${Number(order.quantity || 0).toLocaleString()} pieces`}
      main={main} side={side} canEdit={editable} dirty={dirty} onClose={onClose} onSave={save} submitLabel="Save costs"
    />
  );
}
