import { zodResolver } from "@hookform/resolvers/zod";
import { EckeButton, EckeDropdown, EckeField, EckeInput, EckeModal } from "@ds/stencil/react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import { useAuth } from "@/auth/AuthProvider";

import "@/shell/forms.css";
import "./EntryFormModal.css";

import { computeDurationMinutes } from "@/lib/duration";
import { useCreateTimeEntry, usePickerClients, useUpdateTimeEntry } from "../hooks";
import { timeEntrySchema, type TimeEntryFormValues } from "../schema";
import type { TimeEntryWithClient } from "../api";

/** `yyyy-MM-ddTHH:mm` in LOCAL time — `datetime-local`'s own wire format. Deliberately not `toISOString()`, which is UTC and would shift the displayed clock time by the browser's offset. */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultValuesFor(entry: TimeEntryWithClient | "new"): TimeEntryFormValues {
  if (entry === "new") {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0);
    return { client_id: "", description: "", start: toDatetimeLocal(start), end: toDatetimeLocal(end) };
  }
  const start = new Date(entry.start_time);
  const end = entry.end_time ? new Date(entry.end_time) : new Date(start.getTime() + (entry.duration_minutes ?? 0) * 60_000);
  return {
    client_id: entry.client_id,
    description: entry.description ?? "",
    start: toDatetimeLocal(start),
    end: toDatetimeLocal(end),
  };
}

/**
 * Create AND edit a manual time entry — one form for both, same as the old
 * app's single `_TimeEntryFormDialog` behind `showManualEntryDialog` /
 * `showEditTimeEntryDialog`. Only ever offered for a not-yet-invoiced entry
 * (ZeiterfassungScreen hides "Bearbeiten" once `is_invoiced` — RLS would
 * reject the write regardless, docs/DATABASE_SCHEMA.md §6).
 */
export function EntryFormModal({
  entry,
  onClose,
}: {
  /** `"new"` = create, a row = edit, `null` = closed. */
  entry: TimeEntryWithClient | "new" | null;
  onClose: () => void;
}) {
  const isEditing = entry !== null && entry !== "new";
  const { session } = useAuth();
  const { clients } = usePickerClients(isEditing ? entry.client_id : undefined);
  const createEntry = useCreateTimeEntry();
  const updateEntry = useUpdateTimeEntry(isEditing ? entry.id : "");

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TimeEntryFormValues>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: entry ? defaultValuesFor(entry) : defaultValuesFor("new"),
  });

  useEffect(() => {
    if (entry !== null) reset(defaultValuesFor(entry));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable; only re-seed when the modal (re)opens or the target entry changes
  }, [entry]);

  const mutationError = isEditing ? updateEntry.error : createEntry.error;

  const onSubmit = async (values: TimeEntryFormValues) => {
    const start = new Date(values.start);
    const end = new Date(values.end);
    const client = clients.find((c) => c.id === values.client_id);
    const payload = {
      client_id: values.client_id,
      description: values.description,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: computeDurationMinutes(start, end),
      // The currently-selected client's rate, snapshotted fresh at save
      // time — matches the old app's cubit, which re-reads `hourlyRate`
      // from the dialog's (possibly just-changed) client selection rather
      // than reusing the entry's original snapshot.
      hourly_rate_snapshot: client?.hourly_rate ?? (isEditing ? entry.hourly_rate_snapshot : 0),
    };
    if (isEditing) {
      // profile_id is deliberately NOT touched here: an admin correcting
      // an employee's entry must not reassign it to themselves, and the
      // update RLS policy's WITH CHECK only re-validates the existing
      // value, not a supplied one.
      await updateEntry.mutateAsync(payload);
    } else {
      // profile_id has no server default (docs/DATABASE_SCHEMA.md §5) and
      // its INSERT policy requires it to equal the caller's own id — the
      // old app's remote data source injected this same field server-side
      // of the repository layer; here it happens at the one call site
      // that creates a row.
      await createEntry.mutateAsync({ ...payload, profile_id: session!.user.id });
    }
    onClose();
  };

  return (
    <EckeModal open={entry !== null} heading={isEditing ? "Zeiteintrag bearbeiten" : "Manueller Eintrag"} onEckeClose={onClose} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Controller
          control={control}
          name="client_id"
          render={({ field }) => (
            <EckeField label="Kunde *" error={errors.client_id?.message}>
              <EckeDropdown
                options={clients.map((c) => ({ value: c.id, label: c.name }))}
                value={field.value}
                placeholder="Kunde wählen…"
                invalid={!!errors.client_id}
                onEckeChange={(e) => field.onChange(e.detail)}
              />
            </EckeField>
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <EckeField label="Leistung *" error={errors.description?.message}>
              <EckeInput value={field.value} invalid={!!errors.description} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
            </EckeField>
          )}
        />
        <div className="entry-form__row">
          <Controller
            control={control}
            name="start"
            render={({ field }) => (
              <EckeField label="Start *" error={errors.start?.message}>
                <input
                  type="datetime-local"
                  className="native-date-input"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  onBlur={field.onBlur}
                />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="end"
            render={({ field }) => (
              <EckeField label="Ende *" error={errors.end?.message}>
                <input
                  type="datetime-local"
                  className="native-date-input"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  onBlur={field.onBlur}
                />
              </EckeField>
            )}
          />
        </div>

        {mutationError && (
          <p role="alert" className="form-error">
            Zeiteintrag konnte nicht gespeichert werden{isEditing ? " (evtl. bereits abgerechnet)" : ""}.
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
