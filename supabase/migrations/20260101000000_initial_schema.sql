-- ecke.Solutions CRM — consolidated initial schema.
--
-- Squashed from the old repo's 9 incremental migrations
-- (eckeSolutions/ecke-crm_old, supabase/migrations/2026040500000 …
-- 20260802020000) plus two corrections previously carried separately:
--   * explicit CREATE EXTENSION "uuid-ossp" (the old initial schema left it
--     commented and relied on the supabase/postgres image preinstalling it);
--   * an AFTER trigger on invoice_items keeping time_entries.is_invoiced /
--     invoice_id in sync — documented in the old docs/DATABASE_SCHEMA.md but
--     never migrated (the Flutter client patched it in application code).
-- The old project's granular migration history stays in that repo's git.
--
-- Domain: a single German Kleinunternehmer (§19 UStG). Single-tenant:
-- admin + employee roles, per-user RLS, no organization_id. GoBD: an issued
-- invoice is immutable and numbered gaplessly from a DB sequence.
--
-- The old repo's auth-schema MFA phone-factor migration was dropped, not
-- carried over: phone MFA is native in modern GoTrue and is switched on via
-- [auth.mfa.phone] in config.toml — no schema change.
--
-- Verified: `supabase db reset` applies this clean (5 Sep 2026).
--
-- Prose walkthrough — ER diagram, RLS matrix, invoice lifecycle:
-- docs/DATABASE_SCHEMA.md.

BEGIN;

-- ======================================================================
-- EXTENSIONS
-- ======================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ======================================================================
-- HELPER FUNCTIONS (trigger bodies — plpgsql, so table references are
-- resolved at execution time, not now; safe to declare before the tables).
-- public.is_admin() is the exception: it's LANGUAGE sql and Postgres
-- validates its `SELECT ... FROM public.profiles` body at CREATE time, so it
-- is declared after the tables (see "ROLE HELPER" below).
-- ======================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Prevent a user granting themselves admin via a self UPDATE.
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins may change a profile role';
    END IF;
    RETURN NEW;
END;
$$;

-- time_entries.duration_minutes is always rounded UP to the next 15.
CREATE OR REPLACE FUNCTION public.round_duration_to_15()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.duration_minutes IS NOT NULL THEN
        NEW.duration_minutes := ceil(NEW.duration_minutes::float / 15) * 15;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-provision a public.profiles row when a new auth.users row appears
-- (Studio "Add user" or the GoTrue signup API). The very first user ever
-- becomes admin; every subsequent signup defaults to 'employee'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data ->> 'full_name',
        CASE
            WHEN EXISTS (SELECT 1 FROM public.profiles) THEN 'employee'
            ELSE 'admin'
        END
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- GoBD: once an invoice leaves 'draft' its identifying / financial fields
-- are frozen; only status / notes / pdf_storage_path may still change.
CREATE OR REPLACE FUNCTION public.enforce_invoice_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status <> 'draft' THEN
        IF NEW.invoice_number <> OLD.invoice_number
           OR NEW.client_id <> OLD.client_id
           OR NEW.total_amount <> OLD.total_amount
           OR NEW.date_issued <> OLD.date_issued THEN
            RAISE EXCEPTION 'Invoice % is issued and immutable; only status/notes/pdf_storage_path may change', OLD.invoice_number;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enforce_invoice_items_immutability()
RETURNS TRIGGER AS $$
DECLARE
    parent_status text;
BEGIN
    SELECT status INTO parent_status FROM public.invoices
    WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

    IF parent_status IS NOT NULL AND parent_status <> 'draft' THEN
        RAISE EXCEPTION 'Cannot modify line items of an issued invoice';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.stamp_invoice_paid_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'paid' AND OLD.status <> 'paid' AND NEW.paid_at IS NULL THEN
        NEW.paid_at = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Keep time_entries.is_invoiced / invoice_id in sync with invoice_items.
-- SECURITY DEFINER: the time_entries_update RLS WITH CHECK forbids a
-- non-admin flipping is_invoiced to true. Authorization is already
-- established upstream — invoice_items RLS scopes the write to an invoice
-- the caller owns, and enforce_invoice_items_immutability() guarantees the
-- parent invoice is 'draft' for any write that reaches this AFTER trigger.
-- Covers createDraftInvoice (insert → invoiced), replaceInvoiceItems
-- (delete-all revert + re-insert), and deleting a draft invoice
-- (invoice_items cascade-delete → revert).
CREATE OR REPLACE FUNCTION public.sync_time_entry_invoiced()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.linked_time_entry_id IS NOT NULL THEN
            UPDATE public.time_entries
               SET is_invoiced = true,
                   invoice_id  = NEW.invoice_id
             WHERE id = NEW.linked_time_entry_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.linked_time_entry_id IS NOT NULL THEN
            UPDATE public.time_entries
               SET is_invoiced = false,
                   invoice_id  = NULL
             WHERE id = OLD.linked_time_entry_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- ======================================================================
