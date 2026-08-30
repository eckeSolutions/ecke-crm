-- dev_dummy_data.sql — ecke.Solutions CRM local dev dummy dataset
--
-- Generates ~40 clients, 1-3 contacts each, ~60 invoices (1-8 line items
-- each, ~70% time-based / ~30% flat-fee) with backing time_entries, spread
-- across the last 4 years. Intentionally excludes company_settings' JMAP
-- fields (jmap_endpoint/jmap_username/jmap_secret_id stay NULL) and does not
-- touch auth.users/profiles.
--
-- NOT idempotent — assumes clients/contacts/time_entries/invoices/
-- invoice_items are empty (see infrastructure/supabase/.env / README for the
-- reset steps) and invoice_number_seq is at 422. Local dev / test data only;
-- emails use the .test TLD (RFC 2606, guaranteed non-routable).
--
-- Run: docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < dev_dummy_data.sql

BEGIN;

-- ======================================================================
-- SERVICE TEMPLATES
-- ======================================================================
INSERT INTO public.service_templates (title, is_time_based, default_price) VALUES
  ('Fernwartung',              true,  NULL),
  ('Vor-Ort-Service',          true,  NULL),
  ('Ersteinrichtung',          true,  NULL),
  ('Beratung',                 true,  NULL),
  ('Datenrettung',             true,  NULL),
  ('Netzwerk-Einrichtung',     true,  NULL),
  ('Wartungspauschale (mtl.)', false, 49.00),
  ('Softwarelizenz (Jahr)',    false, 89.00);

-- ======================================================================
-- CLIENTS — ~40, onboarding dates spread over 4 years (growth-weighted:
-- fewer/older clients in year 4-ago, more/newer in the most recent year)
-- ======================================================================
DO $$
DECLARE
  business_prefixes text[] := ARRAY[
    'Bäckerei','Autohaus','Praxis Dr.','Kanzlei','Malerbetrieb','Elektro',
    'Frisörsalon','Steuerberatung','Physiotherapie','Gaststätte',
    'Zahnarztpraxis','Architekturbüro','Fitnessstudio','Tischlerei',
    'Metallbau','Reisebüro','Versicherungsbüro','Immobilien','Hotel','Café',
    'Weingut','Landhandel','Spedition','IT-Systemhaus','Werbeagentur',
    'Fotostudio','Buchhandlung','Apotheke','Tierarztpraxis','Sanitätshaus',
    'Bestattungen','Dachdeckerei','Sanitär','Gärtnerei','Confiserie',
    'Second-Hand-Laden','Nagelstudio','Yogastudio','Getränkemarkt','Fahrschule'
  ];
  surnames text[] := ARRAY[
    'Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner',
    'Becker','Hoffmann','Schulz','Koch','Bauer','Richter','Klein','Wolf',
    'Neumann','Schwarz','Zimmermann','Braun','Krüger','Hofmann','Lange',
    'Schmitt','Werner','Krause','Meier','Lehmann','Huber','Mayer','Herrmann',
    'König','Walter','Fuchs','Kaiser','Vogel','Peters','Möller','Ludwig',
    'Böhm','Winkler'
  ];
  zips  text[] := ARRAY['78462','79098','88131','88045','89073','70173','76133','68159','86150','80331','90402','97070','55116','60311','79761','78224','88250','89312','70563','88214'];
  citys text[] := ARRAY['Konstanz','Freiburg im Breisgau','Lindau','Friedrichshafen','Ulm','Stuttgart','Karlsruhe','Mannheim','Augsburg','München','Nürnberg','Würzburg','Mainz','Frankfurt am Main','Waldshut-Tiengen','Singen','Weingarten','Günzburg','Vaihingen an der Enz','Ravensburg'];
  street_names text[] := ARRAY['Bahnhofstraße','Hauptstraße','Seestraße','Industriestraße','Gartenweg','Kirchplatz','Rosenweg','Schulstraße','Talstraße','Am Markt','Rheinstraße','Waldweg','Bergstraße','Ringstraße','Mühlweg'];

  bucket_years  int[] := ARRAY[4,3,2,1];   -- "years ago" bucket start
  bucket_counts int[] := ARRAY[6,8,12,14]; -- sums to 40, growth over time

  bucket_start date;
  bucket_end   date;
  cname text;
  cslug text;
  idx   int;
  zidx  int;
  j int;
  i int;
