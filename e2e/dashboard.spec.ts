import { expect, test } from "@playwright/test";

import { ADMIN, login } from "./helpers";

/**
 * Read-only against the live seeded dataset (`supabase/seed/10_dev_dummy_data.sql`
 * spreads invoices/time entries randomly over the last ~4 years/30 days), so this
 * asserts structure and navigation rather than exact totals — the numbers
 * themselves shift with every `db reset` and depend on which day it's run.
 */
test.describe("Dashboard", () => {
  test("shows the welcome header and this-month/open/hours stat cards after login", async ({ page }) => {
    await login(page, ADMIN);
    await expect(page).toHaveURL(/\/$/);

    await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();

    const statCards = page.locator("ecke-stat-card");
    await expect(statCards).toHaveCount(3);
    await expect(statCards.nth(0)).toContainText("Umsatz diesen Monat");
    await expect(statCards.nth(1)).toContainText("Offene Rechnungen");
    await expect(statCards.nth(2)).toContainText("Erfasste Stunden (Monat)");
  });

  test("renders the revenue trend chart and the payment split card", async ({ page }) => {
    await login(page, ADMIN);

    await expect(page.getByText("Umsatzentwicklung")).toBeVisible();
    await expect(page.locator("ecke-bar-chart")).toBeVisible();
    await expect(page.getByText(/Offen vs\. bezahlt/)).toBeVisible();
  });

  test("renders the recent-invoices and top-clients cards", async ({ page }) => {
    await login(page, ADMIN);

    await expect(page.locator("ecke-recent-list")).toContainText("Letzte Rechnungen");
    await expect(page.getByText(/Top Kunden/)).toBeVisible();
  });

  test("quick access navigates to the target feature via a real route change", async ({ page }) => {
    await login(page, ADMIN);

    await page.getByRole("link", { name: "Neue Rechnung" }).click();
    await expect(page).toHaveURL(/\/invoices\/new$/);
  });

  test("\"Alle anzeigen\" on Letzte Rechnungen navigates to the invoices list", async ({ page }) => {
    await login(page, ADMIN);

    await page.getByRole("link", { name: "Alle anzeigen" }).click();
    await expect(page).toHaveURL(/\/invoices$/);
  });
});
