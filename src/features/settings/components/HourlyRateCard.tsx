import { zodResolver } from "@hookform/resolvers/zod";
import { EckeButton, EckeCard, EckeField, EckeInput } from "@ds/stencil/react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import "@/shell/forms.css";
import "./SettingsScreen.css";

import type { CompanySettings } from "../api";
import { useUpdateCompanySettings } from "../hooks";
import { hourlyRateSchema, type HourlyRateFormValues } from "../schema";

/** Feeds the clients feature's "new client" form via `get_default_hourly_rate()` — the only field of this whole admin-only table an employee reaches (docs/DATABASE_SCHEMA.md §7). */
export function HourlyRateCard({ settings }: { settings: CompanySettings }) {
  const updateSettings = useUpdateCompanySettings();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<HourlyRateFormValues>({
    resolver: zodResolver(hourlyRateSchema),
    defaultValues: { default_hourly_rate: settings.default_hourly_rate ?? 0 },
  });

  useEffect(() => {
    reset({ default_hourly_rate: settings.default_hourly_rate ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable; only re-seed when the row itself changes
  }, [settings]);

  const onSubmit = (values: HourlyRateFormValues) => {
    void updateSettings.mutateAsync(values);
  };

  return (
    <EckeCard surface="glass" heading="Standard-Stundensatz">
      <p className="settings-form__hint">Vorbelegung für neue Kunden.</p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="settings-form">
        <Controller
          control={control}
          name="default_hourly_rate"
          render={({ field }) => (
            <EckeField label="Satz (€)" error={errors.default_hourly_rate?.message}>
              <EckeInput
                type="number"
                value={String(field.value)}
                invalid={!!errors.default_hourly_rate}
                onEckeInput={(e) => field.onChange(Number(e.detail))}
                onEckeChange={field.onBlur}
              />
            </EckeField>
          )}
        />
        <p className="settings-form__hint">Mitarbeitende sehen nur diesen Satz, nicht die übrigen Firmendaten.</p>

        {updateSettings.isError && (
          <p role="alert" className="form-error">
            Einstellungen konnten nicht gespeichert werden.
          </p>
        )}

        <div className="form-actions">
          <EckeButton surface="glass" type="submit" emphasis="primary" disabled={isSubmitting}>
            {isSubmitting ? "Speichern…" : "Speichern"}
          </EckeButton>
        </div>
      </form>
    </EckeCard>
  );
}
