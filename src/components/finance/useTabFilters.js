/**
 * A Finance tab's own filters, declared once and drawn in the Filters panel. This was written here first; the engine is now shared by every
 * page that has a Filters button (components/filters/useFilters.js: read its header for what a filter can be).
 */
export { default, computeFilters, offOf, rangeText, datesText } from "../filters/useFilters";
