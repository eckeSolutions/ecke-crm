import { describe, expect, it } from "vitest";

import type { ClientInvoice, ClientTimeEntry } from "./api";

import { computeClientDetailStats } from "./clientDetailStats";

const NOW = new Date(2026, 6, 15); // 15 Jul 2026

function invoice(overrides: Partial<ClientInvoice>): ClientInvoice {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    invoice_number: 1,
    client_id: "c1",
    profile_id: "p1",
    date_issued: "2026-07-01",
    date_due: null,
    status: "sent",
    total_amount: 0,
    notes: null,
    pdf_storage_path: null,
    paid_at: null,
    created_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function timeEntry(overrides: Partial<ClientTimeEntry>): ClientTimeEntry {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    client_id: "c1",
    profile_id: "p1",
    template_id: null,
    description: null,
    start_time: "2026-07-01T09:00:00Z",
    end_time: null,
    duration_minutes: 60,
    hourly_rate_snapshot: 60,
    is_invoiced: false,
    invoice_id: null,
    calendar_event_id: null,
    created_at: "2026-07-01T09:00:00Z",
    ...overrides,
  };
}

describe("computeClientDetailStats", () => {
  it("sums this-year revenue, excluding cancelled invoices and other years", () => {
    const stats = computeClientDetailStats(
      [
        invoice({ status: "paid", total_amount: 100, date_issued: "2026-01-15" }),
        invoice({ status: "sent", total_amount: 50, date_issued: "2026-06-01" }),
        invoice({ status: "cancelled", total_amount: 999, date_issued: "2026-03-01" }),
        invoice({ status: "paid", total_amount: 200, date_issued: "2025-12-31" }),
      ],
      [],
      NOW,
    );
    expect(stats.revenueThisYear).toBe(150);
  });

  it("sums this-year hours from duration_minutes", () => {
    const stats = computeClientDetailStats(
      [],
      [
        timeEntry({ duration_minutes: 90, start_time: "2026-02-01T09:00:00Z" }),
        timeEntry({ duration_minutes: 30, start_time: "2026-05-01T09:00:00Z" }),
        timeEntry({ duration_minutes: 999, start_time: "2025-12-01T09:00:00Z" }),
      ],
      NOW,
    );
    expect(stats.hoursThisYear).toBe(2);
  });

  it("sums openAmount and openInvoiceCount from status=sent only", () => {
    const stats = computeClientDetailStats(
      [
        invoice({ status: "sent", total_amount: 100 }),
        invoice({ status: "sent", total_amount: 50 }),
        invoice({ status: "paid", total_amount: 999 }),
      ],
      [],
      NOW,
    );
    expect(stats.openAmount).toBe(150);
    expect(stats.openInvoiceCount).toBe(2);
  });

  it("averages payment days over paid invoices with a paid_at, ignoring the rest", () => {
    const stats = computeClientDetailStats(
      [
        invoice({ status: "paid", date_issued: "2026-01-01", paid_at: "2026-01-11T00:00:00Z" }), // 10 days
        invoice({ status: "paid", date_issued: "2026-02-01", paid_at: "2026-02-21T00:00:00Z" }), // 20 days
        invoice({ status: "sent" }), // no paid_at -- excluded
      ],
      [],
      NOW,
    );
    expect(stats.avgPaymentDays).toBe(15);
  });

  it("avgPaymentDays is null with no paid invoices", () => {
    const stats = computeClientDetailStats([invoice({ status: "sent" })], [], NOW);
    expect(stats.avgPaymentDays).toBeNull();
  });

  it("builds 6 oldest-first monthly buckets ending on the current month", () => {
    const stats = computeClientDetailStats(
      [invoice({ status: "paid", total_amount: 100, date_issued: "2026-07-05" })],
      [],
      NOW,
    );
    expect(stats.monthlyRevenue).toHaveLength(6);
    expect(stats.monthlyRevenue[0]!.month.getMonth()).toBe(1); // Feb (now.getMonth()=6, -5)
    expect(stats.monthlyRevenue[5]!.month.getMonth()).toBe(6); // Jul, the current month
    expect(stats.monthlyRevenue[5]!.amount).toBe(100);
  });

  it("keeps only the first 3 as recent invoices/time entries, trusting caller order", () => {
    const stats = computeClientDetailStats(
      [invoice({}), invoice({}), invoice({}), invoice({})],
      [timeEntry({}), timeEntry({}), timeEntry({}), timeEntry({})],
      NOW,
    );
    expect(stats.recentInvoices).toHaveLength(3);
    expect(stats.recentTimeEntries).toHaveLength(3);
  });
});
