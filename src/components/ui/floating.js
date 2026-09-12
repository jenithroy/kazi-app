/**
 * Where a floating box goes next to the thing that opened it.
 *
 * Below the anchor by default, flipped above when there is no room, and always
 * inside the window. Menus and popovers render at the end of <body>, so a card
 * or a table scroller cannot clip them.
 */
export function placeFloating(anchor, floating, { align = "end", gap = 4, margin = 8 } = {}) {
  const a = anchor.getBoundingClientRect();
  const w = floating.offsetWidth;
  const h = floating.offsetHeight;

  let top = a.bottom + gap;
  if (top + h > window.innerHeight - margin && a.top - gap - h > margin) top = a.top - gap - h;

  let left = align === "end" ? a.right - w : align === "center" ? a.left + a.width / 2 - w / 2 : a.left;
  left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - w - margin));

  return { top: Math.round(top), left: Math.round(left) };
}
