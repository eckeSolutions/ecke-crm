import { z } from "zod";

/**
 * Fixed category list — ported verbatim from the old app's
 * `ledger_entry_dialog.dart` (`_categories`). Not a database enum
 * (`ledger_entries.category` is plain `text`, docs/DATABASE_SCHEMA.md §2),
 * so this is just the app's own suggested vocabulary, not a CHECK
 * constraint — a category outside this list from old data or a future
 * change wouldn't be rejected, only unselectable as a *new* value here.
 */
export const LEDGER_CATEGORIES = ["Büro", "Software", "Fahrzeug", "Marketing", "Fortbildung", "Sonstiges"] as const;

export const ledgerEntrySchema = z.object({
  entry_type: z.enum(["income", "expense"]),
  entry_date: z.string().min(1, "Pflichtfeld"), // yyyy-mm-dd, native <input type="date"> shape
  description: z.string().trim().min(1, "Pflichtfeld"),
  amount: z.number().positive("Muss größer als 0 sein"),
  category: z.string().optional(),
});

export type LedgerEntryFormValues = z.infer<typeof ledgerEntrySchema>;
