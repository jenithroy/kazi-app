/**
 * Which columns of a tech pack a LIST needs.
 *
 * The photographs of an older (paper) tech pack and its two sketches are kept INSIDE the row, as pictures written out in text
 * (`data:image/...`): 2 MB for the 32 packs there are, while every other table together is about 1 MB. A list that reads the
 * whole table to show names therefore downloads those pictures too, on every visit. So a list (the order form's picker, the
 * customer's card, the editor's "next reference") reads PACK_LIST_COLUMNS, which is every column except those three, and the
 * Tech packs tab asks for PACK_PICTURE_COLUMNS once it is opened. One pack is always read whole (`fetchOne`) when it is opened.
 *
 * The list is the schema map's own, so a column added to `patterns` later is in it without anyone remembering to add it here.
 */
import { SCHEMA_MAP } from "./schemaMap";

const PICTURES = ["tech_pack_images", "frontSketchUrl", "backSketchUrl"];

/** Every `fs_patterns` column but the three that hold whole pictures, as `select=` wants it. */
export const PACK_LIST_COLUMNS = Object.keys(SCHEMA_MAP.patterns.fields).filter((k) => !PICTURES.includes(k)).join(",");

/** The three picture columns, with the id to put each back on its pack. */
export const PACK_PICTURE_COLUMNS = ["id", ...PICTURES].join(",");
