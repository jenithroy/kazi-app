/**
 * The cards for the library's three plain lists: a fabric, a process, a sample.
 *
 * Each is the same card the stock item and the task use (components/EditCard.jsx): what it is on the left, its
 * numbers (and its picture) on the right. They replace the old fabric drawer, the "Add fabric" pop-up and the
 * shared library pop-up. The fields, what each one saves and the picture handling are the ones those had;
 * only where they sit changed. (Tech packs keep their own editor until they are redone.)
 *
 * `item` is the row being changed, or null to make a new one. `onChanged` runs after a write so the page reloads.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import EditCard, { Field, NumberInput } from "../EditCard";
import Select from "../Select";
import { Icons } from "../ui";
import { deleteRow, insertRow, updateRow } from "../../lib/db";
import { compressFabricImage, uploadFabricSwatch, uploadSamplePhoto } from "../../lib/inventoryImages";
import { COMMON_SIZES, FABRIC_STATUSES, PROCESS_CATEGORIES, SAMPLE_STAGES, SAMPLE_STATUSES } from "../../lib/inventory";
import { REGIONS, normaliseRegion } from "../../utils/region";

const regionOptions = [{ value: "", label: "Not set" }, ...REGIONS.map((r) => ({ value: r.id, label: r.label }))];
const listOf = (items) => items.map((x) => ({ value: x, label: x }));
const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
const text = (v) => (v == null ? "" : String(v));
const initialsOf = (name) => (name ? name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() : "?");

/** A picture with a place to drop a new one. A chosen file shows at once; saving it is the card's business. */
function PhotoDrop({ url, file, onFile, disabled, busy, name, noun, message }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const shown = preview || url;

  function take(list) {
    const picked = Array.from(list || []).find((x) => x.type.startsWith("image/"));
    if (picked) onFile(picked);
  }

  return (
    <div className="ec-block ec-wide">
      <div className={`ec-photo${shown ? "" : " ec-photo--empty"}`}>{shown ? <img src={shown} alt={name ? `${noun} of ${name}` : noun} /> : <span aria-hidden="true">{initialsOf(name)}</span>}</div>
      {!disabled && (
        <>
          <button
            type="button"
            className={`ec-drop${over ? " is-over" : ""}`}
            disabled={busy}
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
          >
            <Icons.Image size={18} aria-hidden="true" />
            {busy ? "Uploading…" : `Drop a ${noun} here, or click to choose one`}
            <small>PNG or JPG. It is shrunk for you.</small>
          </button>
          {message ? <small className="ec-hint ec-bad" role="alert">{message}</small> : null}
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
        </>
      )}
    </div>
  );
}

/** The delete the card offers: removes the row, reloads the page, or says why it could not. */
function deleter(table, item, onChanged, canEdit) {
  return async function remove() {
    if (!canEdit) return { ok: false, message: "You can look at this, but changing it is for people who can edit Inventory." };
    try {
      await deleteRow(table, item.id);
    } catch (err) {
      return { ok: false, message: `Couldn't delete: ${err.message || "the database refused it"}` };
    }
    await onChanged();
    return { ok: true };
  };
}

/* ── A fabric ───────────────────────────────────────────────────── */

