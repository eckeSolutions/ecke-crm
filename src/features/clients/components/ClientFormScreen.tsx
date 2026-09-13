import { zodResolver } from "@hookform/resolvers/zod";
import { EckeButton, EckeCard, EckeDropdown, EckeField, EckeInput, EckePageHeader } from "@ds/stencil/react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";

import { useClient, useCreateClient, useDefaultHourlyRate, useUpdateClient } from "../hooks";
import { clientSchema, type ClientFormValues } from "../schema";
import "@/shell/forms.css";
import "./ClientFormScreen.css";

const STATUS_OPTIONS = [
  { value: "active", label: "Aktiv" },
  { value: "inactive", label: "Inaktiv" },
];

const EMPTY_VALUES: ClientFormValues = {
  name: "",
  client_number: "",
  street: undefined,
  zip_code: undefined,
  city: undefined,
  phone: undefined,
  mobile_1: undefined,
  mobile_2: undefined,
  email_1: undefined,
  email_2: undefined,
  website: undefined,
  birthday: undefined,
  hourly_rate: 0,
  status: "active",
};

export function ClientFormScreen() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();

  const clientQuery = useClient(id);
  const defaultRateQuery = useDefaultHourlyRate();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient(id ?? "");

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: EMPTY_VALUES,
  });

  // Editing: fill the form once the existing client loads. Creating: seed
  // hourly_rate with the company default (get_default_hourly_rate RPC) once
  // it loads — company_settings itself is admin-only, this is how an
  // employee reaches that one field (docs/DATABASE_SCHEMA.md §7).
  useEffect(() => {
    if (isEditing && clientQuery.data) {
      const c = clientQuery.data;
      reset({
        name: c.name,
        client_number: c.client_number,
        street: c.street ?? undefined,
        zip_code: c.zip_code ?? undefined,
        city: c.city ?? undefined,
        phone: c.phone ?? undefined,
        mobile_1: c.mobile_1 ?? undefined,
        mobile_2: c.mobile_2 ?? undefined,
        email_1: c.email_1 ?? undefined,
        email_2: c.email_2 ?? undefined,
        website: c.website ?? undefined,
        birthday: c.birthday ?? undefined,
        hourly_rate: c.hourly_rate ?? 0,
        status: c.status === "inactive" ? "inactive" : "active",
      });
    } else if (!isEditing && defaultRateQuery.data !== undefined) {
      reset((current) => ({ ...current, hourly_rate: defaultRateQuery.data }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable; re-running on every render would fight the user's own edits
  }, [isEditing, clientQuery.data, defaultRateQuery.data]);

  const onSubmit = async (values: ClientFormValues) => {
    const saved = isEditing
      ? await updateClient.mutateAsync(values)
      : await createClient.mutateAsync(values);
    navigate(`/clients/${saved.id}`, { viewTransition: true });
  };

  const mutationError = isEditing ? updateClient.error : createClient.error;

  return (
    <>
      <EckePageHeader pageTitle={isEditing ? "Kunde bearbeiten" : "Neuer Kunde"} />
      <EckeCard surface="glass" className="client-form">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <EckeField label="Kunde *" error={errors.name?.message}>
                <EckeInput value={field.value} invalid={!!errors.name} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="client_number"
            render={({ field }) => (
              <EckeField label="Kundennummer *" error={errors.client_number?.message}>
                <EckeInput
                  value={field.value}
                  invalid={!!errors.client_number}
                  onEckeInput={(e) => field.onChange(e.detail)}
                  onEckeChange={field.onBlur}
                />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="street"
            render={({ field }) => (
              <EckeField label="Straße Hausnummer">
                <EckeInput value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
              </EckeField>
            )}
          />
          <div className="client-form__row">
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
          <Controller
            control={control}
            name="phone"
            render={({ field }) => (
              <EckeField label="Telefon">
                <EckeInput type="tel" value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
              </EckeField>
            )}
          />
          <div className="client-form__row">
            <Controller
              control={control}
              name="mobile_1"
              render={({ field }) => (
                <EckeField label="Mobil">
                  <EckeInput type="tel" value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
                </EckeField>
              )}
            />
            <Controller
              control={control}
              name="mobile_2"
              render={({ field }) => (
                <EckeField label="Mobil 2">
                  <EckeInput type="tel" value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
                </EckeField>
              )}
            />
          </div>
          <Controller
            control={control}
            name="email_1"
            render={({ field }) => (
              <EckeField label="E-Mail" error={errors.email_1?.message}>
                <EckeInput
                  type="email"
                  value={field.value ?? ""}
                  invalid={!!errors.email_1}
                  onEckeInput={(e) => field.onChange(e.detail)}
                  onEckeChange={field.onBlur}
                />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="email_2"
            render={({ field }) => (
              <EckeField label="E-Mail 2" error={errors.email_2?.message}>
                <EckeInput
                  type="email"
                  value={field.value ?? ""}
                  invalid={!!errors.email_2}
                  onEckeInput={(e) => field.onChange(e.detail)}
                  onEckeChange={field.onBlur}
                />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="website"
            render={({ field }) => (
              <EckeField label="Website">
                <EckeInput type="url" value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="birthday"
            render={({ field }) => (
              // A native <input type="date"> rather than ecke-input -- its
              // fixed `type` union has no "date" variant (text/email/
              // password/number/tel/search/url only). ecke-field's own doc
              // comment explicitly allows "a plain native control" for
              // exactly this case; color-scheme: dark (main.tsx's global.css
              // import) is what keeps the native picker popup dark instead
              // of a jarring light default.
              <EckeField label="Geburtstag">
                <input
                  type="date"
                  className="native-date-input"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value)}
                  onBlur={field.onBlur}
                />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="hourly_rate"
            render={({ field }) => (
              <EckeField label="Stundensatz (€)" error={errors.hourly_rate?.message}>
                <EckeInput
                  type="number"
                  value={String(field.value)}
                  invalid={!!errors.hourly_rate}
                  onEckeInput={(e) => field.onChange(e.detail === "" ? 0 : Number(e.detail))}
                  onEckeChange={field.onBlur}
                />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <EckeField label="Status">
                <EckeDropdown options={STATUS_OPTIONS} value={field.value} onEckeChange={(e) => field.onChange(e.detail)} />
              </EckeField>
            )}
          />

          {mutationError && (
            <p role="alert" className="form-error">
              Kunde konnte nicht gespeichert werden.
            </p>
          )}

          <div className="form-actions">
            <EckeButton surface="glass" type="button" emphasis="ghost" onClick={() => navigate(-1)}>
              Abbrechen
            </EckeButton>
            <EckeButton surface="glass" type="submit" emphasis="primary" disabled={isSubmitting}>
              {isSubmitting ? "Speichern…" : "Speichern"}
            </EckeButton>
          </div>
        </form>
      </EckeCard>
    </>
  );
}
