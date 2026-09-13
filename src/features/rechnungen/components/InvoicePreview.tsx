import { EckeCard } from "@ds/stencil/react";

import { formatDateDe, formatDecimalDe, formatEuro } from "@/lib/formatters";
import { USTG_NOTICE } from "@/lib/money";

import type { Letterhead } from "../api";
import type { EditorItem } from "../editorItem";
import "./InvoicePreview.css";

/**
 * The "HTML/CSS live preview (approximate)" ROADMAP.md's Phase 4 asks for —
 * updates as items/dates change, with no round-trip to the server. It is
 * deliberately NOT a pixel-accurate rendering of the real PDF: the design
 * system is dark-only (no light/paper mode), so this stays a dark card
 * that reads as "here's what your invoice will contain," not a fake sheet
 * of white A4 rendered inside a dark app shell. The actual document —
 * fonts, pagination, word-wrap, the real letterhead — is
 * `generate-pdf`'s job alone (CLAUDE.md: "It remains the single PDF
 * renderer — no client-side builder"); this preview does not attempt to
 * match it exactly.
 */
export function InvoicePreview({
  invoiceNumber,
  dateIssued,
  dateDue,
  client,
  items,
  total,
  letterhead,
}: {
  invoiceNumber: number | undefined;
  dateIssued: Date;
  dateDue: string;
  client: { name: string; client_number: string; street: string | null; zip_code: string | null; city: string | null };
  items: readonly EditorItem[];
  total: number;
  letterhead: Letterhead | undefined;
}) {
  const clientAddressLines = [client.street, [client.zip_code, client.city].filter(Boolean).join(" ")].filter(Boolean);

  return (
    <EckeCard surface="glass" className="invoice-preview">
      <div className="invoice-preview__header">
        <div>
          <div className="invoice-preview__company">{letterhead?.company_name ?? "…"}</div>
          {letterhead?.slogan && <div className="invoice-preview__slogan">{letterhead.slogan}</div>}
          <div className="invoice-preview__address">
            {letterhead?.street}
            <br />
            {[letterhead?.zip_code, letterhead?.city].filter(Boolean).join(" ")}
          </div>
        </div>
        <div className="invoice-preview__meta">
          <div className="invoice-preview__number">Rechnung #{invoiceNumber ?? "…"}</div>
          <div>Datum: {formatDateDe(dateIssued)}</div>
          {dateDue && <div>Fällig: {formatDateDe(new Date(dateDue))}</div>}
        </div>
      </div>

      <div className="invoice-preview__client">
        <div className="invoice-preview__client-name">{client.name}</div>
        <div>{client.client_number}</div>
        {clientAddressLines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>

      <table className="invoice-preview__items">
        <thead>
          <tr>
            <th>Beschreibung</th>
            <th className="invoice-preview__num">Menge</th>
            <th className="invoice-preview__num">Preis</th>
            <th className="invoice-preview__num">Gesamt</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={4} className="invoice-preview__empty">
                Noch keine Positionen.
              </td>
            </tr>
          ) : (
            items.map((item, i) => (
              <tr key={i}>
                <td>{item.description}</td>
                <td className="invoice-preview__num">{formatDecimalDe(item.quantity, 2)}</td>
                <td className="invoice-preview__num">{formatEuro(item.unit_price)}</td>
                <td className="invoice-preview__num">{formatEuro(item.line_total)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="invoice-preview__total">
        <span>Gesamtbetrag</span>
        <strong>{formatEuro(total)}</strong>
      </div>

      <p className="invoice-preview__ustg">{USTG_NOTICE}</p>

      {letterhead && (
        <div className="invoice-preview__footer">
          {[
            letterhead.tax_number && `Steuernr. ${letterhead.tax_number}`,
            letterhead.vat_id && `USt-IdNr. ${letterhead.vat_id}`,
            letterhead.iban && `IBAN ${letterhead.iban}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}
    </EckeCard>
  );
}
