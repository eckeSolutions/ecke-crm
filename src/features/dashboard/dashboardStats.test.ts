import { describe, expect, it } from "vitest";

import type { DashboardBirthdayClient, DashboardInvoiceRow, DashboardTimeEntryRow } from "./api";

import { computeDashboardStats, revenueDeltaPercent } from "./dashboardStats";

const NOW = new Date(2026, 6, 15); // 15 Jul 2026

function invoice(overrides: Partial<DashboardInvoiceRow> & { clientName?: string }): DashboardInvoiceRow {
  const { clientName, ...rest } = overrides;
  return {
    invoice_number: 1,
    date_issued: "2026-07-01",
    total_amount: 0,
    status: "sent",
    created_at: "2026-07-01T00:00:00Z",
    clients: { name: clientName ?? "Acme GmbH" },
    ...rest,
  };
}

function timeEntry(overrides: Partial<DashboardTimeEntryRow>): DashboardTimeEntryRow {
  return {
    duration_minutes: 60,
    start_time: "2026-07-01T09:00:00Z",
    end_time: null,
    ...overrides,
  };
}

function birthdayClient(overrides: Partial<DashboardBirthdayClient>): DashboardBirthdayClient {
  return {
    name: "Acme GmbH",
    client_number: "K-0001",
    birthday: "1990-07-20",
    ...overrides,
  };
}

describe("computeDashboardStats", () => {
  it("sums this-month and last-month revenue, excluding cancelled invoices", () => {
    const stats = computeDashboardStats(
      [
        invoice({ status: "paid", total_amount: 100, date_issued: "2026-07-05" }),
        invoice({ status: "sent", total_amount: 50, date_issued: "2026-07-10" }),
        invoice({ status: "cancelled", total_amount: 999, date_issued: "2026-07-12" }),
        invoice({ status: "paid", total_amount: 200, date_issued: "2026-06-20" }),
      ],
      [],
      [],
      NOW,
    );

    expect(stats.revenueThisMonth).toBe(150);
    expect(stats.revenueLastMonth).toBe(200);
  });

  it("sums duration_minutes across the passed-in time entries into hours", () => {
    const stats = computeDashboardStats([], [timeEntry({ duration_minutes: 90 }), timeEntry({ duration_minutes: 30 })], [], NOW);
    expect(stats.hoursThisMonth).toBe(2);
  });

  it("counts sent invoices as open, and only those older than 14 days as overdue", () => {
    const stats = computeDashboardStats(
      [
        invoice({ status: "sent", date_issued: "2026-07-10" }), // 5 days old — open, not overdue
        invoice({ status: "sent", date_issued: "2026-06-01" }), // 44 days old — open and overdue
        invoice({ status: "paid", date_issued: "2026-06-01" }), // not open at all
      ],
      [],
      [],
      NOW,
    );

    expect(stats.openInvoiceCount).toBe(2);
    expect(stats.overdueInvoiceCount).toBe(1);
  });

  it("builds a 6-month revenue trend ending on the current month", () => {
    const stats = computeDashboardStats([invoice({ status: "paid", total_amount: 42, date_issued: "2026-07-01" })], [], [], NOW);

    expect(stats.monthlyRevenue).toHaveLength(6);
    expect(stats.monthlyRevenue[0]!.month).toEqual(new Date(2026, 1, 1)); // Feb 2026
    expect(stats.monthlyRevenue[5]!.month).toEqual(new Date(2026, 6, 1)); // Jul 2026 (current)
    expect(stats.monthlyRevenue[5]!.amount).toBe(42);
  });

  it("ranks top clients by this-year revenue, highest first, capped to 5", () => {
    const stats = computeDashboardStats(
      [
        invoice({ status: "paid", total_amount: 100, clientName: "A" }),
        invoice({ status: "paid", total_amount: 50, clientName: "A" }),
        invoice({ status: "paid", total_amount: 300, clientName: "B" }),
        invoice({ status: "cancelled", total_amount: 9999, clientName: "C" }),
      ],
      [],
      [],
      NOW,
    );

    expect(stats.topClients).toEqual([
      { clientName: "B", amount: 300 },
      { clientName: "A", amount: 150 },
    ]);
  });

  it("splits this-year totals into outstanding (sent) and paid", () => {
    const stats = computeDashboardStats(
      [
        invoice({ status: "sent", total_amount: 40 }),
        invoice({ status: "paid", total_amount: 60 }),
        invoice({ status: "paid", total_amount: 999, date_issued: "2025-01-01" }), // other year, excluded
      ],
      [],
      [],
      NOW,
    );

    expect(stats.outstandingAmount).toBe(40);
    expect(stats.paidAmount).toBe(60);
  });

  it("caps recent invoices to 5, passing rows through in caller-supplied order", () => {
    const invoices = Array.from({ length: 8 }, (_, i) => invoice({ invoice_number: i + 1 }));
    const stats = computeDashboardStats(invoices, [], [], NOW);
    expect(stats.recentInvoices).toHaveLength(5);
    expect(stats.recentInvoices[0]!.invoiceNumber).toBe(1);
  });

  it("re-anchors a birthday already passed this year to next year, and keeps only the 30-day window", () => {
    const stats = computeDashboardStats(
      [],
      [],
      [
        birthdayClient({ name: "Soon", birthday: "1990-07-25" }), // 10 days away
        birthdayClient({ name: "TooFar", birthday: "1990-09-01" }), // outside the window
        birthdayClient({ name: "AlreadyPassed", birthday: "1990-01-01" }), // wraps to next year, outside window
      ],
      NOW,
    );

    expect(stats.upcomingBirthdays).toEqual([{ clientName: "Soon", clientNumber: "K-0001", nextOccurrence: new Date(2026, 6, 25), daysUntil: 10 }]);
  });

  it("skips clients with no birthday", () => {
    const stats = computeDashboardStats([], [], [birthdayClient({ birthday: null })], NOW);
    expect(stats.upcomingBirthdays).toEqual([]);
  });
});

describe("revenueDeltaPercent", () => {
  it("computes a percent change", () => {
    expect(revenueDeltaPercent({ revenueThisMonth: 150, revenueLastMonth: 100 })).toBe(50);
  });

  it("returns null when there's no last-month revenue to compare against", () => {
    expect(revenueDeltaPercent({ revenueThisMonth: 150, revenueLastMonth: 0 })).toBeNull();
  });
});
