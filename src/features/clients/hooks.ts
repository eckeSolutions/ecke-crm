import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "./api";
import { computeClientDetailStats } from "./clientDetailStats";
import type { ClientFormValues, ContactFormValues } from "./schema";

export function useClients(searchQuery: string) {
  return useQuery({
    queryKey: ["clients", { searchQuery }],
    queryFn: () => api.fetchClients(searchQuery),
  });
}

export function useClientIdsWithOpenInvoices() {
  return useQuery({
    queryKey: ["clients", "openInvoiceIds"],
    queryFn: api.fetchClientIdsWithOpenInvoices,
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ["client", id],
    queryFn: () => api.fetchClientById(id!),
    enabled: !!id,
  });
}

export function useDefaultHourlyRate() {
  return useQuery({
    queryKey: ["company", "defaultHourlyRate"],
    queryFn: api.fetchDefaultHourlyRate,
    staleTime: 5 * 60_000,
  });
}

function toClientPayload(values: ClientFormValues): api.ClientInsert {
  return {
    name: values.name,
    client_number: values.client_number,
    street: values.street ?? null,
    zip_code: values.zip_code ?? null,
    city: values.city ?? null,
    phone: values.phone ?? null,
    mobile_1: values.mobile_1 ?? null,
    mobile_2: values.mobile_2 ?? null,
    email_1: values.email_1 ?? null,
    email_2: values.email_2 ?? null,
    website: values.website ?? null,
    birthday: values.birthday ?? null,
    hourly_rate: values.hourly_rate,
    status: values.status,
  };
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ClientFormValues) => api.createClient(toClientPayload(values)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useUpdateClient(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ClientFormValues) => api.updateClient(id, toClientPayload(values)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: ["client", id] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteClient,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

/**
 * Client-side aggregation over invoices + time_entries — see
 * clientDetailStats.ts. Two queries, one derived result; `enabled` chains
 * off the client id like the rest of this file's hooks.
 */
export function useClientDetailStats(clientId: string | undefined) {
  const invoicesQuery = useQuery({
    queryKey: ["client", clientId, "invoices"],
    queryFn: () => api.fetchInvoicesForClient(clientId!),
    enabled: !!clientId,
  });
  const sinceIso = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const timeEntriesQuery = useQuery({
    queryKey: ["client", clientId, "timeEntries", sinceIso],
    queryFn: () => api.fetchTimeEntriesForClient(clientId!, sinceIso),
    enabled: !!clientId,
  });

  const isPending = invoicesQuery.isPending || timeEntriesQuery.isPending;
  const isError = invoicesQuery.isError || timeEntriesQuery.isError;
  const stats =
    invoicesQuery.data && timeEntriesQuery.data
      ? computeClientDetailStats(invoicesQuery.data, timeEntriesQuery.data)
      : undefined;

  return { stats, isPending, isError };
}

export function useContacts(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client", clientId, "contacts"],
    queryFn: () => api.fetchContacts(clientId!),
    enabled: !!clientId,
  });
}

function toContactPayload(clientId: string, values: ContactFormValues): api.ContactInsert {
  return {
    client_id: clientId,
    first_name: values.first_name,
    last_name: values.last_name ?? null,
    email: values.email ?? null,
    phone: values.phone ?? null,
    position: values.position ?? null,
  };
}

export function useCreateContact(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ContactFormValues) => api.createContact(toContactPayload(clientId, values)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["client", clientId, "contacts"] });
    },
  });
}

export function useUpdateContact(clientId: string, contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ContactFormValues) => api.updateContact(contactId, toContactPayload(clientId, values)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["client", clientId, "contacts"] });
    },
  });
}

export function useDeleteContact(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteContact,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["client", clientId, "contacts"] });
    },
  });
}
