import { EckeButton, EckePageHeader, EckeTable, EckeTableCard } from "@ds/stencil/react";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { useNavigate } from "react-router-dom";

import { formatDateDe, formatEuro } from "@/lib/formatters";
import { INVOICE_STATUS_LABEL, type InvoiceStatus } from "@/lib/invoiceStatus";

import { useInvoices } from "../hooks";
import { ClientPickerModal } from "./ClientPickerModal";
import "./InvoiceListScreen.css";

const COLUMNS = [
  { key: "number", label: "Nr." },
  { key: "client", label: "Kunde" },
  { key: "date", label: "Datum" },
  { key: "amount", label: "Betrag", align: "right" as const },
  { key: "status", label: "Status", align: "right" as const },
];

export function InvoiceListScreen() {
  const navigate = useNavigate();
  const invoicesQuery = useInvoices();
  const [pickerOpen, setPickerOpen] = useState(false);
  const tableRef = useRef<ComponentRef<typeof EckeTable>>(null);

  const invoices = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data]);
  const rows = useMemo(
    () =>
      invoices.map((inv) => ({
        number: `#${inv.invoice_number}`,
        client: inv.clients?.name ?? "—",
        date: inv.date_issued ? formatDateDe(new Date(inv.date_issued)) : "—",
        amount: formatEuro(inv.total_amount ?? 0),
        status: INVOICE_STATUS_LABEL[(inv.status as InvoiceStatus | null) ?? "draft"],
      })),
    [invoices],
  );

  // Row click -> open, same composedPath() pattern Kunden's and
  // Zeiterfassung's tables use (ecke-table emits no row event of its own).
  useEffect(() => {
    const host = tableRef.current as unknown as HTMLElement | null;
    if (!host) return;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const tr = event.composedPath().find((n): n is HTMLElement => n instanceof HTMLElement && n.tagName === "TR");
      if (!tr?.parentElement || tr.parentElement.tagName !== "TBODY") return;

      const index = Array.prototype.indexOf.call(tr.parentElement.children, tr);
      const invoice = invoices[index];
      if (invoice) navigate(`/rechnungen/${invoice.id}`, { viewTransition: true });
    };

    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [invoices, navigate]);

  return (
    <>
      <EckePageHeader pageTitle="Rechnungen">
        <EckeButton surface="glass" emphasis="primary" onClick={() => setPickerOpen(true)}>
          Neue Rechnung
        </EckeButton>
      </EckePageHeader>

      {invoicesQuery.isPending ? (
        <p>Wird geladen…</p>
      ) : invoicesQuery.isError ? (
        <p role="alert">Rechnungen konnten nicht geladen werden.</p>
      ) : invoices.length === 0 ? (
        <p>Noch keine Rechnungen.</p>
      ) : (
        <EckeTableCard surface="glass" className="invoice-list__table">
          <EckeTable ref={tableRef} columns={COLUMNS} rows={rows} />
        </EckeTableCard>
      )}

      <ClientPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(clientId) => {
          setPickerOpen(false);
          navigate(`/rechnungen/neu?client=${clientId}`);
        }}
      />
    </>
  );
}
