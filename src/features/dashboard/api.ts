import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

/**
 * A thin, feature-local set of queries against `invoices`/`time_entries`/
 * `clients` rather than importing another feature's `api.ts` — mirrors the
 * old app's `DashboardRemoteDataSource`, which existed for the same
 * no-cross-feature-imports reason. RLS already scopes every row to the
 * caller unless admin (docs/DATABASE_SCHEMA.md §6); nothing dashboard-
 * specific happens here.
 */
export type DashboardInvoiceRow = Pick<
  Database["public"]["Tables"]["invoices"]["Row"],
  "invoice_number" | "date_issued" | "total_amount" | "status" | "created_at"
> & { clients: { name: string } | null };

export type DashboardTimeEntryRow = Pick<Database["public"]["Tables"]["time_entries"]["Row"], "duration_minutes" | "start_time" | "end_time">;

export type DashboardBirthdayClient = Pick<Database["public"]["Tables"]["clients"]["Row"], "name" | "client_number" | "birthday">;

/** `date_issued`/`total_amount`/`status` plus the client name — enough to compute every dashboard metric client-side. */
export async function fetchInvoicesForDashboard(): Promise<DashboardInvoiceRow[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("invoice_number, date_issued, total_amount, status, created_at, clients(name)")
    .order("date_issued", { ascending: false });
  if (error) throw error;
  return data;
}

/** Every entry starting within the given month (first-of-month `Date`, any day/time). */
export async function fetchTimeEntriesForMonth(monthStart: Date): Promise<DashboardTimeEntryRow[]> {
  const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const { data, error } = await supabase
    .from("time_entries")
    .select("duration_minutes, start_time, end_time")
    .gte("start_time", start.toISOString())
    .lt("start_time", end.toISOString());
  if (error) throw error;
  return data;
}

export async function fetchClientsWithBirthday(): Promise<DashboardBirthdayClient[]> {
  const { data, error } = await supabase.from("clients").select("name, client_number, birthday").not("birthday", "is", null);
  if (error) throw error;
  return data;
}
