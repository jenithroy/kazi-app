/**
 * A phone shows only the first rows of a long list until "Show all" is pressed, and narrowing the list by anything (a search, a filter, the
 * view) puts that cap back. `key` is any string that changes when the list is narrowed to something else; the page builds it from what
 * narrows the list.
 *
 *   const [showAll, showAllNow] = useShowAll(`${query}|${JSON.stringify(filters.values)}`);
 *
 * The cap comes back for good when the key changes: the key going back to an earlier value later does not lift it again.
 */
import { useState } from "react";

export default function useShowAll(key) {
  const [state, setState] = useState({ key, all: false });
  // the list was narrowed to something else: the cap is back (React allows state to be adjusted while the component renders)
  if (state.key !== key) setState({ key, all: false });
  return [state.key === key && state.all, () => setState({ key, all: true })];
}
