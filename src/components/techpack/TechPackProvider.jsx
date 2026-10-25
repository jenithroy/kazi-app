/**
 * Open any tech pack from anywhere.
 *
 * The provider sits once, around the whole signed-in app (AppLayout), beside the person and Send providers. A tech pack named
 * anywhere on a page (an order's card, a customer's card, the Tech packs tab) calls one of three things:
 *
 *   openSheet({ id })                                                  the printed sheet in the document viewer (look, zoom, Print, Download PDF, Send)
 *   openPages({ id })                                                  the photographs of the paper tech pack (older packs are mostly these)
 *   openEditor({ id | null, presetCustomerId, onSaved, onDeleted })    the editor; no id = a new tech pack, `presetCustomerId` starts it for that customer
 *
 * All are fetched when first wanted (the viewer and the editor are big, and the sheet brings the PDF maker with it on demand). The
 * row is read by id when it is opened, so what is shown is what is saved now; the customer's name comes from it too. The card or page
 * that was pressed stays exactly as it was underneath; Escape closes only the top one. Going to another page puts them away.
 *
 * `openEditor` is null for a position that may not edit tech packs (the same rule as the Inventory page: Inventory or Library edit).
 */
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { fetchOne } from "../../lib/db";
import { sectionCanEdit, sectionVisible } from "../../utils/permissions";
import Modal from "../Modal";
import "./techpack.css";

const loadViewer = () => import("./SheetViewer");
const loadEditor = () => import("./Editor");
const loadPages = () => import("./PagesViewer");
const SheetViewer = lazy(loadViewer);
const TechPackEditor = lazy(loadEditor);
const PagesViewer = lazy(loadPages);

const Ctx = createContext({ openSheet: null, openPages: null, openEditor: null, warm: () => {} });

/** Start fetching the viewer's code (a pointer arriving on a tech pack's name). Asking again is free. */
function warm() {
  loadViewer().catch(() => {});
}

export function TechPackProvider({ children }) {
  const { profile } = useAuth();
  const { pathname, search } = useLocation();
  const me = profile?.personId ? String(profile.personId) : null;
  // the Inventory page's own rule (Inventory or Library edit, and the Nepal staff role it has always let in)
  const isNepalStaff = profile?.appRole === "nepal_staff" || profile?.role === "nepal_staff";
  const canEdit = sectionCanEdit(profile, "inventory") || sectionCanEdit(profile, "library") || isNepalStaff;
  const canRead = sectionVisible(profile, "inventory") || sectionVisible(profile, "library") || sectionVisible(profile, "production");

  // { mode: "sheet" | "pages" | "edit", id, row, customer, preset, onSaved, onDeleted, error }
  const [shown, setShown] = useState(null);

  const openSheet = useCallback((ref) => {
    if (!ref?.id) return;
    setShown({ mode: "sheet", id: String(ref.id), row: null, customer: null, error: "" });
  }, []);
  const openPages = useCallback((ref) => {
    if (!ref?.id) return;
    setShown({ mode: "pages", id: String(ref.id), row: null, customer: null, error: "" });
  }, []);
  const openEditor = useCallback((ref = {}) => {
    setShown({
      mode: "edit", id: ref.id ? String(ref.id) : "", row: null, customer: null, error: "",
      preset: ref.presetCustomerId || "", onSaved: ref.onSaved, onDeleted: ref.onDeleted,
    });
  }, []);
  const close = useCallback(() => setShown(null), []);

  // Going to another page puts a sheet or the photographed pages away, and so does signing out. The EDITOR is put away only by signing out:
  // a page that changes its own address under it (a filter, a tab) must not throw away what is being typed, and Back must not either.
  useEffect(() => { setShown((s) => (s && s.mode === "edit" && me ? s : null)); }, [pathname, search, me]);

  // read the row (and who it is for) for whatever was asked to open
  const wantId = shown?.id || "";
  const loaded = Boolean(shown?.row);
  useEffect(() => {
    if (!wantId || loaded) return undefined;
    let alive = true;
    (async () => {
      try {
        const row = await fetchOne("patterns", wantId);
        if (!alive) return;
        if (!row) { setShown((s) => (s && s.id === wantId ? { ...s, error: "That tech pack is not there any more." } : s)); return; }
        let customer = null;
        if (row.customerId) customer = await fetchOne("customers", row.customerId).catch(() => null);
        if (alive) setShown((s) => (s && s.id === wantId ? { ...s, row, customer: customer ? { id: customer.id, name: customer.name } : null } : s));
      } catch (err) {
        console.error("Could not open the tech pack:", err);
        if (alive) setShown((s) => (s && s.id === wantId ? { ...s, error: "That tech pack could not be opened. Check the connection and try again." } : s));
      }
    })();
    return () => { alive = false; };
  }, [wantId, loaded]);

  const value = useMemo(
    () => ({
      openSheet: me && canRead ? openSheet : null,
      openPages: me && canRead ? openPages : null,
      openEditor: me && canEdit ? openEditor : null,
      warm,
    }),
    [me, canRead, canEdit, openSheet, openPages, openEditor],
  );

  const goEdit = useCallback((row) => setShown((s) => ({ ...(s || {}), mode: "edit", id: String(row.id), row, preset: "", onSaved: undefined, onDeleted: undefined })), []);
  const goPages = useCallback((row) => setShown((s) => ({ ...(s || {}), mode: "pages", id: String(row.id), row })), []);
  const saved = useCallback((row) => {
    const after = shown?.onSaved;
    setShown(null);
    if (after) after(row);
  }, [shown]);
  const deleted = useCallback(() => {
    const after = shown?.onDeleted;
    setShown(null);
    if (after) after();
  }, [shown]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {me && shown?.error && (
        <Modal title="Tech pack" size="sm" glass onClose={close} footer={<button type="button" className="primary-button" onClick={close}>OK</button>}>
          <p>{shown.error}</p>
        </Modal>
      )}
      {me && shown && !shown.error && (
        <Suspense fallback={null}>
          {shown.mode === "sheet" && shown.row && (
            <SheetViewer
              key={shown.id} row={shown.row} customer={shown.customer} onClose={close}
              onEdit={canEdit ? () => goEdit(shown.row) : undefined}
              onPages={() => goPages(shown.row)}      /* the viewer draws the button only when the pack has scanned pages */
            />
          )}
          {shown.mode === "pages" && shown.row && (
            <PagesViewer key={`p${shown.id}`} row={shown.row} customer={shown.customer} onClose={close} />
          )}
          {shown.mode === "edit" && (!shown.id || shown.row) && (
            <TechPackEditor
              key={shown.id || "new"} row={shown.row || null} presetCustomerId={shown.preset || ""}
              canEdit={canEdit} canCreateCustomer={sectionCanEdit(profile, "customers")}
              onSaved={saved} onDeleted={deleted} onClose={close}
            />
          )}
        </Suspense>
      )}
    </Ctx.Provider>
  );
}

/** `{ openSheet, openPages, openEditor }`: `openSheet({ id })` shows a tech pack's sheet; each is null while nobody is signed in or the position may not do it. */
export function useTechPack() {
  return useContext(Ctx);
}
