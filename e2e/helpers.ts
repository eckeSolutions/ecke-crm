import { expect, type Page } from "@playwright/test";

/**
 * Seeded dev accounts from supabase/seed/00_dev_baseline.sql. The first
 * auth.users insert there becomes the admin — see CLAUDE.md.
 */
export const ADMIN = { email: "admin@ecke.test", password: "devpassword" };
export const EMPLOYEE = { email: "employee@ecke.test", password: "devpassword" };

/**
 * Every form control is a Stencil custom element rendering a real
 * <input>/<button> in its own shadow DOM. Playwright's selectors pierce
 * shadow DOM, so targeting the *inner* native element is both reliable and
 * immune to CLAUDE.md's "@Prop()s aren't reflected, so attribute selectors
 * match nothing" trap — `ecke-input[type="email"]` would match nothing.
 */
export function emailInput(page: Page) {
  return page.locator('ecke-input input[type="email"]');
}

export function passwordInput(page: Page) {
  return page.locator('ecke-input input[type="password"]');
}

export async function login(page: Page, who = ADMIN) {
  await page.goto("/login");
  await emailInput(page).fill(who.email);
  await passwordInput(page).fill(who.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  // Must be "not /login", not a negative-lookahead on any "/": a pattern
  // like /\/(?!login)/ matches the "//" in "http://localhost:4173/login"
  // and so passes *on the login page*, letting the caller navigate away
  // mid-sign-in and silently lose the session.
  await expect(page).not.toHaveURL(/\/login$/);
}
