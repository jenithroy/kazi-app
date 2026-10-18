/**
 * ItemCard: one inventory item, in the card in the middle of the screen.
 *
 * The old page spread an item over three tables (Stock levels, Item details, Items cost) and a row you had to
 * expand. It is one thing, so it is one card with four sections:
 *
 *   Details     what it is and where it lives; on the right, what is in stock now, its reorder level, its region
 *   Cost        what a piece costs to make, and what it sells for: the cost sheet
 *   Movements   stock in and out, dated; the history
 *   Sizes       required against counted by size, and the wash / damage log
 *
 * It also makes a new item, two ways: a stock item (what you hold, how many, what it cost) and a cost item
 * (a product with its cost sheet). Every number is the one the old page worked out; only where it is entered moved.
 *
 * Saving writes only what changed. The movement form is separate on purpose: Log movement writes at once, the way
 * the old ledger panel did, because a stock movement is a record of something that happened, not an edit.
 */
import { useMemo, useRef, useState } from "react";
import EditCard, { Field, KV, NumberInput, Seg, Tag } from "../EditCard";
import Select from "../Select";
import DatePicker from "../DatePicker";
import Suggest from "../Suggest";
import { Icons } from "../ui";
import { useCurrency } from "../../context/CurrencyContext";
import { deleteRow, insertRow, updateRow, upsertRow } from "../../lib/db";
import { itemMovements, logStockMovement } from "../../utils/stockLedger";
import { kathmanduDate } from "../../utils/date";
import { REGIONS, normaliseRegion } from "../../utils/region";
import {
  STOCK_CATEGORIES, STOCK_STATE_LABEL, computeFabricCost, costOf, findFabricByName, fmtQty, nextItemId, sizeRowsOf, stockOf, stockState,
} from "../../lib/inventory";

const SOURCE_LABEL = { purchase: "Purchase", sale: "Sale", manual: "Manual", opening: "Opening", production: "Production" };
const STATE_TONE = { negative: "bad", out: "bad", low: "warn" };

const num = (v) => Number(v || 0);
const str = (n) => (n ? String(n) : "");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function initialForm(mode, row, econ, region) {
  const e = econ || {};
  const cost = {
    fabricName: e.fabricName || "", gramsUsed: str(e.gramsUsed), fabric: str(e.fabric), rib: str(e.rib),
    trims: str(e.trims), directLabour: str(e.directLabour), others: str(e.others), targetPrice: str(e.targetPrice),
  };
  if (mode !== "edit") {
    return {
      item: "", itemId: "", category: "Raw Materials", unit: "pcs", supplier: "", location: "", owner: "", condition: "",
      minLevel: "", openingStock: "", unitCostNPR: "", region: region || "", sizeRows: sizeRowsOf(null), damageLog: [], ...cost,
    };
  }
  return {
    item: row.item || "", itemId: row.itemId || "", category: row.category || "", unit: row.unit || "", supplier: row.supplier || "",
    location: row.location || "", owner: row.owner || "", condition: row.condition || "", minLevel: str(row.minLevel),
    openingStock: str(row.openingStock), unitCostNPR: str(row.unitCostNPR), region: normaliseRegion(row.region),
    sizeRows: sizeRowsOf(row), damageLog: Array.isArray(row.damageLog) ? row.damageLog : [], ...cost,
  };
}

