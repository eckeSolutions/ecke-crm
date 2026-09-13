import { useQuery } from "@tanstack/react-query";

import { supabase } from "./supabase";
import type { Database } from "./database.types";

/**
 * Fetchers AND hooks backing the small "pick a client" / "pick a service
 * template" controls that show up in more than one feature —
 * Zeiterfassung's start-timer and manual-entry modals, Rechnungen's
 * new-invoice and add-item flows. Lives here (not in either feature's own
 * `api.ts`/`hooks.ts`) per CLAUDE.md's "more than one feature needs it"
 * rule: Rechnungen became the second consumer of exactly these queries.
 * The hooks live alongside the fetchers, not just the fetchers, so the
 * query *keys* stay in one place too — `lib/queryClient.ts` already
 * establishes that `lib/` isn't React-hook-free, and two features quietly
 * retyping `["clients", "active"]` themselves is exactly the kind of
 * drift this file exists to prevent.
 */

export type ActiveClient = Pick<Database["public"]["Tables"]["clients"]["Row"], "id" | "name" | "hourly_rate">;
export type ServiceTemplate = Database["public"]["Tables"]["service_templates"]["Row"];

/** `status = 'active'` only, same as the old app's `getActiveClients()`. */
export async function fetchActiveClients(): Promise<ActiveClient[]> {
  const { data, error } = await supabase.from("clients").select("id, name, hourly_rate").eq("status", "active").order("name");
  if (error) throw error;
  return data;
}

/** A client that may since have gone inactive (or been renamed) but is still some existing row's own client — merged into a picker list so editing that row always has a matching option, same reasoning as the old app's `pickerClients`. */
export async function fetchClientById(id: string): Promise<ActiveClient | null> {
  const { data, error } = await supabase.from("clients").select("id, name, hourly_rate").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Quick-fill description/line-item chips — unfiltered, same as the old app's `getServiceTemplates()`. */
export async function fetchServiceTemplates(): Promise<ServiceTemplate[]> {
  const { data, error } = await supabase.from("service_templates").select("*").order("title");
  if (error) throw error;
  return data;
}

export function useActiveClients() {
  return useQuery({
    queryKey: ["clients", "active"],
    queryFn: fetchActiveClients,
  });
}

/** Only enabled for a client id not already in the active list — see `usePickerClients`. */
export function useClientById(id: string | undefined) {
  return useQuery({
    queryKey: ["client", id],
    queryFn: () => fetchClientById(id!),
    enabled: !!id,
  });
}

export function useServiceTemplates() {
  return useQuery({
    queryKey: ["serviceTemplates"],
    queryFn: fetchServiceTemplates,
    staleTime: 5 * 60_000,
  });
}

/**
 * Active clients, plus `extraClientId`'s client merged in if it isn't
 * already active — so a picker always has a matching option even when
 * editing a row whose client has since gone inactive. Ported from the old
 * app's `pickerClients` fallback in `TimeTrackingPage._editEntry`.
 */
export function usePickerClients(extraClientId: string | undefined) {
  const activeQuery = useActiveClients();
  const active = activeQuery.data ?? [];
  const needsExtra = !!extraClientId && !active.some((c) => c.id === extraClientId);
  const extraQuery = useClientById(needsExtra ? extraClientId : undefined);

  const clients = needsExtra && extraQuery.data ? [extraQuery.data, ...active] : active;
  return { clients, isPending: activeQuery.isPending || (needsExtra && extraQuery.isPending) };
}
