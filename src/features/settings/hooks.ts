import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "./api";

const SETTINGS_KEY = ["companySettings"];

export function useCompanySettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: api.fetchCompanySettings,
  });
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: api.CompanySettingsUpdate) => api.updateCompanySettings(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      // The clients feature's "new client" form seeds hourly_rate from
      // get_default_hourly_rate() — a change here should be visible there
      // on the next visit, not stuck behind that RPC's own 5-minute
      // staleTime (see lib/pickers.ts-adjacent hooks for the same pattern).
      void queryClient.invalidateQueries({ queryKey: ["company", "defaultHourlyRate"] });
      // The invoice preview panel's letterhead — same reasoning.
      void queryClient.invalidateQueries({ queryKey: ["companySettings", "letterhead"] });
    },
  });
}

export function useReplaceJmapSecret() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (secret: string) => api.replaceJmapSecret(secret),
    onSuccess: () => {
      // jmap_secret_id changes server-side (Vault write), so the "konfiguriert" badge needs a refetch.
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}
