import { expect, test, type Page } from "@playwright/test";

import { ADMIN, EMPLOYEE, login } from "./helpers";

/**
 * Covers the flows verified by hand against the live dev stack when this
 * feature was built — a regression guard for that verification, not a
 * repeat of it. Needs the CLI stack's seeded data up, same precondition
 * the other feature specs document in the README. Unlike Zeiterfassung/
 * Rechnungen, the seed data has NO `ledger_entries` rows at all, so every
 * test here creates (and cleans up) its own — there's no "at least one
 * seeded row" assumption to lean on.
 */

function entryModal(page: Page, heading: string) {
  return page.locator("ecke-modal[open]", { hasText: heading });
}

async function deleteConfirmed(page: Page) {
  await page.getByRole("button", { name: "Löschen" }).click();
  const dialog = page.locator("ecke-modal[open]", { hasText: "löschen" });
  await dialog.getByRole("button", { name: "Löschen" }).click();
  // Wait for the delete to actually land, not just for the click to
  // register — unlike Rechnungen's delete (which navigates, giving a URL
  // to wait on), this screen stays put, so the dialog closing is the
  // signal the mutation resolved. Without this, a test can end (tearing
  // down the page) while the mutation is still in flight, leaving rows
  // behind — exactly what happened the first time this test ran.
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
}

