/**
 * Arrow-key movement for a tablist or a radiogroup: the selected item is the
 * only one in the Tab order, and the arrows (plus Home and End) move the
 * selection and focus together. Each item carries `data-value`.
 *
 *   values    the enabled values, in order
 *   current   the selected value
 *   onSelect  called with the value to select
 *   axis      "x" for a tab bar (Left/Right only, so Up/Down still scroll
 *             the page), "both" for a radiogroup
 */
export function handleRovingKeys(e, { values, current, onSelect, axis = "x" }) {
  if (!values.length) return;
  const prev = e.key === "ArrowLeft" || (axis === "both" && e.key === "ArrowUp");
  const next = e.key === "ArrowRight" || (axis === "both" && e.key === "ArrowDown");
  const index = values.indexOf(current);

  let target;
  if (prev) target = index <= 0 ? values.length - 1 : index - 1;
  else if (next) target = index === -1 || index === values.length - 1 ? 0 : index + 1;
  else if (e.key === "Home") target = 0;
  else if (e.key === "End") target = values.length - 1;
  else return;

  e.preventDefault();
  const value = values[target];
  onSelect(value);
  const selector = `[data-value="${CSS.escape(String(value))}"]`;
  e.currentTarget.querySelector(selector)?.focus();
}
