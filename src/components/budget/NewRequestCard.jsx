import { useEffect, useId, useRef } from "react";
import EditCard, { Field, NumberInput, Seg } from "../EditCard";
import Select from "../Select";
import useCardForm from "../finance/cards/useCardForm";
import { advance, enterAdvance, focusFirst, thenAdvance } from "../finance/flow";
import { npr } from "../finance/parts";
import { submit } from "../../lib/budgetWrites";
import { BUDGET_CATEGORIES, REQ_CATEGORIES, URGENCIES, emptyForm, nprToGbp } from "../../lib/budget";
import { toNPR } from "../../utils/currency";
import { REGIONS, normaliseRegion } from "../../utils/region";
import "./budget.css";

const KINDS = [["requirement", "Requirement"], ["budget", "Budget request"]];

/**
 * Asking for something, in the card in the middle of the screen. A requirement (an item, how many, a rough cost in rupees
 * and/or pounds) and a budget request (a sum in pounds, with the reason) are the old page's two forms, side by side as one
 * switch. What is built from them, the BR number and the rupee/pound linkage are the old page's (lib/budget.js); here only
 * the typing is kept for the keyboard: Enter goes to the next field and Enter in the last one sends.
 */
export default function NewRequestCard({ rows, region, profile, onClose, onSent }) {
  const uid = useId();
  const root = useRef(null);
  const { form, set, dirty } = useCardForm(() => emptyForm("requirement", region));
  const budget = form.kind === "budget";
  const categories = budget ? BUDGET_CATEGORIES : REQ_CATEGORIES;
  const gbp = Number(form.amountGBP) || 0;

  useEffect(() => { focusFirst(root.current?.closest("form"), "[data-first]"); }, []);

  // the two kinds' fields live in one form, so what was typed stays when the kind is switched; only a category the other list lacks is reset
  const pickKind = (kind) => set((f) => {
    const list = kind === "budget" ? BUDGET_CATEGORIES : REQ_CATEGORIES;
    return { kind, category: list.includes(f.category) ? f.category : list[0] };
  });

  // typing rupees works out the pounds; typing pounds clears the rupees (the old requirement form's rule)
  const onNpr = (e) => set({ amountNPR: e.target.value, amount: nprToGbp(e.target.value) });
  const onGbp = (e) => set({ amount: e.target.value, amountNPR: "" });

  async function save() {
    const res = await submit(form, { rows, region, profile });
    if (!res.ok) return res;
    await onSent(res.row);
    return { ok: true };
  }

  const flow = {
    onKeyDown: (e) => {
      const t = e.target;
      // Enter on an open dropdown picks the highlighted option; picking the one that is already chosen is not a change, so the
      // dropdown's own "move on after a change" does not run. Move on here, unless something already has.
      const picking = e.key === "Enter" && t.matches?.("button.ksel") && t.getAttribute("aria-expanded") === "true";
      enterAdvance(e, () => t.closest("form")?.requestSubmit());
      if (picking) requestAnimationFrame(() => requestAnimationFrame(() => { if (document.activeElement === t) advance(); }));
    },
  };

  const main = (
    <div className="bd-flow" ref={root} {...flow}>
      <Field label="Kind of request" labelId={`${uid}-kind`} wide>
        <Seg label="Kind of request" value={form.kind} onChange={pickKind} options={KINDS} />
        <small className="ec-hint">
          {budget ? "A sum of money in pounds, with the reason, for the directors to approve." : "Something the office needs: what it is, how many, and a rough cost."}
        </small>
      </Field>
      <Field label={budget ? "What is the money for?" : "What is needed?"} htmlFor={`${uid}-title`} wide>
        <input
          id={`${uid}-title`} data-first type="text" autoComplete="off" value={form.title}
          placeholder={budget ? "e.g. Replacement overlock machine" : "e.g. Zippers, threads and elastics"}
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>
      <Field label="Category" htmlFor={`${uid}-cat`} wide={budget}>
        <Select id={`${uid}-cat`} label="Category" value={form.category} onChange={thenAdvance((v) => set({ category: v }))} options={categories.map((c) => ({ value: c, label: c }))} />
      </Field>
      {!budget && (
        <Field label="How many" htmlFor={`${uid}-qty`}>
          <input id={`${uid}-qty`} type="text" autoComplete="off" value={form.quantity} placeholder="e.g. 50 units" onChange={(e) => set({ quantity: e.target.value })} />
        </Field>
      )}
      <Field
        label={budget ? "Why is it needed?" : "Notes"} htmlFor={`${uid}-notes`} wide
        hint={budget ? "The directors read this before they decide." : "Anything that helps them decide (optional)."}
      >
        {/* data-flow: Enter in the box before it lands here (the reason is required for a budget request); Enter inside it is a new line, Tab or Ctrl + Enter leaves it */}
        <textarea
          id={`${uid}-notes`} data-flow rows={4} value={form.notes}
          placeholder={budget ? "Why is this needed? Include any relevant context." : "Additional context"}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </Field>
    </div>
  );

  const side = (
    <div className="bd-flow" {...flow}>
      <Field label="Urgency" labelId={`${uid}-urg`} wide>
        <Seg label="Urgency" value={form.urgency} onChange={(v) => set({ urgency: v })} options={URGENCIES.map((u) => [u, u])} />
        <small className="ec-hint">High goes to the top of the directors' list.</small>
      </Field>
      {budget ? (
        <Field
          label="Amount" htmlFor={`${uid}-gbp`} wide
          hint={gbp > 0 ? `About ₨ ${npr(Math.round(toNPR(gbp, "GBP")))} at today's rate.` : undefined}
        >
          <NumberInput id={`${uid}-gbp`} unit="GBP" value={form.amountGBP} placeholder="0" onChange={(e) => set({ amountGBP: e.target.value })} />
        </Field>
      ) : (
        <>
          <Field label="Estimated cost" htmlFor={`${uid}-npr`}>
            <NumberInput id={`${uid}-npr`} unit="NPR" value={form.amountNPR} placeholder="0" onChange={onNpr} />
          </Field>
          <Field label="In pounds" htmlFor={`${uid}-gbp`} hint={form.amountNPR ? "Worked out from the rupees." : undefined}>
            <NumberInput id={`${uid}-gbp`} unit="GBP" value={form.amount} placeholder="0.00" onChange={onGbp} />
          </Field>
        </>
      )}
      <Field label="Which side of the business" labelId={`${uid}-reg`} wide>
        <Seg label="Region" value={normaliseRegion(form.region)} onChange={(v) => set({ region: v })} options={REGIONS.map((r) => [r.id, r.label])} />
      </Field>
    </div>
  );

  return (
    <EditCard
      className="bd-card"
      title="New request"
      subtitle="For the directors to approve"
      mainLabel="Request"
      sideLabel="Cost and urgency"
      main={main}
      side={side}
      creating
      dirty={dirty}
      submitLabel="Send request"
      savingLabel="Sending…"
      onSave={save}
      onClose={onClose}
    />
  );
}