export default function ItemCard({
  mode = "edit", row, economics, movements, fabrics, allRows, canEdit, region, profileName, initialSection, onChanged, onClose,
}) {
  const { money, moneyAlt } = useCurrency();
  const editing = mode === "edit";
  const creatingCost = mode === "create-cost";
  const today = kathmanduDate();
  const who = profileName || "Unknown";

  const first = useMemo(() => initialForm(mode, row, economics, region), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState(first);
  const put = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const type = (k) => (e) => put(k)(e.target.value);
  const ro = !canEdit;

  const [mv, setMv] = useState({ date: today, direction: "in", qty: "", note: "" });
  const [mvBusy, setMvBusy] = useState(false);
  const [mvMsg, setMvMsg] = useState("");
  const [mvWarn, setMvWarn] = useState(false);
  const mvLock = useRef(false);          // a second Enter before the first has finished must not log it twice
  const [tagText, setTagText] = useState("");

  const stock = editing ? stockOf(row, movements) : { opening: 0, inTotal: 0, outTotal: 0, closing: 0 };
  const level = stockState(stock.closing, f.minLevel);
  const history = editing ? itemMovements(movements, row.id).slice().reverse() : [];
  const unit = f.unit || "units";

  const cost = costOf(f);
  const material = findFabricByName(fabrics, f.fabricName);

  const categoryOptions = useMemo(() => {
    const list = STOCK_CATEGORIES.slice();
    if (f.category && !list.includes(f.category)) list.unshift(f.category);
    return list.map((c) => ({ value: c, label: c }));
  }, [f.category]);
  const regionOptions = useMemo(() => [{ value: "", label: "Not set" }, ...REGIONS.map((r) => ({ value: r.id, label: r.label }))], []);
  const materialOptions = useMemo(
    () => fabrics.filter((x) => x.name).map((x) => ({ label: x.name, hint: x.pricePerKg != null ? `${money(x.pricePerKg)}/kg` : "no price" })),
    [fabrics, money],
  );

  // Picking a priced material, or the grams a piece uses, fills in the fabric cost. It stays editable: typing over it wins.
  function setMaterial(field, value) {
    setF((s) => {
      const next = { ...s, [field]: value };
      const c = computeFabricCost(fabrics, next.fabricName, next.gramsUsed);
      if (c !== null) next.fabric = String(c);
      return next;
    });
  }

  /* ── writes ─────────────────────────────────────────────────── */

  async function writeCost(id) {
    const payload = {
      fabric: num(f.fabric), fabricName: f.fabricName.trim(), gramsUsed: num(f.gramsUsed), rib: num(f.rib), trims: num(f.trims),
      directLabour: num(f.directLabour), others: num(f.others), targetPrice: num(f.targetPrice),
      updatedAt: new Date().toISOString(), updatedBy: who,
    };
    await upsertRow("unit_economics", { id, data: payload }, ["id"]);
    // A material typed here that the library does not know yet is added to it, so it can be picked (and priced) next time.
    if (payload.fabricName && !findFabricByName(fabrics, payload.fabricName)) {
      await insertRow("fabrics", {
        name: payload.fabricName, pricePerKg: null, composition: "", gsm: null, weight: "", status: "In Stock", swatchImageUrl: "",
      });
    }
    return payload.fabric + payload.rib + payload.trims + payload.directLabour + payload.others;
  }

  async function save() {
    if (!canEdit) return { ok: false, message: "You can look at this, but changing it is for people who can edit Inventory." };
    if (!f.item.trim()) return { ok: false, message: "Give the item a name.", section: "details" };
    try {
      if (mode === "create-stock") {
        await insertRow("inventory", {
          item: f.item.trim(), unit: f.unit, category: f.category, supplier: f.supplier, location: f.location, owner: "", condition: "",
          itemId: nextItemId(allRows),
          region: f.region || region,
          openingStock: num(f.openingStock), minLevel: num(f.minLevel), unitCostNPR: num(f.unitCostNPR),
          createdBy: who, createdAt: new Date().toISOString(),
        });
      } else if (creatingCost) {
        const made = await insertRow("inventory", {
          item: f.item, itemId: nextItemId(allRows), category: f.category, unit: "pcs", openingStock: 0, minLevel: 0, unitCostNPR: 0,
          createdBy: who, createdAt: new Date().toISOString(),
        });
        const cogs = await writeCost(made.id);
        await updateRow("inventory", made.id, { unitCostNPR: cogs, lastUpdated: kathmanduDate(), updatedBy: who });
      } else {
        const patch = {};
        const was = first;
        // only the fields that were changed are written, so a field someone else changed meanwhile is not put back
        const how = { item: (v) => v.trim(), itemId: (v) => v.trim(), minLevel: num, region: (v) => v || null };
        for (const k of ["item", "itemId", "category", "unit", "supplier", "location", "owner", "condition", "minLevel", "region"]) {
          if (f[k] !== was[k]) patch[k] = (how[k] || ((v) => v))(f[k]);
        }
        if (!same(f.sizeRows, was.sizeRows)) patch.sizeRows = f.sizeRows;
        if (!same(f.damageLog, was.damageLog)) patch.damageLog = f.damageLog;
        const costKeys = ["fabricName", "gramsUsed", "fabric", "rib", "trims", "directLabour", "others", "targetPrice"];
        if (costKeys.some((k) => f[k] !== was[k])) {
          const cogs = await writeCost(row.id);
          // a cost sheet with nothing in it must not wipe out a unit cost somebody typed in by hand
          if (cogs > 0 || !Number(row.unitCostNPR)) patch.unitCostNPR = cogs;
        }
        if (Object.keys(patch).length) {
          await updateRow("inventory", row.id, { ...patch, lastUpdated: kathmanduDate(), updatedBy: who });
        }
      }
    } catch (err) {
      return { ok: false, message: `Not saved: ${err.message || "the database refused it"}` };
    }
    await onChanged();
    return { ok: true };
  }

  async function remove() {
    if (!canEdit) return { ok: false, message: "You can look at this, but changing it is for people who can edit Inventory." };
    try {
      await deleteRow("inventory", row.id);
      try { await deleteRow("unit_economics", row.id); } catch { /* it had no cost sheet */ }
    } catch (err) {
      return { ok: false, message: `Couldn't delete: ${err.message || "the database refused it"}` };
    }
    await onChanged();
    return { ok: true };
  }

  async function logMove() {
    if (!canEdit || mvLock.current) return;
    const qty = Number(mv.qty);
    if (!qty || qty <= 0) { setMvMsg("Enter a quantity greater than 0."); return; }
    if (mv.direction === "out" && qty > stock.closing && !mvWarn) {
      setMvWarn(true);
      setMvMsg(`This takes the balance from ${fmtQty(stock.closing)} to ${fmtQty(stock.closing - qty)}, below zero. Press Log movement again to go ahead.`);
      return;
    }
    mvLock.current = true;
    setMvBusy(true);
    setMvMsg("");
    try {
      await logStockMovement({
        itemId: row.id, date: mv.date || today, qty, direction: mv.direction, source: "manual", note: mv.note || "", createdBy: who,
        // A hand-entered movement has no purchase or sale to value it by, so it is priced at the item's unit cost.
        amountNPR: qty * Number(row.unitCostNPR || 0),
      });
      setMv({ date: today, direction: "in", qty: "", note: "" });
      setMvWarn(false);
      await onChanged();
    } catch (err) {
      setMvMsg(`Couldn't log it: ${err.message}`);
    } finally {
      mvLock.current = false;
      setMvBusy(false);
    }
  }
  const mvPut = (k) => (v) => { setMv((s) => ({ ...s, [k]: v })); setMvWarn(false); setMvMsg(""); };
  const enterLogs = (e) => { if (e.key === "Enter") { e.preventDefault(); logMove(); } };

  function addTag() {
    const t = tagText.trim();
    if (!t) return;
    put("damageLog")([...f.damageLog, t]);
    setTagText("");
  }
  const sizeEdit = (size, field, v) => put("sizeRows")(f.sizeRows.map((r) => (r.size === size ? { ...r, [field]: Number(v) || 0 } : r)));

  /* ── the sections ───────────────────────────────────────────── */

  const idOf = (n) => `inv-${n}`;

  const nameField = (
    <Field label="Item name" htmlFor={idOf("name")} wide>
      <input id={idOf("name")} value={f.item} onChange={type("item")} placeholder="e.g. Chinese Terry Fabric" maxLength={160} disabled={ro} aria-required="true" />
    </Field>
  );
  const categoryField = (
    <Field label="Category" htmlFor={idOf("cat")}>
      <Select id={idOf("cat")} label="Category" value={f.category} onChange={put("category")} options={categoryOptions} disabled={ro} />
    </Field>
  );
  const regionField = (
    <Field label="Region" htmlFor={idOf("region")} wide hint="Which store this item sits in. Not set shows it under both UK and Nepal.">
      <Select id={idOf("region")} label="Region" value={f.region} onChange={put("region")} options={regionOptions} placeholder="Not set" disabled={ro} />
    </Field>
  );

  const detailsMain = (
    <>
      {nameField}
      {editing && (
        <Field label="Item code" htmlFor={idOf("code")}>
          <input id={idOf("code")} value={f.itemId} onChange={type("itemId")} maxLength={40} disabled={ro} />
        </Field>
      )}
      {categoryField}
      <Field label="Unit" htmlFor={idOf("unit")}>
        <input id={idOf("unit")} value={f.unit} onChange={type("unit")} placeholder="pcs / kg / metres" maxLength={20} disabled={ro} />
      </Field>
      <Field label="Supplier" htmlFor={idOf("sup")}>
        <input id={idOf("sup")} value={f.supplier} onChange={type("supplier")} placeholder="Supplier name" maxLength={120} disabled={ro} />
      </Field>
      <Field label="Location / store" htmlFor={idOf("loc")}>
        <input id={idOf("loc")} value={f.location} onChange={type("location")} placeholder="e.g. Warehouse A" maxLength={120} disabled={ro} />
      </Field>
      {editing && (
        <>
          <Field label="Owner / client" htmlFor={idOf("own")}>
            <input id={idOf("own")} value={f.owner} onChange={type("owner")} placeholder="e.g. client name" maxLength={120} disabled={ro} />
          </Field>
          <Field label="Condition" htmlFor={idOf("cond")}>
            <input id={idOf("cond")} value={f.condition} onChange={type("condition")} placeholder="e.g. Packed, Washed" maxLength={120} disabled={ro} />
          </Field>
        </>
      )}
    </>
  );

  const stockNow = editing && (
    <>
      <div className="ec-block ec-wide">
        <span className="ec-cap">In stock now</span>
        <div className={`ec-fig${stock.closing < 0 ? " ec-bad" : ""}`}>{fmtQty(stock.closing)}<small>{unit}</small></div>
        {STOCK_STATE_LABEL[level.state] ? <span><Tag tone={STATE_TONE[level.state]}>{STOCK_STATE_LABEL[level.state]}</Tag></span> : null}
      </div>
      <KV rows={[
        ["Opening", fmtQty(stock.opening)],
        ["In", `+${fmtQty(stock.inTotal)}`, "good"],
        ["Out", `−${fmtQty(stock.outTotal)}`, stock.outTotal ? "bad" : undefined],
        ["Worth", row.unitCostNPR ? money(stock.closing * Number(row.unitCostNPR)) : "—"],
      ]} />
    </>
  );

  const detailsSide = editing ? (
    <>
      {stockNow}
      <Field label="Reorder level" htmlFor={idOf("min")}>
        <NumberInput id={idOf("min")} value={f.minLevel} onChange={type("minLevel")} placeholder="0" unit={unit.slice(0, 6)} disabled={ro} />
      </Field>
      <Field label="Unit cost" hint="From the Cost section.">
        <input value={row.unitCostNPR ? money(row.unitCostNPR) : "—"} readOnly disabled aria-label="Unit cost" />
      </Field>
      {regionField}
      <p className="ec-note ec-wide">
        {row.lastUpdated ? <>Last changed <b>{row.lastUpdated}</b>{row.updatedBy ? <> by <b>{row.updatedBy}</b></> : null}.</> : "Not changed since it was added."}
      </p>
    </>
  ) : (
    <>
      <Field label="Opening stock" htmlFor={idOf("open")} hint="What you hold today. Changes after this are logged as movements.">
        <NumberInput id={idOf("open")} value={f.openingStock} onChange={type("openingStock")} placeholder="0" unit={unit.slice(0, 6)} />
      </Field>
      <Field label="Reorder level" htmlFor={idOf("min")} hint="Flagged Low at or under this.">
        <NumberInput id={idOf("min")} value={f.minLevel} onChange={type("minLevel")} placeholder="0" unit={unit.slice(0, 6)} />
      </Field>
      <Field label="Unit cost" htmlFor={idOf("ucost")} wide>
        <NumberInput id={idOf("ucost")} value={f.unitCostNPR} onChange={type("unitCostNPR")} placeholder="0" unit="NPR" />
      </Field>
      {regionField}
    </>
  );

  const costMain = (
    <>
      {creatingCost && nameField}
      <Field label="Material" htmlFor={idOf("mat")} wide>
        <Suggest id={idOf("mat")} label="Material" value={f.fabricName} onChange={(v) => setMaterial("fabricName", v)} options={materialOptions} placeholder="Pick one from the library, or type a new name" disabled={ro} />
        {f.fabricName.trim() && material && material.pricePerKg == null && (
          <small className="ec-hint">This material has no price in the library, so type the fabric cost yourself.</small>
        )}
      </Field>
      <Field label="Grams per piece" htmlFor={idOf("grams")}>
        <NumberInput id={idOf("grams")} value={f.gramsUsed} onChange={(e) => setMaterial("gramsUsed", e.target.value)} placeholder="e.g. 900" unit="g" disabled={ro} />
      </Field>
      <Field label="Fabric" htmlFor={idOf("fabric")}>
        <NumberInput id={idOf("fabric")} value={f.fabric} onChange={type("fabric")} placeholder="0" unit="NPR" disabled={ro} />
      </Field>
      <Field label="Rib" htmlFor={idOf("rib")}>
        <NumberInput id={idOf("rib")} value={f.rib} onChange={type("rib")} placeholder="0" unit="NPR" disabled={ro} />
      </Field>
      <Field label="Trims" htmlFor={idOf("trims")}>
        <NumberInput id={idOf("trims")} value={f.trims} onChange={type("trims")} placeholder="0" unit="NPR" disabled={ro} />
      </Field>
      <Field label="Labour" htmlFor={idOf("labour")}>
        <NumberInput id={idOf("labour")} value={f.directLabour} onChange={type("directLabour")} placeholder="0" unit="NPR" disabled={ro} />
      </Field>
      <Field label="Others" htmlFor={idOf("others")}>
        <NumberInput id={idOf("others")} value={f.others} onChange={type("others")} placeholder="0" unit="NPR" disabled={ro} />
      </Field>
      <div className="ec-strip ec-wide" aria-live="polite">
        <Icons.Wallet size={16} aria-hidden="true" />
        <span><b>{money(cost.cogs)} a piece</b><small>{moneyAlt(cost.cogs)} · fabric + rib + trims + labour + others</small></span>
      </div>
    </>
  );

  const costSide = (
    <>
      {creatingCost && categoryField}
      <Field label="Selling price" htmlFor={idOf("target")} wide={!creatingCost}>
        <NumberInput id={idOf("target")} value={f.targetPrice} onChange={type("targetPrice")} placeholder="0" unit="NPR" disabled={ro} />
      </Field>
      <KV rows={[
        ["Cost per piece", <>{money(cost.cogs)} <small>{moneyAlt(cost.cogs)}</small></>],
        ["Gross profit", cost.targetPrice > 0 ? <>{money(cost.gp)} <small>{moneyAlt(cost.gp)}</small></> : "—", cost.tone],
        ["Margin", cost.targetPrice > 0 ? `${cost.marginPct.toFixed(1)}%` : "—", cost.tone],
        ["Biggest cost", cost.driver ? `${cost.driver.name} ${cost.driver.pct.toFixed(0)}%` : "—"],
        ["Price for a 50% margin", <>{money(cost.target50)} <small>{moneyAlt(cost.target50)}</small></>],
        ...(editing ? [["Stock at this cost", money(stock.closing * cost.cogs)]] : []),
      ]} />
    </>
  );

  const movesMain = (
    <>
      {canEdit ? (
        <>
          <Field label="Date" htmlFor={idOf("mdate")}>
            <DatePicker id={idOf("mdate")} label="Date of the movement" value={mv.date} onChange={mvPut("date")} today={today} clearable={false} />
          </Field>
          <Field label="Direction" labelId={idOf("mdir")}>
            <Seg label="Direction" value={mv.direction} onChange={mvPut("direction")} options={[["in", "In"], ["out", "Out"]]} />
          </Field>
          <Field label={`Quantity (${unit})`} htmlFor={idOf("mqty")}>
            <NumberInput id={idOf("mqty")} value={mv.qty} onChange={(e) => mvPut("qty")(e.target.value)} onKeyDown={enterLogs} placeholder="0" />
          </Field>
          <Field label="Note" htmlFor={idOf("mnote")}>
            <input id={idOf("mnote")} value={mv.note} onChange={(e) => mvPut("note")(e.target.value)} onKeyDown={enterLogs} placeholder="Optional" maxLength={200} />
          </Field>
          <div className="ec-wide ec-add" style={{ alignItems: "center" }}>
            <p className={`ec-note${mvWarn ? " ec-warn" : ""}`} style={{ flex: "1 1 auto" }} role={mvMsg ? "alert" : undefined}>{mvMsg}</p>
            <button type="button" className="primary-button" onClick={logMove} disabled={mvBusy}>{mvBusy ? "Logging…" : "Log movement"}</button>
          </div>
        </>
      ) : null}
      <div className="ec-block ec-wide">
        <span className="ec-cap">History</span>
        {history.length === 0 ? (
          <p className="ec-hist-empty">No dated movements yet. The balance is just the opening stock until one is logged.</p>
        ) : (
          <ul className="ec-hist" tabIndex={0} aria-label="Stock movements, newest first">
            {history.map((m) => (
              <li key={m.id}>
                <time dateTime={m.date}>{m.date}</time>
                <span className="ec-hist-t"><b>{SOURCE_LABEL[m.source] || m.source}</b><span>{m.note || "—"}</span></span>
                <span className={`ec-hist-q ${m.direction === "in" ? "ec-good" : "ec-bad"}`}>
                  {m.direction === "in" ? "+" : "−"}{fmtQty(m.qty)}
                  {m.amountNPR ? <small>{money(m.amountNPR)}</small> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  const reqTotal = f.sizeRows.reduce((s, r) => s + num(r.required), 0);
  const cntTotal = f.sizeRows.reduce((s, r) => s + num(r.counted), 0);
  const diffTone = (d) => (d < 0 ? "ec-bad" : d > 0 ? "ec-good" : undefined);
  const diffText = (d) => (d > 0 ? `+${d}` : String(d));
  const sizesMain = (
    <>
      <div className="ec-f ec-wide">
        <span className="ec-lbl">Required and counted, by size</span>
        <table className="ec-sizes">
          <thead>
            <tr><th scope="col">Size</th><th scope="col">Required</th><th scope="col">Counted</th><th scope="col">Difference</th></tr>
          </thead>
          <tbody>
            {f.sizeRows.map((r) => {
              const d = num(r.counted) - num(r.required);
              return (
                <tr key={r.size}>
                  <td>{r.size}</td>
                  <td><input type="number" min="0" aria-label={`${r.size} required`} value={r.required || ""} placeholder="0" onChange={(e) => sizeEdit(r.size, "required", e.target.value)} disabled={ro} /></td>
                  <td><input type="number" min="0" aria-label={`${r.size} counted`} value={r.counted || ""} placeholder="0" onChange={(e) => sizeEdit(r.size, "counted", e.target.value)} disabled={ro} /></td>
                  <td className={diffTone(d)}>{diffText(d)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td>Total</td><td>{reqTotal}</td><td>{cntTotal}</td><td className={diffTone(cntTotal - reqTotal)}>{diffText(cntTotal - reqTotal)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div className="ec-f ec-wide">
        <span className="ec-lbl">Damage in the wash</span>
        {f.damageLog.length === 0 ? <small className="ec-hint">None logged.</small> : (
          <div className="ec-chips">
            {f.damageLog.map((t, i) => (
              <span key={`${t}-${i}`} className="ec-chip">
                {t}
                {canEdit && (
                  <button type="button" aria-label={`Remove ${t}`} onClick={() => put("damageLog")(f.damageLog.filter((_, k) => k !== i))}><Icons.X size={12} sw={2.2} /></button>
                )}
              </span>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="ec-add">
            <input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="e.g. W-3XL, damaged 2 pcs L"
              aria-label="Add damage note"
              maxLength={80}
            />
            <button type="button" className="ghost-button" onClick={addTag}>Add</button>
          </div>
        )}
      </div>
    </>
  );

  /* ── the card ───────────────────────────────────────────────── */

  if (editing) {
    const count = history.length;
    return (
      <EditCard
        title={row.item}
        subtitle={[row.itemId, row.category].filter(Boolean).join(" · ") || undefined}
        canEdit={canEdit}
        initialSection={initialSection}
        sections={[
          { id: "details", label: "Details", main: detailsMain, side: detailsSide },
          { id: "cost", label: "Cost", main: costMain, side: costSide },
          { id: "moves", label: "Movements", main: movesMain, side: stockNow || null },
          { id: "sizes", label: "Sizes", main: sizesMain, side: stockNow || null },
        ]}
        onSave={save}
        onDelete={remove}
        deleteName={row.item}
        deleteNote={`This also removes its ${count} stock movement${count === 1 ? "" : "s"} and its cost sheet. It can't be undone.`}
        onClose={onClose}
      />
    );
  }

  return (
    <EditCard
      title={creatingCost ? "New cost item" : "New stock item"}
      subtitle={creatingCost ? "A product and what it costs to make." : "Something you keep in stock."}
      creating
      canEdit
      mainLabel={creatingCost ? "Cost" : "The item"}
      sideLabel={creatingCost ? "Price" : "Stock"}
      main={creatingCost ? costMain : <>{detailsMain}</>}
      side={creatingCost ? costSide : detailsSide}
      submitLabel={creatingCost ? "Add cost item" : "Add item"}
      savingLabel="Adding…"
      onSave={save}
      onClose={onClose}
    />
  );
}
