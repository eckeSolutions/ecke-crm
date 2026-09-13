import { z } from "zod";

/** "Position hinzufügen" — a free-text line item, not backed by a time entry. */
export const manualItemSchema = z.object({
  description: z.string().trim().min(1, "Pflichtfeld"),
  quantity: z.number().positive("Muss größer als 0 sein"),
  unit_price: z.number().min(0, "Muss 0 oder größer sein"),
});

export type ManualItemFormValues = z.infer<typeof manualItemSchema>;

/** Metadata editable on a draft alongside its items — everything else about an invoice (client, date_issued, total, items) is decided once at creation or derived. */
export const invoiceMetaSchema = z.object({
  date_due: z.string().optional(), // yyyy-mm-dd or empty, native <input type="date"> shape — see ClientFormScreen's birthday field for the same pattern
  notes: z.string().optional(),
});

export type InvoiceMetaFormValues = z.infer<typeof invoiceMetaSchema>;
