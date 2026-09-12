import { expect, test } from "@playwright/test";

import { ADMIN, EMPLOYEE, emailInput, login, passwordInput } from "./helpers";

test.describe("Auth", () => {
  test("an anonymous visitor is redirected to /login", async ({ page }) => {
    await page.goto("/kunden");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("wrong credentials show an error and stay on /login", async ({ page }) => {
    await page.goto("/login");
    await emailInput(page).fill(ADMIN.email);
    await passwordInput(page).fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Anmelden" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("admin logs in, lands on the dashboard and sees every nav entry", async ({ page }) => {
    await login(page, ADMIN);

    await expect(page).toHaveURL(/\/$/);
    for (const label of ["Übersicht", "Kunden", "Zeiterfassung", "Rechnungen", "Finanzen", "Einstellungen"]) {
      await expect(page.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("an employee sees no Einstellungen entry and is bounced off its URL", async ({ page }) => {
    await login(page, EMPLOYEE);

    await expect(page.getByRole("link", { name: "Kunden" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Einstellungen" })).toHaveCount(0);

    // isAdmin is advisory (CLAUDE.md) — hiding the nav item is not the
    // gate, so prove the direct URL is refused too.
    await page.goto("/einstellungen");
    await expect(page).toHaveURL(/\/$/);
  });

  test("the attempted deep link is restored after logging in", async ({ page }) => {
    await page.goto("/kunden");
    await expect(page).toHaveURL(/\/login$/);

    await emailInput(page).fill(ADMIN.email);
    await passwordInput(page).fill(ADMIN.password);
    await page.getByRole("button", { name: "Anmelden" }).click();

    await expect(page).toHaveURL(/\/kunden$/);
  });

  test("a hard reload on a deep route restores it instead of 404ing", async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole("link", { name: "Kunden" }).click();
    await expect(page).toHaveURL(/\/kunden$/);

    // The real point of this one: `vite preview` and the production Caddy
    // both need an SPA fallback for a non-root URL. ROADMAP.md's Phase 2
    // PWA item flags it; Caddyfile's try_files is the production half.
    await page.reload();
    await expect(page).toHaveURL(/\/kunden$/);
    await expect(page.getByRole("link", { name: "Kunden" })).toBeVisible();
  });

  test("signing out returns to /login and the session does not survive a reload", async ({ page }) => {
    await login(page, ADMIN);

    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/kunden");
    await expect(page).toHaveURL(/\/login$/);
  });
});
