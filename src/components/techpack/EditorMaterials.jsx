/**
 * The Materials section: what the garment is made of and finished with, one row each (main fabric, lining, rib, buttons, labels...),
 * with a swatch picture. "Add from the fabric library" starts a row from a fabric the factory already keeps (its name, composition and
 * GSM, its swatch picture) and remembers which one it was (`fabricId`); `itemId` is carried through untouched for later.
 */
import { useId, useMemo, useRef } from "react";
import { Icons } from "../ui";
import Select from "../Select";
import { Field } from "../EditCard";
import { MATERIAL_KINDS, newId } from "../../lib/techpack";
import { Flow, LeftOut, useEditor } from "./editorContext";
import { leftOutRows } from "./editorModel";
import { ImageSlot, focusBack, focusLater, usePreviews } from "./Pictures";

const KIND_OPTIONS = MATERIAL_KINDS.map((k) => ({ value: k.id, label: k.label }));

const blankMaterial = (kind) => ({ id: newId(), kind, name: "", spec: "", colour: "", swatchUrl: "", fabricId: null, itemId: null });

/** "70% polyester, 120 GSM": the parts a fabric has, with the empty ones skipped. */
const specOf = (f) => [f.composition, f.gsm ? `${f.gsm} GSM` : ""].map((x) => String(x || "").trim()).filter(Boolean).join(", ");

function Row({ m, i, count, root }) {
  const { update, canEdit, saving } = useEditor();
  const previews = usePreviews();
  const uid = useId();
  const set = (patch) => update((p) => ({ ...p, materials: p.materials.map((x) => (x.id === m.id ? { ...x, ...patch } : x)) }));
  const label = m.name.trim() || `material ${i + 1}`;

  function move(d, which) {
    update((p) => {
      const from = p.materials.findIndex((x) => x.id === m.id);
      const to = from + d;
      if (to < 0 || to >= p.materials.length) return p;
      const materials = p.materials.slice();
      [materials[from], materials[to]] = [materials[to], materials[from]];
      return { ...p, materials };
    });
    const other = which === "tpe-mat-up" ? "tpe-mat-down" : "tpe-mat-up";
    focusBack(root.current, [`[data-mat="${CSS.escape(m.id)}"] .${which}`, `[data-mat="${CSS.escape(m.id)}"] .${other}`]);
  }

  function remove() {
    previews.drop(m.swatchPreview);
    update((p) => ({ ...p, materials: p.materials.filter((x) => x.id !== m.id) }));
    focusBack(root.current, ".tpe-addmat");
  }

  return (
    <li className="tpe-mat" data-mat={m.id}>
      <ImageSlot
        className="tpe-slot--mini tpe-slot--cover" shape="square" src={m.swatchPreview || m.swatchUrl} alt={`Swatch of ${label}`} label={`swatch for ${label}`}
        disabled={!canEdit} busy={saving && Boolean(m.swatchFile)}
        onFile={(file) => { previews.drop(m.swatchPreview); set({ swatchFile: file, swatchPreview: previews.make(file) }); }}
        onRemove={() => { previews.drop(m.swatchPreview); set({ swatchUrl: "", swatchFile: null, swatchPreview: "" }); }}
      />
      <Field label="Kind" htmlFor={`${uid}-k`} className="tpe-mat-kind">
        <Select id={`${uid}-k`} label={`Kind of material ${i + 1}`} value={m.kind} onChange={(v) => set({ kind: v })} options={KIND_OPTIONS} disabled={!canEdit} searchable={false} />
      </Field>
      <Field label="Name" htmlFor={`${uid}-n`} className="tpe-mat-name-f">
        <input id={`${uid}-n`} type="text" className="tpe-mat-name" autoComplete="off" value={m.name} maxLength={80} placeholder="Name, like Main fabric" aria-label={`Name of material ${i + 1}`} disabled={!canEdit} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Colour" htmlFor={`${uid}-c`} className="tpe-mat-colour" hint={m.fabricId ? "From the fabric library" : undefined}>
        <input id={`${uid}-c`} type="text" autoComplete="off" value={m.colour} maxLength={60} placeholder="Black" aria-label={`Colour of ${label}`} disabled={!canEdit} onChange={(e) => set({ colour: e.target.value })} />
      </Field>
      <Field label="Composition and weight" htmlFor={`${uid}-s`} className="tpe-mat-spec-f">
        <textarea
          id={`${uid}-s`} className="tpe-mat-spec" rows={3} value={m.spec} maxLength={400} disabled={!canEdit} aria-label={`Composition and weight of ${label}, one thing to a line`}
          placeholder={"70% wool / 30% polyester\n350-450 GSM"} onChange={(e) => set({ spec: e.target.value })}
        />
      </Field>
      {canEdit && (
        <span className="tpe-mat-acts">
          <button type="button" className="tpe-iconbtn tpe-mat-up" disabled={i === 0} onClick={() => move(-1, "tpe-mat-up")} aria-label={`Move ${label} up`} title="Move up"><Icons.ChevronDown size={15} sw={2} aria-hidden="true" style={{ transform: "rotate(180deg)" }} /></button>
          <button type="button" className="tpe-iconbtn tpe-mat-down" disabled={i === count - 1} onClick={() => move(1, "tpe-mat-down")} aria-label={`Move ${label} down`} title="Move down"><Icons.ChevronDown size={15} sw={2} aria-hidden="true" /></button>
          <button type="button" className="tpe-iconbtn tpe-mat-remove" onClick={remove} aria-label={`Remove ${label}`} title="Remove"><Icons.X size={15} sw={2} aria-hidden="true" /></button>
        </span>
      )}
    </li>
  );
}

