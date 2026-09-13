import { expect, test } from "@playwright/test";

import { ADMIN, EMPLOYEE, emailInput, login, passwordInput } from "./helpers";

test.describe("Auth", () => {
  test("an anonymous visitor is redirected to /login", async ({ page }) => {
    await page.goto("/clients");
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
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/$/);
  });

  test("the attempted deep link is restored after logging in", async ({ page }) => {
    await page.goto("/clients");
    await expect(page).toHaveURL(/\/login$/);

    await emailInput(page).fill(ADMIN.email);
    await passwordInput(page).fill(ADMIN.password);
    await page.getByRole("button", { name: "Anmelden" }).click();

    await expect(page).toHaveURL(/\/clients$/);
  });

  test("a hard reload on a deep route restores it instead of 404ing", async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole("link", { name: "Kunden" }).click();
    await expect(page).toHaveURL(/\/clients$/);

    // The real point of this one: `vite preview` and the production Caddy
    // both need an SPA fallback for a non-root URL. ROADMAP.md's Phase 2
    // PWA item flags it; Caddyfile's try_files is the production half.
    await page.reload();
    await expect(page).toHaveURL(/\/clients$/);
    await expect(page.getByRole("link", { name: "Kunden" })).toBeVisible();
  });

  test("signing out returns to /login and the session does not survive a reload", async ({ page }) => {
    await login(page, ADMIN);

    // Desktop sign-out is the sidebar footer's own glyph. It is a bare
    // <svg> with no role or accessible name (design-system issue #5), so it
    // can only be addressed by class — Playwright's CSS engine pierces the
    // shadow root. The floating .app-shell__signout button is the sub-768px
    // fallback and is display:none at this viewport.
    await page.locator(".sidebar-nav__logout").click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/clients");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("on mobile, sign-out lives in the bottom nav's overflow menu", async ({ page }) => {
    // Below 768px the sidebar — and with it the only desktop sign-out — is
    // display:none, so this is the single way out. There is deliberately no
    // floating button any more; rendering one alongside the sidebar's own
    // glyph read as a duplicate.
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, ADMIN);

    await expect(page.locator(".app-shell__signout")).toHaveCount(0);

    // Six nav entries plus Abmelden, against maxVisible 4 — it is in "More".
    await page.locator("ecke-bottom-nav").getByRole("button", { name: /mehr|more/i }).click();
    await page.getByText("Abmelden").click();

    await expect(page).toHaveURL(/\/login$/);
  });
});
