import { EckeButton, EckeCard, EckeIcon } from "@ds/stencil/react";
import { useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { ConfirmModal } from "@/shell/ConfirmModal";

import type { Contact } from "../api";
import { useContacts, useDeleteContact } from "../hooks";
import { ContactFormModal } from "./ContactFormModal";
import "./ContactsSection.css";

/**
 * Ansprechpartner (individual people at a client) — a new surface, not a
 * port: the `contacts` table existed in the old schema but had no Flutter
 * UI at all (ROADMAP.md's Phase 3 note).
 */
export function ContactsSection({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const contactsQuery = useContacts(clientId);
  const deleteContact = useDeleteContact(clientId);

  const [editing, setEditing] = useState<Contact | null | "new">(null);
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteContact.mutateAsync(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <EckeCard surface="glass" heading="Ansprechpartner" className="contacts-section">
      {contactsQuery.isPending ? (
        <p>Wird geladen…</p>
      ) : contactsQuery.isError ? (
        <p role="alert">Ansprechpartner konnten nicht geladen werden.</p>
      ) : contactsQuery.data.length === 0 ? (
        <p className="contacts-section__empty">Noch keine Ansprechpartner erfasst.</p>
      ) : (
        <ul className="contacts-section__list">
          {contactsQuery.data.map((contact) => (
            <li key={contact.id} className="contacts-section__item">
              <div className="contacts-section__info">
                <strong>
                  {contact.first_name} {contact.last_name ?? ""}
                </strong>
                {contact.position && <span className="contacts-section__meta">{contact.position}</span>}
                {contact.email && <span className="contacts-section__meta">{contact.email}</span>}
                {contact.phone && <span className="contacts-section__meta">{contact.phone}</span>}
              </div>
              <div className="contacts-section__actions">
                <EckeButton surface="glass" type="button" emphasis="ghost" iconOnly aria-label="Bearbeiten" onClick={() => setEditing(contact)}>
                  <EckeIcon name="pencil" />
                </EckeButton>
                {isAdmin && (
                  <EckeButton
                    surface="glass"
                    type="button"
                    emphasis="ghost"
                    tone="danger"
                    iconOnly
                    aria-label="Löschen"
                    onClick={() => setPendingDelete(contact)}
                  >
                    <EckeIcon name="trash-2" />
                  </EckeButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <EckeButton surface="glass" type="button" emphasis="secondary" onClick={() => setEditing("new")}>
        <EckeIcon slot="icon" name="plus" />
        Ansprechpartner hinzufügen
      </EckeButton>

      <ContactFormModal
        clientId={clientId}
        contact={editing === "new" || editing === null ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />

      <ConfirmModal
        open={!!pendingDelete}
        heading="Ansprechpartner löschen?"
        message={`„${pendingDelete?.first_name} ${pendingDelete?.last_name ?? ""}" wird unwiderruflich gelöscht.`}
        pending={deleteContact.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </EckeCard>
  );
}
