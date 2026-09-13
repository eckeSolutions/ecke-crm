import { z } from "zod";

/**
 * Shared by the manual-entry and edit modals — one `<form>` for both, same
 * as the old app's single `_TimeEntryFormDialog` reused by
 * `showManualEntryDialog`/`showEditTimeEntryDialog`.
 *
 * `start`/`end` are `datetime-local` strings (native `<input>`, no design
 * system equivalent — see ClientFormScreen's `birthday` field for the same
 * pattern with a plain `date` input). Refined against each other rather
 * than validated separately: an invalid pair is one shared error, not two
 * fields separately flagged "invalid" for what is really one relationship.
 */
export const timeEntrySchema = z
  .object({
    client_id: z.string().trim().min(1, "Pflichtfeld"),
    description: z.string().trim().min(1, "Pflichtfeld"),
    start: z.string().min(1, "Pflichtfeld"),
    end: z.string().min(1, "Pflichtfeld"),
  })
  .refine((v) => new Date(v.end).getTime() > new Date(v.start).getTime(), {
    message: "Ende muss nach dem Start liegen",
    path: ["end"],
  });

export type TimeEntryFormValues = z.infer<typeof timeEntrySchema>;

/** "Zeit starten" — pick a client and a description before the stopwatch begins. No persistence here (the stopwatch is pure client state — see stopwatch.ts), but validated the same way every other form in this app is, rather than inventing a second, looser convention for one modal. */
export const startTimerSchema = z.object({
  client_id: z.string().trim().min(1, "Pflichtfeld"),
  description: z.string().trim().min(1, "Pflichtfeld"),
});

export type StartTimerFormValues = z.infer<typeof startTimerSchema>;