export function MaterialsMain() {
  const { pack, update, canEdit, fabrics, fabricsState, reloadLists } = useEditor();
  const root = useRef(null);
  const options = useMemo(
    () => [...fabrics].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))).map((f) => ({ value: f.id, label: f.name || "Unnamed fabric", hint: specOf(f) })),
    [fabrics],
  );

  function addFromLibrary(id) {
    const f = fabrics.find((x) => x.id === id);
    if (!f) return;
    const row = { ...blankMaterial("fabric"), name: f.name || "", spec: specOf(f), swatchUrl: f.swatchImageUrl || "", fabricId: f.id };
    update((p) => ({ ...p, materials: [...p.materials, row] }));
    focusLater(`[data-mat="${CSS.escape(row.id)}"] .tpe-mat-name`);
  }

  function addBlank() {
    const row = blankMaterial(pack.materials.length ? "trim" : "fabric");
    update((p) => ({ ...p, materials: [...p.materials, row] }));
    focusLater(`[data-mat="${CSS.escape(row.id)}"] .tpe-mat-name`);
  }

  return (
    <Flow>
      {canEdit && (
        <div className="tpe-mat-bar ec-wide">
          <div className="tpe-mat-lib">
            <Select
              label="Add from the fabric library" value="" onChange={addFromLibrary} options={options} searchable searchPlaceholder="Search the fabric library"
              placeholder={fabricsState === "loading" ? "Reading the fabric library…" : "Add from the fabric library"} disabled={fabricsState === "loading" || options.length === 0}
              emptyText="No fabrics in the library"
            />
          </div>
          <button type="button" className="ghost-button tpe-addmat" onClick={addBlank}><Icons.Plus size={14} sw={2} aria-hidden="true" /> Add a material</button>
        </div>
      )}
      {fabricsState === "error" && <p className="tpe-msg ec-wide" role="alert">The fabric library could not be read. <button type="button" className="tpe-link" onClick={reloadLists}>Try again</button></p>}
      <div className="ec-wide tpe-cq" ref={root}>
        <LeftOut noun="material" places={leftOutRows(pack).materials} rule="A material is kept once it has a name or a description." />
        {pack.materials.length === 0 ? (
          <p className="tpe-empty">No materials yet. Add the main fabric first, then the lining, buttons and labels.</p>
        ) : (
          <ul className="tpe-mats">
            {pack.materials.map((m, i) => <Row key={m.id} m={m} i={i} count={pack.materials.length} root={root} />)}
          </ul>
        )}
      </div>
    </Flow>
  );
}

export function MaterialsSide() {
  const { pack } = useEditor();
  const n = pack.materials.filter((m) => m.name.trim()).length;
  return (
    <div className="ec-block ec-wide">
      <span className="ec-cap">Materials</span>
      <div className="ec-fig">{n}<small>named</small></div>
      <p className="ec-note">Buttons and labels belong here too: the factory needs to see them. Write the composition and weight on separate lines.</p>
    </div>
  );
}

