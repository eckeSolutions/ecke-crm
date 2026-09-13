import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { ADMIN, EMPLOYEE, login } from "./helpers";

/**
 * Covers the flows verified by hand against the live dev stack when this
 * feature was built — a regression guard for that verification, not a
 * repeat of it. Needs the CLI stack's seeded data up, same precondition
 * the other feature specs document in the README.
 *
 * The JMAP-secret test additionally needs `supabase functions serve`
 * running — checked for and skipped if not, same pattern
 * `e2e/invoices.spec.ts`'s PDF test uses.
 */

function readAnonKey(): string {
  const match = readFileSync(".env.local", "utf-8").match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m);
  if (!match) throw new Error("VITE_SUPABASE_ANON_KEY not found in .env.local");
  return match[1]!.trim();
}

test.describe("Settings", () => {
  // Serial: every test reads/writes the same single `company_settings` row
  // (there's exactly one, `id = true` — docs/DATABASE_SCHEMA.md §2), so
  // parallel workers would race on it the same way Finance's from-scratch
  // ledger did.
  test.describe.configure({ mode: "serial" });

  test("an employee is bounced off the URL; an admin sees the three cards with real data", async ({ browser }) => {
    // Two separate contexts, not one page logging in twice: LoginPage
    // redirects away from /login whenever a session already exists
    // (`if (session) return <Navigate to="/" />`), so a second `login()`
    // call reusing the same page/session never finds the form at all — it
    // just times out waiting for an input that's never going to render.
    const employeePage = await (await browser.newContext()).newPage();
    await login(employeePage, EMPLOYEE);
    await employeePage.goto("/settings");
    // RequireAdmin (isAdmin is advisory client-side, but company_settings'
    // own RLS is admin-only regardless — CLAUDE.md's isAdmin rule).
    await expect(employeePage).toHaveURL(/\/$/);

    const adminPage = await (await browser.newContext()).newPage();
    await login(adminPage, ADMIN);
    await adminPage.goto("/settings");
    await expect(adminPage.getByText("Firmenprofil")).toBeVisible();
    await expect(adminPage.getByText("Standard-Stundensatz")).toBeVisible();
    await expect(adminPage.getByText("JMAP / DAV (Stalwart)")).toBeVisible();
    // The seed data (00_dev_baseline.sql) fills this in — not a placeholder.
    await expect(adminPage.getByLabel("Firmenname")).toHaveValue(/./);
  });

  test("each of the three cards saves independently without affecting the others", async ({ page }) => {
    const stamp = Date.now();
    const slogan = `E2E Slogan ${stamp}`;

    await login(page, ADMIN);
    await page.goto("/settings");

    const originalRate = await page.getByLabel("Satz (€)").inputValue();
    const saveButtons = page.getByRole("button", { name: "Speichern" });
    await expect(saveButtons).toHaveCount(3);

    // Save only the profile card...
    await page.getByLabel("Slogan").fill(slogan);
    await saveButtons.nth(0).click();
    await page.waitForTimeout(500);

    // ...then reload and confirm the OTHER cards' values survived
    // untouched — each card's mutation only ever sends its own fields
    // (schema.ts's header comment), never the whole row.
    await page.reload();
    await expect(page.getByLabel("Slogan")).toHaveValue(slogan);
    await expect(page.getByLabel("Satz (€)")).toHaveValue(originalRate);

    // Now save the hourly rate card and confirm the profile survives.
    await page.getByLabel("Satz (€)").fill("123");
    await saveButtons.nth(1).click();
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByLabel("Satz (€)")).toHaveValue("123");
    await expect(page.getByLabel("Slogan")).toHaveValue(slogan);

    // Restore both to their original values.
    await page.getByLabel("Slogan").fill("IT-Service und Beratung");
    await saveButtons.nth(0).click();
    await page.waitForTimeout(500);
    await page.getByLabel("Satz (€)").fill(originalRate);
    await saveButtons.nth(1).click();
    await page.waitForTimeout(500);
  });

  test("the updated hourly rate is what an employee's own RPC returns", async ({ page, request }) => {
    await login(page, ADMIN);
    await page.goto("/settings");
    const originalRate = await page.getByLabel("Satz (€)").inputValue();

    await page.getByLabel("Satz (€)").fill("91");
    await page.getByRole("button", { name: "Speichern" }).nth(1).click();
    await page.waitForTimeout(800);

    // get_default_hourly_rate() is how an employee reaches this one field
    // of an otherwise admin-only table (docs/DATABASE_SCHEMA.md §7) — the
    // real cross-role contract, not just "did the UI show 91".
    const anonKey = readAnonKey();
    const tokenRes = await request.post("http://127.0.0.1:54321/auth/v1/token?grant_type=password", {
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      data: { email: EMPLOYEE.email, password: EMPLOYEE.password },
    });
    const { access_token: employeeToken } = (await tokenRes.json()) as { access_token: string };
    const rpcRes = await request.post("http://127.0.0.1:54321/rest/v1/rpc/get_default_hourly_rate", {
      headers: { apikey: anonKey, Authorization: `Bearer ${employeeToken}`, "Content-Type": "application/json" },
      data: {},
    });
    expect(await rpcRes.json()).toBe(91);

    // Restore.
    await page.getByLabel("Satz (€)").fill(originalRate);
    await page.getByRole("button", { name: "Speichern" }).nth(1).click();
    await page.waitForTimeout(500);
  });

  test("submitting the hourly rate with a negative number shows validation, not a silent no-op", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/settings");
    const originalRate = await page.getByLabel("Satz (€)").inputValue();

    await page.getByLabel("Satz (€)").fill("-5");
    await page.getByRole("button", { name: "Speichern" }).nth(1).click();

    await expect(page.getByText("Muss 0 oder größer sein")).toBeVisible();
    // Confirm nothing was silently written.
    await page.reload();
    await expect(page.getByLabel("Satz (€)")).toHaveValue(originalRate);
  });

  test("replacing the JMAP secret flips the 'konfiguriert' badge and writes to Vault", async ({ page, request }) => {
    const anonKey = readAnonKey();
    const reachable = await request
      .get("http://127.0.0.1:54321/functions/v1/main", { timeout: 3000 })
      .then((r) => r.status() !== 0)
      .catch(() => false);
    test.skip(!reachable, "supabase functions serve is not running — see this file's header comment");

    // Not asserting "nicht konfiguriert" first — there is no in-app way to
    // clear a secret once set (only "Ersetzen"), so after this test's own
    // first run the row stays "konfiguriert" in the dev DB permanently.
    // The badge flipping to (or staying) "konfiguriert" after a successful
    // replace is the real, repeatable claim.
    await login(page, ADMIN);
    await page.goto("/settings");

    await page.getByRole("button", { name: "Ersetzen" }).click();
    const modal = page.locator("ecke-modal[open]", { hasText: "Zugangsdaten ersetzen" });
    await modal.locator('ecke-input input[type="password"]').fill(`E2E-secret-${Date.now()}`);

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("set-jmap-secret")),
      modal.getByRole("button", { name: "Ersetzen" }).click(),
    ]);
    expect(response.status()).toBe(200);
    await expect(page.getByText("konfiguriert", { exact: true })).toBeVisible({ timeout: 10_000 });

    // Defense in depth, not just a hidden button: an employee calling the
    // same function directly is rejected server-side.
    const tokenRes = await request.post("http://127.0.0.1:54321/auth/v1/token?grant_type=password", {
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      data: { email: EMPLOYEE.email, password: EMPLOYEE.password },
    });
    const { access_token: employeeToken } = (await tokenRes.json()) as { access_token: string };
    const forbidden = await request.post("http://127.0.0.1:54321/functions/v1/set-jmap-secret", {
      headers: { apikey: anonKey, Authorization: `Bearer ${employeeToken}`, "Content-Type": "application/json" },
      data: { secret: "employee-attempt" },
    });
    expect(forbidden.status()).toBe(403);
  });
});
