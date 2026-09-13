import { EckeBadge, EckeButton, EckePageHeader } from "@ds/stencil/react";
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { durationHours } from "@/lib/duration";
import { formatEuro } from "@/lib/formatters";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, type InvoiceStatus } from "@/lib/invoiceStatus";
import { ConfirmModal } from "@/shell/ConfirmModal";

import { downloadInvoicePdf, replaceInvoiceItems, updateInvoiceTotal, type UninvoicedTimeEntry } from "../api";
import { itemFromManualEntry, type EditorItem } from "../editorItem";
import {
  useClientAddress,
  useCreateDraftInvoice,
  useDeleteInvoice,
  useGeneratePdf,
  useInvoiceDetail,
  useLetterhead,
  useNextInvoiceNumberPreview,
  useSaveInvoiceItems,
  useUninvoicedTimeEntries,
  useUpdateInvoiceMeta,
  useUpdateInvoiceStatus,
} from "../hooks";
import { computeInvoiceTotal, computeLineTotal } from "../totals";
import { isEditable, nextStatuses } from "../transitions";
import { AddManualItemModal } from "./AddManualItemModal";
import { InvoiceItemsTable } from "./InvoiceItemsTable";
import { InvoicePreview } from "./InvoicePreview";
import "./InvoiceEditorScreen.css";

function itemFromTimeEntry(entry: UninvoicedTimeEntry): EditorItem {
  const hours = durationHours(entry.duration_minutes ?? 0);
  return {
    description: entry.description ?? "Leistung",
    quantity: hours,
    unit_price: entry.hourly_rate_snapshot,
    line_total: computeLineTotal(hours, entry.hourly_rate_snapshot),
    linked_time_entry_id: entry.id,
    template_id: entry.template_id,
  };
}

