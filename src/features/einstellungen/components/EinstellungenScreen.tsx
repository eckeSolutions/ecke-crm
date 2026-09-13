import { EckePageHeader } from "@ds/stencil/react";

import { useCompanySettings } from "../hooks";
import { CompanyProfileCard } from "./CompanyProfileCard";
import { HourlyRateCard } from "./HourlyRateCard";
import { JmapCard } from "./JmapCard";
import "./EinstellungenScreen.css";

/**
 * Admin-only (the route itself is `RequireAdmin`-gated, and
 * `company_settings`'s own RLS backs that up server-side) — three
 * independently-saved cards, same shape as the old app's
 * `SettingsPage` minus its MFA card.
 *
 * MFA (phone) is deliberately not built here: `supabase/config.toml`'s
 * `[auth.mfa.phone]` has `enroll_enabled = false` / `verify_enabled =
 * false` — no SMS provider is wired into the self-hosted stack — so an
 * enrollment UI would call an API the server rejects outright. Building
 * a card for a feature that can't work yet would be worse than not
 * having the card; see ROADMAP.md's Einstellungen entry.
 */
export function EinstellungenScreen() {
  const settingsQuery = useCompanySettings();

  if (settingsQuery.isPending) return <p>Wird geladen…</p>;
  if (settingsQuery.isError || !settingsQuery.data) return <p role="alert">Einstellungen konnten nicht geladen werden.</p>;

  const settings = settingsQuery.data;

  return (
    <>
      <EckePageHeader pageTitle="Einstellungen" subtitle="Nur für Administratoren sichtbar" />
      <div className="einstellungen__grid">
        <div className="einstellungen__col">
          <CompanyProfileCard settings={settings} />
        </div>
        <div className="einstellungen__col">
          <HourlyRateCard settings={settings} />
          <JmapCard settings={settings} />
        </div>
      </div>
    </>
  );
}
