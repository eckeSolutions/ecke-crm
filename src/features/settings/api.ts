import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

export type CompanySettings = Database["public"]["Tables"]["company_settings"]["Row"];
export type CompanySettingsUpdate = Database["public"]["Tables"]["company_settings"]["Update"];

/** `company_settings` SELECT is admin-only RLS (docs/DATABASE_SCHEMA.md §6) — the route itself is already `RequireAdmin`-gated, so a non-admin never reaches this call. */
export async function fetchCompanySettings(): Promise<CompanySettings> {
  const { data, error } = await supabase.from("company_settings").select("*").eq("id", true).single();
  if (error) throw error;
  return data;
}

/** Partial update — each card sends only the fields it owns, never the whole row (see schema.ts's header comment). */
export async function updateCompanySettings(data: CompanySettingsUpdate): Promise<CompanySettings> {
  const { data: row, error } = await supabase.from("company_settings").update(data).eq("id", true).select().single();
  if (error) throw error;
  return row;
}

/**
 * The client can never write `jmap_secret_id`/the Vault secret directly —
 * RLS and the architecture both forbid it (only a `service_role` Edge
 * Function may touch `vault.decrypted_secrets`/`vault.create_secret`/
 * `vault.update_secret`). `set-jmap-secret` re-checks admin status itself
 * from the caller's own JWT, so this is real defense in depth, not just a
 * client-side gate.
 */
export async function replaceJmapSecret(secret: string): Promise<void> {
  const { error } = await supabase.functions.invoke("set-jmap-secret", { body: { secret } });
  if (error) throw error;
}
