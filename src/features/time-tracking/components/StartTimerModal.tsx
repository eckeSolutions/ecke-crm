import { zodResolver } from "@hookform/resolvers/zod";
import { EckeButton, EckeDropdown, EckeField, EckeFilterChip, EckeInput, EckeModal } from "@ds/stencil/react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import "@/shell/forms.css";
import "./StartTimerModal.css";

import { useActiveClients, useServiceTemplates } from "../hooks";
import { startTimerSchema, type StartTimerFormValues } from "../schema";
import type { RunningTimer } from "../stopwatch";

const EMPTY_VALUES: StartTimerFormValues = { client_id: "", description: "" };

export function StartTimerModal({
  open,
  onClose,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (params: Omit<RunningTimer, "startedAt">) => void;
}) {
  const clientsQuery = useActiveClients();
  const templatesQuery = useServiceTemplates();
  const clients = clientsQuery.data ?? [];
  const templates = templatesQuery.data ?? [];

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<StartTimerFormValues>({
    resolver: zodResolver(startTimerSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (open) reset(EMPTY_VALUES);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable; only re-seed when the modal (re)opens
  }, [open]);

  const onSubmit = (values: StartTimerFormValues) => {
    const client = clients.find((c) => c.id === values.client_id);
    if (!client) return; // the resolver already guarantees a selection from `clients`' own options
    onStart({
      clientId: client.id,
      clientName: client.name,
      hourlyRate: client.hourly_rate ?? 0,
      description: values.description,
    });
    onClose();
  };

  return (
    <EckeModal open={open} heading="Zeit starten" onEckeClose={onClose} size="sm">
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
        {templates.length > 0 && (
          <div className="start-timer__templates">
            {templates.map((t) => (
              <EckeFilterChip key={t.id} selected={false} onEckeToggle={() => setValue("description", t.title, { shouldValidate: true })}>
                {t.title}
              </EckeFilterChip>
            ))}
          </div>
        )}

        <div className="form-actions">
          <EckeButton surface="glass" type="button" emphasis="ghost" onClick={onClose}>
            Abbrechen
          </EckeButton>
          <EckeButton surface="glass" type="submit" emphasis="primary">
            Starten
          </EckeButton>
        </div>
      </form>
    </EckeModal>
  );
}
