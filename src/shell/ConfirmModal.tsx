import { EckeButton, EckeModal } from "@ds/stencil/react";

import "./forms.css";

/**
 * Generic destructive-action confirmation — the "X löschen?" pattern used
 * across every feature (Kunden today, Rechnungen/Zeiterfassung/Finanzen
 * later). One shared component so the copy/keyboard/focus behavior stays
 * consistent instead of each feature rolling its own.
 */
export function ConfirmModal({
  open,
  heading,
  message,
  confirmLabel = "Löschen",
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  heading: string;
  message: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <EckeModal open={open} heading={heading} onEckeClose={onCancel}>
      <p>{message}</p>
      <div className="form-actions">
        <EckeButton surface="glass" type="button" emphasis="ghost" onClick={onCancel} disabled={pending}>
          Abbrechen
        </EckeButton>
        <EckeButton surface="glass" type="button" emphasis="primary" tone="danger" onClick={onConfirm} disabled={pending}>
          {pending ? "Wird gelöscht…" : confirmLabel}
        </EckeButton>
      </div>
    </EckeModal>
  );
}
