import { EckeButton, EckeCard, EckePageHeader, EckeSelectionBar, EckeTable, EckeTableCard } from "@ds/stencil/react";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { formatDateShortDe, formatDecimalDe } from "@/lib/formatters";
import { ConfirmModal } from "@/shell/ConfirmModal";

import { createTimeEntry } from "../api";
import type { TimeEntryWithClient } from "../api";
import { computeDurationMinutes, durationHours } from "../duration";
import { useDeleteTimeEntry, useTimeEntriesForCurrentMonth } from "../hooks";
import { useStopwatch } from "../useStopwatch";
import { EntryFormModal } from "./EntryFormModal";
import { RunningTimerCard } from "./RunningTimerCard";
import { StartTimerModal } from "./StartTimerModal";
import "./ZeiterfassungScreen.css";

const COLUMNS = [
  { key: "date", label: "Datum" },
  { key: "client", label: "Kunde" },
  { key: "description", label: "Leistung" },
  { key: "duration", label: "Dauer", align: "right" as const },
  { key: "status", label: "Status", align: "right" as const },
];

export function ZeiterfassungScreen() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const stopwatch = useStopwatch();
  const entriesQuery = useTimeEntriesForCurrentMonth();
  const deleteEntry = useDeleteTimeEntry();

  const [startOpen, setStartOpen] = useState(false);
  const [formEntry, setFormEntry] = useState<TimeEntryWithClient | "new" | null>(null);
  const [stopPending, setStopPending] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingDelete, setPendingDelete] = useState<TimeEntryWithClient[] | null>(null);
  const tableRef = useRef<ComponentRef<typeof EckeTable>>(null);

  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const totalHours = useMemo(() => entries.reduce((sum, e) => sum + durationHours(e.duration_minutes ?? 0), 0), [entries]);

  const rows = useMemo(
    () =>
      entries.map((e) => ({
        date: formatDateShortDe(new Date(e.start_time)),
        client: e.clients?.name ?? "—",
        description: e.description ?? "—",
        duration: `${formatDecimalDe(durationHours(e.duration_minutes ?? 0), 2)} h`,
        status: e.is_invoiced ? "abgerechnet" : "offen",
      })),
    [entries],
  );

  // Row click -> edit, same composedPath() pattern ClientListScreen uses
  // (ecke-table renders its <tr>s in its own shadow root and emits no row
  // event). A click on an already-invoiced row is a no-op: RLS would
  // reject the edit anyway (docs/DATABASE_SCHEMA.md §6), so there's
  // nothing useful to open.
  useEffect(() => {
    const host = tableRef.current as unknown as HTMLElement | null;
    if (!host) return;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const path = event.composedPath();
      if (path.some((n) => n instanceof HTMLElement && n.tagName === "ECKE-CHECKBOX")) return;

      const tr = path.find((n): n is HTMLElement => n instanceof HTMLElement && n.tagName === "TR");
      if (!tr?.parentElement || tr.parentElement.tagName !== "TBODY") return;

      const index = Array.prototype.indexOf.call(tr.parentElement.children, tr);
      const entry = entries[index];
      if (entry && !entry.is_invoiced) setFormEntry(entry);
    };

    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [entries]);

  const selectedEntries = selected.map((i) => entries[i]).filter((e): e is TimeEntryWithClient => !!e);
  const selectedHours = selectedEntries.reduce((sum, e) => sum + durationHours(e.duration_minutes ?? 0), 0);
  const noneInvoiced = selectedEntries.length > 0 && selectedEntries.every((e) => !e.is_invoiced);
  const singleClient = selectedEntries.length > 0 && selectedEntries.every((e) => e.client_id === selectedEntries[0]!.client_id);

  const handleStop = async () => {
    const result = stopwatch.stop();
    if (!result) return;
    setStopPending(true);
    try {
      // Not one of the useXTimeEntry mutation hooks — this is a
      // fire-and-forget insert straight from the stopwatch, so a plain
      // refetch afterwards is simpler than reaching for a query-client
      // invalidation this call site has no other reason to import.
      await createTimeEntry({
        client_id: result.clientId,
        description: result.description,
        start_time: result.startedAt,
        end_time: result.endedAt.toISOString(),
        duration_minutes: computeDurationMinutes(new Date(result.startedAt), result.endedAt),
        hourly_rate_snapshot: result.hourlyRate,
        // profile_id has no server default and its INSERT policy requires
        // it to equal the caller's own id — see EntryFormModal's identical
        // comment on its own create path.
        profile_id: session!.user.id,
      });
      stopwatch.discard();
      await entriesQuery.refetch();
    } finally {
      setStopPending(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    for (const entry of pendingDelete) await deleteEntry.mutateAsync(entry.id);
    setPendingDelete(null);
    setSelected([]);
  };

  const createInvoiceFromSelection = () => {
    if (!singleClient || !noneInvoiced) return;
    const clientId = selectedEntries[0]!.client_id;
    const entryIds = selectedEntries.map((e) => e.id).join(",");
    setSelected([]);
    navigate(`/rechnungen/neu?client=${clientId}&entries=${entryIds}`);
  };

  return (
    <>
      <EckePageHeader
        pageTitle="Zeiterfassung"
        subtitle={`${formatDecimalDe(totalHours, 1)} h in diesem Monat erfasst · alle Einträge auf 15 Min aufgerundet`}
      >
        <EckeButton surface="glass" emphasis="secondary" onClick={() => setFormEntry("new")}>
          Manueller Eintrag
        </EckeButton>
        <EckeButton surface="glass" emphasis="primary" disabled={!!stopwatch.timer} onClick={() => setStartOpen(true)}>
          Zeit starten
        </EckeButton>
      </EckePageHeader>

      {stopwatch.timer && (
        <RunningTimerCard
          timer={stopwatch.timer}
          elapsedMs={stopwatch.elapsedMs}
          pending={stopPending}
          onStop={() => void handleStop()}
          onDiscard={stopwatch.discard}
        />
      )}

      {entriesQuery.isPending ? (
        <p>Wird geladen…</p>
      ) : entriesQuery.isError ? (
        <p role="alert">Zeiterfassung konnte nicht geladen werden.</p>
      ) : entries.length === 0 ? (
        <EckeCard surface="glass">
          <p>Noch keine Zeiteinträge in diesem Monat.</p>
        </EckeCard>
      ) : (
        <>
          {selected.length > 0 && (
            <EckeSelectionBar
              summary={`${selected.length} Einträge ausgewählt · ${formatDecimalDe(selectedHours, 2)} h`}
              onEckeClear={() => setSelected([])}
              className="zeiterfassung__selection"
            >
              {noneInvoiced && (
                <EckeButton surface="glass" emphasis="secondary" tone="danger" onClick={() => setPendingDelete(selectedEntries)}>
                  Löschen
                </EckeButton>
              )}
              {noneInvoiced && singleClient && (
                <EckeButton surface="glass" emphasis="secondary" onClick={createInvoiceFromSelection}>
                  In Rechnung übernehmen
                </EckeButton>
              )}
            </EckeSelectionBar>
          )}
          {selected.length > 0 && !(noneInvoiced && singleClient) && (
            <p className="zeiterfassung__selection-hint">
              {!noneInvoiced
                ? "Bereits abgerechnete Einträge können nicht übernommen oder gelöscht werden."
                : "Nur Einträge desselben Kunden können gemeinsam in Rechnung übernommen werden."}
            </p>
          )}

          <EckeTableCard surface="glass" className="zeiterfassung__table">
            <EckeTable ref={tableRef} columns={COLUMNS} rows={rows} selectable onEckeSelectionChange={(e) => setSelected(e.detail.indices)} />
          </EckeTableCard>
        </>
      )}

      <StartTimerModal open={startOpen} onClose={() => setStartOpen(false)} onStart={(params) => stopwatch.start(params)} />
      <EntryFormModal entry={formEntry} onClose={() => setFormEntry(null)} />

      <ConfirmModal
        open={!!pendingDelete}
        heading={pendingDelete && pendingDelete.length > 1 ? "Zeiteinträge löschen?" : "Zeiteintrag löschen?"}
        message={
          pendingDelete && pendingDelete.length > 1
            ? `${pendingDelete.length} Zeiteinträge werden unwiderruflich gelöscht.`
            : "Der Zeiteintrag wird unwiderruflich gelöscht."
        }
        pending={deleteEntry.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
