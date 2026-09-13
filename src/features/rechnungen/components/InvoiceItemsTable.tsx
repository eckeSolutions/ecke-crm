import { EckeButton, EckeIcon } from "@ds/stencil/react";

import { formatDecimalDe, formatEuro } from "@/lib/formatters";

import type { EditorItem } from "../editorItem";
import "./InvoiceItemsTable.css";

/**
 * A plain semantic `<table>`, not `ecke-table` — `ecke-table`'s cells are
 * fixed to strings and it has no per-row action slot (the same limit
 * Kunden's and Zeiterfassung's lists worked around with a selection bar
 * instead of inline buttons). Here there's no selection concept at all;
 * each row needs its own "remove" button while editing, which is a
 * different shape of table than either of those screens', not a rebuild
 * of the same one.
 */
export function InvoiceItemsTable({ items, editable, onRemove }: { items: readonly EditorItem[]; editable: boolean; onRemove: (index: number) => void }) {
  if (items.length === 0) {
    return <p className="invoice-items-table__empty">Noch keine Positionen.</p>;
  }

  return (
    <table className="invoice-items-table">
      <thead>
        <tr>
          <th>Beschreibung</th>
          <th className="invoice-items-table__num">Menge</th>
          <th className="invoice-items-table__num">Einzelpreis</th>
          <th className="invoice-items-table__num">Gesamt</th>
          {editable && <th className="invoice-items-table__actions" aria-label="Aktionen" />}
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={index}>
            <td>{item.description}</td>
            <td className="invoice-items-table__num">{formatDecimalDe(item.quantity, 2)}</td>
            <td className="invoice-items-table__num">{formatEuro(item.unit_price)}</td>
            <td className="invoice-items-table__num invoice-items-table__total">{formatEuro(item.line_total)}</td>
            {editable && (
              <td className="invoice-items-table__actions">
                <EckeButton surface="glass" type="button" emphasis="ghost" iconOnly aria-label="Entfernen" onClick={() => onRemove(index)}>
                  <EckeIcon name="x" />
                </EckeButton>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