-- INVOICE NUMBER SEQUENCE (atomic, gapless — GoBD)
-- 421 invoices were imported historically from CSV; live numbering starts
-- at 422. The client must never compute or pass invoice_number.
-- ======================================================================
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 422;

-- ======================================================================
-- TABLES  (declared in FK dependency order)
-- ======================================================================

-- --- profiles: app users, mirror of auth.users ---
CREATE TABLE public.profiles (
    id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email text UNIQUE NOT NULL,
    full_name text,
    role text DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
    default_hourly_rate numeric(10,2) DEFAULT 0.00,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- --- clients (Kunden) ---
CREATE TABLE public.clients (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    name text NOT NULL,
    client_number text UNIQUE NOT NULL,
    street text,
    zip_code text,
    city text,
    phone text,
    mobile_1 text,
    mobile_2 text,
    email_1 text,
    email_2 text,
    website text,
    birthday date,
    hourly_rate numeric(10,2) DEFAULT 0.00,
    stalwart_contact_id text,
    status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    -- contact-sync tracking (sync-contacts Edge Function). last_contact_sync_at
    -- doubles as the 10s-per-client rate-limit guard.
    last_contact_sync_at timestamptz,
    sync_status text CHECK (sync_status IN ('ok', 'error')),
    last_sync_error text
);

-- --- contacts: individual people at a client ---
CREATE TABLE public.contacts (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    first_name text NOT NULL,
    last_name text,
    email text,
    phone text,
    "position" text,
    stalwart_contact_id text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- --- service_templates: admin-managed catalog ---
CREATE TABLE public.service_templates (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    title text NOT NULL,
    is_time_based boolean DEFAULT true,
    default_price numeric(10,2) DEFAULT 0.00,
    created_at timestamptz DEFAULT now()
);

-- --- invoices ---
CREATE TABLE public.invoices (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_number integer UNIQUE NOT NULL DEFAULT nextval('public.invoice_number_seq'),
    client_id uuid REFERENCES public.clients(id) NOT NULL,
    profile_id uuid REFERENCES public.profiles(id) NOT NULL,
    date_issued date DEFAULT current_date,
    date_due date,
    status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'cancelled')),
    total_amount numeric(10,2) DEFAULT 0.00,
    notes text,
    pdf_storage_path text,
    paid_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- --- time_entries ---
CREATE TABLE public.time_entries (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    template_id uuid REFERENCES public.service_templates(id),
    description text,
    start_time timestamptz NOT NULL,
    end_time timestamptz,
    duration_minutes integer,
    hourly_rate_snapshot numeric(10,2) NOT NULL,
    is_invoiced boolean DEFAULT false,
    invoice_id uuid CONSTRAINT fk_time_entries_invoice REFERENCES public.invoices(id) ON DELETE SET NULL,
    calendar_event_id text,
    created_at timestamptz DEFAULT now()
);

-- --- invoice_items ---
CREATE TABLE public.invoice_items (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
    template_id uuid REFERENCES public.service_templates(id),
    description text NOT NULL,
    quantity numeric(10,2) NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    line_total numeric(10,2) NOT NULL,
    linked_time_entry_id uuid REFERENCES public.time_entries(id),
    sort_order integer DEFAULT 0
);

-- --- company_settings: single-row company profile / billing / JMAP config ---
-- SECURITY NOTE: jmap_secret_id points at a Supabase Vault secret. The JMAP
-- password/token is NEVER stored here in plaintext; only a service_role
-- Edge Function may resolve it via vault.decrypted_secrets.
CREATE TABLE public.company_settings (
    id boolean PRIMARY KEY DEFAULT true,
    company_name text,
    slogan text,
    street text,
    zip_code text,
    city text,
    tax_number text,
    vat_id text,
    iban text,
    default_hourly_rate numeric(10,2) DEFAULT 0.00,
    jmap_endpoint text,
    jmap_username text,
    jmap_secret_id uuid,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT company_settings_single_row CHECK (id)
);

-- --- ledger_entries: simple manual income/expense tracking ---
-- Income normally flows through invoices; entry_type exists so a rare
-- one-off (refund, reimbursement) can be logged without the invoice
-- numbering sequence.
CREATE TABLE public.ledger_entries (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    profile_id uuid REFERENCES public.profiles(id) NOT NULL,
    entry_date date NOT NULL DEFAULT current_date,
    entry_type text NOT NULL DEFAULT 'expense' CHECK (entry_type IN ('income', 'expense')),
    category text,
    description text NOT NULL,
    amount numeric(10,2) NOT NULL CHECK (amount > 0),
    -- reserved for a future receipt-upload flow (Supabase Storage)
    receipt_storage_path text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ======================================================================
-- ROLE HELPER  (must come after public.profiles — LANGUAGE sql body is
-- validated now). SECURITY DEFINER so RLS policies can check role without
-- recursing into profiles' own policy (a naive `role = 'admin'` subquery
-- inside profiles' policy would invoke profiles' policy again).
-- ======================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ======================================================================
-- RPCs (read helpers exposed to the client)
-- ======================================================================

-- Employees need the company default hourly rate when creating a client,
-- but company_settings is admin-only — expose just that one field.
CREATE OR REPLACE FUNCTION public.get_default_hourly_rate()
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT default_hourly_rate FROM public.company_settings WHERE id = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_default_hourly_rate() TO authenticated;

-- Preview only ("your next invoice will be #423"). Does NOT consume the
-- sequence — the real number comes from the invoices.invoice_number default,
-- which is atomic under concurrent writes.
CREATE OR REPLACE FUNCTION public.generate_next_invoice_number()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END
  FROM public.invoice_number_seq;
$$;

-- Uninvoiced entries for a client. NOT security definer — caller RLS
-- (own rows unless admin) still applies.
CREATE OR REPLACE FUNCTION public.get_uninvoiced_time_entries(client_uuid uuid)
RETURNS SETOF public.time_entries
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM public.time_entries
  WHERE client_id = client_uuid AND is_invoiced = false
  ORDER BY start_time;
$$;
GRANT EXECUTE ON FUNCTION public.get_uninvoiced_time_entries(uuid) TO authenticated;

-- Public-safe letterhead subset for invoice PDFs (employees may build draft
-- invoices but can't read admin-only company_settings). Never returns the
-- jmap_* columns.
CREATE OR REPLACE FUNCTION public.get_company_letterhead()
RETURNS TABLE (
    company_name text,
    slogan text,
    street text,
    zip_code text,
    city text,
    tax_number text,
    vat_id text,
    iban text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT company_name, slogan, street, zip_code, city, tax_number, vat_id, iban
  FROM public.company_settings WHERE id = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_company_letterhead() TO authenticated;

-- ======================================================================
-- INDEXES (FK columns + hot paths)
-- ======================================================================
CREATE INDEX idx_contacts_client_id ON public.contacts(client_id);
CREATE INDEX idx_time_entries_client_id ON public.time_entries(client_id);
CREATE INDEX idx_time_entries_profile_id ON public.time_entries(profile_id);
CREATE INDEX idx_time_entries_invoice_id ON public.time_entries(invoice_id);
CREATE INDEX idx_time_entries_uninvoiced ON public.time_entries(client_id) WHERE is_invoiced = false;
CREATE INDEX idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX idx_ledger_entries_profile_id ON public.ledger_entries(profile_id);
CREATE INDEX idx_ledger_entries_entry_date ON public.ledger_entries(entry_date);

-- ======================================================================
-- TRIGGERS
-- ======================================================================
CREATE TRIGGER trigger_handle_new_user
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER trigger_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trigger_prevent_role_self_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_escalation();

CREATE TRIGGER trigger_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trigger_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trigger_round_duration
BEFORE INSERT OR UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.round_duration_to_15();

CREATE TRIGGER trigger_invoice_immutability
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_immutability();

CREATE TRIGGER trigger_stamp_invoice_paid_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.stamp_invoice_paid_at();

CREATE TRIGGER trigger_invoice_items_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_items_immutability();

CREATE TRIGGER trigger_sync_time_entry_invoiced
AFTER INSERT OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.sync_time_entry_invoiced();

CREATE TRIGGER trigger_company_settings_updated_at
BEFORE UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trigger_ledger_entries_updated_at
BEFORE UPDATE ON public.ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ======================================================================
-- ROW LEVEL SECURITY
-- Model: per-user + admin. auth.jwt() / custom claims are never read here;
-- the app's admin/employee role is public.profiles.role, checked via
-- public.is_admin(). anon gets nothing. service_role (Edge Functions)
-- bypasses RLS for privileged writes.
-- ======================================================================
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries    ENABLE ROW LEVEL SECURITY;

-- --- profiles ---
CREATE POLICY "profiles_select" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles_update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.is_admin())
    WITH CHECK (id = auth.uid() OR public.is_admin());
-- role escalation is blocked separately by trigger_prevent_role_self_escalation

-- --- clients ---
CREATE POLICY "clients_select" ON public.clients
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_insert" ON public.clients
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clients_update" ON public.clients
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "clients_delete" ON public.clients
    FOR DELETE TO authenticated USING (public.is_admin());

-- --- contacts (mirrors clients access) ---
CREATE POLICY "contacts_select" ON public.contacts
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "contacts_insert" ON public.contacts
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "contacts_update" ON public.contacts
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "contacts_delete" ON public.contacts
    FOR DELETE TO authenticated USING (public.is_admin());

-- --- service_templates (admin-managed catalog) ---
CREATE POLICY "service_templates_select" ON public.service_templates
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_templates_write" ON public.service_templates
    FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "service_templates_update" ON public.service_templates
    FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "service_templates_delete" ON public.service_templates
    FOR DELETE TO authenticated USING (public.is_admin());

-- --- time_entries (own rows only, unless admin; frozen once invoiced) ---
CREATE POLICY "time_entries_select" ON public.time_entries
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid() OR public.is_admin());
CREATE POLICY "time_entries_insert" ON public.time_entries
    FOR INSERT TO authenticated
    WITH CHECK (profile_id = auth.uid() OR public.is_admin());
CREATE POLICY "time_entries_update" ON public.time_entries
    FOR UPDATE TO authenticated
    USING ((profile_id = auth.uid() AND is_invoiced = false) OR public.is_admin())
    WITH CHECK ((profile_id = auth.uid() AND is_invoiced = false) OR public.is_admin());
CREATE POLICY "time_entries_delete" ON public.time_entries
    FOR DELETE TO authenticated
    USING ((profile_id = auth.uid() AND is_invoiced = false) OR public.is_admin());

-- --- invoices (employees see only their own; admins see all financials) ---
CREATE POLICY "invoices_select" ON public.invoices
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid() OR public.is_admin());
CREATE POLICY "invoices_insert" ON public.invoices
    FOR INSERT TO authenticated
    WITH CHECK (profile_id = auth.uid() AND status = 'draft');
