/**
 * UK / Nepal.
 *
 * The business runs two arms, and almost every page shows one of them at a
 * time. A record says which side it belongs to through a `region` field
 * ("uk" or "nepal"), and the switch in each page header decides which side is
 * on screen.
 *
 * The one rule worth stating plainly: a record with no region set shows under
 * BOTH switches. Everything that existed before regions did is untagged, and
 * hiding it would have made half the company's data vanish on deploy. Tag a
 * row and it moves to that side alone; leave it and it stays in view on both,
 * which is the honest reading of "nobody has said yet".
 */

export const REGIONS = [
  { id: "nepal", label: "Nepal", short: "NP", flag: "🇳🇵" },
  { id: "uk", label: "UK", short: "UK", flag: "🇬🇧" },
];

export const REGION_IDS = REGIONS.map((r) => r.id);

export const DEFAULT_REGION = "nepal";

export const STORAGE_KEY = "kazi.region";

/** The record for a region id, falling back to the default rather than undefined. */
export function regionMeta(id) {
  return REGIONS.find((r) => r.id === id) || REGIONS.find((r) => r.id === DEFAULT_REGION);
}

export const regionLabel = (id) => regionMeta(id).label;

/** Normalise anything that might be a region into "uk", "nepal", or "" for untagged. */
export function normaliseRegion(value) {
  if (!value) return "";
  const v = String(value).trim().toLowerCase();
  if (v === "uk" || v === "gb" || v === "united kingdom" || v === "britain") return "uk";
  if (v === "nepal" || v === "np" || v === "np-ktm" || v === "kathmandu") return "nepal";
  return "";
}

/** Is this row on screen when `region` is selected? Untagged rows always are. */
export function inRegion(row, region) {
  const rowRegion = normaliseRegion(row?.region);
  return !rowRegion || rowRegion === region;
}

/** Keep the rows belonging to `region`, plus the untagged ones. */
export function filterByRegion(rows, region) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => inRegion(row, region));
}

/**
 * The same test, against some other field that already answers the question.
 *
 * Tech packs are the case in point: a pattern has always carried a `market`
 * ("UK" / "Nepal"), which is exactly the split the switch asks about. Giving
 * them a second `region` alongside it would be two fields to keep in step and
 * one more thing to get wrong, so the Tech Packs tab reads `market` instead.
 */
export function inRegionBy(row, region, field) {
  const value = normaliseRegion(row?.[field]);
  return !value || value === region;
}

export function filterByRegionField(rows, region, field) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => inRegionBy(row, region, field));
}

/** How many rows have nothing in `field` that names a region. */
export function countUntaggedBy(rows, field) {
  return Array.isArray(rows) ? rows.filter((r) => !normaliseRegion(r?.[field])).length : 0;
}

/** Only the rows explicitly tagged to `region` — no untagged. Use for totals that must not double-count. */
export function filterByRegionStrict(rows, region) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => normaliseRegion(row?.region) === region);
}

/** Stamp a region onto a document about to be written, unless it already carries one. */
export function withRegion(data, region) {
  return { ...data, region: normaliseRegion(data?.region) || region };
}

/** True when nobody has assigned this row to a region yet. */
export const isUntagged = (row) => !normaliseRegion(row?.region);

/** How many of these rows still need tagging — drives the "n untagged" hint. */
export function countUntagged(rows) {
  return Array.isArray(rows) ? rows.filter(isUntagged).length : 0;
}

/**
 * Region-filter every array in a `loadCollections()` result at once.
 *
 * The dashboards pull a dozen collections in one call and then read them by
 * name. Filtering the whole bag here means the switch reaches every panel
 * without a dozen separate memos that could each be forgotten.
 */
export function filterCollections(collections, region) {
  const out = {};
  for (const [key, value] of Object.entries(collections || {})) {
    out[key] = Array.isArray(value) ? filterByRegion(value, region) : value;
  }
  return out;
}
