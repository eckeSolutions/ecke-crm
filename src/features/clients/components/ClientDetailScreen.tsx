import { EckeBadge, EckeBarChart, EckeBreadcrumb, EckeCard, EckeIcon, EckePageHeader, EckeStatCard } from "@ds/stencil/react";
import { useRef } from "react";
import { useParams } from "react-router-dom";

import { formatDateDe, formatDateShortDe, formatDecimalDe, formatEuro, formatMonthAbbrevDe } from "@/lib/formatters";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE } from "@/lib/invoiceStatus";
import { useShellNavClick } from "@/shell/useShellNavClick";

import { formatClientAddress } from "../clientFormat";
import { useClient, useClientDetailStats } from "../hooks";
import { ContactsSection } from "./ContactsSection";
import "./ClientDetailScreen.css";

export function ClientDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const breadcrumbRef = useRef<HTMLDivElement>(null);
  useShellNavClick(breadcrumbRef);

  const clientQuery = useClient(id);
  const { stats, isPending: statsPending } = useClientDetailStats(id);

  if (clientQuery.isPending) return <p>Wird geladen…</p>;
  if (clientQuery.isError || !clientQuery.data) return <p role="alert">Kunde konnte nicht geladen werden.</p>;

  const client = clientQuery.data;
  const address = formatClientAddress(client);
  const year = new Date().getFullYear();

  return (
    <>
      <div ref={breadcrumbRef}>
        <EckeBreadcrumb items={[{ label: "Kunden", href: "/clients" }, { label: client.name }]} />
      </div>
      <EckePageHeader pageTitle={client.name} subtitle={[client.client_number, address].filter(Boolean).join(" · ")} />

      <div className="client-detail__grid">
        <div className="client-detail__master">
          <EckeCard surface="glass" heading="Stammdaten">
            <ul className="client-detail__info-list">
              {address && <InfoRow icon="map-pin" label={address} />}
              {client.phone && <InfoRow icon="phone" label={client.phone} />}
              {client.mobile_1 && <InfoRow icon="smartphone" label={client.mobile_1} />}
              {client.email_1 && <InfoRow icon="mail" label={client.email_1} />}
              {client.website && <InfoRow icon="globe" label={client.website} />}
              {client.birthday && <InfoRow icon="gift" label={formatDateDe(new Date(client.birthday))} />}
            </ul>
          </EckeCard>
          <EckeCard surface="glass" heading="Konditionen">
            <div className="client-detail__kv">
              <span>Stundensatz</span>
              <strong>{formatEuro(client.hourly_rate ?? 0)}</strong>
            </div>
          </EckeCard>
        </div>

        <div className="client-detail__stats">
          {statsPending || !stats ? (
            <p>Wird geladen…</p>
          ) : (
            <>
              <div className="client-detail__stat-row">
                <EckeStatCard label={`Umsatz ${year}`} value={formatEuro(stats.revenueThisYear)}>
                  <EckeIcon slot="icon" name="wallet" />
                </EckeStatCard>
                <EckeStatCard
                  label="Offen"
                  value={formatEuro(stats.openAmount)}
                  iconVariant="warning"
                  delta={stats.openInvoiceCount === 0 ? undefined : `${stats.openInvoiceCount} Rechnung${stats.openInvoiceCount === 1 ? "" : "en"}`}
                >
                  <EckeIcon slot="icon" name="receipt" />
                </EckeStatCard>
                <EckeStatCard label={`Stunden ${year}`} value={`${formatDecimalDe(stats.hoursThisYear)} h`}>
                  <EckeIcon slot="icon" name="clock" />
                </EckeStatCard>
                <EckeStatCard
                  label="Ø Zahlungsdauer"
                  value={stats.avgPaymentDays === null ? "—" : `${Math.round(stats.avgPaymentDays)} Tage`}
                  delta={stats.avgPaymentDays === null ? undefined : "zuverlässig"}
                >
                  <EckeIcon slot="icon" name="calendar" />
                </EckeStatCard>
              </div>

              <EckeCard surface="glass" heading="Umsatzverlauf">
                <EckeBarChart
                  data={stats.monthlyRevenue.map((m, i, arr) => {
                    const max = Math.max(...arr.map((x) => x.amount), 0);
                    return {
                      label: formatMonthAbbrevDe(m.month),
                      value: max === 0 ? 0 : m.amount / max,
                      highlighted: i === arr.length - 1,
                    };
                  })}
                />
              </EckeCard>

              <div className="client-detail__recent-row">
                <EckeCard surface="glass" heading="Letzte Rechnungen">
                  {stats.recentInvoices.length === 0 ? (
                    <p className="client-detail__empty">Noch keine Rechnungen.</p>
                  ) : (
                    <ul className="client-detail__recent-list">
                      {stats.recentInvoices.map((invoice) => (
                        <li key={invoice.id}>
                          <span className="client-detail__recent-num">#{invoice.invoice_number}</span>
                          <span className="client-detail__recent-date">
                            {formatDateDe(new Date(invoice.date_issued ?? invoice.created_at ?? "1970-01-01"))}
                          </span>
                          <span className="client-detail__recent-amount">{formatEuro(invoice.total_amount ?? 0)}</span>
                          <EckeBadge tone={INVOICE_STATUS_TONE[invoice.status as keyof typeof INVOICE_STATUS_TONE] ?? "neutral"}>
                            {INVOICE_STATUS_LABEL[invoice.status as keyof typeof INVOICE_STATUS_LABEL] ?? invoice.status}
                          </EckeBadge>
                        </li>
                      ))}
                    </ul>
                  )}
                </EckeCard>
                <EckeCard surface="glass" heading="Letzte Zeiteinträge">
                  {stats.recentTimeEntries.length === 0 ? (
                    <p className="client-detail__empty">Noch keine Zeiteinträge.</p>
                  ) : (
                    <ul className="client-detail__recent-list">
                      {stats.recentTimeEntries.map((entry) => (
                        <li key={entry.id}>
                          <span className="client-detail__recent-date">{formatDateShortDe(new Date(entry.start_time))}</span>
                          <span className="client-detail__recent-desc">{entry.description ?? "—"}</span>
                          <span className="client-detail__recent-amount">
                            {formatDecimalDe((entry.duration_minutes ?? 0) / 60, 2)} h
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </EckeCard>
              </div>
            </>
          )}
        </div>
      </div>

      {id && <ContactsSection clientId={id} />}
    </>
  );
}

type InfoIcon = "map-pin" | "phone" | "smartphone" | "mail" | "globe" | "gift";

function InfoRow({ icon, label }: { icon: InfoIcon; label: string }) {
  return (
    <li className="client-detail__info-row">
      <EckeIcon name={icon} size="sm" tone="info" />
      <span>{label}</span>
    </li>
  );
}
