import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "./api";

const MONTH_KEY = ["ledgerEntries", "currentMonth"];

export function useLedgerEntriesForCurrentMonth() {
  return useQuery({
    queryKey: MONTH_KEY,
    queryFn: api.fetchLedgerEntriesForCurrentMonth,
  });
}

export function useCreateLedgerEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: api.LedgerEntryInsert) => api.createLedgerEntry(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MONTH_KEY });
    },
  });
}

export function useUpdateLedgerEntry(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: api.LedgerEntryUpdate) => api.updateLedgerEntry(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MONTH_KEY });
    },
  });
}

export function useDeleteLedgerEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteLedgerEntry,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MONTH_KEY });
    },
  });
}
