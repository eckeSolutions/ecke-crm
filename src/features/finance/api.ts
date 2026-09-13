import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

export type LedgerEntry = Database["public"]["Tables"]["ledger_entries"]["Row"];
export type LedgerEntryInsert = Database["public"]["Tables"]["ledger_entries"]["Insert"];
export type LedgerEntryUpdate = Database["public"]["Tables"]["ledger_entries"]["Update"];

/** RLS already scopes this to the caller's own rows unless admin (docs/DATABASE_SCHEMA.md §6); there's no month picker, same as the time-tracking feature's `fetchTimeEntriesForCurrentMonth` and the old app's `LedgerCubit.load()`, which always used `DateTime.now()`. */
export async function fetchLedgerEntriesForCurrentMonth(): Promise<LedgerEntry[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("*")
    .gte("entry_date", toDateOnly(start))
    .lt("entry_date", toDateOnly(end))
    .order("entry_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createLedgerEntry(data: LedgerEntryInsert): Promise<LedgerEntry> {
  const { data: row, error } = await supabase.from("ledger_entries").insert(data).select().single();
  if (error) throw error;
  return row;
}

export async function updateLedgerEntry(id: string, data: LedgerEntryUpdate): Promise<LedgerEntry> {
  const { data: row, error } = await supabase.from("ledger_entries").update(data).eq("id", id).select().single();
  if (error) throw error;
  return row;
}

export async function deleteLedgerEntry(id: string): Promise<void> {
  const { error } = await supabase.from("ledger_entries").delete().eq("id", id);
  if (error) throw error;
}
