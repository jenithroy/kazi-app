/**
 * Undo and redo for the design. The design is never changed in place, so a history is just a list of the designs there
 * have been. A drag (moving, scaling, typing a number) shows its result as it goes without filling the history: begin(),
 * then live(design) any number of times, then end() makes the whole drag ONE step.
 */
export function createHistory(initial, limit = 120) {
  let present = initial;
  let past = [];
  let future = [];
  let dragStart = null;

  /** Close the drag: records one step if the design is not what it was when the drag began. */
  function close() {
    if (dragStart === null) return false;
    const changed = present !== dragStart;
    if (changed) { past.push(dragStart); if (past.length > limit) past.shift(); future = []; }
    dragStart = null;
    return changed;
  }

  return {
    get present() { return present; },
    /** Is a drag (begin... end) in progress? */
    get dragging() { return dragStart !== null; },
    get canUndo() { return past.length > 0 && dragStart === null; },
    get canRedo() { return future.length > 0 && dragStart === null; },

    /** A finished change: one step (a drag still open is closed first, so the steps stay in the order they happened). Returns true when something changed. */
    commit(next) {
      close();
      const value = typeof next === "function" ? next(present) : next;
      if (value === present) return false;
      past.push(present);
      if (past.length > limit) past.shift();
      future = [];
      present = value;
      return true;
    },

    begin() { if (dragStart === null) dragStart = present; },
    /** Show a result without recording it. */
    live(next) { present = typeof next === "function" ? next(present) : next; },
    end: close,
    /** Put the design back as it was when the drag began (Escape in the middle of a drag). */
    cancel() { if (dragStart !== null) { present = dragStart; dragStart = null; } },

    undo() {
      if (dragStart !== null || !past.length) return false;
      future.push(present);
      present = past.pop();
      return true;
    },
    redo() {
      if (dragStart !== null || !future.length) return false;
      past.push(present);
      present = future.pop();
      return true;
    },
    /**
     * Change every design the history holds (this one, the ones before and the ones after) with the same function, without
     * making a step. For an answer that arrives late and belongs to every state with the same input (the letters drawn for
     * some text): undoing and redoing then never show words with the wrong letters. `fn` must give back the design it was
     * given when there is nothing to change.
     */
    patchAll(fn) {
      present = fn(present);
      past = past.map(fn);
      future = future.map(fn);
      if (dragStart !== null) dragStart = fn(dragStart);
    },
    /** Replace everything (opening a file, a new design): the history starts again. */
    reset(next) { present = next; past = []; future = []; dragStart = null; },
  };
}
