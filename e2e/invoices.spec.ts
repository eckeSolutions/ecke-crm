import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { ADMIN, EMPLOYEE, login } from "./helpers";

/** Node's `process.env` doesn't get Vite's `VITE_*` vars for free — read `.env.local` directly, same file the app itself reads at build time. */
function readAnonKey(): string {
  const match = readFileSync(".env.local", "utf-8").match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m);
  if (!match) throw new Error("VITE_SUPABASE_ANON_KEY not found in .env.local");
  return match[1]!.trim();
}

/**
 * Covers the flows verified by hand against the live dev stack when this
 * feature was built — a regression guard for that verification, not a
 * repeat of it. Needs the CLI stack's seeded data (`supabase/seed/*.sql`)
 * up, same precondition the other feature specs document in the README.
 *
 * PDF generation additionally needs `supabase functions serve` running —
 * unlike the DB, that isn't always up, so the one test that exercises it
 * checks reachability first and skips rather than failing the suite.
 */

function itemModal(page: Page, heading: string) {
  return page.locator("ecke-modal[open]", { hasText: heading });
}

async function deleteConfirmed(page: Page) {
  await page.getByRole("button", { name: "Löschen" }).click();
  const dialog = page.locator("ecke-modal[open]", { hasText: "löschen" });
  await dialog.getByRole("button", { name: "Löschen" }).click();
  // Wait for the delete to actually land, not just for the click to
  // register — otherwise a test can end (and the page/context tear down)
  // while the mutation is still in flight, leaving the row behind. Found
  // by exactly that: three prior runs of the PDF test each left an
  // undeleted draft in the dev DB.
  await page.waitForURL(/\/invoices$/, { timeout: 10_000 });
}

