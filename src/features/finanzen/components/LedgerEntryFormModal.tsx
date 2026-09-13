import { zodResolver } from "@hookform/resolvers/zod";
import { EckeButton, EckeDropdown, EckeField, EckeInput, EckeModal } from "@ds/stencil/react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import { useAuth } from "@/auth/AuthProvider";

import "@/shell/forms.css";
import "./LedgerEntryFormModal.css";

import type { LedgerEntry } from "../api";
import { useCreateLedgerEntry, useUpdateLedgerEntry } from "../hooks";
import { LEDGER_CATEGORIES, ledgerEntrySchema, type LedgerEntryFormValues } from "../schema";

const TYPE_OPTIONS = [
  { value: "expense", label: "Ausgabe" },
  { value: "income", label: "Einnahme" },
];
const CATEGORY_OPTIONS = [{ value: "", label: "—" }, ...LEDGER_CATEGORIES.map((c) => ({ value: c, label: c }))];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultValuesFor(entry: LedgerEntry | "new"): LedgerEntryFormValues {
  if (entry === "new") {
    return { entry_type: "expense", entry_date: todayIso(), description: "", amount: 0, category: "" };
  }
  return {
    entry_type: entry.entry_type === "income" ? "income" : "expense",
    entry_date: entry.entry_date,
    description: entry.description,
    amount: entry.amount,
    category: entry.category ?? "",
  };
}

/**
 * Create AND edit a ledger entry — one form for both, same shape as
 * Zeiterfassung's `EntryFormModal` and Kunden's `ContactFormModal`
 * (`entry: LedgerEntry | "new" | null`, `null` = closed).
 */
export function LedgerEntryFormModal({ entry, onClose }: { entry: LedgerEntry | "new" | null; onClose: () => void }) {
  const isEditing = entry !== null && entry !== "new";
  const { session } = useAuth();
  const createEntry = useCreateLedgerEntry();
  const updateEntry = useUpdateLedgerEntry(isEditing ? entry.id : "");

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LedgerEntryFormValues>({
    resolver: zodResolver(ledgerEntrySchema),
    defaultValues: entry ? defaultValuesFor(entry) : defaultValuesFor("new"),
  });

  useEffect(() => {
    if (entry !== null) reset(defaultValuesFor(entry));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable; only re-seed when the modal (re)opens or the target entry changes
  }, [entry]);

  const mutationError = isEditing ? updateEntry.error : createEntry.error;

  const onSubmit = async (values: LedgerEntryFormValues) => {
    const payload = {
      entry_type: values.entry_type,
      entry_date: values.entry_date,
      description: values.description,
      amount: values.amount,
      category: values.category || null,
    };
    if (isEditing) {
      // profile_id is never touched on update — an admin correcting an
      // employee's booking must not reassign it to themselves, the same
      // rule this app already applies to time_entries and invoices.
      await updateEntry.mutateAsync(payload);
    } else {
      // profile_id has no server default and its INSERT policy requires
      // it to equal the caller's own id (docs/DATABASE_SCHEMA.md §6) —
      // same finding as time_entries/invoices.
      await createEntry.mutateAsync({ ...payload, profile_id: session!.user.id });
    }
    onClose();
  };

  return (
    <EckeModal open={entry !== null} heading={isEditing ? "Buchung bearbeiten" : "Neue Buchung"} onEckeClose={onClose} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Controller
          control={control}
          name="entry_type"
          render={({ field }) => (
            <EckeField label="Typ *">
              <EckeDropdown options={TYPE_OPTIONS} value={field.value} onEckeChange={(e) => field.onChange(e.detail)} />
            </EckeField>
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <EckeField label="Beschreibung *" error={errors.description?.message}>
              <EckeInput value={field.value} invalid={!!errors.description} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
            </EckeField>
          )}
        />
        <div className="ledger-form__row">
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <EckeField label="Betrag (€) *" error={errors.amount?.message}>
                <EckeInput
                  type="number"
                  value={String(field.value)}
                  invalid={!!errors.amount}
                  onEckeInput={(e) => field.onChange(Number(e.detail))}
                  onEckeChange={field.onBlur}
                />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="entry_date"
            render={({ field }) => (
              <EckeField label="Datum *" error={errors.entry_date?.message}>
                <input type="date" className="native-date-input" value={field.value} onChange={(e) => field.onChange(e.target.value)} onBlur={field.onBlur} />
              </EckeField>
            )}
          />
        </div>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <EckeField label="Kategorie">
              <EckeDropdown options={CATEGORY_OPTIONS} value={field.value} onEckeChange={(e) => field.onChange(e.detail)} />
            </EckeField>
          )}
        />

        {mutationError && (
          <p role="alert" className="form-error">
            Buchung konnte nicht gespeichert werden.
          </p>
        )}

        <div className="form-actions">
          <EckeButton surface="glass" type="button" emphasis="ghost" onClick={onClose} disabled={isSubmitting}>
            Abbrechen
          </EckeButton>
          <EckeButton surface="glass" type="submit" emphasis="primary" disabled={isSubmitting}>
            {isSubmitting ? "Speichern…" : "Speichern"}
          </EckeButton>
        </div>
      </form>
    </EckeModal>
  );
}
