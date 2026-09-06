import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env.local and fill them in.",
  );
}

// One client for the whole app. Not a secret — see .env.example's note;
// RLS is the real gate, this key can only do what a policy allows.
export const supabase = createClient<Database>(url, anonKey);
