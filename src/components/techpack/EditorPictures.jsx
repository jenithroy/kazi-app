/**
 * The Pictures and Details sections.
 *
 * Pictures: the views along the top of the sheet. A new pack starts with four empty slots (reference photo, front, back, side, as on the
 * owner's sheet); each has a picture, the caption printed under it, a kind, and arrows to put it earlier or later. An empty slot is simply
 * not saved. The brand logo (optional, printed instead of the typed name) sits in the right pane.
 *
 * Details: the small close-up photos under DETAILS, with a caption each.
 */
import { useId, useRef, useState } from "react";
import { Icons } from "../ui";
import Select from "../Select";
import { MAX_VIEWS, VIEW_KINDS } from "../../lib/techpack";
import { Field } from "../EditCard";
import { Flow, useEditor } from "./editorContext";
import { ImageSlot, TileGrid, focusBack, usePreviews } from "./Pictures";
import { kindLabel, NEW_VIEW_KINDS, newView } from "./editorModel";

/** Ids of the pictures that are still files while a Save is running: they say "Saving…". */
export const savingIds = (items, saving) => (saving ? new Set((items || []).filter((i) => i.file).map((i) => i.id)) : null);

const KIND_OPTIONS = VIEW_KINDS.map((k) => ({ value: k.id, label: k.label }));

/* ── Views ─────────────────────────────────────────────────────── */

function ViewSlot({ v, i, count, root }) {
  const { pack, update, canEdit, saving } = useEditor();
  const previews = usePreviews();
  const uid = useId();
  const [note, setNote] = useState("");
  const drawn = pack.points.filter((p) => p.view === v.id && p.line).length;
  const name = (v.label || "").trim() || kindLabel(v.kind);
  const set = (patch) => update((p) => ({ ...p, views: p.views.map((x) => (x.id === v.id ? { ...x, ...patch } : x)) }));

  function choose(file) {
    previews.drop(v.preview);
    set({ file, preview: previews.make(file) });
    setNote(!drawn ? "" : drawn === 1 ? "The line drawn on the old picture stayed where it was. Check it in Measurements." : `The ${drawn} lines drawn on the old picture stayed where they were. Check them in Measurements.`);
  }

  // taking the picture away takes its lines off the picture (their rows and numbers stay)
  function clearPicture() {
    previews.drop(v.preview);
    update((p) => ({
      ...p,
      views: p.views.map((x) => (x.id === v.id ? { ...x, url: "", file: null, preview: "" } : x)),
      points: p.points.map((pt) => (pt.view === v.id ? { ...pt, view: null, line: null } : pt)),
    }));
    setNote(!drawn ? "" : drawn === 1 ? "The line drawn on it was taken off the picture. Its number stays in Measurements." : `The ${drawn} lines drawn on it were taken off the picture. Their numbers stay in Measurements.`);
  }

  function removeView() {
    previews.drop(v.preview);
    update((p) => ({
      ...p,
      views: p.views.filter((x) => x.id !== v.id),
      points: p.points.map((pt) => (pt.view === v.id ? { ...pt, view: null, line: null } : pt)),
    }));
    focusBack(root.current, ".tpe-addview");
  }

  function move(d, which) {
    update((p) => {
      const from = p.views.findIndex((x) => x.id === v.id);
      const to = from + d;
      if (to < 0 || to >= p.views.length) return p;
      const views = p.views.slice();
      [views[from], views[to]] = [views[to], views[from]];
      return { ...p, views };
    });
    const other = which === "tpe-view-earlier" ? "tpe-view-later" : "tpe-view-earlier";
    focusBack(root.current, [`[data-view="${CSS.escape(v.id)}"] .${which}`, `[data-view="${CSS.escape(v.id)}"] .${other}`]);
  }

  // the caption starts as the kind's name and follows it until someone writes their own
  function setKind(kind) {
    const untouched = !(v.label || "").trim() || v.label === kindLabel(v.kind);
    set({ kind, label: untouched ? kindLabel(kind) : v.label });
  }

  return (
    <li className="tpe-view" data-view={v.id}>
      <span className="tpe-view-n">View {i + 1}</span>
      <ImageSlot
        src={v.preview || v.url} alt={`${name}${pack.name ? ` of ${pack.name}` : ""}`} label={`picture for view ${i + 1}`} shape="tall"
        disabled={!canEdit} busy={saving && Boolean(v.file)} onFile={choose} onRemove={clearPicture}
      />
      <Field label="Caption" htmlFor={`${uid}-cap`} className="tpe-view-f">
        <input
          id={`${uid}-cap`} type="text" className="tpe-view-cap" autoComplete="off" value={v.label} maxLength={60} placeholder={kindLabel(v.kind)} disabled={!canEdit}
          aria-label={`Caption for view ${i + 1}`} onChange={(e) => set({ label: e.target.value })}
        />
      </Field>
      <Field label="Kind" htmlFor={`${uid}-kind`} className="tpe-view-f">
        <Select id={`${uid}-kind`} label={`Kind of view ${i + 1}`} value={v.kind} onChange={setKind} options={KIND_OPTIONS} disabled={!canEdit} searchable={false} className="tpe-view-kind" />
      </Field>
      {canEdit && (
        <span className="tpe-view-acts">
          <button type="button" className="tpe-iconbtn tpe-view-earlier" disabled={i === 0} onClick={() => move(-1, "tpe-view-earlier")} aria-label={`Move view ${i + 1} earlier`} title="Move earlier"><Icons.ChevronLeft size={15} sw={2} aria-hidden="true" /></button>
          <button type="button" className="tpe-iconbtn tpe-view-later" disabled={i === count - 1} onClick={() => move(1, "tpe-view-later")} aria-label={`Move view ${i + 1} later`} title="Move later"><Icons.ChevronRight size={15} sw={2} aria-hidden="true" /></button>
          <button type="button" className="tpe-iconbtn tpe-view-remove" onClick={removeView} aria-label={`Remove view ${i + 1}${v.label ? `, ${v.label}` : ""}`} title="Remove this view"><Icons.Trash size={15} sw={1.8} aria-hidden="true" /></button>
        </span>
      )}
      {note ? <small className="tpe-msg" role="status">{note}</small> : null}
    </li>
  );
}

