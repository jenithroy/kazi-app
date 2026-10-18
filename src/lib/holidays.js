/**
 * Holidays: the days the office is closed besides the weekly Saturday (Dashain, Tihar, a strike ...).
 * One row is a run of days ("Dashain", 3 to 17 October) for one region, or for everyone. The table
 * is migration 0059; this file asks it questions and writes to it. The plain questions about a
 * holiday ("does it cover this day?") are in holidayDays.js, which has no database in it. Everything
 * here fails quietly into "not set up" when the table is not on the database yet, so the app can
 * ship before the migration is run.
 */
import { supabase } from "../supabase";

export { holidayOn, holidaySpan, holidayDays } from "./holidayDays";

/** True when the error just means the holidays table has not been added yet. */
export function holidaysNotSetUp(err) {
  const text = String(err?.message || err || "");
  return /does not exist|schema cache|could not find the table|PGRST205|42P01/i.test(text);
}

const day = (v) => String(v || "").slice(0, 10);
const fromRow = (r) => ({ id: r.id, name: r.name, start: day(r.start_date), end: day(r.end_date), region: r.region || "" });

/** Every holiday, soonest first: [{ id, name, start, end, region ("nepal" | "uk" | "" for everyone) }]. */
export async function fetchHolidays() {
  const { data, error } = await supabase.from("holidays").select("*").order("start_date", { ascending: true });
  if (error) throw error;
  return (data || []).map(fromRow);
}

/** Add one. `end` defaults to `start` (a single day); `region` "" means everyone. */
export async function addHoliday({ name, start, end, region }) {
  const { data, error } = await supabase
    .from("holidays")
    .insert({ name: String(name).trim(), start_date: start, end_date: end || start, region: region || null })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function removeHoliday(id) {
  const { error } = await supabase.from("holidays").delete().eq("id", id);
  if (error) throw error;
}
