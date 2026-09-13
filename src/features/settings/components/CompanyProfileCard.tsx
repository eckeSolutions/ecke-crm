import { zodResolver } from "@hookform/resolvers/zod";
import { EckeButton, EckeCard, EckeField, EckeInput } from "@ds/stencil/react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import "@/shell/forms.css";
import "./SettingsScreen.css";

import type { CompanySettings } from "../api";
import { useUpdateCompanySettings } from "../hooks";
import { companyProfileSchema, type CompanyProfileFormValues } from "../schema";

function valuesFrom(settings: CompanySettings): CompanyProfileFormValues {
  return {
    company_name: settings.company_name ?? "",
    slogan: settings.slogan ?? "",
    street: settings.street ?? "",
    zip_code: settings.zip_code ?? "",
    city: settings.city ?? "",
    tax_number: settings.tax_number ?? "",
    vat_id: settings.vat_id ?? "",
    iban: settings.iban ?? "",
  };
}

/** The letterhead — used verbatim on every invoice PDF via `get_company_letterhead()` (docs/DATABASE_SCHEMA.md §7). */
export function CompanyProfileCard({ settings }: { settings: CompanySettings }) {
  const updateSettings = useUpdateCompanySettings();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<CompanyProfileFormValues>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: valuesFrom(settings),
  });

  useEffect(() => {
    reset(valuesFrom(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable; only re-seed when the row itself changes
  }, [settings]);

  const onSubmit = (values: CompanyProfileFormValues) => {
    void updateSettings.mutateAsync(values);
  };

  return (
    <EckeCard surface="glass" heading="Firmenprofil">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="settings-form">
        <div className="settings-form__row">
          <Controller
            control={control}
            name="company_name"
            render={({ field }) => (
              <EckeField label="Firmenname">
                <EckeInput value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="slogan"
            render={({ field }) => (
              <EckeField label="Slogan">
                <EckeInput value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
              </EckeField>
            )}
          />
        </div>
        <Controller
          control={control}
          name="street"
          render={({ field }) => (
            <EckeField label="Adresse">
              <EckeInput value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
            </EckeField>
          )}
        />
        <div className="settings-form__row">
          <Controller
            control={control}
            name="zip_code"
            render={({ field }) => (
              <EckeField label="PLZ">
                <EckeInput value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="city"
            render={({ field }) => (
              <EckeField label="Ort">
                <EckeInput value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
              </EckeField>
            )}
          />
        </div>
        <div className="settings-form__row">
          <Controller
            control={control}
            name="tax_number"
            render={({ field }) => (
              <EckeField label="Steuernummer">
                <EckeInput value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="vat_id"
            render={({ field }) => (
              <EckeField label="USt-IdNr. (optional)">
                <EckeInput value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
              </EckeField>
            )}
          />
        </div>
        <Controller
          control={control}
          name="iban"
          render={({ field }) => (
            <EckeField label="IBAN">
              <EckeInput value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
            </EckeField>
          )}
        />

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
