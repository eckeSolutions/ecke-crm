import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

export type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];
export type TimeEntryInsert = Database["public"]["Tables"]["time_entries"]["Insert"];
export type TimeEntryUpdate = Database["public"]["Tables"]["time_entries"]["Update"];
export type { ActiveClient, ServiceTemplate } from "@/lib/pickers";

/**
 * A time entry joined with its client's display name — `time_entries`
 * itself only stores `client_id` (docs/DATABASE_SCHEMA.md §5), and every
 * list here needs the name to render. Ported from the old app's
 * `TimeEntryWithClient`, but as an embedded-resource select rather than a
 * repository-side join — `supabase-js` doesn't type embedded resources
 * from the generated `Database` type on its own, hence the manual
 * intersection here.
 */
export type TimeEntryWithClient = TimeEntry & { clients: { name: string } | null };

/** All entries for the caller's current calendar month — RLS already scopes this to the caller's own rows unless admin (docs/DATABASE_SCHEMA.md §6); there's no month picker, matching the old app's `TimeTrackingCubit.load()`, which always used `DateTime.now()`. */
export async function fetchTimeEntriesForCurrentMonth(): Promise<TimeEntryWithClient[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const { data, error } = await supabase
    .from("time_entries")
    .select("*, clients(name)")
    .gte("start_time", start.toISOString())
    .lt("start_time", end.toISOString())
    .order("start_time", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTimeEntry(data: TimeEntryInsert): Promise<TimeEntry> {
  const { data: row, error } = await supabase.from("time_entries").insert(data).select().single();
  if (error) throw error;
  return row;
}

export async function updateTimeEntry(id: string, data: TimeEntryUpdate): Promise<TimeEntry> {
  const { data: row, error } = await supabase.from("time_entries").update(data).eq("id", id).select().single();
  if (error) throw error;
  return row;
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const { error } = await supabase.from("time_entries").delete().eq("id", id);
  if (error) throw error;
}