test.describe("Invoices", () => {
  test("the list loads and shows German status labels", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/invoices");

    await expect(page.locator("ecke-table")).toBeVisible();
    await expect(page.locator("ecke-table tbody tr").first()).toBeVisible();
    // The seed data has invoices in every status — draft never appears
    // there (nothing seeds an unfinished draft), but sent/paid/cancelled do.
    const statusCells = await page.locator("ecke-table tbody tr td:last-child").allInnerTexts();
    expect(statusCells.some((s) => ["Offen", "Bezahlt", "Storniert", "Entwurf"].includes(s))).toBe(true);
  });

  test("an employee sees only their own invoices, an admin sees more", async ({ browser }) => {
    const adminPage = await (await browser.newContext()).newPage();
    await login(adminPage, ADMIN);
    await adminPage.goto("/invoices");
    await expect(adminPage.locator("ecke-table")).toBeVisible();
    const adminRows = await adminPage.locator("ecke-table tbody tr").count();

    const employeePage = await (await browser.newContext()).newPage();
    await login(employeePage, EMPLOYEE);
    await employeePage.goto("/invoices");
    await expect(employeePage.locator("ecke-table")).toBeVisible();
    const employeeRows = await employeePage.locator("ecke-table tbody tr").count();

    // RLS (docs/DATABASE_SCHEMA.md §6): invoices_select is
    // `profile_id = auth.uid() OR is_admin()`.
    expect(adminRows).toBeGreaterThan(employeeRows);
  });

  test("creating a new invoice needs a client first, via a native <select> (design-system issue #9 workaround)", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/invoices");

    await page.getByRole("button", { name: "Neue Rechnung" }).click();
    const picker = itemModal(page, "Neue Rechnung");
    // A real <select>, not the APG listbox: `ecke-dropdown`'s popup is
    // unclickable inside this modal (confirmed via a real
    // document.elementFromPoint() hit-test, not a Playwright artifact —
    // see ClientPickerModal.tsx's comment and DS issue #9).
    await expect(picker.locator("select")).toBeVisible();
    await picker.locator("select").selectOption({ index: 1 });
    await picker.getByRole("button", { name: "Weiter" }).click();

    await expect(page).toHaveURL(/\/invoices\/new\?client=[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: /^Rechnung #/ })).toBeVisible();
  });

  test("a draft can be built, saved, edited, and deleted", async ({ page }) => {
    const stamp = Date.now();
    const description = `E2E Position ${stamp}`;

    await login(page, ADMIN);
    await page.goto("/invoices");
    await page.getByRole("button", { name: "Neue Rechnung" }).click();
    const picker = itemModal(page, "Neue Rechnung");
    await picker.locator("select").selectOption({ index: 1 });
    await picker.getByRole("button", { name: "Weiter" }).click();
    await expect(page).toHaveURL(/\/invoices\/new/);

    // Add a manual item.
    await page.getByRole("button", { name: "Position hinzufügen" }).click();
    const addModal = itemModal(page, "Position hinzufügen");
    await addModal.locator("ecke-input input").first().fill(description);
    const numInputs = addModal.locator('ecke-input input[type="number"]');
    await numInputs.nth(0).fill("2");
    await numInputs.nth(1).fill("50");
    await addModal.getByRole("button", { name: "Hinzufügen" }).click();

    // Appears in both the editable table and the live preview panel —
    // both showing the same item is correct, not a duplicate to dedupe.
    await expect(page.locator(".invoice-items-table").getByText(description)).toBeVisible();
    await expect(page.locator(".invoice-editor__total strong")).toHaveText("100,00 €");

    // Save -> real invoice, real URL.
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    const url = page.url();

    // Edit: remove the item, add a different one, save again — still the same invoice.
    await page.locator(".invoice-items-table tbody tr", { hasText: description }).locator("button").click();
    await expect(page.locator(".invoice-items-table").getByText(description)).toHaveCount(0);
    await page.getByRole("button", { name: "Position hinzufügen" }).click();
    const editModal = itemModal(page, "Position hinzufügen");
    await editModal.locator("ecke-input input").first().fill(`${description} v2`);
    const editNumInputs = editModal.locator('ecke-input input[type="number"]');
    await editNumInputs.nth(0).fill("1");
    await editNumInputs.nth(1).fill("30");
    await editModal.getByRole("button", { name: "Hinzufügen" }).click();
    await page.getByRole("button", { name: "Speichern" }).click();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(url); // no navigation on a re-save
    await expect(page.locator(".invoice-items-table").getByText(`${description} v2`)).toBeVisible();

    // Delete — draft only; confirms the row disappears from the list too.
    await deleteConfirmed(page);
    await expect(page).toHaveURL(/\/invoices$/, { timeout: 10_000 });
    await page.goto(url);
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 }); // "Rechnung konnte nicht geladen werden." — RLS/404 after delete, allowing for TanStack Query's one retry
  });

  test("submitting a manual item with an empty description shows validation, not a silent no-op", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/invoices");
    await page.getByRole("button", { name: "Neue Rechnung" }).click();
    const picker = itemModal(page, "Neue Rechnung");
    await picker.locator("select").selectOption({ index: 1 });
    await picker.getByRole("button", { name: "Weiter" }).click();

    await page.getByRole("button", { name: "Position hinzufügen" }).click();
    const modal = itemModal(page, "Position hinzufügen");
    await modal.getByRole("button", { name: "Hinzufügen" }).click();

    await expect(modal.getByText("Pflichtfeld")).toBeVisible();
    await expect(modal).toBeVisible(); // still open, nothing silently added
  });

  test("the time-tracking handoff seeds a line item from the query params", async ({ page }) => {
    await login(page, ADMIN);

    // Find one of the seeded admin's own uninvoiced entries directly —
    // this test exercises the RECEIVING end of the handoff
    // (InvoiceEditorScreen reading ?client=&entries=), not time-tracking's
    // sending end, which time-tracking.spec.ts already covers.
    await page.goto("/time-tracking");
    const row = page.locator("ecke-table tbody tr").first();
    await expect(row).toBeVisible();
    // td indices: 0 = the selection checkbox (this table is `selectable`), 1 = date, 2 = client.
    const clientName = await row.locator("td").nth(2).innerText();

    await row.locator("ecke-checkbox").click();
    // Only proceed via the real button if this row qualifies (not invoiced,
    // which the seed data guarantees for the current month's rows).
    const handoffButton = page.getByRole("button", { name: "In Rechnung übernehmen" });
    await expect(handoffButton).toBeVisible();
    await handoffButton.click();

    await expect(page).toHaveURL(/\/invoices\/new\?client=[0-9a-f-]{36}&entries=[0-9a-f-]{36}$/);
    // The handoff's client, not just "a" client.
    await expect(page.locator(".invoice-preview__client-name")).toHaveText(clientName);
    // A real line item, not an empty editor — the whole point of the handoff.
    await expect(page.locator(".invoice-items-table tbody tr")).toHaveCount(1);
  });

  test("PDF generation and download produce a real PDF", async ({ page, request }) => {
    const reachable = await request
      .get("http://127.0.0.1:54321/functions/v1/main", { timeout: 3000 })
      .then((r) => r.status() !== 0)
      .catch(() => false);
    test.skip(!reachable, "supabase functions serve is not running — see this file's header comment");

    const stamp = Date.now();
    await login(page, ADMIN);
    await page.goto("/invoices");
    await page.getByRole("button", { name: "Neue Rechnung" }).click();
    const picker = itemModal(page, "Neue Rechnung");
    await picker.locator("select").selectOption({ index: 1 });
    await picker.getByRole("button", { name: "Weiter" }).click();

    await page.getByRole("button", { name: "Position hinzufügen" }).click();
    const modal = itemModal(page, `Position hinzufügen`);
    await modal.locator("ecke-input input").first().fill(`E2E PDF ${stamp}`);
    const nums = modal.locator('ecke-input input[type="number"]');
    await nums.nth(0).fill("1");
    await nums.nth(1).fill("10");
    await modal.getByRole("button", { name: "Hinzufügen" }).click();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/, { timeout: 10_000 });

    await page.getByRole("button", { name: "PDF erstellen" }).click();
    await expect(page.getByRole("button", { name: "PDF ansehen" })).toBeVisible({ timeout: 15_000 });

    // "PDF ansehen" opens a blob: URL via window.open() — a real popup
    // fires, but a blob: tab never reaches Playwright's observable "load"/
    // URL-change state (a known limitation, not evidence of anything wrong
    // app-side). So the popup firing at all is checked here, and the PDF's
    // actual bytes are verified independently, straight from storage
    // through the same RLS a real download goes through — the substantive
    // claim, not just "some tab opened."
    const invoiceId = page.url().split("/").pop()!;
    const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "PDF ansehen" }).click()]);
    expect(popup).toBeTruthy();

    const accessToken = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
          return (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token;
        }
      }
      return null;
    });
    expect(accessToken).toBeTruthy();

    const pdfResponse = await request.get(`http://127.0.0.1:54321/storage/v1/object/invoice-pdfs/${invoiceId}.pdf`, {
      headers: { apikey: readAnonKey(), Authorization: `Bearer ${accessToken}` },
    });
    expect(pdfResponse.status()).toBe(200);
    const bytes = await pdfResponse.body();
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    await deleteConfirmed(page);
  });
});
