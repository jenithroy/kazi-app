/**
 * Small helpers for showing a person: their initials and their colour.
 *
 * Five pages each kept a copy of these, in two versions that hash a name to
 * different hues, so one person could wear a different colour on Tasks than on
 * Usage. Pages switch to this copy as they are redesigned.
 */

/** A stable hue (0–359) for `<Avatar hue>`. The same name gives the same colour everywhere. */
export function hueFromName(name = "") {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h % 360;
}

/** Up to two initials, "?" when there is no name to take them from. */
export function initials(name = "") {
  const letters = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return letters || "?";
}
