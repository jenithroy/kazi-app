import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Btn } from "./Btn";
import { Dialog } from "./Dialog";

/* ── Confirm ──────────────────────────────────────────── */

const ConfirmContext = createContext(null);

/**
 * Asks before something that cannot be taken back, in the app's own dialog
 * rather than the browser's.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({
 *     title: "Delete this expense?",
 *     message: "It is removed from the ledger too.",
 *     confirmLabel: "Delete expense",
 *     danger: true,
 *   }))) return;
 *
 * A plain string works as well: `await confirm("Delete this payroll record?")`.
 * Resolves true when confirmed, false when cancelled or dismissed.
 *
 * Replacing a window.confirm keeps its wording: the first sentence becomes
 * `title`, anything after it `message`. For a dangerous action focus starts on
 * Cancel, so a stray Enter does not delete anything.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm needs a <ConfirmProvider> above it (see main.jsx).");
  return ctx;
}

/** Mount once near the root. Renders the one confirm dialog the app uses. */
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolver = useRef(null);
  // Keeps the text on screen while the dialog animates closed.
  const shown = useRef({});

  const confirm = useCallback((options) => {
    const opts = typeof options === "string" ? { title: options } : options;
    resolver.current?.(false); // a second request replaces an unanswered first
    return new Promise((resolve) => {
      resolver.current = resolve;
      setRequest(opts);
    });
  }, []);

  const answer = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  };

  if (request) shown.current = request;
  const r = shown.current;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={Boolean(request)}
        onClose={() => answer(false)}
        size="sm"
        title={r.title || ""}
        description={r.message}
        footer={
          <>
            <Btn kind="secondary" onClick={() => answer(false)} data-autofocus={r.danger ? "" : undefined}>
              {r.cancelLabel || "Cancel"}
            </Btn>
            <Btn kind={r.danger ? "danger" : "primary"} onClick={() => answer(true)} data-autofocus={r.danger ? undefined : ""}>
              {r.confirmLabel || "Confirm"}
            </Btn>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}
