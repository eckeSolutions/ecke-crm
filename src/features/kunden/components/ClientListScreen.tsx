import {
  EckeButton,
  EckeCard,
  EckeFilterChip,
  EckePageHeader,
  EckePagination,
  EckeSearchField,
  EckeSelectionBar,
  EckeTable,
  EckeTableCard,
} from "@ds/stencil/react";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { formatEuro } from "@/lib/formatters";
import { ConfirmModal } from "@/shell/ConfirmModal";

import type { Client } from "../api";
import { useClientIdsWithOpenInvoices, useClients, useDeleteClient } from "../hooks";
import "./ClientListScreen.css";

type Filter = "all" | "openInvoices";

const PAGE_SIZE = 10;

const COLUMNS = [
  { key: "name", label: "Kunde", sortable: false },
  { key: "number", label: "Nr." },
  { key: "city", label: "Ort" },
  { key: "phone", label: "Telefon" },
  { key: "rate", label: "Stundensatz", align: "right" as const },
];

export function ClientListScreen() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingDelete, setPendingDelete] = useState<Client[] | null>(null);
  const tableRef = useRef<ComponentRef<typeof EckeTable>>(null);

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
  const pageClients = useMemo(() => filtered.slice(start, start + PAGE_SIZE), [filtered, start]);

  const rows = useMemo(
    () =>
      pageClients.map((c) => ({
        name: c.name,
        number: c.client_number,
        city: c.city ?? "—",
        phone: c.phone ?? "—",
        rate: formatEuro(c.hourly_rate ?? 0),
      })),
    [pageClients],
  );

  // Row click -> detail. ecke-table emits no row event and renders its
  // <tr>s in its own shadow root, so this listens on the host and reads
  // composedPath() — the same pattern as src/shell/useShellNavClick.ts, and
  // for the same reason (a real addEventListener, never a JSX onClick, for
  // an event that crosses a shadow boundary).
  useEffect(() => {
    // The wrapper types this ref as the Stencil component class; at
    // runtime it is the <ecke-table> custom element itself.
    const host = tableRef.current as unknown as HTMLElement | null;
    if (!host) return;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const path = event.composedPath();
      // A click on the selection checkbox is a selection, not navigation.
      if (path.some((n) => n instanceof HTMLElement && n.tagName === "ECKE-CHECKBOX")) return;

      const tr = path.find((n): n is HTMLElement => n instanceof HTMLElement && n.tagName === "TR");
      if (!tr?.parentElement || tr.parentElement.tagName !== "TBODY") return;

      const index = Array.prototype.indexOf.call(tr.parentElement.children, tr);
      const client = pageClients[index];
      if (client) navigate(`/kunden/${client.id}`, { viewTransition: true });
    };

    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [navigate, pageClients]);

  const resetPage = () => {
    setPage(1);
    setSelected([]);
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    resetPage();
  };
  const changeFilter = (value: Filter) => {
    setFilter(value);
    resetPage();
  };

  const selectedClients = selected.map((i) => pageClients[i]).filter((c): c is Client => !!c);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    for (const client of pendingDelete) await deleteClient.mutateAsync(client.id);
    setPendingDelete(null);
    setSelected([]);
  };

  return (
    <>
      <EckePageHeader pageTitle="Kunden">
        <EckeButton surface="glass" emphasis="primary" onClick={() => navigate("/kunden/neu")}>
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
        <EckeCard surface="glass">
          <p>{filter === "all" ? "Noch keine Kunden angelegt." : "Keine Kunden mit offenen Rechnungen."}</p>
        </EckeCard>
      ) : (
        <>
          {selected.length > 0 && (
            <EckeSelectionBar
              count={selected.length}
              onEckeClear={() => setSelected([])}
              className="client-list__selection"
            >
              {selected.length === 1 && (
                <EckeButton
                  surface="glass"
                  emphasis="secondary"
                  onClick={() => navigate(`/kunden/${selectedClients[0]!.id}/bearbeiten`)}
                >
                  Bearbeiten
                </EckeButton>
              )}
              {/* clients' RLS restricts delete to admin (docs/DATABASE_SCHEMA.md
                  §6) — hide it rather than letting the request 403, same as
                  Kunden's ContactsSection. */}
              {isAdmin && (
                <EckeButton surface="glass" emphasis="secondary" tone="danger" onClick={() => setPendingDelete(selectedClients)}>
                  Löschen
                </EckeButton>
              )}
            </EckeSelectionBar>
          )}

          <EckeTableCard surface="glass" className="client-list__table">
            <EckeTable
              ref={tableRef}
              columns={COLUMNS}
              rows={rows}
              selectable
              onEckeSelectionChange={(e) => setSelected(e.detail.indices)}
            />
          </EckeTableCard>

          <EckePagination
            className="client-list__pagination"
            page={currentPage}
            totalPages={pageCount}
            summary={`${start + 1}–${start + pageClients.length} von ${filtered.length} Kunden`}
            onEckePageChange={(e) => {
              setPage(e.detail);
              setSelected([]);
            }}
          />
        </>
      )}

      <ConfirmModal
        open={!!pendingDelete}
        heading={pendingDelete && pendingDelete.length > 1 ? "Kunden löschen?" : "Kunde löschen?"}
        message={
          pendingDelete && pendingDelete.length > 1
            ? `${pendingDelete.length} Kunden werden unwiderruflich gelöscht.`
            : `„${pendingDelete?.[0]?.name}" wird unwiderruflich gelöscht.`
        }
        pending={deleteClient.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