BEGIN
  PERFORM setseed(0.42);

  FOR j IN 1..4 LOOP
    bucket_start := (CURRENT_DATE - make_interval(years => bucket_years[j]));
    bucket_end   := (CURRENT_DATE - make_interval(years => bucket_years[j] - 1));

    FOR i IN 1..bucket_counts[j] LOOP
      idx   := (floor(random()*array_length(business_prefixes,1))+1)::int;
      cname := business_prefixes[idx] || ' ' || surnames[(floor(random()*array_length(surnames,1))+1)::int];
      cslug := lower(regexp_replace(translate(cname, 'äöüÄÖÜß', 'aouAOUs'), '[^a-zA-Z0-9]+', '-', 'g'));
      zidx  := (floor(random()*array_length(zips,1))+1)::int;

      INSERT INTO public.clients (
        name, client_number, street, zip_code, city, phone, mobile_1, mobile_2,
        email_1, email_2, website, birthday, hourly_rate, status, created_at, updated_at
      ) VALUES (
        cname,
        'K' || lpad(((SELECT count(*) FROM public.clients) + 1)::text, 4, '0'),
        street_names[(floor(random()*array_length(street_names,1))+1)::int] || ' ' || (floor(random()*140)+1)::text,
        zips[zidx],
        citys[zidx],
        '+49 7531 ' || (100000 + floor(random()*899999))::text,
        CASE WHEN random() < 0.7 THEN '+49 1' || (50+floor(random()*20))::text || ' ' || (1000000+floor(random()*8999999))::text ELSE NULL END,
        NULL,
        cslug || '@example.test',
        CASE WHEN random() < 0.2 THEN 'buero.' || cslug || '@example.test' ELSE NULL END,
        CASE WHEN random() < 0.6 THEN 'https://www.' || cslug || '.test' ELSE NULL END,
        (DATE '1958-01-01' + (floor(random()*14600))::int),
        CASE WHEN random() < 0.8 THEN 60.00
             ELSE (ARRAY[45.00,50.00,55.00,65.00,70.00,75.00,90.00])[(floor(random()*7)+1)::int]
        END,
        CASE WHEN random() < 0.9 THEN 'active' ELSE 'inactive' END,
        bucket_start + (random() * (bucket_end - bucket_start)) * interval '1 day',
        now()
      );
    END LOOP;
  END LOOP;
END $$;

-- ======================================================================
-- CONTACTS — 1-3 per client
-- ======================================================================
DO $$
DECLARE
  first_names text[] := ARRAY['Michael','Sandra','Thomas','Julia','Andreas','Nicole','Stefan','Anna','Christian','Laura','Markus','Sabine','Frank','Claudia','Jürgen','Petra','Daniel','Melanie','Alexander','Katrin','Martin','Simone','Peter','Vanessa','Tobias','Nadine','Florian','Jasmin','Sebastian','Carina'];
  last_names  text[] := ARRAY['Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Hoffmann','Schulz','Koch','Bauer','Richter','Klein','Wolf','Neumann','Schwarz','Zimmermann','Braun','Krüger'];
  positions   text[] := ARRAY['Geschäftsführer','Geschäftsführerin','Ansprechpartner','Ansprechpartnerin','Buchhaltung','IT-Verantwortlicher','Inhaber','Inhaberin','Prokurist','Assistenz der Geschäftsführung'];
  r record;
  n_contacts int;
  k int;
  fn text;
  ln text;
BEGIN
  PERFORM setseed(0.77);
  FOR r IN SELECT id FROM public.clients LOOP
    n_contacts := (1 + floor(random()*3))::int; -- 1..3
    FOR k IN 1..n_contacts LOOP
      fn := first_names[(floor(random()*array_length(first_names,1))+1)::int];
      ln := last_names[(floor(random()*array_length(last_names,1))+1)::int];
      INSERT INTO public.contacts (client_id, first_name, last_name, email, phone, "position")
      VALUES (
        r.id, fn, ln,
        lower(fn || '.' || ln) || '@example.test',
        '+49 1' || (50+floor(random()*20))::text || ' ' || (1000000+floor(random()*8999999))::text,
        positions[(floor(random()*array_length(positions,1))+1)::int]
      );
    END LOOP;
  END LOOP;
