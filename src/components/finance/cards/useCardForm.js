import { useCallback, useRef, useState } from "react";

/**
 * The form a card edits, and whether it has been changed since it was opened (or last saved and cleared).
 * `set` takes a patch or a function of the form; `reset` puts a new form in and makes *that* the clean one, which is what
 * "Save and add another" does.
 */
export default function useCardForm(initial) {
  const [form, setForm] = useState(initial);            // `initial` may be a function, as with useState
  const clean = useRef(null);
  if (clean.current === null) clean.current = JSON.stringify(form);

  const set = useCallback((patch) => setForm((f) => ({ ...f, ...(typeof patch === "function" ? patch(f) : patch) })), []);
  const reset = useCallback((next) => { clean.current = JSON.stringify(next); setForm(next); }, []);
  const dirty = JSON.stringify(form) !== clean.current;

  return { form, set, setForm, reset, dirty };
}
