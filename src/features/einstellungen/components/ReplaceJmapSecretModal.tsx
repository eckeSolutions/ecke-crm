import { zodResolver } from "@hookform/resolvers/zod";
import { EckeButton, EckeField, EckeInput, EckeModal } from "@ds/stencil/react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import "@/shell/forms.css";

import { useReplaceJmapSecret } from "../hooks";
import { replaceJmapSecretSchema, type ReplaceJmapSecretFormValues } from "../schema";

const EMPTY_VALUES: ReplaceJmapSecretFormValues = { secret: "" };

/**
 * The secret is write-only end to end: never fetched back from the server
 * (only a `service_role` Edge Function can read `vault.decrypted_secrets`
 * at all), and this form never pre-fills a masked placeholder either —
 * there is nothing to prefill from.
 */
export function ReplaceJmapSecretModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const replaceSecret = useReplaceJmapSecret();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReplaceJmapSecretFormValues>({ resolver: zodResolver(replaceJmapSecretSchema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (open) reset(EMPTY_VALUES);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable; only re-seed when the modal (re)opens
  }, [open]);

  const onSubmit = async (values: ReplaceJmapSecretFormValues) => {
    await replaceSecret.mutateAsync(values.secret);
    onClose();
  };

  return (
    <EckeModal open={open} heading="JMAP/DAV-Zugangsdaten ersetzen" onEckeClose={onClose} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Controller
          control={control}
          name="secret"
          render={({ field }) => (
            <EckeField label="Neues Passwort / Token *" error={errors.secret?.message}>
              <EckeInput type="password" value={field.value} invalid={!!errors.secret} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
            </EckeField>
          )}
        />

        {replaceSecret.isError && (
          <p role="alert" className="form-error">
            Zugangsdaten konnten nicht aktualisiert werden — ist die Edge Function set-jmap-secret bereitgestellt?
          </p>
        )}

        <div className="form-actions">
          <EckeButton surface="glass" type="button" emphasis="ghost" onClick={onClose} disabled={isSubmitting}>
            Abbrechen
          </EckeButton>
          <EckeButton surface="glass" type="submit" emphasis="primary" disabled={isSubmitting}>
            {isSubmitting ? "Ersetzen…" : "Ersetzen"}
          </EckeButton>
        </div>
      </form>
    </EckeModal>
  );
}
