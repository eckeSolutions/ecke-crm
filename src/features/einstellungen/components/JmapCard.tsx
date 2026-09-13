import { zodResolver } from "@hookform/resolvers/zod";
import { EckeBadge, EckeButton, EckeCard, EckeField, EckeIcon, EckeInput } from "@ds/stencil/react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import "@/shell/forms.css";
import "./EinstellungenScreen.css";

import type { CompanySettings } from "../api";
import { useUpdateCompanySettings } from "../hooks";
import { jmapSchema, type JmapFormValues } from "../schema";
import { ReplaceJmapSecretModal } from "./ReplaceJmapSecretModal";

function valuesFrom(settings: CompanySettings): JmapFormValues {
  return { jmap_endpoint: settings.jmap_endpoint ?? "", jmap_username: settings.jmap_username ?? "" };
}

/** Stalwart connection details — `jmap_username` is display-only context; `sync-contacts`/`sync-calendar` authenticate with the Bearer secret alone (see `_shared/jmap.ts`'s file header). */
export function JmapCard({ settings }: { settings: CompanySettings }) {
  const updateSettings = useUpdateCompanySettings();
  const [replaceOpen, setReplaceOpen] = useState(false);
  const hasSecret = !!settings.jmap_secret_id;

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<JmapFormValues>({
    resolver: zodResolver(jmapSchema),
    defaultValues: valuesFrom(settings),
  });

  useEffect(() => {
    reset(valuesFrom(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable; only re-seed when the row itself changes
  }, [settings]);

  const onSubmit = (values: JmapFormValues) => {
    void updateSettings.mutateAsync(values);
  };

  return (
    <EckeCard surface="glass" heading="JMAP / DAV (Stalwart)">
      <div className="settings-form__badge-row">
        <EckeBadge tone={hasSecret ? "success" : "neutral"}>{hasSecret ? "konfiguriert" : "nicht konfiguriert"}</EckeBadge>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="settings-form">
        <div className="settings-form__row">
          <Controller
            control={control}
            name="jmap_endpoint"
            render={({ field }) => (
              <EckeField label="Endpoint">
                <EckeInput value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="jmap_username"
            render={({ field }) => (
              <EckeField label="Benutzername">
                <EckeInput value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
              </EckeField>
            )}
          />
        </div>

        <p className="settings-form__hint">
          <EckeIcon name="info" /> {hasSecret ? "Passwort/Token konfiguriert" : "Kein Passwort/Token hinterlegt"} · wird nie
          angezeigt (sicher verschlüsselt hinterlegt)
        </p>

        {updateSettings.isError && (
          <p role="alert" className="form-error">
            Einstellungen konnten nicht gespeichert werden.
          </p>
        )}

        <div className="form-actions">
          <EckeButton surface="glass" type="button" emphasis="secondary" onClick={() => setReplaceOpen(true)}>
            Ersetzen
          </EckeButton>
          <EckeButton surface="glass" type="submit" emphasis="primary" disabled={isSubmitting}>
            {isSubmitting ? "Speichern…" : "Speichern"}
          </EckeButton>
        </div>
      </form>

      <ReplaceJmapSecretModal open={replaceOpen} onClose={() => setReplaceOpen(false)} />
    </EckeCard>
  );
}
