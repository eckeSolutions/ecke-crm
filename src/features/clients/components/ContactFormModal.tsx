import { zodResolver } from "@hookform/resolvers/zod";
import { EckeButton, EckeField, EckeInput, EckeModal } from "@ds/stencil/react";
import { Controller, useForm } from "react-hook-form";
import { useEffect } from "react";

import "@/shell/forms.css";

import type { Contact } from "../api";
import { useCreateContact, useUpdateContact } from "../hooks";
import { contactSchema, type ContactFormValues } from "../schema";

const EMPTY_VALUES: ContactFormValues = {
  first_name: "",
  last_name: undefined,
  email: undefined,
  phone: undefined,
  position: undefined,
};

/**
 * Add/edit a single contact (an individual person at a client) — the new
 * surface the old Flutter app never built (the `contacts` table existed,
 * nothing used it). A modal rather than its own route: there's no deep-link
 * case for "editing contact X" on its own, unlike a client.
 */
export function ContactFormModal({
  clientId,
  contact,
  open,
  onClose,
}: {
  clientId: string;
  /** Present = editing; absent = creating. */
  contact: Contact | null;
  open: boolean;
  onClose: () => void;
}) {
  const isEditing = !!contact;
  const createContact = useCreateContact(clientId);
  const updateContact = useUpdateContact(clientId, contact?.id ?? "");

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    reset(
      contact
        ? {
            first_name: contact.first_name,
            last_name: contact.last_name ?? undefined,
            email: contact.email ?? undefined,
            phone: contact.phone ?? undefined,
            position: contact.position ?? undefined,
          }
        : EMPTY_VALUES,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable; only re-seed when the modal (re)opens or the target contact changes
  }, [open, contact]);

  const mutationError = isEditing ? updateContact.error : createContact.error;

  const onSubmit = async (values: ContactFormValues) => {
    if (isEditing) {
      await updateContact.mutateAsync(values);
    } else {
      await createContact.mutateAsync(values);
    }
    onClose();
  };

  return (
    <EckeModal open={open} heading={isEditing ? "Ansprechpartner bearbeiten" : "Neuer Ansprechpartner"} onEckeClose={onClose} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="contact-form">
        <Controller
          control={control}
          name="first_name"
          render={({ field }) => (
            <EckeField label="Vorname *" error={errors.first_name?.message}>
              <EckeInput value={field.value} invalid={!!errors.first_name} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
            </EckeField>
          )}
        />
        <Controller
          control={control}
          name="last_name"
          render={({ field }) => (
            <EckeField label="Nachname">
              <EckeInput value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
            </EckeField>
          )}
        />
        <Controller
          control={control}
          name="position"
          render={({ field }) => (
            <EckeField label="Position">
              <EckeInput value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
            </EckeField>
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <EckeField label="E-Mail" error={errors.email?.message}>
              <EckeInput
                type="email"
                value={field.value ?? ""}
                invalid={!!errors.email}
                onEckeInput={(e) => field.onChange(e.detail)}
                onEckeChange={field.onBlur}
              />
            </EckeField>
          )}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <EckeField label="Telefon">
              <EckeInput type="tel" value={field.value ?? ""} onEckeInput={(e) => field.onChange(e.detail)} onEckeChange={field.onBlur} />
            </EckeField>
          )}
        />

        {mutationError && (
          <p role="alert" className="form-error">
            Ansprechpartner konnte nicht gespeichert werden.
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
