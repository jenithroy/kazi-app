/**
 * What the editor's sections share. The card (Editor.jsx) owns the pack and the lists; each section reads them here instead of
 * taking a dozen props, and changes the pack through `set` (merge keys) or `update` (a function of the pack: use it whenever the
 * new value depends on the old one, as a dragged dot does many times a second).
 */
import { createContext, useContext } from "react";
import { enterAdvance } from "../finance/flow";

export const EditorCtx = createContext(null);
export const useEditor = () => useContext(EditorCtx);

/**
 * "Not saved: materials 2, 3. A material is kept once it has a name or a description. Finish them, or remove them." Said under a list
 * when a row has something typed in it that a Save would leave out (see `leftOutRows` in editorModel.js). Nothing when there is none.
 */
export function LeftOut({ noun, places, rule }) {
  if (!places || !places.length) return null;
  const one = places.length === 1;
  return (
    <p className="ec-note tpe-warn ec-wide" role="status">
      <b>Not saved: {noun}{one ? "" : "s"} {places.join(", ")}.</b> {rule} Finish {one ? "it" : "them"}, or remove {one ? "it" : "them"}.
    </p>
  );
}

/**
 * Wrap a section's fields: Enter in a one-line box goes to the next field, the way the Finance cards work, and Ctrl + Enter saves from
 * anywhere. Enter in the LAST field of a section does nothing: this card has seven sections, so that box is not the end of the form, and a
 * key that saves and closes the card from the middle of a tech pack would throw the rest of the work in at the deep end. A text area keeps
 * Enter as a new line. `display: contents`, so the fields still sit in the card's grid.
 */
export function Flow({ children }) {
  return (
    <div
      className="tpe-flow"
      onKeyDown={(e) => enterAdvance(e, () => { if (e.ctrlKey || e.metaKey) e.target.closest("form")?.requestSubmit(); })}
    >
      {children}
    </div>
  );
}
