import { EckeBarChart, EckeCard, EckeIcon, EckePageHeader, EckeQuickAccess, EckeRankedList, EckeRecentList, EckeSegmentedBar, EckeStatCard, EckeUpcomingList } from "@ds/stencil/react";
import { useRef } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { formatDateShortDe, formatDecimalDe, formatEuro, formatMonthAbbrevDe } from "@/lib/formatters";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE } from "@/lib/invoiceStatus";
import { useShellNavClick } from "@/shell/useShellNavClick";

import { useDashboardStats } from "../hooks";
import { revenueDeltaPercent, type DashboardStats } from "../dashboardStats";
import "./DashboardScreen.css";

export function DashboardScreen() {
  const { profile } = useAuth();
  const { stats, isPending, isError } = useDashboardStats();
  const navRef = useRef<HTMLDivElement>(null);
  useShellNavClick(navRef);

  const name = profile?.full_name ?? profile?.email ?? "";

  return (
    <div ref={navRef}>
      <EckePageHeader pageTitle={`Willkommen zurück${name ? `, ${name}` : ""}!`} subtitle="Übersicht" />

      {isPending && <p>Wird geladen…</p>}
      {isError && <p role="alert">Übersicht konnte nicht geladen werden.</p>}
      {stats && <DashboardBody stats={stats} />}
    </div>
  );
}

function DashboardBody({ stats }: { stats: DashboardStats }) {
  const year = new Date().getFullYear();
  const delta = revenueDeltaPercent(stats);
  const paymentTotal = stats.outstandingAmount + stats.paidAmount;
  const maxMonthlyRevenue = Math.max(...stats.monthlyRevenue.map((m) => m.amount), 0);
  const maxTopClientRevenue = stats.topClients[0]?.amount ?? 0;

  return (
    <>
      <div className="dashboard__stats-row">
        <EckeStatCard
          label="Umsatz diesen Monat"
          value={formatEuro(stats.revenueThisMonth)}
          delta={delta === null ? undefined : `${delta >= 0 ? "+" : ""}${Math.round(delta)} % ggü. Vormonat`}
          deltaNegative={delta !== null && delta < 0}
        >
          <EckeIcon slot="icon" name="wallet" />
        </EckeStatCard>
        <EckeStatCard
          label="Offene Rechnungen"
          value={String(stats.openInvoiceCount)}
          iconVariant="warning"
          delta={stats.overdueInvoiceCount === 0 ? undefined : `${stats.overdueInvoiceCount} seit über 14 Tagen offen`}
          deltaNegative={stats.overdueInvoiceCount > 0}
        >
          <EckeIcon slot="icon" name="receipt" />
        </EckeStatCard>
        <EckeStatCard label="Erfasste Stunden (Monat)" value={`${formatDecimalDe(stats.hoursThisMonth)} h`}>
          <EckeIcon slot="icon" name="clock" />
        </EckeStatCard>
      </div>

      <div className="dashboard__row">
        <EckeCard heading="Umsatzentwicklung">
          <EckeBarChart
            data={stats.monthlyRevenue.map((m, i, arr) => ({
              label: formatMonthAbbrevDe(m.month),
              value: maxMonthlyRevenue === 0 ? 0 : m.amount / maxMonthlyRevenue,
              highlighted: i === arr.length - 1,
            }))}
          />
        </EckeCard>
        <EckeCard heading={`Offen vs. bezahlt (${year})`}>
          {paymentTotal === 0 ? (
            <p className="dashboard__empty">Noch keine Rechnungen in diesem Jahr.</p>
          ) : (
            <EckeSegmentedBar
              segments={[
                { value: stats.paidAmount, color: "var(--status-success)", label: "Bezahlt", formattedValue: formatEuro(stats.paidAmount) },
                { value: stats.outstandingAmount, color: "var(--status-warning)", label: "Offen", formattedValue: formatEuro(stats.outstandingAmount) },
              ]}
            />
          )}
        </EckeCard>
      </div>

      <div className="dashboard__row">
        <EckeRecentList
          heading="Letzte Rechnungen"
          linkLabel="Alle anzeigen"
          linkHref="/invoices"
          rows={stats.recentInvoices.map((invoice) => ({
            id: `#${invoice.invoiceNumber}`,
            title: invoice.clientName,
            meta: formatDateShortDe(invoice.dateIssued),
            amount: formatEuro(invoice.totalAmount),
            badgeLabel: INVOICE_STATUS_LABEL[invoice.status],
            badgeTone: INVOICE_STATUS_TONE[invoice.status],
          }))}
        />
        <EckeCard heading={`Top Kunden (${year})`}>
          {stats.topClients.length === 0 ? (
            <p className="dashboard__empty">Noch keine Umsätze in diesem Jahr.</p>
          ) : (
            <EckeRankedList
              items={stats.topClients.map((client) => ({
                label: client.clientName,
                value: formatEuro(client.amount),
                percent: maxTopClientRevenue === 0 ? 0 : (client.amount / maxTopClientRevenue) * 100,
              }))}
            />
          )}
        </EckeCard>
      </div>

      <div className="dashboard__row">
        <EckeCard heading="Schnellzugriff">
          <EckeQuickAccess
            items={[
              { icon: "plus", label: "Neuer Kunde", href: "/clients/new" },
              { icon: "invoice", label: "Neue Rechnung", href: "/invoices/new" },
              { icon: "plus", label: "Zeit erfassen", href: "/time-tracking" },
              { icon: "plus", label: "Buchung erfassen", href: "/finance" },
            ]}
          />
        </EckeCard>
        {stats.upcomingBirthdays.length > 0 && (
          <EckeUpcomingList
            heading="Anstehende Geburtstage"
            rows={stats.upcomingBirthdays.map((birthday) => ({
              date: formatDateShortDe(birthday.nextOccurrence),
              title: birthday.clientName,
              subtitle: birthday.clientNumber,
              relative: relativeDaysLabel(birthday.daysUntil),
            }))}
          />
        )}
      </div>
    </>
  );
}

function relativeDaysLabel(daysUntil: number): string {
  if (daysUntil === 0) return "heute";
  if (daysUntil === 1) return "morgen";
  return `in ${daysUntil} Tagen`;
}
