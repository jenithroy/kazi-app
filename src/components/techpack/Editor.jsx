/**
 * The tech pack editor: one card in the middle of the screen (the shared EditCard, made wide) where staff make and change a tech pack
 * with everything the factory's sheet needs.
 *
 *   <TechPackEditor
 *     row={fs_patterns row | null}      null = a new tech pack
 *     presetCustomerId=""               a new pack starts for this customer (their name goes in Brand too)
 *     customers fabrics existingPacks   optional lists; the card reads what it needs when they are not given
 *     canEdit canCreateCustomer
 *     onSaved={(row) => ...}            the saved row, read back from the database, so the caller can use it at once
 *     onDeleted={() => ...}             after Delete worked (the card then closes; onSaved is not called for a delete)
 *     onClose
 *     onCustomerCreated={(c) => ...}    when the card makes a customer on the spot
 *     initialSection="sheet" />
 *
 * Seven sections (the switch at the top of the card): Sheet, Pictures, Details, Materials, Measurements, Finishing & notes, Artwork &
 * labels. The four the sheet cannot do without carry a dot that fills when they are done; the footer says in a plain sentence what is
 * still needed. Only a Name is needed to save: an unfinished new-format tech pack saves, it just cannot be picked on an order yet.
 *
 * The pack lives in this component's state, in `readPack`'s shape (lib/techpack.js) with, on a picture that is not saved yet, a local
 * `file` and `preview`. Everything that reaches the database goes through lib/techpackWrites.js, which writes `packPayload(pack)`.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import EditCard from "../EditCard";
import { useAuth } from "../../context/AuthContext";
import { useRegion } from "../../context/RegionContext";
import { fetchAll } from "../../lib/db";
import { PACK_LIST_COLUMNS } from "../../lib/packColumns";
import { bullets, completeness, missingWords, readPack } from "../../lib/techpack";
import { applyUploaded, deleteTechPack, offListSizes, ordersMadeFrom, saveTechPack } from "../../lib/techpackWrites";
import { kathmanduDate } from "../../utils/date";
import { cn } from "../ui";
import { EditorCtx } from "./editorContext";
import { marketFor, nextStyleCode, previewPack, regionOfMarket, signature, startingPack } from "./editorModel";
import { focusLater, PreviewProvider } from "./Pictures";
import { SheetMain, SheetSide } from "./EditorSheet";
import { DetailsMain, DetailsSide, PicturesMain, PicturesSide } from "./EditorPictures";
import { MaterialsMain, MaterialsSide } from "./EditorMaterials";
import { MeasureBoard } from "./MeasureBoard";
import { NotesMain, NotesSide } from "./EditorNotes";
import { ArtworkMain, ArtworkSide } from "./EditorArtwork";
import "./editor.css";

const loadViewer = () => import("./SheetViewer");
const SheetViewer = lazy(loadViewer);

/** A section's name on its tab, with a dot that says whether it is done (required sections) or a count (optional ones). */
function TabLabel({ id, text, state, count }) {
  return (
    <span className="tpe-tab" data-tpe-tab={id}>
      {state ? <i className={cn("tpe-dot", state === "done" ? "is-done" : "is-todo")} aria-hidden="true" /> : null}
      {text}
      {state ? <span className="tpe-sr">{state === "done" ? ", complete" : ", still needed"}</span> : null}
      {count ? <span className="tpe-count">{count}</span> : null}
    </span>
  );
}

const NO_ROWS = Object.freeze([]);