CREATE POLICY "invoices_update" ON public.invoices
    FOR UPDATE TO authenticated
    USING ((profile_id = auth.uid() AND status = 'draft') OR public.is_admin())
    WITH CHECK ((profile_id = auth.uid() AND status = 'draft') OR public.is_admin());
CREATE POLICY "invoices_delete" ON public.invoices
    FOR DELETE TO authenticated
    USING ((profile_id = auth.uid() AND status = 'draft') OR public.is_admin());

-- --- invoice_items (scoped through parent invoice) ---
CREATE POLICY "invoice_items_select" ON public.invoice_items
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_id AND (i.profile_id = auth.uid() OR public.is_admin())
    ));
CREATE POLICY "invoice_items_write" ON public.invoice_items
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_id AND (i.profile_id = auth.uid() OR public.is_admin())
    ));
CREATE POLICY "invoice_items_update" ON public.invoice_items
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_id AND (i.profile_id = auth.uid() OR public.is_admin())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_id AND (i.profile_id = auth.uid() OR public.is_admin())
    ));
CREATE POLICY "invoice_items_delete" ON public.invoice_items
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_id AND (i.profile_id = auth.uid() OR public.is_admin())
    ));

-- --- company_settings (admin only; billing + JMAP config) ---
CREATE POLICY "company_settings_select" ON public.company_settings
    FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "company_settings_update" ON public.company_settings
    FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- --- ledger_entries (own rows unless admin; either account can log one) ---
