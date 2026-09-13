import { z } from "zod";

// Matches clients' real constraints (docs/DATABASE_SCHEMA.md §2): name and
// client_number are the only NOT NULL business fields; everything else is
// nullable in the DB, so empty stays empty rather than becoming "".
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const optionalEmail = z
  .union([z.literal(""), z.string().trim().email("Ungültige E-Mail-Adresse")])
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Pflichtfeld"),
  client_number: z.string().trim().min(1, "Pflichtfeld"),
  street: optionalText,
  zip_code: optionalText,
  city: optionalText,
  phone: optionalText,
  mobile_1: optionalText,
  mobile_2: optionalText,
  email_1: optionalEmail,
  email_2: optionalEmail,
  website: optionalText,
  // yyyy-mm-dd (native <input type="date"> shape) or empty.
  birthday: z
    .string()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  // Not z.coerce.number() -- the field's own onEckeInput handler already
  // converts to a number before it reaches react-hook-form state, and
  // z.coerce's input type is `unknown`, which throws off zodResolver's
  // inferred form-values type (hourly_rate becomes `unknown`, not
  // `number`) for the whole schema.
  hourly_rate: z.number().min(0, "Muss 0 oder größer sein"),
  status: z.enum(["active", "inactive"]),
});

export type ClientFormValues = z.infer<typeof clientSchema>;

export const contactSchema = z.object({
  first_name: z.string().trim().min(1, "Pflichtfeld"),
  last_name: optionalText,
  email: optionalEmail,
  phone: optionalText,
  position: optionalText,
});

export type ContactFormValues = z.infer<typeof contactSchema>;
