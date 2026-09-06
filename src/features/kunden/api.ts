import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
export type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"];
export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type ContactInsert = Database["public"]["Tables"]["contacts"]["Insert"];
export type ContactUpdate = Database["public"]["Tables"]["contacts"]["Update"];
export type ClientInvoice = Database["public"]["Tables"]["invoices"]["Row"];
export type ClientTimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

/** Ported from the old app's ContactsRemoteDataSource.fetchClients. */
export async function fetchClients(searchQuery?: string): Promise<Client[]> {
  let query = supabase.from("clients").select("*");
  const q = searchQuery?.trim();
  if (q) {
    query = query.or(`name.ilike.%${q}%,client_number.ilike.%${q}%,city.ilike.%${q}%`);
  }
  const { data, error } = await query.order("name");
  if (error) throw error;
  return data;
}

/** Distinct client ids with at least one `sent` ("Offen") invoice — for the "Mit offenen Rechnungen" filter. */
export async function fetchClientIdsWithOpenInvoices(): Promise<Set<string>> {
  const { data, error } = await supabase.from("invoices").select("client_id").eq("status", "sent");
  if (error) throw error;
  return new Set(data.map((row) => row.client_id));
}

export async function fetchClientById(id: string): Promise<Client> {
  const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createClient(data: ClientInsert): Promise<Client> {
  const { data: row, error } = await supabase.from("clients").insert(data).select().single();
  if (error) throw error;
  return row;
}

export async function updateClient(id: string, data: ClientUpdate): Promise<Client> {
  const { data: row, error } = await supabase.from("clients").update(data).eq("id", id).select().single();
  if (error) throw error;
  return row;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}

/** Company default hourly rate (`get_default_hourly_rate()` RPC) — company_settings is admin-only, this is how an employee reaches it when creating a client. */
export async function fetchDefaultHourlyRate(): Promise<number> {
  const { data, error } = await supabase.rpc("get_default_hourly_rate");
  if (error) throw error;
  return data ?? 0;
}

/** Most recent invoices for a client, newest first — bounded the same way the old app bounded it (a year of typical activity). */
export async function fetchInvoicesForClient(clientId: string, limit = 100): Promise<ClientInvoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("client_id", clientId)
    .order("date_issued", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/** Time entries for a client since a given ISO timestamp, newest first. */
export async function fetchTimeEntriesForClient(clientId: string, sinceIso: string): Promise<ClientTimeEntry[]> {
  const { data, error } = await supabase
    .from("time_entries")
    .select("*")
    .eq("client_id", clientId)
    .gte("start_time", sinceIso)
    .order("start_time", { ascending: false });
  if (error) throw error;
  return data;
}

// -- Contacts (individual people at a client) — new surface, no Flutter UI ever existed. --

export async function fetchContacts(clientId: string): Promise<Contact[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("client_id", clientId)
    .order("first_name");
  if (error) throw error;
  return data;
}

export async function createContact(data: ContactInsert): Promise<Contact> {
  const { data: row, error } = await supabase.from("contacts").insert(data).select().single();
  if (error) throw error;
  return row;
}

export async function updateContact(id: string, data: ContactUpdate): Promise<Contact> {
  const { data: row, error } = await supabase.from("contacts").update(data).eq("id", id).select().single();
  if (error) throw error;
  return row;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) throw error;
}
