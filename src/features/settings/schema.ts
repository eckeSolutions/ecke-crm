import { z } from "zod";

/**
 * Three independent forms on one `company_settings` singleton row — ported
 * from the old app's three separately-saved `EckeSectionCard`s
 * (Firmenprofil / Standard-Stundensatz / JMAP). Each schema only covers the
 * fields its own card owns, and each card's "Speichern" only ever sends
 * those fields — never the whole row — so saving one card can't clobber a
 * value another card is mid-edit on.
 */
export const companyProfileSchema = z.object({
  company_name: z.string().optional(),
  slogan: z.string().optional(),
  street: z.string().optional(),
  zip_code: z.string().optional(),
  city: z.string().optional(),
  tax_number: z.string().optional(),
  vat_id: z.string().optional(),
  iban: z.string().optional(),
});
export type CompanyProfileFormValues = z.infer<typeof companyProfileSchema>;

export const hourlyRateSchema = z.object({
  default_hourly_rate: z.number().min(0, "Muss 0 oder größer sein"),
});
export type HourlyRateFormValues = z.infer<typeof hourlyRateSchema>;

export const jmapSchema = z.object({
  jmap_endpoint: z.string().optional(),
  jmap_username: z.string().optional(),
});
export type JmapFormValues = z.infer<typeof jmapSchema>;

/** "Ersetzen" — the secret itself is never read back (docs/DATABASE_SCHEMA.md §2: only a `service_role` Edge Function ever resolves it), so this is write-only. */
export const replaceJmapSecretSchema = z.object({
  secret: z.string().trim().min(1, "Pflichtfeld"),
});
export type ReplaceJmapSecretFormValues = z.infer<typeof replaceJmapSecretSchema>;