test.describe("Finanzen", () => {
  // Serial, not parallel: every test in this file reads/writes the SAME
  // "current month" ledger scope for the same admin user, with no
  // seeded rows to fall back on (unlike Kunden/Zeiterfassung/Rechnungen,
  // whose tables already have plenty of pre-existing rows to assert
  // against). Running these in parallel workers is a real race — this
  // file's first version failed intermittently exactly that way, one
  // test's mid-flight entry making another test's "table is empty"
  // assertion fail. Other spec files still run in parallel with this one.
  test.describe.configure({ mode: "serial" });

  test("a new expense and income entry update the three stat cards correctly", async ({ page }) => {
    const stamp = Date.now();
    const expenseDesc = `E2E Bürobedarf ${stamp}`;
    const incomeDesc = `E2E Erstattung ${stamp}`;

    await login(page, ADMIN);
    await page.goto("/finanzen");
    await expect(page.getByText("Noch keine Buchungen in diesem Monat.")).toBeVisible();

    // Default type is "Ausgabe" (expense) — no need to touch the dropdown.
    await page.getByRole("button", { name: "Neue Buchung" }).click();
    const expenseModal = entryModal(page, "Neue Buchung");
    await expenseModal.locator("ecke-input input").first().fill(expenseDesc);
    await expenseModal.locator('ecke-input input[type="number"]').fill("42.50");
    await expenseModal.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText(expenseDesc)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Neue Buchung" }).click();
    const incomeModal = entryModal(page, "Neue Buchung");
    await incomeModal.locator("ecke-dropdown").first().click();
    await page.getByRole("option", { name: "Einnahme" }).click();
    await incomeModal.locator("ecke-input input").first().fill(incomeDesc);
    await incomeModal.locator('ecke-input input[type="number"]').fill("100");
    await incomeModal.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText(incomeDesc)).toBeVisible({ timeout: 10_000 });

    // .textContent()/toContainText() pierce shadow DOM for matching;
    // `ecke-stat-card`'s value renders inside its own shadow root, so
    // `.innerText()` (a real DOM API that does NOT cross shadow
    // boundaries here) came back empty — not a component bug, just the
    // wrong extraction method for a Stencil shadow component.
    const statsText = page.locator(".finanzen__stats");
    await expect(statsText).toContainText("100,00 €"); // Einnahmen
    await expect(statsText).toContainText("42,50 €"); // Ausgaben
    await expect(statsText).toContainText("57,50 €"); // Saldo = 100 - 42.50

    // Clean up both via multi-select delete.
    const rows = page.locator("ecke-table tbody tr");
    await rows.nth(0).locator("ecke-checkbox").click();
    await rows.nth(1).locator("ecke-checkbox").click();
    await deleteConfirmed(page);
    await expect(page.getByText("Noch keine Buchungen in diesem Monat.")).toBeVisible({ timeout: 10_000 });
  });

  test("row click opens the entry for editing, category included", async ({ page }) => {
    const stamp = Date.now();
    const description = `E2E Editierbar ${stamp}`;

    await login(page, ADMIN);
    await page.goto("/finanzen");
    await page.getByRole("button", { name: "Neue Buchung" }).click();
    const createModal = entryModal(page, "Neue Buchung");
    await createModal.locator("ecke-input input").first().fill(description);
    await createModal.locator('ecke-input input[type="number"]').fill("10");
    await createModal.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText(description)).toBeVisible({ timeout: 10_000 });

    await page.getByText(description).click();
    const editModal = entryModal(page, "Buchung bearbeiten");
    await expect(editModal).toBeVisible();
    // Category dropdown is the second ecke-dropdown in this form (the first is "Typ").
    await editModal.locator("ecke-dropdown").nth(1).click();
    await page.getByRole("option", { name: "Software" }).click();
    await editModal.getByRole("button", { name: "Speichern" }).click();

    await expect(page.locator("ecke-table tbody tr", { hasText: description })).toContainText("Software");

    await page.locator("ecke-table tbody tr", { hasText: description }).locator("ecke-checkbox").click();
    await deleteConfirmed(page);
  });

  test("submitting with an empty description shows validation, not a silent no-op", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/finanzen");
    await page.getByRole("button", { name: "Neue Buchung" }).click();
    const modal = entryModal(page, "Neue Buchung");
    await modal.locator('ecke-input input[type="number"]').fill("10");
    await modal.getByRole("button", { name: "Speichern" }).click();

    await expect(modal.getByText("Pflichtfeld")).toBeVisible();
    await expect(modal).toBeVisible(); // still open — nothing silently created
  });

  test("submitting with a zero amount shows validation, not a silent no-op", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/finanzen");
    await page.getByRole("button", { name: "Neue Buchung" }).click();
    const modal = entryModal(page, "Neue Buchung");
    await modal.locator("ecke-input input").first().fill("E2E Ungültig");
    await modal.getByRole("button", { name: "Speichern" }).click();

    await expect(modal.getByText("Muss größer als 0 sein")).toBeVisible();
    await expect(modal).toBeVisible();
  });

  test("an admin sees an employee's booking; the employee does not see the admin's", async ({ browser }) => {
    const stamp = Date.now();
    const adminDesc = `E2E Admin-Buchung ${stamp}`;

    const adminPage = await (await browser.newContext()).newPage();
    await login(adminPage, ADMIN);
    await adminPage.goto("/finanzen");
    await adminPage.getByRole("button", { name: "Neue Buchung" }).click();
    const modal = entryModal(adminPage, "Neue Buchung");
    await modal.locator("ecke-input input").first().fill(adminDesc);
    await modal.locator('ecke-input input[type="number"]').fill("5");
    await modal.getByRole("button", { name: "Speichern" }).click();
    await expect(adminPage.getByText(adminDesc)).toBeVisible({ timeout: 10_000 });

    // RLS (docs/DATABASE_SCHEMA.md §6): ledger_entries_select is
    // `profile_id = auth.uid() OR is_admin()` — admin sees everyone's,
    // an employee only their own.
    const employeePage = await (await browser.newContext()).newPage();
    await login(employeePage, EMPLOYEE);
    await employeePage.goto("/finanzen");
    await expect(employeePage.getByText(adminDesc)).toHaveCount(0);

    // Clean up the admin's own entry.
    await adminPage.locator("ecke-table tbody tr", { hasText: adminDesc }).locator("ecke-checkbox").click();
    await deleteConfirmed(adminPage);
  });
});