END $$;

-- ======================================================================
-- INVOICES + ITEMS + BACKING TIME ENTRIES — ~60 invoices, 1-8 items each,
-- dated after their client's onboarding, spread across the 4-year window.
-- Also generates ~30 extra un-invoiced time_entries for recent pending work.
-- ======================================================================
DO $$
DECLARE
  admin_id      uuid := (SELECT id FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1);
  employee_id   uuid := (SELECT id FROM public.profiles WHERE role = 'employee' ORDER BY created_at LIMIT 1);

  time_tpl_ids     uuid[];
  time_tpl_titles  text[];
  flat_tpl_ids     uuid[];
  flat_tpl_titles  text[];
  flat_tpl_prices  numeric[];

  n_invoices int := 60;
  inv int;
  client_rec record;
  invoice_id uuid;
  invoice_date date;
  date_due date;
  age_days int;
  v_status text;
  v_paid_at timestamptz;
  notes text;
  profile_id uuid;

  n_items int;
  item int;
  is_time_item boolean;
  tpl_idx int;
  tpl_id uuid;
  tpl_title text;
  qty numeric(10,2);
  unit_price numeric(10,2);
  line_total numeric(10,2);
  line_desc text;
  duration_min int;
  start_ts timestamptz;
  end_ts timestamptz;
  time_entry_id uuid;
  total numeric(10,2);
  r double precision;
  k int;
  extra int;