export function FabricCard({ item, canEdit, region, onChanged, onClose }) {
  const editing = Boolean(item);
  const [f, setF] = useState(() => ({
    name: item?.name || "", composition: item?.composition || "", gsm: text(item?.gsm), weight: item?.weight || "",
    pricePerKg: text(item?.pricePerKg), status: item?.status || "In Stock", region: editing ? normaliseRegion(item.region) : (region || ""),
  }));
  const [swatch, setSwatch] = useState(item?.swatchImageUrl || "");
  const [picked, setPicked] = useState(null);          // a new picture not saved yet (a new fabric)
  const [uploading, setUploading] = useState(false);
  const [photoMsg, setPhotoMsg] = useState("");
  const put = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const type = (k) => (e) => put(k)(e.target.value);
  const ro = !canEdit;

  // An existing fabric's picture is saved the moment it is chosen (as the old drawer did); a new fabric's waits for Add.
  async function choose(file) {
    if (!canEdit) return;
    setPhotoMsg("");
    if (!editing) { setPicked(file); return; }
    setUploading(true);
    try {
      const small = await compressFabricImage(file);
      const url = await uploadFabricSwatch(item.id, small);
      await updateRow("fabrics", item.id, { swatchImageUrl: url, updatedAt: new Date().toISOString() });
      setSwatch(url);
      await onChanged();
    } catch (err) {
      setPhotoMsg(`Couldn't upload the picture: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!canEdit) return { ok: false, message: "You can look at this, but changing it is for people who can edit Inventory." };
    if (!f.name.trim()) return { ok: false, message: "Give the fabric a name." };
    if (uploading) return { ok: false, message: "Wait for the picture to finish uploading." };
    const payload = {
      name: f.name, gsm: numOrNull(f.gsm), weight: f.weight, composition: f.composition, status: f.status,
      pricePerKg: numOrNull(f.pricePerKg), region: f.region || null,
    };
    try {
      if (editing) {
        await updateRow("fabrics", item.id, { ...payload, swatchImageUrl: swatch, updatedAt: new Date().toISOString() });
      } else {
        const made = await insertRow("fabrics", { ...payload, swatchImageUrl: "" });
        if (picked) {
          const url = await uploadFabricSwatch(made.id, await compressFabricImage(picked));
          await updateRow("fabrics", made.id, { swatchImageUrl: url });
        }
      }
    } catch (err) {
      return { ok: false, message: `Not saved: ${err.message || "the database refused it"}` };
    }
    await onChanged();
    return { ok: true };
  }

  return (
    <EditCard
      title={editing ? item.name || "Fabric" : "New fabric"}
      subtitle={editing ? [item.composition, item.gsm ? `${item.gsm} GSM` : ""].filter(Boolean).join(" · ") || undefined : "Add it to the library."}
      creating={!editing}
      canEdit={canEdit}
      mainLabel="The fabric"
      sideLabel="Price and photo"
      submitLabel={editing ? "Save changes" : "Add fabric"}
      savingLabel={editing ? "Saving…" : "Adding…"}
      onSave={save}
      onDelete={editing ? deleter("fabrics", item, onChanged, canEdit) : undefined}
      deleteName={item?.name}
      deleteNote="It is gone from the library; tech packs that name it keep the name."
      onClose={onClose}
      main={(
        <>
          <Field label="Fabric name" htmlFor="fab-name" wide>
            <input id="fab-name" value={f.name} onChange={type("name")} placeholder="e.g. SOS Cotton, 30s Sinker Nepali" maxLength={120} disabled={ro} aria-required="true" />
          </Field>
          <Field label="Composition" htmlFor="fab-comp" wide>
            <input id="fab-comp" value={f.composition} onChange={type("composition")} placeholder="e.g. 100% Cotton" maxLength={120} disabled={ro} />
          </Field>
          <Field label="Weight (GSM)" htmlFor="fab-gsm">
            <NumberInput id="fab-gsm" value={f.gsm} onChange={type("gsm")} placeholder="e.g. 420" unit="GSM" disabled={ro} />
          </Field>
          <Field label="Roll weight" htmlFor="fab-w">
            <input id="fab-w" value={f.weight} onChange={type("weight")} placeholder="e.g. 1.2 kg" maxLength={40} disabled={ro} />
          </Field>
          <Field label="Price per kg" htmlFor="fab-price" hint="Per 1000 g. It prices the Cost section.">
            <NumberInput id="fab-price" value={f.pricePerKg} onChange={type("pricePerKg")} placeholder="e.g. 1150" unit="NPR" disabled={ro} />
          </Field>
          <Field label="Status" htmlFor="fab-status">
            <Select id="fab-status" label="Status" value={f.status} onChange={put("status")} options={listOf(FABRIC_STATUSES)} disabled={ro} />
          </Field>
        </>
      )}
      side={(
        <>
          <PhotoDrop url={swatch} file={picked} onFile={choose} disabled={ro} busy={uploading} name={f.name} noun="swatch photo" message={photoMsg} />
          <Field label="Region" htmlFor="fab-region" wide hint="Not set shows it under both UK and Nepal.">
            <Select id="fab-region" label="Region" value={f.region} onChange={put("region")} options={regionOptions} placeholder="Not set" disabled={ro} />
          </Field>
        </>
      )}
    />
  );
}

/* ── A process ──────────────────────────────────────────────────── */

export function ProcessCard({ item, canEdit, region, onChanged, onClose }) {
  const editing = Boolean(item);
  const [f, setF] = useState(() => ({
    name: item?.name || "", category: item?.category || "", description: item?.description || "", notes: item?.notes || "",
    cost_per_unit: text(item?.cost_per_unit), min_quantity: text(item?.min_quantity), lead_time_days: text(item?.lead_time_days),
    region: editing ? normaliseRegion(item.region) : (region || ""),
  }));
  const put = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const type = (k) => (e) => put(k)(e.target.value);
  const ro = !canEdit;
  const categoryOptions = useMemo(() => [
    { value: "", label: "Choose a category" },
    ...PROCESS_CATEGORIES.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) })),
  ], []);

  async function save() {
    if (!canEdit) return { ok: false, message: "You can look at this, but changing it is for people who can edit Inventory." };
    if (!f.name.trim()) return { ok: false, message: "Give the process a name." };
    const payload = {
      name: f.name, category: f.category, description: f.description, notes: f.notes,
      cost_per_unit: f.cost_per_unit ? Number(f.cost_per_unit) : null,
      min_quantity: f.min_quantity ? Number(f.min_quantity) : null,
      lead_time_days: f.lead_time_days ? Number(f.lead_time_days) : null,
      region: f.region || null,
    };
    try {
      if (editing) await updateRow("processes", item.id, { ...payload, updatedAt: new Date().toISOString() });
      else await insertRow("processes", payload);
    } catch (err) {
      return { ok: false, message: `Not saved: ${err.message || "the database refused it"}` };
    }
    await onChanged();
    return { ok: true };
  }

  return (
    <EditCard
      title={editing ? item.name || "Process" : "New process"}
      subtitle={editing ? item.category || undefined : "A step your work goes through, and what it costs."}
      creating={!editing}
      canEdit={canEdit}
      mainLabel="The process"
      sideLabel="Cost and time"
      submitLabel={editing ? "Save changes" : "Add process"}
      savingLabel={editing ? "Saving…" : "Adding…"}
      onSave={save}
      onDelete={editing ? deleter("processes", item, onChanged, canEdit) : undefined}
      deleteName={item?.name}
      onClose={onClose}
      main={(
        <>
          <Field label="Process name" htmlFor="prc-name" wide>
            <input id="prc-name" value={f.name} onChange={type("name")} placeholder="e.g. DTG printing" maxLength={120} disabled={ro} aria-required="true" />
          </Field>
          <Field label="Description" htmlFor="prc-desc" wide>
            <textarea id="prc-desc" value={f.description} onChange={type("description")} placeholder="What it involves" disabled={ro} />
          </Field>
          <Field label="Notes" htmlFor="prc-notes" wide>
            <textarea id="prc-notes" value={f.notes} onChange={type("notes")} placeholder="Anything worth remembering" disabled={ro} />
          </Field>
        </>
      )}
      side={(
        <>
          <Field label="Category" htmlFor="prc-cat" wide>
            <Select id="prc-cat" label="Category" value={f.category} onChange={put("category")} options={categoryOptions} placeholder="Choose a category" disabled={ro} />
          </Field>
          <Field label="Cost per unit" htmlFor="prc-cost" wide>
            <NumberInput id="prc-cost" value={f.cost_per_unit} onChange={type("cost_per_unit")} placeholder="0" unit="NPR" disabled={ro} />
          </Field>
          <Field label="Minimum order" htmlFor="prc-min">
            <NumberInput id="prc-min" value={f.min_quantity} onChange={type("min_quantity")} placeholder="0" unit="pcs" disabled={ro} />
          </Field>
          <Field label="Lead time" htmlFor="prc-lead">
            <NumberInput id="prc-lead" value={f.lead_time_days} onChange={type("lead_time_days")} placeholder="0" unit="days" disabled={ro} />
          </Field>
          <Field label="Region" htmlFor="prc-region" wide hint="Not set shows it under both UK and Nepal.">
            <Select id="prc-region" label="Region" value={f.region} onChange={put("region")} options={regionOptions} placeholder="Not set" disabled={ro} />
          </Field>
        </>
      )}
    />
  );
}

/* ── A sample ───────────────────────────────────────────────────── */

export function SampleCard({ item, canEdit, region, onChanged, onClose }) {
  const editing = Boolean(item);
  const [f, setF] = useState(() => ({
    name: item?.name || "", product_type: item?.product_type || "", fabric_used: item?.fabric_used || "",
    stage: item?.stage || "Proto", status: item?.status || "Pending", size: item?.size || "", color: item?.color || "",
    cost: text(item?.cost), notes: item?.notes || "", region: editing ? normaliseRegion(item.region) : (region || ""),
  }));
  const [picked, setPicked] = useState(null);
  const put = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const type = (k) => (e) => put(k)(e.target.value);
  const ro = !canEdit;
  const sizeOptions = useMemo(() => [{ value: "", label: "No size" }, ...listOf(COMMON_SIZES)], []);

  async function save() {
    if (!canEdit) return { ok: false, message: "You can look at this, but changing it is for people who can edit Inventory." };
    if (!f.name.trim()) return { ok: false, message: "Give the sample a name." };
    const payload = {
      name: f.name, product_type: f.product_type, stage: f.stage, status: f.status, fabric_used: f.fabric_used,
      size: f.size, color: f.color, cost: f.cost ? Number(f.cost) : null, notes: f.notes, region: f.region || null,
    };
    try {
      if (editing) {
        if (picked) payload.photo_url = await uploadSamplePhoto(item.id, await compressFabricImage(picked));
        await updateRow("samples", item.id, { ...payload, updatedAt: new Date().toISOString() });
      } else {
        const made = await insertRow("samples", payload);
        if (picked) {
          const url = await uploadSamplePhoto(made.id, await compressFabricImage(picked));
          await updateRow("samples", made.id, { photo_url: url });
        }
      }
    } catch (err) {
      return { ok: false, message: `Not saved: ${err.message || "the database refused it"}` };
    }
    await onChanged();
    return { ok: true };
  }

  return (
    <EditCard
      title={editing ? item.name || "Sample" : "New sample"}
      subtitle={editing ? [item.stage, item.status].filter(Boolean).join(" · ") || undefined : "A sample garment and where it has got to."}
      creating={!editing}
      canEdit={canEdit}
      mainLabel="The sample"
      sideLabel="Stage and photo"
      submitLabel={editing ? "Save changes" : "Add sample"}
      savingLabel={editing ? "Saving…" : "Adding…"}
      onSave={save}
      onDelete={editing ? deleter("samples", item, onChanged, canEdit) : undefined}
      deleteName={item?.name}
      onClose={onClose}
      main={(
        <>
          <Field label="Sample name" htmlFor="smp-name" wide>
            <input id="smp-name" value={f.name} onChange={type("name")} placeholder="e.g. Oversized hoodie v2" maxLength={120} disabled={ro} aria-required="true" />
          </Field>
          <Field label="Product type" htmlFor="smp-type">
            <input id="smp-type" value={f.product_type} onChange={type("product_type")} placeholder="T-shirt, hoodie…" maxLength={80} disabled={ro} />
          </Field>
          <Field label="Fabric used" htmlFor="smp-fabric">
            <input id="smp-fabric" value={f.fabric_used} onChange={type("fabric_used")} placeholder="e.g. 180 GSM cotton jersey" maxLength={120} disabled={ro} />
          </Field>
          <Field label="Colour" htmlFor="smp-colour">
            <input id="smp-colour" value={f.color} onChange={type("color")} placeholder="e.g. Navy" maxLength={60} disabled={ro} />
          </Field>
          <Field label="Size" htmlFor="smp-size">
            <Select id="smp-size" label="Size" value={f.size} onChange={put("size")} options={sizeOptions} placeholder="No size" disabled={ro} />
          </Field>
          <Field label="Notes" htmlFor="smp-notes" wide>
            <textarea id="smp-notes" value={f.notes} onChange={type("notes")} placeholder="Fit comments, changes to make" disabled={ro} />
          </Field>
        </>
      )}
      side={(
        <>
          <PhotoDrop url={item?.photo_url} file={picked} onFile={setPicked} disabled={ro} name={f.name} noun="photo" />
          <Field label="Stage" htmlFor="smp-stage">
            <Select id="smp-stage" label="Stage" value={f.stage} onChange={put("stage")} options={listOf(SAMPLE_STAGES)} disabled={ro} />
          </Field>
          <Field label="Status" htmlFor="smp-status">
            <Select id="smp-status" label="Status" value={f.status} onChange={put("status")} options={listOf(SAMPLE_STATUSES)} disabled={ro} />
          </Field>
          <Field label="Cost" htmlFor="smp-cost">
            <NumberInput id="smp-cost" value={f.cost} onChange={type("cost")} placeholder="0" unit="NPR" disabled={ro} />
          </Field>
          <Field label="Region" htmlFor="smp-region">
            <Select id="smp-region" label="Region" value={f.region} onChange={put("region")} options={regionOptions} placeholder="Not set" disabled={ro} />
          </Field>
        </>
      )}
    />
  );
}
