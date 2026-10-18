/**
 * A question that waits for its answer, in the glass dialog's own look (finance/ConfirmDialog.jsx):
 *
 *   const [asking, ask] = useAsk();
 *   …
 *   if (!(await ask({ title: "Cancel this document?", body: <p>The record will be kept.</p>, confirmLabel: "Cancel it" }))) return;
 *   …
 *   return <>…{asking}</>;
 *
 * It replaces window.confirm, which a page in this look does not use. The dialog can sit over an open card (the card stays where it is,
 * and what was typed in it with it).
 */
import { useCallback, useRef, useState } from "react";
import ConfirmDialog from "../finance/ConfirmDialog";

export default function useAsk() {
  const [question, setQuestion] = useState(null);
  const resolver = useRef(null);

  const ask = useCallback((config) => new Promise((resolve) => {
    resolver.current?.(false);                       // a question still open is answered "no" by the one that replaces it
    resolver.current = resolve;
    setQuestion({ ...config, resolve });
  }), []);

  // Each dialog answers only its own question: the dialog calls onCancel once more after a confirm, and by then the caller may already have
  // asked the next question, which that stale call must not answer "no".
  const answer = (resolve, yes) => {
    if (resolver.current !== resolve) return;
    resolver.current = null;
    setQuestion(null);
    resolve(yes);
  };

  const node = question ? (
    <ConfirmDialog
      title={question.title} confirmLabel={question.confirmLabel || "Yes"} danger={question.danger}
      onCancel={() => answer(question.resolve, false)} onConfirm={async () => { answer(question.resolve, true); }}
    >
      {question.body}
    </ConfirmDialog>
  ) : null;

  return [node, ask];
}