export function InvoiceEditorScreen() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, isAdmin } = useAuth();

  const isNew = !id;
  const newClientId = searchParams.get("client") ?? undefined;
  const preselectedEntryIds = useMemo(() => searchParams.get("entries")?.split(",").filter(Boolean) ?? [], [searchParams]);

  const detailQuery = useInvoiceDetail(id);
  const numberPreviewQuery = useNextInvoiceNumberPreview();
  const letterheadQuery = useLetterhead();

  // Once an invoice exists, its client_id is fixed — either value feeds
  // the same uninvoiced-entries / address queries either way.
  const clientId = isNew ? newClientId : detailQuery.data?.invoice.client_id;
  const clientAddressQuery = useClientAddress(isNew ? clientId : undefined);
  const uninvoicedQuery = useUninvoicedTimeEntries(clientId);

  const createDraft = useCreateDraftInvoice();
  const saveItems = useSaveInvoiceItems(id ?? "");
  const updateMeta = useUpdateInvoiceMeta(id ?? "");
  const updateStatus = useUpdateInvoiceStatus(id ?? "");
  const deleteInvoice = useDeleteInvoice();
  const generatePdf = useGeneratePdf(id ?? "");

  const [items, setItems] = useState<EditorItem[]>([]);
  const [dateDue, setDateDue] = useState("");
  const [notes, setNotes] = useState("");
  const [manualItemOpen, setManualItemOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<InvoiceStatus | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [previewToday] = useState(() => new Date());

  // Seed local state from the loaded draft — keyed on the invoice id alone
  // (not on every refetch, so a background refetch mid-edit doesn't clobber
  // unsaved changes) via React's documented "adjust state during render"
  // pattern (react.dev/learn/you-might-not-need-an-effect) rather than a
  // `useEffect` that calls `setState` directly — this project's ESLint
  // config (eslint-plugin-react-hooks v7's purity/effect rules) flags the
  // latter as a cascading-render risk. `ClientFormScreen`'s react-hook-form
  // `reset()`-in-effect isn't flagged the same way, since `reset` isn't a
  // bare `useState` setter the rule can see, but the shape is the same.
  const [seededForId, setSeededForId] = useState<string | undefined>(undefined);
  if (detailQuery.data && seededForId !== detailQuery.data.invoice.id) {
    setSeededForId(detailQuery.data.invoice.id);
    setItems(
      detailQuery.data.items.map((row) => ({
        description: row.description,
        quantity: row.quantity,
        unit_price: row.unit_price,
        line_total: row.line_total,
        linked_time_entry_id: row.linked_time_entry_id,
        template_id: row.template_id,
      })),
    );
    setDateDue(detailQuery.data.invoice.date_due ?? "");
    setNotes(detailQuery.data.invoice.notes ?? "");
  }

  // The Zeiterfassung "In Rechnung übernehmen" handoff: convert the
  // preselected uninvoiced entries into line items once, the moment
  // they're available — mirrors the old app's `startNew(preselectedTimeEntryIds)`.
  // Same during-render pattern as above, guarded by `seededPreselection` so
  // it only ever fires once.
  const [seededPreselection, setSeededPreselection] = useState(false);
  if (isNew && !seededPreselection && preselectedEntryIds.length > 0 && uninvoicedQuery.data) {
    const preselected = new Set(preselectedEntryIds);
    const seeded = uninvoicedQuery.data.filter((e) => preselected.has(e.id)).map(itemFromTimeEntry);
    setSeededPreselection(true);
    if (seeded.length > 0) setItems((current) => [...current, ...seeded]);
  }

  const total = useMemo(() => computeInvoiceTotal(items), [items]);
  const status = ((isNew ? "draft" : detailQuery.data?.invoice.status) ?? "draft") as InvoiceStatus;
  const editable = isEditable(status);
  const addableEntries = useMemo(
    () => (uninvoicedQuery.data ?? []).filter((e) => !items.some((item) => item.linked_time_entry_id === e.id)),
    [uninvoicedQuery.data, items],
  );

  const clientDisplay = isNew ? clientAddressQuery.data : detailQuery.data?.client;
  const saving = createDraft.isPending || saveItems.isPending || updateMeta.isPending;
  const mutationError = createDraft.error ?? saveItems.error ?? updateMeta.error;

  const addManualItem = (values: { description: string; quantity: number; unit_price: number }) => {
    setItems((current) => [...current, itemFromManualEntry(values.description, values.quantity, values.unit_price, computeLineTotal(values.quantity, values.unit_price))]);
  };
  const addUninvoicedEntry = (entry: UninvoicedTimeEntry) => {
    setItems((current) => [...current, itemFromTimeEntry(entry)]);
  };
  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, i) => i !== index));
  };

  const itemPayload = () => items.map(({ description, quantity, unit_price, line_total, linked_time_entry_id, template_id }) => ({ description, quantity, unit_price, line_total, linked_time_entry_id, template_id }));

  const handleSave = async () => {
    if (isNew) {
      if (!clientId) return;
      const invoice = await createDraft.mutateAsync({
        client_id: clientId,
        profile_id: session!.user.id, // no server default; INSERT policy requires this to equal the caller's own id — same finding as time_entries (docs/DATABASE_SCHEMA.md §6)
        date_due: dateDue || null,
        notes: notes || null,
      });
      // useSaveInvoiceItems is bound to `id`, which is undefined in "neu"
      // mode (there's nothing to bind it to before the invoice exists) —
      // call the API functions directly for this one first save instead of
      // through that hook.
      if (items.length > 0) {
        const savedItems = await replaceInvoiceItems(invoice.id, itemPayload());
        await updateInvoiceTotal(invoice.id, computeInvoiceTotal(savedItems));
      }
      navigate(`/rechnungen/${invoice.id}`, { replace: true });
      return;
    }

    await saveItems.mutateAsync(itemPayload());
    await updateMeta.mutateAsync({ date_due: dateDue || null, notes: notes || null });
  };

  const handleGeneratePdf = () => void generatePdf.mutateAsync();

  const handleDownloadPdf = async () => {
    if (!id) return;
    const blob = await downloadInvoicePdf(id);
    // Left to the browser's own tab lifecycle rather than revoked here —
    // this is a real app tab (not a sandboxed Artifact), so a normal
    // object-URL-in-a-new-tab open works fine; the URL is reclaimed when
    // that tab is closed or navigated away from.
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
  };

  const confirmStatusChange = async () => {
    if (!pendingStatus) return;
    await updateStatus.mutateAsync(pendingStatus);
    setPendingStatus(null);
  };

  const confirmDelete = async () => {
    if (!id) return;
    await deleteInvoice.mutateAsync(id);
    navigate("/rechnungen");
  };

  if (!isNew && detailQuery.isPending) return <p>Wird geladen…</p>;
  if (!isNew && (detailQuery.isError || !detailQuery.data)) return <p role="alert">Rechnung konnte nicht geladen werden.</p>;
  if (isNew && !clientId) return <p role="alert">Kein Kunde ausgewählt.</p>;

  const invoiceNumber = isNew ? numberPreviewQuery.data : detailQuery.data?.invoice.invoice_number;
  // `date_issued` gets a real `DEFAULT current_date` the moment the row is
  // saved, so the null case here is purely "not saved yet" — `previewToday`
  // (a Date computed once at mount, not `new Date()`/`Date.now()` inline
  // during render, which this project's purity lint rule flags) covers
  // both that and the `isNew` branch.
  const dateIssued = isNew ? previewToday : new Date(detailQuery.data!.invoice.date_issued ?? previewToday.toISOString());
  const hasPdf = !isNew && !!detailQuery.data?.invoice.pdf_storage_path;

  return (
    <>
      <EckePageHeader pageTitle={`Rechnung ${invoiceNumber ? `#${invoiceNumber}` : ""}`}>
        <EckeBadge tone={INVOICE_STATUS_TONE[status]}>{INVOICE_STATUS_LABEL[status]}</EckeBadge>
        {editable && (
          <EckeButton surface="glass" emphasis="primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Speichert…" : "Speichern"}
          </EckeButton>
        )}
        {!isNew && editable && (
          <EckeButton surface="glass" emphasis="secondary" onClick={handleGeneratePdf} disabled={generatePdf.isPending}>
            {generatePdf.isPending ? "Erstellt PDF…" : "PDF erstellen"}
          </EckeButton>
        )}
        {hasPdf && (
          <EckeButton surface="glass" emphasis="secondary" onClick={() => void handleDownloadPdf()}>
            PDF ansehen
          </EckeButton>
        )}
        {!isNew &&
          isAdmin &&
          nextStatuses(status).map((next) => (
            <EckeButton
              key={next}
              surface="glass"
              emphasis="secondary"
              tone={next === "cancelled" ? "danger" : "neutral"}
              disabled={next === "sent" && !hasPdf}
              onClick={() => setPendingStatus(next)}
            >
              Als „{INVOICE_STATUS_LABEL[next]}" markieren
            </EckeButton>
          ))}
        {!isNew && editable && (
          <EckeButton surface="glass" emphasis="ghost" tone="danger" onClick={() => setPendingDelete(true)}>
            Löschen
          </EckeButton>
        )}
      </EckePageHeader>

      {!isNew && isAdmin && nextStatuses(status).includes("sent") && !hasPdf && (
        <p className="invoice-editor__hint">Vor dem Versenden muss zuerst ein PDF erstellt werden.</p>
      )}

      {mutationError && (
        <p role="alert" className="form-error">
          Rechnung konnte nicht gespeichert werden.
        </p>
      )}

      <div className="invoice-editor__grid">
        <div className="invoice-editor__main">
          {editable && (
            <div className="invoice-editor__meta">
              <label className="invoice-editor__field">
                <span>Fällig am</span>
                <input type="date" className="native-date-input" value={dateDue} onChange={(e) => setDateDue(e.target.value)} />
              </label>
              <label className="invoice-editor__field invoice-editor__field--notes">
                <span>Notizen</span>
                <textarea className="native-date-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
          )}

          <div className="invoice-editor__items-card">
            <div className="invoice-editor__items-header">
              <h2>Positionen</h2>
              {editable && (
                <EckeButton surface="glass" emphasis="secondary" onClick={() => setManualItemOpen(true)}>
                  Position hinzufügen
                </EckeButton>
              )}
            </div>
            <InvoiceItemsTable items={items} editable={editable} onRemove={removeItem} />
            <div className="invoice-editor__total">
              <span>Gesamtbetrag</span>
              <strong>{formatEuro(total)}</strong>
            </div>
          </div>

          {editable && addableEntries.length > 0 && (
            <div className="invoice-editor__items-card">
              <h2>Nicht abgerechnete Zeiteinträge</h2>
              <ul className="invoice-editor__uninvoiced">
                {addableEntries.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      {entry.description ?? "Leistung"} · {formatEuro(durationHours(entry.duration_minutes ?? 0) * entry.hourly_rate_snapshot)}
                    </span>
                    <EckeButton surface="glass" emphasis="ghost" onClick={() => addUninvoicedEntry(entry)}>
                      Hinzufügen
                    </EckeButton>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="invoice-editor__preview">
          {clientDisplay && (
            <InvoicePreview
              invoiceNumber={invoiceNumber}
              dateIssued={dateIssued}
              dateDue={dateDue}
              client={clientDisplay}
              items={items}
              total={total}
              letterhead={letterheadQuery.data}
            />
          )}
        </div>
      </div>

      <AddManualItemModal open={manualItemOpen} onClose={() => setManualItemOpen(false)} onAdd={addManualItem} />

      <ConfirmModal
        open={!!pendingStatus}
        heading={`Als „${pendingStatus ? INVOICE_STATUS_LABEL[pendingStatus] : ""}" markieren?`}
        message={
          pendingStatus === "sent"
            ? "Die Rechnung wird abgeschlossen — Positionen, Kunde und Betrag können danach nicht mehr geändert werden."
            : pendingStatus === "cancelled"
              ? "Die Rechnung wird storniert. Das kann nicht rückgängig gemacht werden."
              : "Der Status wird aktualisiert."
        }
        confirmLabel="Bestätigen"
        pending={updateStatus.isPending}
        onConfirm={() => void confirmStatusChange()}
        onCancel={() => setPendingStatus(null)}
      />

      <ConfirmModal
        open={pendingDelete}
        heading="Rechnung löschen?"
        message="Der Entwurf wird unwiderruflich gelöscht; verknüpfte Zeiteinträge werden wieder als nicht abgerechnet markiert."
        pending={deleteInvoice.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(false)}
      />
    </>
  );
}
