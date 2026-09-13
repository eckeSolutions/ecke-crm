/**
 * A line item as the editor holds it locally — before it has a real
 * `invoice_id`/`sort_order`/`id` (those are only assigned on save, via
 * `replaceInvoiceItems`). Mirrors `invoice_items`' own columns closely
 * enough that building the save payload is a straight map, not a
 * translation.
 */
export interface EditorItem {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  linked_time_entry_id: string | null;
  template_id: string | null;
}

export function itemFromManualEntry(description: string, quantity: number, unitPrice: number, lineTotal: number): EditorItem {
  return { description, quantity, unit_price: unitPrice, line_total: lineTotal, linked_time_entry_id: null, template_id: null };
}