export default function TechPackEditor({
  row = null, presetCustomerId = "", customers: customersProp, fabrics: fabricsProp, existingPacks: packsProp,
  canEdit = true, canCreateCustomer = false, onSaved, onDeleted, onClose, onCustomerCreated, initialSection = "sheet",
}) {
  const { profile } = useAuth();
  const { region } = useRegion();
  const editing = Boolean(row);
  const today = useMemo(() => kathmanduDate(), []);

  /* ── the lists the card chooses from ── */
  const [lists, setLists] = useState(() => ({
    customers: customersProp || NO_ROWS, customersState: customersProp ? "ready" : "loading",
    fabrics: fabricsProp || NO_ROWS, fabricsState: fabricsProp ? "ready" : "loading",
    packs: packsProp || NO_ROWS, packsState: packsProp || editing ? "ready" : "loading",
  }));
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const read = async (name, collection, columns) => {
      try {
        const rows = await fetchAll(collection, columns ? { columns } : undefined);
        if (alive) setLists((l) => ({ ...l, [name]: rows, [`${name}State`]: "ready" }));
      } catch (err) {
        console.error(`Tech pack editor: could not read ${collection}:`, err);
        if (alive) setLists((l) => ({ ...l, [`${name}State`]: "error" }));
      }
    };
    const l = listsRef.current;
    if (!customersProp && l.customersState === "loading") read("customers", "customers");
    if (!fabricsProp && l.fabricsState === "loading") read("fabrics", "fabrics");
    // (only the next reference is taken from this list, so not the pictures kept inside an older pack's row: 2 MB for nothing)
    if (!packsProp && !editing && l.packsState === "loading") read("packs", "patterns", PACK_LIST_COLUMNS);
    return () => { alive = false; };
  }, [tick]);   // eslint-disable-line react-hooks/exhaustive-deps

  const reloadLists = useCallback(() => {
    setLists((l) => ({
      ...l,
      customersState: l.customersState === "error" ? "loading" : l.customersState,
      fabricsState: l.fabricsState === "error" ? "loading" : l.fabricsState,
      packsState: l.packsState === "error" ? "loading" : l.packsState,
    }));
    setTick((t) => t + 1);
  }, []);

  const addCustomer = useCallback((c) => {
    if (!c) return;
    setLists((l) => (l.customers.some((x) => x.id === c.id) ? l : { ...l, customers: [...l.customers, c] }));
    onCustomerCreated?.(c);
  }, [onCustomerCreated]);

  /* ── the pack ── */
  const [start, setStart] = useState(() => {
    const named = presetCustomerId ? (customersProp || []).find((c) => String(c.id) === String(presetCustomerId)) : null;
    return startingPack({
      row,
      customer: !row && presetCustomerId ? { id: presetCustomerId, name: named?.name || "" } : null,
      today,
      styleNo: !row && packsProp ? nextStyleCode(packsProp) : "",
      market: marketFor(region),
    });
  });
  const [pack, setPack] = useState(start);
  const update = useCallback((fn) => setPack(fn), []);
  const set = useCallback((patch) => setPack((p) => ({ ...p, ...patch })), []);
  const [typedCustomer, setTypedCustomer] = useState("");
  const [board, setBoardState] = useState({ viewId: "", selectedId: "", templateId: "" });
  const setBoard = useCallback((patch) => setBoardState((b) => (Object.keys(patch).every((k) => b[k] === patch[k]) ? b : { ...b, ...patch })), []);

  // the next reference and the preset customer's name arrive with the lists: they fill the boxes that are still empty, and count as
  // how the pack started, so they are not "changes" to throw away
  const filled = useRef({ code: false, brand: false });
  useEffect(() => {
    if (editing || lists.packsState !== "ready" || filled.current.code) return;
    filled.current.code = true;
    const code = nextStyleCode(lists.packs);
    setStart((s) => (s.styleNo ? s : { ...s, styleNo: code }));
    setPack((p) => (p.styleNo ? p : { ...p, styleNo: code }));
  }, [editing, lists.packsState, lists.packs]);
  useEffect(() => {
    if (editing || !presetCustomerId || lists.customersState !== "ready" || filled.current.brand) return;
    filled.current.brand = true;
    const name = lists.customers.find((c) => String(c.id) === String(presetCustomerId))?.name || "";
    if (!name) return;
    setStart((s) => (s.brand ? s : { ...s, brand: name }));
    setPack((p) => (p.brand ? p : { ...p, brand: name }));
  }, [editing, presetCustomerId, lists.customersState, lists.customers]);

  const startSig = useMemo(() => signature(start), [start]);
  const packSig = useMemo(() => signature(pack), [pack]);
  const dirty = canEdit && packSig !== startSig;

  // what to say in the footer. An old pack is judged as the sheet it becomes when it is saved.
  const need = useMemo(() => completeness(pack.legacy ? { ...pack, legacy: false } : pack), [pack]);
  const doneIn = (section) => !need.missing.some((m) => m.section === section);
  const keepSizes = useMemo(() => (row ? offListSizes(readPack(row)) : []), [row]);
  const oldSheet = useMemo(
    () => (row ? [["Remarks", row.remarks], ["Trims", row.trims]].map(([k, v]) => [k, String(v ?? "").trim()]).filter(([, v]) => v) : []),
    [row],
  );

  /* ── the card's own state ── */
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const forceRef = useRef(false);               // the person was told someone else saved first and pressed Save again: write anyway
  const inflight = useRef(null);                // the Save that is running: pressing Save again joins it instead of starting a second one
  const createdRef = useRef(null);              // the row a first Save made: a second Save updates it, never makes another
  const attemptRef = useRef(null);              // a try at making the row that ended without an answer: the next Save looks for the row before it makes one
  const stampsRef = useRef([]);                 // the `updatedAt` values this card wrote itself (a change with one of them is ours, not somebody else's)
  const lockedFocus = useRef(null);
  const [preview, setPreview] = useState(null);
  const [orders, setOrders] = useState(null);   // how many orders were made from this pack (null: not known)

  useEffect(() => {
    if (!row?.id) return undefined;
    let alive = true;
    ordersMadeFrom(row.id).then((n) => { if (alive) setOrders(n); });
    return () => { alive = false; };
  }, [row?.id]);

  // a new tech pack opens with the cursor where the work starts: on who it is for, or on the name when that is already known (on a phone not
  // in a box: the keyboard would cover the card before anything has been seen)
  useEffect(() => {
    if (editing) return;
    requestAnimationFrame(() => {
      const touch = Boolean(window.matchMedia?.("(pointer: coarse)").matches);
      const el = presetCustomerId ? (touch ? null : document.querySelector('.tpe-card input[aria-required="true"]')) : document.querySelector(".tpe-card .kmodal-body .ksel");
      el?.focus?.({ preventScroll: true });
    });
  }, [editing, presetCustomerId]);

  // Preview sheet loads its code on the first press; fetch it a moment after the card opens instead, so a long sitting that is cut by a new
  // version of the site cannot lose what was typed (a chunk that is gone makes the page reload)
  useEffect(() => {
    const idle = window.requestIdleCallback ? window.requestIdleCallback(() => loadViewer().catch(() => {}), { timeout: 4000 }) : setTimeout(() => loadViewer().catch(() => {}), 1500);
    return () => { if (window.requestIdleCallback) window.cancelIdleCallback?.(idle); else clearTimeout(idle); };
  }, []);

  // While a Save runs the fields are locked: whatever is typed after the button is pressed is not in what is being written, and the card
  // would close afterwards as if it were. Where the cursor was comes back if the Save does not close the card.
  useEffect(() => {
    if (!saving) return undefined;
    const body = document.querySelector(".tpe-card .kmodal-body");
    if (!body) return undefined;
    const at = document.activeElement;
    lockedFocus.current = at && at !== document.body && body.contains(at) ? at : null;
    body.inert = true;
    return () => {
      body.inert = false;
      const back = lockedFocus.current;
      lockedFocus.current = null;
      if (back?.isConnected && (!document.activeElement || document.activeElement === document.body)) back.focus?.({ preventScroll: true });
    };
  }, [saving]);

  // the section switch scrolls sideways when the card is narrow: the tab that was just chosen comes to the middle of it
  useEffect(() => {
    const strip = document.querySelector(".tpe-card .ec-sections .kregion-seg");
    if (!strip) return undefined;
    const reveal = () => {
      const tab = strip.querySelector('[aria-selected="true"]');
      if (!tab || strip.scrollWidth <= strip.clientWidth) return;
      const left = tab.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft - (strip.clientWidth - tab.offsetWidth) / 2;
      strip.scrollTo({ left: Math.max(0, left), behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    reveal();
    // a section opens at its top, not wherever the last one was scrolled to
    const body = strip.closest(".kmodal-body");
    const watch = new MutationObserver(() => { reveal(); if (body) body.scrollTop = 0; });
    watch.observe(strip, { attributes: true, attributeFilter: ["aria-selected"], subtree: true });
    return () => watch.disconnect();
  }, []);

  // a button in a section that means "go to that section" (the board with no picture, say) presses the section's tab
  const goTo = useCallback((id) => {
    const tab = document.querySelector(`.tpe-card [data-tpe-tab="${id}"]`)?.closest("button");
    tab?.click();
    tab?.focus?.({ preventScroll: true });
  }, []);

  const customerName = (lists.customers.find((c) => String(c.id) === String(pack.customerId))?.name) || typedCustomer || "";

  // Two quick presses of Save (React has not drawn the busy button yet) must not make two tech packs: the second joins the first.
  function save() {
    if (inflight.current) return inflight.current;
    inflight.current = writeIt().finally(() => { inflight.current = null; });
    return inflight.current;
  }

  async function writeIt() {
    if (!canEdit) return { ok: false, message: "You can look at this, but changing it is for people who can edit Inventory." };
    if (!pack.name.trim()) {
      focusLater('.tpe-card input[aria-required="true"]');
      return { ok: false, message: "Give the tech pack a name before saving. It is the only thing that is needed.", section: "sheet" };
    }
    setSaving(true);
    let saved;
    try {
      saved = await saveTechPack({
        pack, row: createdRef.current || row, region: regionOfMarket(pack.market), profileName: profile?.name || "",
        onInserted: (made) => { createdRef.current = made; attemptRef.current = null; },
        attempt: attemptRef.current, onAttempt: (a) => { attemptRef.current = a; },
        ownStamps: stampsRef.current, onStamp: (s) => { stampsRef.current = [...stampsRef.current, s]; },
        onUploaded: (target, url) => setPack((p) => applyUploaded(p, target, url)),
        onProgress: setProgress, force: forceRef.current,
      });
    } catch (err) {
      if (err?.conflict) forceRef.current = true;
      return { ok: false, message: err?.message || "The tech pack could not be saved. Press Save to try again; what you typed is kept." };
    } finally {
      setSaving(false);
      setProgress(null);
    }
    // the caller's own handler is not part of the save: if it throws, the tech pack is still saved
    try { onSaved?.(saved); } catch (err) { console.error("Tech pack editor: onSaved failed:", err); }
    return { ok: true };
  }

  async function remove() {
    if (!canEdit) return { ok: false, message: "You can look at this, but changing it is for people who can edit Inventory." };
    try {
      await deleteTechPack(createdRef.current || row);
    } catch (err) {
      return { ok: false, message: err?.message || "The tech pack could not be deleted." };
    }
    onDeleted?.();
    return { ok: true };
  }

  function openPreview() {
    setPreview({ pack: previewPack(pack, createdRef.current || row), customer: pack.customerId || customerName ? { id: pack.customerId || null, name: customerName } : null });
  }

  /* ── what the sections share ── */
  const ctx = {
    pack, set, update, canEdit, saving, today, keepSizes, oldSheet, goTo, board, setBoard,
    customers: lists.customers, customersState: lists.customersState, fabrics: lists.fabrics, fabricsState: lists.fabricsState,
    reloadLists, canCreateCustomer, addCustomer, typedCustomer, setTypedCustomer,
  };

  const count = (n) => (n > 0 ? String(n) : "");
  const sections = [
    { id: "sheet", label: <TabLabel id="sheet" text="Sheet" state={doneIn("sheet") ? "done" : "todo"} />, main: <SheetMain />, side: <SheetSide /> },
    { id: "pictures", label: <TabLabel id="pictures" text="Pictures" state={doneIn("pictures") ? "done" : "todo"} />, main: <PicturesMain />, side: <PicturesSide /> },
    { id: "details", label: <TabLabel id="details" text="Details" count={count(pack.details.length)} />, main: <DetailsMain />, side: <DetailsSide /> },
    { id: "materials", label: <TabLabel id="materials" text="Materials" state={doneIn("materials") ? "done" : "todo"} />, main: <MaterialsMain />, side: <MaterialsSide /> },
    { id: "measurements", label: <TabLabel id="measurements" text="Measurements" state={doneIn("measurements") ? "done" : "todo"} />, main: <MeasureBoard />, side: null },
    { id: "notes", label: <TabLabel id="notes" text="Finishing & notes" count={count(bullets(pack.finishing).length + bullets(pack.notes).length + (pack.washCare.trim() ? 1 : 0))} />, main: <NotesMain />, side: <NotesSide /> },
    { id: "artwork", label: <TabLabel id="artwork" text="Artwork & labels" count={count(pack.prints.length + pack.labelling.length + pack.construction.length)} />, main: <ArtworkMain />, side: <ArtworkSide /> },
  ];

  const sentence = need.ok
    ? (pack.legacy ? "Everything the sheet needs is here. Saving moves this tech pack onto the sheet." : "Everything the sheet needs is here.")
    : pack.legacy
      ? `It moves onto the sheet once it has: ${missingWords(need)}. Until then it stays an old-format tech pack, which can still be used on an order.`
      : `Still needed: ${missingWords(need)}.`;
  const footer = (
    <>
      <p className={cn("tpe-need", need.ok && "is-ok")} role="status">{sentence}</p>
      <button type="button" className="ghost-button tpe-preview" onClick={openPreview}>Preview sheet</button>
    </>
  );

  const deleteNote = orders > 0
    ? `${orders === 1 ? "1 order was made from it; it stays, unlinked." : `${orders} orders were made from it; they stay, unlinked.`} This can't be undone.`
    : "Any orders made from it stay, but lose the link to it. This can't be undone.";

  return (
    <PreviewProvider>
      <EditorCtx.Provider value={ctx}>
        <EditCard
          className="tpe-card"
          title={editing ? start.name.trim() || "Tech pack" : "New tech pack"}
          subtitle={editing ? [start.brand, start.styleNo].map((x) => x.trim()).filter(Boolean).join(" · ") || undefined : "Fill in the sections; what is still missing is listed at the bottom."}
          creating={!editing}
          canEdit={canEdit}
          sections={sections}
          initialSection={initialSection}
          dirty={dirty}
          onSave={save}
          submitLabel={editing ? "Save changes" : "Add tech pack"}
          savingLabel={progress && progress.total ? `Saving pictures ${progress.done} of ${progress.total}…` : "Saving…"}
          onDelete={editing && canEdit ? remove : undefined}
          deleteName={start.name.trim() || "this tech pack"}
          deleteNote={deleteNote}
          footerExtra={footer}
          onClose={onClose}
        />
        {preview && (
          <Suspense fallback={null}>
            <SheetViewer pack={preview.pack} customer={preview.customer} onClose={() => setPreview(null)} />
          </Suspense>
        )}
      </EditorCtx.Provider>
    </PreviewProvider>
  );
}
