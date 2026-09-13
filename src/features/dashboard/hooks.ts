import { useQuery } from "@tanstack/react-query";

import * as api from "./api";
import { computeDashboardStats } from "./dashboardStats";

/** Same three-query-then-aggregate shape as `useClientDetailStats` — each query cached under its own key so any one of them refetching (e.g. after creating an invoice) doesn't force-refetch the other two. */
export function useDashboardStats() {
  const now = new Date();
  const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const invoicesQuery = useQuery({
    queryKey: ["dashboard", "invoices"],
    queryFn: api.fetchInvoicesForDashboard,
  });
  const timeEntriesQuery = useQuery({
    queryKey: ["dashboard", "timeEntries", monthStartIso],
    queryFn: () => api.fetchTimeEntriesForMonth(now),
  });
  const birthdaysQuery = useQuery({
    queryKey: ["dashboard", "birthdays"],
    queryFn: api.fetchClientsWithBirthday,
    staleTime: 60 * 60_000,
  });

  const isPending = invoicesQuery.isPending || timeEntriesQuery.isPending || birthdaysQuery.isPending;
  const isError = invoicesQuery.isError || timeEntriesQuery.isError || birthdaysQuery.isError;
  const stats =
    invoicesQuery.data && timeEntriesQuery.data && birthdaysQuery.data
      ? computeDashboardStats(invoicesQuery.data, timeEntriesQuery.data, birthdaysQuery.data)
      : undefined;

  return { stats, isPending, isError };
}