export function PicturesMain() {
  const { pack, update, canEdit } = useEditor();
  const root = useRef(null);
  const free = NEW_VIEW_KINDS.find((k) => !pack.views.some((v) => v.kind === k)) || "other";
  const full = pack.views.length >= MAX_VIEWS;

  return (
    <Flow>
      <p className="ec-note ec-wide">The pictures along the top of the sheet. Put the garment first, then the flat drawings. A slot with no picture is left out.</p>
      <div className="ec-wide" ref={root}>
        <ol className="tpe-views">
          {pack.views.map((v, i) => <ViewSlot key={v.id} v={v} i={i} count={pack.views.length} root={root} />)}
        </ol>
        {canEdit && !full && (
          <button type="button" className="ghost-button tpe-addview" onClick={() => update((p) => ({ ...p, views: [...p.views, newView(free)] }))}>
            <Icons.Plus size={14} sw={2} aria-hidden="true" /> Add a view
          </button>
        )}
        {full && <p className="ec-note">The sheet shows up to {MAX_VIEWS} views.</p>}
      </div>
    </Flow>
  );
}

export function PicturesSide() {
  const { pack, update, canEdit, saving } = useEditor();
  const previews = usePreviews();
  const uid = useId();
  const [note, setNote] = useState("");
  const src = pack.brandLogoPreview || pack.brandLogoUrl;
  return (
    <Flow>
      <Field label="Brand logo" labelId={`${uid}-logo`} wide hint="Optional. Printed at the top of the sheet instead of the typed brand name.">
        <ImageSlot
          src={src} alt={`${pack.brand || "Brand"} logo`} label="brand logo" shape="wide" disabled={!canEdit} busy={saving && Boolean(pack.brandLogoFile)}
          onFile={(file) => { previews.drop(pack.brandLogoPreview); update((p) => ({ ...p, brandLogoFile: file, brandLogoPreview: previews.make(file) })); }}
          onRemove={() => { previews.drop(pack.brandLogoPreview); update((p) => ({ ...p, brandLogoUrl: "", brandLogoFile: null, brandLogoPreview: "" })); setNote("The logo is taken off. Save to keep that."); }}
        />
        {note ? <small className="ec-hint" role="status">{note}</small> : null}
      </Field>
      {pack.pages.length > 0 && (
        <p className="ec-note ec-wide">
          <b>{pack.pages.length} photograph{pack.pages.length === 1 ? "" : "s"} of the paper tech pack</b> {pack.pages.length === 1 ? "is" : "are"} kept with this one. Open {pack.pages.length === 1 ? "it" : "them"} from the Tech packs tab.
        </p>
      )}
      {pack.externalUrl ? (
        <p className="ec-note ec-wide">
          <b>A file kept somewhere else</b> is linked to this tech pack: {/^https?:\/\//i.test(pack.externalUrl)
            ? <a className="tpe-link" href={pack.externalUrl} target="_blank" rel="noopener noreferrer">open it</a>
            : <span>{pack.externalUrl}</span>}. It stays as it is.
        </p>
      ) : null}
      <p className="ec-note ec-wide">Pictures are shrunk for you when you press Save, so a big photo from a phone is fine.</p>
    </Flow>
  );
}

/* ── Details ───────────────────────────────────────────────────── */

export function DetailsMain() {
  const { pack, set, canEdit, saving } = useEditor();
  return (
    <Flow>
      <p className="ec-note ec-wide">These are the small photos under DETAILS on the sheet (up to 6 fit on the first page). Write what each one shows.</p>
      <div className="ec-wide">
        <TileGrid
          items={pack.details} onChange={(details) => set({ details })} canEdit={canEdit} noun="close-up" altBase="Close-up"
          captionPlaceholder="High collar without buckle" busyIds={savingIds(pack.details, saving)}
        />
      </div>
    </Flow>
  );
}

export function DetailsSide() {
  const { pack } = useEditor();
  const n = pack.details.length;
  return (
    <div className="ec-block ec-wide">
      <span className="ec-cap">On the first page</span>
      <div className={`ec-fig${n > 6 ? " ec-warn" : ""}`}>{Math.min(n, 6)}<small>of 6</small></div>
      <p className="ec-note">
        {n === 0 ? "No close-ups yet. Add the collar, the buttons, a seam or a label: anything the factory must copy." : n > 6 ? `${n - 6} more ${n - 6 === 1 ? "picture does" : "pictures do"} not fit on the first page.` : "Take them close and straight, one thing in each picture."}
      </p>
    </div>
  );
}
