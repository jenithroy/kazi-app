import { useCallback, useEffect, useRef, useState } from "react";
import { useFin } from "../FinanceContext";

/**
 * The record that was just added: `[key, flash]`. Give `key` to the table's `flashKey` (it tints that row and brings it into
 * view, once the list has been read again and the row is in it: DataTable times the tint from then) and `flash` to the row of
 * fields as `onSaved`. The key is only kept long enough for a slow reload, then let go (a record that never arrives, one dated outside the
 * period, must not be waited for for ever).
 */
export default function useFlash(ms = 30000) {
  const [key, setKey] = useState(null);
  const timer = useRef(0);
  const flash = useCallback((id) => {
    clearTimeout(timer.current);
    if (id == null) { setKey(null); return; }
    setKey(id);
    timer.current = setTimeout(() => setKey(null), ms);
  }, [ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [key, flash];
}

/**
 * A record that was just added and is not in the list because of the search box or a filter is said so, the way one dated outside the
 * period is (useOutsideNote): otherwise "Saved" is followed by a list that has not changed, which reads as "it did not save".
 * `all` is the list the tab starts from (the period and the side of the business already applied), `shown` what is left after the search
 * and the filters. The record is only looked for once the list has been read again with it in; a record outside the period never is in
 * `all`, and has been spoken for already.
 */
export function useHiddenNote(fresh, all, shown, keyOf = (r) => r.id) {
  const { notify } = useFin();
  const told = useRef(null);
  useEffect(() => {
    if (fresh == null || told.current === fresh) return;
    if (!all.some((r) => keyOf(r) === fresh)) return;
    told.current = fresh;
    if (!shown.some((r) => keyOf(r) === fresh)) notify("Saved. Your search or a filter hides it, so it is not in this list. Clear them to see it.", "warn");
  }, [fresh, all, shown]);   // eslint-disable-line react-hooks/exhaustive-deps
}
