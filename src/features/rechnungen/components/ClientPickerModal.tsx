import { zodResolver } from "@hookform/resolvers/zod";
import { EckeButton, EckeDropdown, EckeField, EckeModal } from "@ds/stencil/react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { useActiveClients } from "@/lib/pickers";

import "@/shell/forms.css";

const schema = z.object({ client_id: z.string().trim().min(1, "Pflichtfeld") });
type FormValues = z.infer<typeof schema>;

/**
 * "Neue Rechnung" needs a client chosen before the editor can open at all
 * (an invoice's `client_id` is fixed at creation — nothing in the editor
 * itself changes it). Ported from the old app's `SimpleDialog` client
 * list, but as one `ecke-dropdown` rather than a button per client — this
 * repo's Kunden dataset (dozens of clients) makes a scrolling button list
 * the wrong shape for the same picker that already works fine as a
 * dropdown in Zeiterfassung's modals.
 */
export function ClientPickerModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (clientId: string) => void }) {
  const clientsQuery = useActiveClients();
  const clients = clientsQuery.data ?? [];

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { client_id: "" } });

  const onSubmit = (values: FormValues) => {
    onPick(values.client_id);
    reset({ client_id: "" });
  };

  return (
    <EckeModal open={open} heading="Neue Rechnung" onEckeClose={onClose} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Controller
          control={control}
          name="client_id"
          render={({ field }) => (
            <EckeField label="Kunde *" error={errors.client_id?.message}>
              <EckeDropdown
                // INTERIM — remove when design-system issue #9 lands.
                // The APG listbox popup (position: fixed inside the shadow
                // root) is unclickable here: a real click lands on
                // <ecke-modal> instead of the option underneath it,
                // confirmed via document.elementFromPoint() at the
                // option's own screen coordinates, not just a Playwright
                // actionability false positive. Reproduces on this page
                // (a long, tall client list under the modal) but not on
                // Zeiterfassung's structurally identical StartTimerModal
                // dropdown — likely a stacking-context interaction with
                // the scrollable content behind the modal, not a plain
                // z-index fix. `native` (a real OS-level `<select>`,
                // immune to any of this app's CSS) is the component's own
                // documented escape hatch for exactly this failure mode.
                native
                options={clients.map((c) => ({ value: c.id, label: c.name }))}
                value={field.value}
                placeholder={clientsQuery.isPending ? "Wird geladen…" : "Kunde wählen…"}
                disabled={clientsQuery.isPending}
                invalid={!!errors.client_id}
                onEckeChange={(e) => field.onChange(e.detail)}
              />
            </EckeField>
          )}
        />
        {!clientsQuery.isPending && clients.length === 0 && (
          <p className="form-error" role="alert">
            Keine aktiven Kunden vorhanden.
          </p>
        )}
        <div className="form-actions">
          <EckeButton surface="glass" type="button" emphasis="ghost" onClick={onClose}>
            Abbrechen
          </EckeButton>
          <EckeButton surface="glass" type="submit" emphasis="primary" disabled={clients.length === 0}>
            Weiter
          </EckeButton>
        </div>
      </form>
    </EckeModal>
  );
}
