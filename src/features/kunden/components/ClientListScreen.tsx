import {
  EckeAvatar,
  EckeButton,
  EckeCard,
  EckeFilterChip,
  EckeIcon,
  EckePageHeader,
  EckePagination,
  EckeSearchField,
} from "@ds/stencil/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { formatEuro } from "@/lib/formatters";
import { ConfirmModal } from "@/shell/ConfirmModal";

import type { Client } from "../api";
import { useClientIdsWithOpenInvoices, useClients, useDeleteClient } from "../hooks";
import "./ClientListScreen.css";

type Filter = "all" | "openInvoices";

const PAGE_SIZE = 10;

export function ClientListScreen() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Client | null>(null);

  const clientsQuery = useClients(search);
  const openIdsQuery = useClientIdsWithOpenInvoices();
  const deleteClient = useDeleteClient();

  const filtered = useMemo(() => {
    const clients = clientsQuery.data ?? [];
    if (filter === "all") return clients;
    const openIds = openIdsQuery.data ?? new Set<string>();
    return clients.filter((c) => openIds.has(c.id));
  }, [clientsQuery.data, filter, openIdsQuery.data]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageClients = filtered.slice(start, start + PAGE_SIZE);

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const changeFilter = (value: Filter) => {
    setFilter(value);
    setPage(1);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteClient.mutateAsync(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <>
      <EckePageHeader pageTitle="Kunden">
        <EckeButton emphasis="primary" onClick={() => navigate("/kunden/neu")}>
          Neuer Kunde
        </EckeButton>
      </EckePageHeader>

      <div className="client-list__toolbar">
        <EckeSearchField
          placeholder="Suche nach Name, Kundennummer oder Ort…"
          value={search}
          onEckeInput={(e) => changeSearch(e.detail)}
        />
        <EckeFilterChip selected={filter === "all"} onEckeToggle={() => changeFilter("all")}>
          Alle
        </EckeFilterChip>
        <EckeFilterChip selected={filter === "openInvoices"} onEckeToggle={() => changeFilter("openInvoices")}>
          Mit offenen Rechnungen
        </EckeFilterChip>
      </div>

      {clientsQuery.isPending ? (
        <p>Wird geladen…</p>
      ) : clientsQuery.isError ? (
        <p role="alert">Kunden konnten nicht geladen werden.</p>
      ) : filtered.length === 0 ? (
        <EckeCard surface="solid">
          <p>{filter === "all" ? "Noch keine Kunden angelegt." : "Keine Kunden mit offenen Rechnungen."}</p>
        </EckeCard>
      ) : (
        <>
          <div className="client-list__rows">
            {pageClients.map((client) => (
              <EckeCard key={client.id} surface="solid" className="client-list__row">
                <button
                  type="button"
                  className="client-list__row-main"
                  onClick={() => navigate(`/kunden/${client.id}`, { viewTransition: true })}
                >
                  <EckeAvatar initials={initials(client.name)} />
                  <span className="client-list__row-name">
                    <strong>{client.name}</strong>
                    <span className="client-list__row-meta">
                      {client.client_number}
                      {client.city ? ` · ${client.city}` : ""}
                    </span>
                  </span>
                  <span className="client-list__row-phone">{client.phone ?? "—"}</span>
                  <span className="client-list__row-rate">{formatEuro(client.hourly_rate ?? 0)}</span>
                </button>
                <div className="client-list__row-actions">
                  <EckeButton
                    type="button"
                    emphasis="ghost"
                    iconOnly
                    aria-label="Bearbeiten"
                    onClick={() => navigate(`/kunden/${client.id}/bearbeiten`)}
                  >
                    <EckeIcon name="pencil" />
                  </EckeButton>
                  <EckeButton
                    type="button"
                    emphasis="ghost"
                    tone="danger"
                    iconOnly
                    aria-label="Löschen"
                    onClick={() => setPendingDelete(client)}
                  >
                    <EckeIcon name="trash-2" />
                  </EckeButton>
                </div>
              </EckeCard>
            ))}
          </div>

          <EckePagination
            page={currentPage}
            totalPages={pageCount}
            summary={`${start + 1}–${start + pageClients.length} von ${filtered.length} Kunden`}
            onEckePageChange={(e) => setPage(e.detail)}
          />
        </>
      )}

      <ConfirmModal
        open={!!pendingDelete}
        heading="Kunde löschen?"
        message={`„${pendingDelete?.name}" wird unwiderruflich gelöscht.`}
        pending={deleteClient.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
