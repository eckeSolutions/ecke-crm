import { expect, test } from "@playwright/test";

import { ADMIN, login } from "./helpers";

/**
 * Guards the shadow-DOM submit bridge (src/shell/Form.tsx) on the client
 * form, i.e. beyond the login page. `ecke-button`'s inner
 * `<button type="submit">` cannot submit a light-DOM form across the
 * shadow boundary, so without `Form`/`SubmitButton` this screen looks
 * fine and silently does nothing.
 *
 * Fields are addressed by label, not by index: `ecke-field` bridges its
 * `label` onto the slotted `ecke-input`, which renders it as `aria-label`
 * on the real <input>. (A CSS attribute selector would match nothing —
 * most @Prop()s aren't reflected, see CLAUDE.md.)
 */
test.describe("Forms", () => {
  const fill = async (page: import("@playwright/test").Page, label: string, value: string) => {
    await page.getByLabel(label).fill(value);
  };

  const openNewClientForm = async (page: import("@playwright/test").Page) => {
    await login(page, ADMIN);
    await page.goto("/clients/new");
    // Prove we're actually on the form before acting — a bounce to /login
    // would otherwise make a "navigated away" assertion pass for entirely
    // the wrong reason.
    await expect(page).toHaveURL(/\/clients\/new$/);
    await expect(page.getByLabel("Kunde *")).toBeVisible();
  };

  test("a client can be created by clicking Speichern", async ({ page }) => {
    const stamp = Date.now();
    await openNewClientForm(page);

    await fill(page, "Kunde *", `E2E Testkunde ${stamp}`);
    await fill(page, "Kundennummer *", `E2E-${stamp}`);
    await page.getByRole("button", { name: "Speichern" }).click();

    // onSubmit navigates to the new client's detail route — an exact
    // destination, not merely "somewhere else".
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  });

  test("pressing Enter in a text field submits the form", async ({ page }) => {
    const stamp = Date.now();
    await openNewClientForm(page);

    await fill(page, "Kunde *", `E2E Entertest ${stamp}`);
    await fill(page, "Kundennummer *", `E2E-E-${stamp}`);
    await page.getByLabel("Kundennummer *").press("Enter");

    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  });

  test("submitting with the required fields empty shows validation, not a silent no-op", async ({ page }) => {
    await openNewClientForm(page);

    await fill(page, "Kunde *", "");
    await page.getByRole("button", { name: "Speichern" }).click();

    // Still on the form, and react-hook-form actually ran — which is only
    // observable because the submit reached it at all.
    await expect(page).toHaveURL(/\/clients\/new$/);
    await expect(page.getByText("Pflichtfeld").first()).toBeVisible();
  });
});
