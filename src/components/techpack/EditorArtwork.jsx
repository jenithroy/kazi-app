/**
 * Artwork & labels (optional, for garments with prints, labels or construction pictures: the tee in the owner's second photograph).
 *
 * Prints: one row each (where it goes, a picture, its colour, how it is done, how wide). Labels and tags, and Construction pictures:
 * captioned pictures like Details.
 */
import { useId, useRef } from "react";
import { Icons } from "../ui";
import Suggest from "../Suggest";
import { Field } from "../EditCard";
import { newId } from "../../lib/techpack";
import { Flow, LeftOut, useEditor } from "./editorContext";
import { leftOutRows } from "./editorModel";
import { ImageSlot, TileGrid, focusBack, focusLater, usePreviews } from "./Pictures";
import { savingIds } from "./EditorPictures";

const PLACEMENTS = ["Front", "Back", "Sleeve", "Neck"].map((label) => ({ label }));

function PrintRow({ pr, i, root }) {
  const { update, canEdit, saving } = useEditor();
  const previews = usePreviews();
  const uid = useId();
  const set = (patch) => update((p) => ({ ...p, prints: p.prints.map((x) => (x.id === pr.id ? { ...x, ...patch } : x)) }));
  const label = pr.placement.trim() ? `${pr.placement.trim()} print` : `print ${i + 1}`;
  const remove = () => {
    previews.drop(pr.preview);
    update((p) => ({ ...p, prints: p.prints.filter((x) => x.id !== pr.id) }));
    focusBack(root.current, ".tpe-addprint");
  };
  return (
    <li className="tpe-print" data-print={pr.id}>
      <ImageSlot
        className="tpe-slot--mini" shape="square" src={pr.preview || pr.url} alt={`Artwork for the ${label}`} label={`picture for the ${label}`}
        disabled={!canEdit} busy={saving && Boolean(pr.file)}
        onFile={(file) => { previews.drop(pr.preview); set({ file, preview: previews.make(file) }); }}
        onRemove={() => { previews.drop(pr.preview); set({ url: "", file: null, preview: "" }); }}
      />
      <div className="tpe-print-f">
        <Field label="Where" htmlFor={`${uid}-w`}>
          <Suggest id={`${uid}-w`} className="tpe-print-place" value={pr.placement} onChange={(v) => set({ placement: v })} options={PLACEMENTS} placeholder="Front" label={`Placement of print ${i + 1}`} disabled={!canEdit} passEnter />
        </Field>
        <Field label="Colour" htmlFor={`${uid}-c`}>
          <input id={`${uid}-c`} type="text" autoComplete="off" value={pr.colour} maxLength={60} placeholder="Faded red" aria-label={`Colour of the ${label}`} disabled={!canEdit} onChange={(e) => set({ colour: e.target.value })} />
        </Field>
        <Field label="How it is made" htmlFor={`${uid}-t`}>
          <input id={`${uid}-t`} type="text" autoComplete="off" value={pr.technique} maxLength={80} placeholder="Screen printing" aria-label={`How the ${label} is made`} disabled={!canEdit} onChange={(e) => set({ technique: e.target.value })} />
        </Field>
        <Field label="Width" htmlFor={`${uid}-x`}>
          <input id={`${uid}-x`} type="text" autoComplete="off" value={pr.width} maxLength={40} placeholder="22 cm" aria-label={`Width of the ${label}`} disabled={!canEdit} onChange={(e) => set({ width: e.target.value })} />
        </Field>
      </div>
      {canEdit && (
        <button type="button" className="tpe-iconbtn tpe-print-remove" onClick={remove} aria-label={`Remove the ${label}`} title="Remove"><Icons.X size={15} sw={2} aria-hidden="true" /></button>
      )}
    </li>
  );
}

export function ArtworkMain() {
  const { pack, update, canEdit } = useEditor();
  const root = useRef(null);
  const uid = useId();
  const add = () => {
    const row = { id: newId(), placement: "", url: "", colour: "", technique: "", width: "" };
    update((p) => ({ ...p, prints: [...p.prints, row] }));
    focusLater(`[data-print="${CSS.escape(row.id)}"] .tpe-print-place input`);
  };
  return (
    <Flow>
      <Field label="Prints" labelId={`${uid}-prints`} wide hint="Each print or embroidery on the garment: where it goes and how it is made.">
        <div ref={root} className="tpe-cq" role="group" aria-labelledby={`${uid}-prints`}>
          <LeftOut noun="print" places={leftOutRows(pack).prints} rule="A print is kept once it has a picture, a place or a way it is made." />
          {pack.prints.length === 0 ? (
            <p className="tpe-empty">No prints. Leave this empty for a plain garment.</p>
          ) : (
            <ul className="tpe-prints">{pack.prints.map((pr, i) => <PrintRow key={pr.id} pr={pr} i={i} root={root} />)}</ul>
          )}
          {canEdit && <button type="button" className="ghost-button tpe-addprint" onClick={add}><Icons.Plus size={14} sw={2} aria-hidden="true" /> Add a print</button>}
        </div>
      </Field>
    </Flow>
  );
}

export function ArtworkSide() {
  const { pack, set, canEdit, saving } = useEditor();
  const uid = useId();
  return (
    <Flow>
      <Field label="Labels and tags" labelId={`${uid}-labels`} wide hint="The sewn-in label, the hang tag, the care label.">
        <TileGrid
          items={pack.labelling} onChange={(labelling) => set({ labelling })} canEdit={canEdit} noun="label picture" altBase="Label"
          captionPlaceholder="Internal label, Cavalls Studio" busyIds={savingIds(pack.labelling, saving)}
        />
      </Field>
      <Field label="Construction pictures" labelId={`${uid}-construction`} wide hint="How a seam, a hem or a binding is made.">
        <TileGrid
          items={pack.construction} onChange={(construction) => set({ construction })} canEdit={canEdit} noun="construction picture" altBase="Construction"
          captionPlaceholder="Narrow binding, single-needle topstitch" busyIds={savingIds(pack.construction, saving)}
        />
      </Field>
    </Flow>
  );
}
