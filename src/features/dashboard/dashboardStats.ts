import type { DashboardBirthdayClient, DashboardInvoiceRow, DashboardTimeEntryRow } from "./api";
import type { InvoiceStatus } from "@/lib/invoiceStatus";

const OVERDUE_AFTER_DAYS = 14;
const RECENT_INVOICE_COUNT = 5;
const TOP_CLIENT_COUNT = 5;
const TREND_MONTH_COUNT = 6;
const BIRTHDAY_WINDOW_DAYS = 30;

export interface MonthlyRevenuePoint {
  /** First day of the month this bucket covers. */
  month: Date;
  amount: number;
}

/** One row of the "Top 5 Kunden" ranked list. */
export interface ClientRevenueShare {
  clientName: string;
  amount: number;
}

/** A slimmed-down invoice row for the "Letzte Rechnungen" widget. */
export interface RecentInvoiceSummary {
  invoiceNumber: number;
  clientName: string;
  dateIssued: Date;
  totalAmount: number;
  status: InvoiceStatus;
}

/** A client with a birthday within the next 30 days, re-anchored to this (or next) year. */
export interface UpcomingBirthday {
  clientName: string;
  clientNumber: string;
  nextOccurrence: Date;
  daysUntil: number;
}

/**
 * Aggregated read model for the dashboard's overview screen, composed
 * client-side from `invoices`/`time_entries`/`clients` rather than a DB
 * view — same "small row counts, premature to materialize" reasoning as
 * `clientDetailStats.ts`. Ported from the old app's
 * `DashboardRepositoryImpl.getDashboardStats`.
 */
export interface DashboardStats {
  revenueThisMonth: number;
  revenueLastMonth: number;
  hoursThisMonth: number;
  openInvoiceCount: number;
  /** `sent` invoices issued more than 14 days ago. */
  overdueInvoiceCount: number;
  /** Last 6 months, oldest first, current month last. */
  monthlyRevenue: MonthlyRevenuePoint[];
  /** Top 5 clients by revenue this year, highest first. */
  topClients: ClientRevenueShare[];
  /** `sent` invoices' total, this year. */
  outstandingAmount: number;
  /** `paid` invoices' total, this year. */
  paidAmount: number;
  /** Newest first, capped to 5. */
  recentInvoices: RecentInvoiceSummary[];
  /** Within the next 30 days, soonest first. */
  upcomingBirthdays: UpcomingBirthday[];
}

export function computeDashboardStats(
  invoices: readonly DashboardInvoiceRow[],
  timeEntries: readonly DashboardTimeEntryRow[],
  birthdayClients: readonly DashboardBirthdayClient[],
  now: Date = new Date(),
): DashboardStats {
  const clientName = (row: DashboardInvoiceRow) => row.clients?.name ?? "—";
  const issuedDate = (row: DashboardInvoiceRow) => new Date(row.date_issued ?? row.created_at ?? now);

  const billable = invoices.filter((i) => i.status !== "cancelled");

  const revenueInMonth = (month: Date) =>
    billable
      .filter((i) => {
        const d = issuedDate(i);
        return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
      })
      .reduce((sum, i) => sum + (i.total_amount ?? 0), 0);

  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const hoursThisMonth = timeEntries.reduce((sum, e) => sum + (e.duration_minutes ?? 0) / 60, 0);

  const openInvoices = invoices.filter((i) => i.status === "sent");
  const overdueInvoiceCount = openInvoices.filter((i) => {
    const days = Math.floor((now.getTime() - issuedDate(i).getTime()) / (1000 * 60 * 60 * 24));
    return days > OVERDUE_AFTER_DAYS;
  }).length;

  const monthlyRevenue: MonthlyRevenuePoint[] = Array.from({ length: TREND_MONTH_COUNT }, (_, i) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (TREND_MONTH_COUNT - 1) + i, 1);
    return { month, amount: revenueInMonth(month) };
  });

  const yearInvoices = billable.filter((i) => issuedDate(i).getFullYear() === now.getFullYear());
  const revenueByClient = new Map<string, number>();
  for (const invoice of yearInvoices) {
    const name = clientName(invoice);
    revenueByClient.set(name, (revenueByClient.get(name) ?? 0) + (invoice.total_amount ?? 0));
  }
  const topClients: ClientRevenueShare[] = Array.from(revenueByClient.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CLIENT_COUNT)
    .map(([name, amount]) => ({ clientName: name, amount }));

  const outstandingAmount = invoices
    .filter((i) => i.status === "sent" && issuedDate(i).getFullYear() === now.getFullYear())
    .reduce((sum, i) => sum + (i.total_amount ?? 0), 0);
  const paidAmount = invoices
    .filter((i) => i.status === "paid" && issuedDate(i).getFullYear() === now.getFullYear())
    .reduce((sum, i) => sum + (i.total_amount ?? 0), 0);

  const recentInvoices: RecentInvoiceSummary[] = invoices.slice(0, RECENT_INVOICE_COUNT).map((i) => ({
    invoiceNumber: i.invoice_number,
    clientName: clientName(i),
    dateIssued: issuedDate(i),
    totalAmount: i.total_amount ?? 0,
    status: i.status as InvoiceStatus,
  }));

  return {
    revenueThisMonth: revenueInMonth(thisMonth),
    revenueLastMonth: revenueInMonth(lastMonth),
    hoursThisMonth,
    openInvoiceCount: openInvoices.length,
    overdueInvoiceCount,
    monthlyRevenue,
    topClients,
    outstandingAmount,
    paidAmount,
    recentInvoices,
    upcomingBirthdays: upcomingBirthdays(birthdayClients, now),
  };
}

/**
 * Re-anchors each client's `birthday` (a plain `date` column, parsed by
 * month/day only — never through `new Date(iso)`, which would read a
 * `YYYY-MM-DD` string as UTC midnight and roll it back a day in any
 * timezone behind UTC) to its next occurrence, keeping only those within
 * `BIRTHDAY_WINDOW_DAYS`, soonest first.
 */
function upcomingBirthdays(clients: readonly DashboardBirthdayClient[], now: Date): UpcomingBirthday[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming: UpcomingBirthday[] = [];

  for (const client of clients) {
    if (!client.birthday) continue;
    const [, monthStr, dayStr] = client.birthday.split("-");
    const month = Number(monthStr) - 1;
    const day = Number(dayStr);

    let next = new Date(today.getFullYear(), month, day);
    if (next.getTime() < today.getTime()) {
      next = new Date(today.getFullYear() + 1, month, day);
    }
    const daysUntil = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= BIRTHDAY_WINDOW_DAYS) {
      upcoming.push({ clientName: client.name, clientNumber: client.client_number, nextOccurrence: next, daysUntil });
    }
  }

  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  return upcoming;
}

/** `null` when there's no last-month revenue to compare against (division by zero). */
export function revenueDeltaPercent(stats: Pick<DashboardStats, "revenueThisMonth" | "revenueLastMonth">): number | null {
  return stats.revenueLastMonth === 0 ? null : ((stats.revenueThisMonth - stats.revenueLastMonth) / stats.revenueLastMonth) * 100;
}
