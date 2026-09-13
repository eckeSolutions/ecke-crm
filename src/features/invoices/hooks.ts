import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { InvoiceStatus } from "@/lib/invoiceStatus";
import { useActiveClients, useClientById, usePickerClients, useServiceTemplates } from "@/lib/pickers";

import * as api from "./api";
import type { InvoiceItemInsert } from "./api";
import { computeInvoiceTotal } from "./totals";

// Client/service-template pickers — shared with time tracking, see lib/pickers.ts.
export { useActiveClients, useClientById, usePickerClients, useServiceTemplates };

const LIST_KEY = ["invoices"];
const detailKey = (id: string) => ["invoice", id];

export function useInvoices() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: api.fetchInvoices,
  });
}

export function useClientAddress(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client", clientId, "address"],
    queryFn: () => api.fetchClientAddress(clientId!),
    enabled: !!clientId,
  });
}

export function useInvoiceDetail(id: string | undefined) {
  return useQuery({
    queryKey: detailKey(id ?? ""),
    queryFn: () => api.fetchInvoiceDetail(id!),
    enabled: !!id,
  });
}

export function useNextInvoiceNumberPreview() {
  return useQuery({
    queryKey: ["invoices", "nextNumberPreview"],
    queryFn: api.fetchNextInvoiceNumberPreview,
    // A preview only, and it can go stale the instant anyone else on the
    // (two-person) team saves an invoice — no point pretending this is
    // cacheable beyond avoiding a duplicate request on the same render.
    staleTime: 0,
  });
}

export function useUninvoicedTimeEntries(clientId: string | undefined) {
  return useQuery({
    queryKey: ["timeEntries", "uninvoiced", clientId],
    queryFn: () => api.fetchUninvoicedTimeEntries(clientId!),
    enabled: !!clientId,
  });
}

export function useLetterhead() {
  return useQuery({
    queryKey: ["companySettings", "letterhead"],
    queryFn: api.fetchLetterhead,
    staleTime: 5 * 60_000,
  });
}

export function useCreateDraftInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: api.InvoiceInsert) => api.createDraftInvoice(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

/**
 * Replaces an invoice's items and updates its stored total in one call —
 * the two writes the old app's `replaceInvoiceItems` repository method
 * made as a pair, kept paired here rather than left to two separate
 * mutation calls a caller could accidentally split apart.
 */
export function useSaveInvoiceItems(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (items: readonly Omit<InvoiceItemInsert, "invoice_id" | "sort_order">[]) => {
      const saved = await api.replaceInvoiceItems(invoiceId, items);
      await api.updateInvoiceTotal(invoiceId, computeInvoiceTotal(saved));
      return saved;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey(invoiceId) });
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      // Items just (un)linked some time_entries via sync_time_entry_invoiced()
      // (docs/DATABASE_SCHEMA.md §4) — the time-tracking feature's own cache doesn't know
      // that happened on its own.
      void queryClient.invalidateQueries({ queryKey: ["timeEntries"] });
    },
  });
}

export function useUpdateInvoiceMeta(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof api.updateInvoiceMeta>[1]) => api.updateInvoiceMeta(invoiceId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey(invoiceId) });
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

export function useUpdateInvoiceStatus(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: InvoiceStatus) => api.updateInvoiceStatus(invoiceId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey(invoiceId) });
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteInvoice,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      // A draft's items cascade-delete, reverting their time entries.
      void queryClient.invalidateQueries({ queryKey: ["timeEntries"] });
    },
  });
}

export function useGeneratePdf(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.generateInvoicePdf(invoiceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey(invoiceId) });
    },
  });
}
