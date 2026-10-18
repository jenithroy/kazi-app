/**
 * Keyboard-first data entry for the finance cards: Enter in a field moves to the next one, and Enter in the last field saves.
 *
 * This is the old forms' Enter-to-advance (focusNextOnEnter and KeyboardSelect), for the glass dropdown, the date picker and the
 * short choices. An accountant types a bill straight through without reaching for the mouse: type, Enter, type, Enter. A dropdown
 * is a button, so Enter on it opens its list (as it must); once a choice is made, focus moves on by itself (`advance`). A short
 * choice (Cash | Bank | Credit) is a radio group: the arrow keys change it and Enter moves on.
 */

const FIELDS = [
  'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([disabled])',
  "button.ksel:not([disabled])",
  'textarea[data-enter="next"]:not([disabled])',
  "button.kdp-trigger:not([disabled])",
  '.ec-seg [role="radio"][aria-checked="true"]:not([disabled])',
  "[data-flow]:not([disabled])",
].join(", ");

const visible = (el) => el.offsetParent !== null || el === document.activeElement;

export function fieldsIn(root) {
  return [...root.querySelectorAll(FIELDS)].filter(visible);
}

/** Move focus to the field after `from`: "moved", "last" (it was the last one) or "unknown" (it is not one of the fields). */
export function focusAfter(from, root) {
  const scope = root || from.closest("form") || document;
  const all = fieldsIn(scope);
  const at = all.indexOf(from);
  if (at < 0) return "unknown";
  const next = all[at + 1];
  if (!next) return "last";
  next.focus();
  return "moved";
}

/**
 * onKeyDown for the wrappers around a card's fields. Enter in a text or number input, or on a short choice, goes to the next field;
 * in the last one it calls `onLast` (save). Enter in a button or a list is left alone, and so is Enter in a textarea unless it opts in with
 * data-enter="next" (an address, a line of a bill: Enter moves on, Shift + Enter is a new line).
 */
export function enterAdvance(e, onLast) {
  if (e.key !== "Enter" || e.defaultPrevented || e.shiftKey || e.altKey) return;
  // Ctrl (or Cmd) + Enter is "I am done" from any field: the same as Enter in the last one (a card that handles it itself has already claimed the key)
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); onLast?.(); return; }
  const t = e.target;
  const choice = t.matches?.('[role="radio"]');
  // a text area is a place to type lines, so Enter there is a new line unless it says it is a one-or-two line field (data-enter="next"); Shift + Enter is always a new line
  const textNext = t.tagName === "TEXTAREA" && t.dataset.enter === "next";
  if (!choice && !textNext && (t.tagName !== "INPUT" || ["checkbox", "file", "radio", "submit", "button"].includes(t.type))) return;
  e.preventDefault();
  // a choice that has just been changed is the chosen part by the time the next key arrives; if not yet, go on from the chosen one
  const from = choice ? (t.closest(".ec-seg")?.querySelector('[aria-checked="true"]') || t) : t;
  const where = focusAfter(from, t.closest("form"));
  if (where === "last") onLast?.();
}

/** After a dropdown or the date picker takes a choice it puts focus back on its button; step on from there. */
export function advance() {
  requestAnimationFrame(() => {
    const el = document.activeElement;
    if (el && el !== document.body && el.closest("form")) focusAfter(el, el.closest("form"));
  });
}

/** Wrap an onChange so that making the choice also moves on to the next field. */
export const thenAdvance = (onChange) => (v) => { onChange(v); advance(); };

/** Focus the first field of a card once it is on screen (or the one `selector` names). */
export function focusFirst(root, selector) {
  requestAnimationFrame(() => {
    const el = (selector && root?.querySelector(selector)) || (root && fieldsIn(root)[0]);
    el?.focus({ preventScroll: true });
  });
}