BEGIN
  PERFORM setseed(0.13);

  SELECT array_agg(id), array_agg(title) INTO time_tpl_ids, time_tpl_titles
    FROM public.service_templates WHERE is_time_based;
  SELECT array_agg(id), array_agg(title), array_agg(default_price) INTO flat_tpl_ids, flat_tpl_titles, flat_tpl_prices
    FROM public.service_templates WHERE NOT is_time_based;

  FOR inv IN 1..n_invoices LOOP
    -- Pick a random existing client, then a date on/after their onboarding.
    SELECT id, hourly_rate, created_at::date AS since INTO client_rec
      FROM public.clients ORDER BY random() LIMIT 1;

    invoice_date := client_rec.since + (floor(random() * GREATEST(1, LEAST(1460, CURRENT_DATE - client_rec.since))))::int;
    IF invoice_date > CURRENT_DATE THEN
      invoice_date := CURRENT_DATE;
    END IF;
    date_due := invoice_date + 14;

    profile_id := CASE WHEN random() < 0.55 THEN admin_id ELSE employee_id END;

    -- Status distribution by age: older invoices have mostly settled.
    age_days := CURRENT_DATE - invoice_date;
    r := random();
    IF age_days > 90 THEN
      v_status := CASE WHEN r < 0.85 THEN 'paid' WHEN r < 0.95 THEN 'sent' ELSE 'cancelled' END;
    ELSIF age_days > 14 THEN
      v_status := CASE WHEN r < 0.45 THEN 'paid' WHEN r < 0.90 THEN 'sent' ELSE 'cancelled' END;
    ELSE
      v_status := CASE WHEN r < 0.30 THEN 'draft' WHEN r < 0.85 THEN 'sent' ELSE 'paid' END;
    END IF;

    notes := CASE
      WHEN v_status = 'cancelled' AND random() < 0.6 THEN 'Storniert - fehlerhafte Rechnung, siehe Ersatzrechnung.'
      WHEN v_status = 'paid' AND random() < 0.15 THEN 'Danke für die pünktliche Zahlung.'
      ELSE NULL
    END;

    -- 1. Insert as draft (required by invoices_insert policy shape / trigger lifecycle).
    INSERT INTO public.invoices (client_id, profile_id, date_issued, date_due, status, notes)
    VALUES (client_rec.id, profile_id, invoice_date, date_due, 'draft', notes)
    RETURNING id INTO invoice_id;

    -- 2. Line items (1-8), ~70% time-based (billed at the client's hourly_rate).
    n_items := (1 + floor(random()*8))::int;
    total := 0;
    FOR item IN 1..n_items LOOP
      is_time_item := random() < 0.7;

      IF is_time_item THEN
        tpl_idx := (floor(random()*array_length(time_tpl_ids,1))+1)::int;
        tpl_id := time_tpl_ids[tpl_idx];
        tpl_title := time_tpl_titles[tpl_idx];
        qty := ((1 + floor(random()*32))::numeric) * 0.25; -- 0.25..8.00h, quarter-hour steps
        unit_price := client_rec.hourly_rate;
        line_desc := tpl_title || ' am ' || to_char(invoice_date - (floor(random()*10))::int, 'DD.MM.YYYY');
      ELSE
        tpl_idx := (floor(random()*array_length(flat_tpl_ids,1))+1)::int;
        tpl_id := flat_tpl_ids[tpl_idx];
        tpl_title := flat_tpl_titles[tpl_idx];
        qty := (1 + floor(random()*3))::numeric;
        unit_price := COALESCE(flat_tpl_prices[tpl_idx], (ARRAY[19.90,29.90,39.90,59.00,99.00])[(floor(random()*5)+1)::int]);
        line_desc := tpl_title;
      END IF;

      line_total := round(qty * unit_price, 2);
      total := total + line_total;
      time_entry_id := NULL;

      IF is_time_item THEN
        duration_min := (qty * 60)::int;
        start_ts := (invoice_date - (floor(random()*14))::int)
                    + make_interval(hours => (8 + floor(random()*8))::int);
        end_ts := start_ts + make_interval(mins => duration_min);

        INSERT INTO public.time_entries (
          client_id, profile_id, template_id, description, start_time, end_time,
          duration_minutes, hourly_rate_snapshot, is_invoiced, invoice_id
        ) VALUES (
          client_rec.id, profile_id, tpl_id, line_desc, start_ts, end_ts,
          duration_min, unit_price, true, invoice_id
        ) RETURNING id INTO time_entry_id;
      END IF;

      INSERT INTO public.invoice_items (
        invoice_id, template_id, description, quantity, unit_price, line_total,
        linked_time_entry_id, sort_order
      ) VALUES (
        invoice_id, tpl_id, line_desc, qty, unit_price, line_total, time_entry_id, item
      );
    END LOOP;

    -- 3. Set the real total while still draft (immutability trigger locks
    --    total_amount once status leaves draft).
    UPDATE public.invoices SET total_amount = total WHERE id = invoice_id;

    -- 4. Move to its final status (allowed: OLD.status is still 'draft' here,
    --    so the immutability trigger's restriction doesn't apply to this update).
    IF v_status <> 'draft' THEN
      v_paid_at := NULL;
      IF v_status = 'paid' THEN
        v_paid_at := (invoice_date + (5 + floor(random()*20))::int)::timestamptz;
        IF v_paid_at > now() THEN v_paid_at := now(); END IF;
      END IF;
      UPDATE public.invoices SET status = v_status, paid_at = v_paid_at WHERE id = invoice_id;
    END IF;
  END LOOP;

  -- Extra un-invoiced time entries: recent pending work not yet billed.
  extra := 30;
  FOR k IN 1..extra LOOP
    SELECT id, hourly_rate INTO client_rec FROM public.clients ORDER BY random() LIMIT 1;
    profile_id := CASE WHEN random() < 0.55 THEN admin_id ELSE employee_id END;
    tpl_idx := (floor(random()*array_length(time_tpl_ids,1))+1)::int;
    tpl_id := time_tpl_ids[tpl_idx];
    tpl_title := time_tpl_titles[tpl_idx];
    duration_min := ((1 + floor(random()*32))::int) * 15; -- 15..480 min, quarter-hour steps
    start_ts := (CURRENT_DATE - (floor(random()*30))::int) + make_interval(hours => (8 + floor(random()*8))::int);
    end_ts := start_ts + make_interval(mins => duration_min);

    INSERT INTO public.time_entries (
      client_id, profile_id, template_id, description, start_time, end_time,
      duration_minutes, hourly_rate_snapshot, is_invoiced, invoice_id
    ) VALUES (
      client_rec.id, profile_id, tpl_id,
      tpl_title || ' am ' || to_char(start_ts, 'DD.MM.YYYY'),
      start_ts, end_ts, duration_min, client_rec.hourly_rate, false, NULL
    );
  END LOOP;
END $$;

COMMIT;
