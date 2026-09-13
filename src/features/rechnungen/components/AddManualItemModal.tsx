import { zodResolver } from "@hookform/resolvers/zod";
import { EckeButton, EckeField, EckeFilterChip, EckeInput, EckeModal } from "@ds/stencil/react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import { formatEuro } from "@/lib/formatters";
import { useServiceTemplates } from "@/lib/pickers";

import "@/shell/forms.css";
import "./AddManualItemModal.css";

import { manualItemSchema, type ManualItemFormValues } from "../schema";

const EMPTY_VALUES: ManualItemFormValues = { description: "", quantity: 1, unit_price: 0 };

/**
 * "Position hinzufügen" — a free-text line item (not backed by a time
 * entry), same quick-fill-chip pattern as Zeiterfassung's start-timer
 * modal: a template only fills the description here (and defaults the
 * price if the template names one), it's never linked by id the way a
 * time entry's item is.
 */
export function AddManualItemModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (values: ManualItemFormValues) => void }) {
  const templatesQuery = useServiceTemplates();
  const templates = templatesQuery.data ?? [];

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ManualItemFormValues>({ resolver: zodResolver(manualItemSchema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (open) reset(EMPTY_VALUES);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable; only re-seed when the modal (re)opens
  }, [open]);

  const onSubmit = (values: ManualItemFormValues) => {
    onAdd(values);
    onClose();
  };

  return (
    <EckeModal open={open} heading="Position hinzufügen" onEckeClose={onClose} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <EckeField label="Beschreibung *" error={errors.description?.message}>
              <EckeInput value={field.value} invalid={!!errors.description} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
            </EckeField>
          )}
        />
        {templates.length > 0 && (
          <div className="add-manual-item__templates">
            {templates.map((t) => (
              <EckeFilterChip
                key={t.id}
                selected={false}
                onEckeToggle={() => {
                  setValue("description", t.title, { shouldValidate: true });
                  if (t.default_price) setValue("unit_price", t.default_price, { shouldValidate: true });
                }}
              >
                {t.title}
                {t.default_price ? ` · ${formatEuro(t.default_price)}` : ""}
              </EckeFilterChip>
            ))}
          </div>
        )}
        <div className="add-manual-item__row">
          <Controller
            control={control}
            name="quantity"
            render={({ field }) => (
              <EckeField label="Menge *" error={errors.quantity?.message}>
                <EckeInput
                  type="number"
                  value={String(field.value)}
                  invalid={!!errors.quantity}
                  onEckeInput={(e) => field.onChange(Number(e.detail))}
                  onEckeChange={field.onBlur}
                />
              </EckeField>
            )}
          />
          <Controller
            control={control}
            name="unit_price"
            render={({ field }) => (
              <EckeField label="Einzelpreis (€) *" error={errors.unit_price?.message}>
                <EckeInput
                  type="number"
                  value={String(field.value)}
                  invalid={!!errors.unit_price}
                  onEckeInput={(e) => field.onChange(Number(e.detail))}
                  onEckeChange={field.onBlur}
                />
              </EckeField>
            )}
          />
        </div>

        <div className="form-actions">
          <EckeButton surface="glass" type="button" emphasis="ghost" onClick={onClose}>
            Abbrechen
          </EckeButton>
          <EckeButton surface="glass" type="submit" emphasis="primary">
            Hinzufügen
          </EckeButton>
        </div>
      </form>
    </EckeModal>
  );
}
