import { EckeButton, EckeCard, EckeIcon, EckePageHeader, EckeSelectionBar, EckeStatCard, EckeTable, EckeTableCard } from "@ds/stencil/react";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";

import { formatDateShortDe, formatEuro } from "@/lib/formatters";
import { ConfirmModal } from "@/shell/ConfirmModal";

import type { LedgerEntry } from "../api";
import { useDeleteLedgerEntry, useLedgerEntriesForCurrentMonth } from "../hooks";
import { balance, totalExpense, totalIncome } from "../totals";
import { LedgerEntryFormModal } from "./LedgerEntryFormModal";
import "./FinanceScreen.css";

const COLUMNS = [
  { key: "date", label: "Datum" },
  { key: "type", label: "Typ" },
  { key: "category", label: "Kategorie" },
  { key: "description", label: "Beschreibung" },
  { key: "amount", label: "Betrag", align: "right" as const },
];

export function FinanceScreen() {
  const entriesQuery = useLedgerEntriesForCurrentMonth();
  const deleteEntry = useDeleteLedgerEntry();

  const [formEntry, setFormEntry] = useState<LedgerEntry | "new" | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingDelete, setPendingDelete] = useState<LedgerEntry[] | null>(null);
  const tableRef = useRef<ComponentRef<typeof EckeTable>>(null);

  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const income = useMemo(() => totalIncome(entries), [entries]);
  const expense = useMemo(() => totalExpense(entries), [entries]);
  const balanceAmount = useMemo(() => balance(entries), [entries]);

  const rows = useMemo(
    () =>
      entries.map((e) => ({
        date: formatDateShortDe(new Date(e.entry_date)),
        type: e.entry_type === "income" ? "Einnahme" : "Ausgabe",
        category: e.category ?? "—",
        description: e.description,
        amount: formatEuro(e.amount),
      })),
    [entries],
  );

  // Row click -> edit, same composedPath() pattern Clients'/TimeTracking's/
  // Invoices' tables use (ecke-table emits no row event of its own).
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
      if (entry) setFormEntry(entry);
    };

    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [entries]);

  const selectedEntries = selected.map((i) => entries[i]).filter((e): e is LedgerEntry => !!e);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    for (const entry of pendingDelete) await deleteEntry.mutateAsync(entry.id);
    setPendingDelete(null);
    setSelected([]);
  };

  return (
    <>
      <EckePageHeader pageTitle="Finanzen" subtitle="Manuelle Buchungen — Bürokosten, Software & Co.">
        <EckeButton surface="glass" emphasis="primary" onClick={() => setFormEntry("new")}>
          Neue Buchung
        </EckeButton>
      </EckePageHeader>

      <div className="finance__stats">
        {/* No income/expense icon in the design system's fixed 29-icon set
            (checked: nothing reads as "money in"/"money out") — the
            iconVariant tint (green/red) already carries that distinction,
            so these two cards go icon-less rather than force a mismatched
            one in. Saldo's wallet icon is the one that actually fits. */}
        <EckeStatCard label="Einnahmen (Monat)" value={formatEuro(income)} iconVariant="success" />
        <EckeStatCard label="Ausgaben (Monat)" value={formatEuro(expense)} iconVariant="danger" />
        <EckeStatCard label="Saldo (Monat)" value={formatEuro(balanceAmount)}>
          <EckeIcon slot="icon" name="wallet" />
        </EckeStatCard>
      </div>

      {entriesQuery.isPending ? (
        <p>Wird geladen…</p>
      ) : entriesQuery.isError ? (
        <p role="alert">Buchungen konnten nicht geladen werden.</p>
      ) : entries.length === 0 ? (
        <EckeCard surface="glass">
          <p>Noch keine Buchungen in diesem Monat.</p>
        </EckeCard>
      ) : (
        <>
          {selected.length > 0 && (
            <EckeSelectionBar summary={`${selected.length} Buchungen ausgewählt`} onEckeClear={() => setSelected([])} className="finance__selection">
              <EckeButton surface="glass" emphasis="secondary" tone="danger" onClick={() => setPendingDelete(selectedEntries)}>
                Löschen
              </EckeButton>
            </EckeSelectionBar>
          )}

          <EckeTableCard surface="glass" className="finance__table">
            <EckeTable ref={tableRef} columns={COLUMNS} rows={rows} selectable onEckeSelectionChange={(e) => setSelected(e.detail.indices)} />
          </EckeTableCard>
        </>
      )}

      <LedgerEntryFormModal entry={formEntry} onClose={() => setFormEntry(null)} />

      <ConfirmModal
        open={!!pendingDelete}
        heading={pendingDelete && pendingDelete.length > 1 ? "Buchungen löschen?" : "Buchung löschen?"}
        message={
          pendingDelete && pendingDelete.length > 1
            ? `${pendingDelete.length} Buchungen werden unwiderruflich gelöscht.`
            : "Die Buchung wird unwiderruflich gelöscht."
        }
        pending={deleteEntry.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
