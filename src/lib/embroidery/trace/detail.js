/**
 * How much detail the tracer keeps. The page has one slider, "Detail" (0 simple ... 1 detailed), and it means different things for
 * different pictures: a logo is a few flat colours and its small shapes are mostly specks and noise, while a portrait's small shapes
 * are its eyes, brows and wrinkles, which is what makes it look like the person. So a portrait or a photograph is traced with more
 * detail than a logo at the same setting.
 */

/** The detail slider (0 simple ... 1 detailed) as the tracer's size limits (millimetres). */
export function detailLimits(detail) {
  const d = Math.max(0, Math.min(1, detail));
  return { minFeatureMm: 1.3 - 1.0 * d, minAreaMm2: 2.2 - 1.9 * d, simplifyMm: 0.08 - 0.05 * d };
}

/** How far up the slider a portrait or a photograph is read (at "Balanced" it gets the detail of "Detailed"). */
export const PHOTO_DETAIL_BOOST = 0.5;

/** The size limits for this kind of picture ("logo" | "art" | "photo") at this slider setting. */
export function limitsFor(kind, detail) {
  return detailLimits(kind === "logo" ? detail : Math.min(1, detail + PHOTO_DETAIL_BOOST));
}
