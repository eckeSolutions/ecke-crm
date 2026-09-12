import { expect, test, type Page } from "@playwright/test";

import { ADMIN, EMPLOYEE, login } from "./helpers";

/**
 * Covers the flows verified by hand against the live dev stack when this
 * feature was built (real Postgres, real RLS, real `round_duration_to_15`
 * trigger) — a regression guard for that verification, not a repeat of it.
 * Runs against the CLI stack's seeded data (`supabase/seed/*.sql`), so it
 * needs that stack up, same precondition `test:e2e` already documents in
 * the README for the forms spec.
 */

function entryModal(page: Page, heading: string) {
  return page.locator("ecke-modal[open]", { hasText: heading });
}

/**
 * Clicks the selection bar's "Löschen" then confirms in the resulting
 * dialog. Both buttons are named "Löschen" — `.first()`/`.last()` on a
 * bare role query is ambiguous between them (the confirm dialog's backdrop
 * physically overlaps the selection bar once open, so a misresolved
 * `.last()` gets intercepted rather than clicking anything), so this scopes
 * to the dialog element the same way `entryModal()` does — `getByRole
 * ("dialog", { name })` did not resolve `ecke-modal`'s shadow-DOM
 * `aria-labelledby` reliably in testing, `ecke-modal[open]` + `hasText`
 * did.
 */
async function deleteSelection(page: Page) {
  await page.getByRole("button", { name: "Löschen" }).click();
  const dialog = page.locator("ecke-modal[open]", { hasText: "löschen" });
  await dialog.getByRole("button", { name: "Löschen" }).click();
}

async function pickFirstClientOption(page: Page, modal: ReturnType<typeof entryModal>) {
  await modal.locator("ecke-dropdown").click();
  await page.getByRole("option").first().click();
}

