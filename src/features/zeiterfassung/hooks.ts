import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "./api";

const MONTH_KEY = ["timeEntries", "currentMonth"];

export function useTimeEntriesForCurrentMonth() {
  return useQuery({
    queryKey: MONTH_KEY,
    queryFn: api.fetchTimeEntriesForCurrentMonth,
  });
}

export function useActiveClients() {
  return useQuery({
    queryKey: ["clients", "active"],
    queryFn: api.fetchActiveClients,
  });
}

/** Only enabled for a client id not already in the active list — see `usePickerClients`. */
export function useClientById(id: string | undefined) {
  return useQuery({
    queryKey: ["client", id],
    queryFn: () => api.fetchClientById(id!),
    enabled: !!id,
  });
}

export function useServiceTemplates() {
  return useQuery({
    queryKey: ["serviceTemplates"],
    queryFn: api.fetchServiceTemplates,
    staleTime: 5 * 60_000,
  });
}

/**
 * Active clients, plus `extraClientId`'s client merged in if it isn't
 * already active — so a picker always has a matching option even when
 * editing an entry whose client has since gone inactive. Ported from the
 * old app's `pickerClients` fallback in `TimeTrackingPage._editEntry`.
 */
export function usePickerClients(extraClientId: string | undefined) {
  const activeQuery = useActiveClients();
  const active = activeQuery.data ?? [];
  const needsExtra = !!extraClientId && !active.some((c) => c.id === extraClientId);
  const extraQuery = useClientById(needsExtra ? extraClientId : undefined);

  const clients = needsExtra && extraQuery.data ? [extraQuery.data, ...active] : active;
  return { clients, isPending: activeQuery.isPending || (needsExtra && extraQuery.isPending) };
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
