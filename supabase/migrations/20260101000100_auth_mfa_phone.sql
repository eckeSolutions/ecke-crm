-- Auth-schema MFA phone factor.
--
-- Verbatim from the old repo's 20240729123726_add_mfa_phone_config.up.sql
-- (only this header comment changed). Kept as its own migration because it
-- alters GoTrue's own auth.* tables, not the app's public schema. Phone MFA
-- is available but not enforced by any policy. If GoTrue's own migrations
-- already added any of this on your target, the guards below make it a no-op.

do $$ begin
    -- Ensure the necessary extension is enabled before attempting to alter the type
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    alter type auth.factor_type add value 'phone';
exception
    when duplicate_object then null;
end $$;

alter table auth.mfa_factors add column if not exists phone text unique default null;
alter table auth.mfa_challenges add column if not exists sent_at timestamptz null;
alter table auth.mfa_challenges add column if not exists otp_code text null;

create index if not exists idx_sent_at on auth.mfa_challenges(sent_at);
create unique index if not exists unique_verified_phone_factor on auth.mfa_factors (user_id, phone);