test.describe("Zeiterfassung", () => {
  test("loads the current month's entries and totals their hours", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/zeiterfassung");

    await expect(page.locator("ecke-table")).toBeVisible();
    // The seed data guarantees at least one row this month (10_dev_dummy_data.sql).
    await expect(page.locator("ecke-table tbody tr").first()).toBeVisible();
    await expect(page.getByText(/h in diesem Monat erfasst/)).toBeVisible();
  });

  test("an employee sees only their own entries, an admin sees more", async ({ browser }) => {
    const adminPage = await (await browser.newContext()).newPage();
    await login(adminPage, ADMIN);
    await adminPage.goto("/zeiterfassung");
    // The table doesn't exist at all while the query is pending (the
    // screen renders "Wird geladen…" in its place) — counting rows before
    // waiting for it is a race that reads 0 regardless of RLS.
    await expect(adminPage.locator("ecke-table")).toBeVisible();
    const adminRows = await adminPage.locator("ecke-table tbody tr").count();

    const employeePage = await (await browser.newContext()).newPage();
    await login(employeePage, EMPLOYEE);
    await employeePage.goto("/zeiterfassung");
    await expect(employeePage.locator("ecke-table")).toBeVisible();
    const employeeRows = await employeePage.locator("ecke-table tbody tr").count();

    // RLS (docs/DATABASE_SCHEMA.md §6): time_entries_select is
    // `profile_id = auth.uid() OR is_admin()` — never equal unless one of
    // them has zero rows, which the seed data doesn't produce.
    expect(adminRows).toBeGreaterThan(employeeRows);
  });

  test("a manual entry can be created, edited by clicking its row, and deleted", async ({ page }) => {
    const stamp = Date.now();
    const created = `E2E Manuell ${stamp}`;
    const edited = `E2E Bearbeitet ${stamp}`;

    await login(page, ADMIN);
    await page.goto("/zeiterfassung");

    await page.getByRole("button", { name: "Manueller Eintrag" }).click();
    const createModal = entryModal(page, "Manueller Eintrag");
    await pickFirstClientOption(page, createModal);
    await createModal.locator("ecke-input input").fill(created);
    await createModal.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText(created)).toBeVisible({ timeout: 10_000 });

    // Row click -> edit (ecke-table emits no row event; ZeiterfassungScreen
    // listens on the host and reads composedPath() for the <tr>, the same
    // pattern ClientListScreen uses).
    await page.getByText(created).click();
    const editModal = entryModal(page, "Zeiteintrag bearbeiten");
    await expect(editModal).toBeVisible();
    await editModal.locator("ecke-input input").fill(edited);
    await editModal.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText(edited)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(created)).toHaveCount(0);

    // Select + delete via the selection bar's ConfirmModal.
    const row = page.locator("ecke-table tbody tr", { hasText: edited });
    await row.locator("ecke-checkbox").click();
    await deleteSelection(page);
    await expect(page.getByText(edited)).toHaveCount(0, { timeout: 10_000 });
  });

  test("submitting the manual-entry form with end before start shows validation, not a silent no-op", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/zeiterfassung");

    await page.getByRole("button", { name: "Manueller Eintrag" }).click();
    const modal = entryModal(page, "Manueller Eintrag");
    await pickFirstClientOption(page, modal);
    await modal.locator("ecke-input input").fill("E2E invalid range");

    const [startInput, endInput] = await modal.locator('input[type="datetime-local"]').all();
    await startInput!.fill("2026-06-01T10:00");
    await endInput!.fill("2026-06-01T09:00");
    await modal.getByRole("button", { name: "Speichern" }).click();

    await expect(modal.getByText("Ende muss nach dem Start liegen")).toBeVisible();
    await expect(modal).toBeVisible(); // still open — the submit reached react-hook-form and was rejected, not lost
  });

  test("selecting entries from different clients hides bulk actions and explains why", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/zeiterfassung");
    await expect(page.locator("ecke-table")).toBeVisible();

    // Search for the first differing pair rather than assuming rows 0/1
    // differ: repeated "Manueller Eintrag" test runs all pick the same
    // (first) client option, so the newest rows often share a client —
    // taking indices 0/1 unconditionally made this skip far more often
    // than the underlying scenario actually requires.
    const clientCells = await page.locator("ecke-table tbody tr td:nth-child(2)").allInnerTexts();
    let a = -1;
    let b = -1;
    outer: for (let i = 0; i < clientCells.length; i++) {
      for (let j = i + 1; j < clientCells.length; j++) {
        if (clientCells[i] !== clientCells[j]) {
          a = i;
          b = j;
          break outer;
        }
      }
    }
    test.skip(a === -1, "every entry this month happens to share one client this run");

    const rows = page.locator("ecke-table tbody tr");
    await rows.nth(a).locator("ecke-checkbox").click();
    await rows.nth(b).locator("ecke-checkbox").click();

    await expect(page.getByRole("button", { name: "In Rechnung übernehmen" })).toHaveCount(0);
    await expect(page.getByText("Nur Einträge desselben Kunden können gemeinsam in Rechnung übernommen werden.")).toBeVisible();
  });

  test("selecting entries from one client hands off to the invoice editor via query params", async ({ page }) => {
    const stamp = Date.now();
    const description = `E2E Handoff ${stamp}`;

    await login(page, ADMIN);
    await page.goto("/zeiterfassung");
    await page.getByRole("button", { name: "Manueller Eintrag" }).click();
    const modal = entryModal(page, "Manueller Eintrag");
    await pickFirstClientOption(page, modal);
    await modal.locator("ecke-input input").fill(description);
    await modal.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText(description)).toBeVisible({ timeout: 10_000 });

    const row = page.locator("ecke-table tbody tr", { hasText: description });
    await row.locator("ecke-checkbox").click();
    await page.getByRole("button", { name: "In Rechnung übernehmen" }).click();

    // The exact contract ROADMAP.md/CLAUDE.md document for this handoff —
    // Rechnungen doesn't exist yet to read these params (still a
    // PlaceholderScreen), so this only proves the navigation side.
    await expect(page).toHaveURL(/\/rechnungen\/neu\?client=[0-9a-f-]{36}&entries=[0-9a-f-]{36}$/);

    // Clean up: the entry survives navigation (selection only clears, the
    // row isn't deleted), so remove it via the API-less path — reopen and
    // delete like the other tests do.
    await page.goto("/zeiterfassung");
    const cleanupRow = page.locator("ecke-table tbody tr", { hasText: description });
    await cleanupRow.locator("ecke-checkbox").click();
    await deleteSelection(page);
    await expect(page.getByText(description)).toHaveCount(0, { timeout: 10_000 });
  });

  test("starting a stopwatch persists across a reload and stopping it saves a real entry", async ({ page }) => {
    const stamp = Date.now();
    const description = `E2E Stoppuhr ${stamp}`;

    await login(page, ADMIN);
    await page.goto("/zeiterfassung");

    await page.getByRole("button", { name: "Zeit starten" }).click();
    const startModal = entryModal(page, "Zeit starten");
    await pickFirstClientOption(page, startModal);
    await startModal.locator("ecke-input input").fill(description);
    await startModal.getByRole("button", { name: "Starten" }).click();

    await expect(page.getByText(description)).toBeVisible();
    await expect(page.getByRole("button", { name: "Zeit starten" })).toBeDisabled();

    // localStorage persistence (ROADMAP.md's "Offline" decision) — a
    // reload must not lose the running timer.
    await page.reload();
    await expect(page.getByText(description)).toBeVisible();
    await expect(page.getByRole("button", { name: "Stoppen" })).toBeVisible();

    await page.getByRole("button", { name: "Stoppen" }).click();
    await expect(page.getByRole("button", { name: "Zeit starten" })).toBeEnabled({ timeout: 10_000 });
    // The description now appears in the table row, not the running-timer
    // card (which is gone) — one match, not the two that would exist while
    // both were visible at once.
    await expect(page.getByText(description)).toHaveCount(1);

    const row = page.locator("ecke-table tbody tr", { hasText: description });
    await row.locator("ecke-checkbox").click();
    await deleteSelection(page);
    await expect(page.getByText(description)).toHaveCount(0, { timeout: 10_000 });
  });

  test("discarding a running timer clears it without saving anything", async ({ page }) => {
    const stamp = Date.now();
    const description = `E2E Verworfen ${stamp}`;

    await login(page, ADMIN);
    await page.goto("/zeiterfassung");

    await page.getByRole("button", { name: "Zeit starten" }).click();
    const startModal = entryModal(page, "Zeit starten");
    await pickFirstClientOption(page, startModal);
    await startModal.locator("ecke-input input").fill(description);
    await startModal.getByRole("button", { name: "Starten" }).click();
    await expect(page.getByText(description)).toBeVisible();

    await page.getByRole("button", { name: "Verwerfen" }).click();
    await expect(page.getByRole("button", { name: "Zeit starten" })).toBeEnabled();
    await expect(page.getByText(description)).toHaveCount(0);
  });
});