CREATE POLICY "ledger_entries_select" ON public.ledger_entries
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid() OR public.is_admin());
CREATE POLICY "ledger_entries_insert" ON public.ledger_entries
    FOR INSERT TO authenticated
    WITH CHECK (profile_id = auth.uid());
CREATE POLICY "ledger_entries_update" ON public.ledger_entries
    FOR UPDATE TO authenticated
    USING (profile_id = auth.uid() OR public.is_admin())
    WITH CHECK (profile_id = auth.uid() OR public.is_admin());
CREATE POLICY "ledger_entries_delete" ON public.ledger_entries
    FOR DELETE TO authenticated
    USING (profile_id = auth.uid() OR public.is_admin());

-- ======================================================================
-- STORAGE: private invoice-pdfs bucket
-- Written only by generate-pdf's service_role client (bypasses RLS).
-- Objects are named "<invoice id>.pdf", flat in the bucket root, so the
-- policy recovers the invoice id with split_part().
-- ======================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-pdfs', 'invoice-pdfs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "invoice_pdfs_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'invoice-pdfs'
        AND EXISTS (
            SELECT 1 FROM public.invoices i
            WHERE i.id::text = split_part(storage.objects.name, '.', 1)
              AND (i.profile_id = auth.uid() OR public.is_admin())
        )
    );

-- ======================================================================
-- SEED: the single company_settings row
-- ======================================================================
INSERT INTO public.company_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

COMMIT;
