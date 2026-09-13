import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "./api";

// Client/service-template pickers are shared with invoices — see
// lib/pickers.ts for why the hooks (not just the fetchers) live there.
export { useActiveClients, useClientById, usePickerClients, useServiceTemplates } from "@/lib/pickers";

const MONTH_KEY = ["timeEntries", "currentMonth"];

export function useTimeEntriesForCurrentMonth() {
  return useQuery({
    queryKey: MONTH_KEY,
    queryFn: api.fetchTimeEntriesForCurrentMonth,
  });
}

export function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: api.TimeEntryInsert) => api.createTimeEntry(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MONTH_KEY });
    },
  });
}

export function useUpdateTimeEntry(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: api.TimeEntryUpdate) => api.updateTimeEntry(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MONTH_KEY });
    },
  });
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteTimeEntry,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MONTH_KEY });
    },
  });
}
