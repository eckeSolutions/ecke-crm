import type { ClientInvoice, ClientTimeEntry } from "./api";

export interface MonthlyRevenue {
  /** First day of the month this bucket covers. */
  month: Date;
  amount: number;
}

/**
 * Aggregated view of one client for the client detail screen — composed
 * client-side from `invoices` + `time_entries`, not a DB row itself. Ported
 * from the old app's `ContactsRepositoryImpl.getClientDetail` (revenue/
 * hours-this-year, open amount, avg payment days, a 6-month revenue trend,
 * the 3 most recent invoices/time entries). Client-side aggregation is
 * deliberate for now — ROADMAP.md flags this as a future Postgres view/RPC
 * candidate once the data volume makes it worth it.
 */
export interface ClientDetailStats {
  revenueThisYear: number;
  hoursThisYear: number;
  openAmount: number;
  openInvoiceCount: number;
  /** Null when there isn't yet a paid invoice to average over. */
  avgPaymentDays: number | null;
  /** Oldest-first, one entry per of the last 6 months. */
  monthlyRevenue: MonthlyRevenue[];
  /** Most recent invoices, newest first (caller passes already-sorted rows). */
  recentInvoices: ClientInvoice[];
  /** Most recent time entries, newest first (caller passes already-sorted rows). */
  recentTimeEntries: ClientTimeEntry[];
}

export function computeClientDetailStats(
  invoices: readonly ClientInvoice[],
  timeEntries: readonly ClientTimeEntry[],
  now: Date = new Date(),
): ClientDetailStats {
  const year = now.getFullYear();

  const invoicesThisYear = invoices.filter(
    (i) => new Date(i.date_issued ?? i.created_at ?? now).getFullYear() === year && i.status !== "cancelled",
  );
  const revenueThisYear = invoicesThisYear.reduce((sum, i) => sum + (i.total_amount ?? 0), 0);

  const hoursThisYear = timeEntries
    .filter((e) => new Date(e.start_time).getFullYear() === year)
    .reduce((sum, e) => sum + (e.duration_minutes ?? 0) / 60, 0);

  const openInvoices = invoices.filter((i) => i.status === "sent");
  const openAmount = openInvoices.reduce((sum, i) => sum + (i.total_amount ?? 0), 0);

  const paidInvoices = invoices.filter((i) => i.status === "paid" && i.paid_at);
  const avgPaymentDays =
    paidInvoices.length === 0
      ? null
      : paidInvoices.reduce((sum, i) => {
          const issued = new Date(i.date_issued ?? i.created_at ?? now);
          const paid = new Date(i.paid_at!);
          const days = Math.round((paid.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24));
          return sum + days;
        }, 0) / paidInvoices.length;

  const monthlyRevenue: MonthlyRevenue[] = Array.from({ length: 6 }, (_, i) => {
    const month = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const amount = invoices
      .filter((inv) => {
        if (inv.status === "cancelled") return false;
        const issued = new Date(inv.date_issued ?? inv.created_at ?? now);
        return issued.getFullYear() === month.getFullYear() && issued.getMonth() === month.getMonth();
      })
      .reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0);
    return { month, amount };
  });

  return {
    revenueThisYear,
    hoursThisYear,
    openAmount,
    openInvoiceCount: openInvoices.length,
    avgPaymentDays,
    monthlyRevenue,
    recentInvoices: invoices.slice(0, 3),
    recentTimeEntries: timeEntries.slice(0, 3),
  };
}
