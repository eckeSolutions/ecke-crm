-- 00_dev_baseline.sql — local dev accounts + a filled-in company profile.
--
-- Loaded automatically by `supabase db reset` via [db.seed] in
-- supabase/config.toml, before 10_dev_dummy_data.sql — which needs one admin
-- and one employee profile to hang invoices and time entries on.
--
-- LOCAL DEV ONLY. Throwaway credentials on a throwaway database:
--     admin@ecke.test     / devpassword
--     employee@ecke.test  / devpassword
-- Never load this against the self-hosted stack. Emails use the .test TLD
-- (RFC 2606, guaranteed non-routable).

BEGIN;

-- pgcrypto lives in the `extensions` schema on the supabase/postgres image,
-- so crypt()/gen_salt() are not on the default search_path.
SET LOCAL search_path = public, extensions;

-- Inserting into auth.users fires public.handle_new_user(), which creates the
-- matching public.profiles row. The FIRST user ever becomes admin and every
-- later one an employee, so these two INSERTs must stay in this order and
-- stay separate statements.
--
-- confirmation_token / recovery_token / email_change / email_change_token_new
-- are nullable with no default, but GoTrue scans them into Go strings — leave
-- them NULL and every login dies with "Database error querying schema"
-- (Scan error ... converting NULL to string is unsupported). They must be ''.
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000a1',
    'authenticated', 'authenticated',
    'admin@ecke.test', crypt('devpassword', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Dev Admin"}'::jsonb,
    now(), now(),
    '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000e1',
    'authenticated', 'authenticated',
    'employee@ecke.test', crypt('devpassword', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Dev Employee"}'::jsonb,
    now(), now(),
    '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- GoTrue refuses a password login for a user with no email identity.
INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
)
SELECT u.id::text, u.id,
       jsonb_build_object(
           'sub', u.id::text,
           'email', u.email,
           'email_verified', true,
           'phone_verified', false
       ),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.email IN ('admin@ecke.test', 'employee@ecke.test')
ON CONFLICT DO NOTHING;

-- Per-user rates (the trigger-created profiles default to 0.00).
UPDATE public.profiles SET default_hourly_rate = 85.00 WHERE email = 'admin@ecke.test';
UPDATE public.profiles SET default_hourly_rate = 65.00 WHERE email = 'employee@ecke.test';

-- The single company_settings row is created empty by the schema; fill it so
-- invoice PDFs and the settings screen have something to render. The jmap_*
-- columns stay NULL — set-jmap-secret owns those.
UPDATE public.company_settings SET
    company_name        = 'ecke.Solutions (dev)',
    slogan              = 'IT-Service und Beratung',
    street              = 'Musterweg 1',
    zip_code            = '78462',
    city                = 'Konstanz',
    tax_number          = '00/000/00000',
    vat_id              = NULL,
    iban                = 'DE00 0000 0000 0000 0000 00',
    default_hourly_rate = 75.00
WHERE id = true;

COMMIT;
