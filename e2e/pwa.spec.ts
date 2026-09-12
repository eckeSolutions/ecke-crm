import { expect, test } from "@playwright/test";

/**
 * Lighthouse 13 **removed the PWA category** — `installable-manifest`,
 * `service-worker`, `maskable-icon`, `splash-screen` and the rest no
 * longer exist as audits, so ROADMAP.md's "Lighthouse PWA audit passes"
 * can't be satisfied by running Lighthouse any more. These checks assert
 * the installability criteria directly instead, which also makes them a
 * regression guard rather than a one-off manual audit.
 */
test.describe("PWA", () => {
  test("the manifest declares everything an install needs", async ({ page, request }) => {
    await page.goto("/login");

    const href = await page.getAttribute('link[rel="manifest"]', "href");
    expect(href).toBeTruthy();

    const res = await request.get(new URL(href!, page.url()).toString());
    expect(res.status()).toBe(200);

    const manifest = await res.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe("standalone");
    // Dark-only brand contract — these must match --bg-page so the splash
    // screen doesn't flash white.
    expect(manifest.theme_color).toBe("#061b2b");
    expect(manifest.background_color).toBe("#061b2b");

    const sizes = (manifest.icons ?? []).map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    // A maskable icon is what stops Android rendering the mark inside a
    // letterboxed white square.
    expect((manifest.icons ?? []).some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);

    for (const icon of manifest.icons as Array<{ src: string }>) {
      const iconRes = await request.get(new URL(icon.src, page.url()).toString());
      expect(iconRes.status(), `icon ${icon.src}`).toBe(200);
    }

    const startRes = await request.get(new URL(manifest.start_url, page.url()).toString());
    expect(startRes.status()).toBe(200);
  });

  test("the service worker registers and takes control", async ({ page }) => {
    await page.goto("/login");

    const scope = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      return reg.scope;
    });
    expect(scope).toContain("/");

    // `serviceWorker.ready` resolves as soon as there *is* an active
    // registration — the worker itself can still be "activating" at that
    // instant, so poll rather than sampling once.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            return reg?.active?.state ?? null;
          }),
        { timeout: 10_000 },
      )
      .toBe("activated");
  });

  test("the app shell is precached, so it loads with the network down", async ({ page, context }) => {
    await page.goto("/login");
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
    });
    // Reload once so the page is actually controlled by the worker.
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);

    await context.setOffline(true);
    await page.reload();

    // The shell renders from the precache; ROADMAP.md's "Offline" row is
    // explicit that only *loading* works offline — there are no offline
    // writes to test.
    await expect(page.getByLabel("E-Mail")).toBeVisible();
    await context.setOffline(false);
  });

  test("the install prompt appears on beforeinstallprompt and can be dismissed", async ({ page }) => {
    await page.goto("/login");

    // Chromium does not fire `beforeinstallprompt` in headless, so the
    // event is synthesised. What's under test is our handling of it —
    // preventDefault, the offer rendering, `prompt()` being called from a
    // user gesture, and the dismissal sticking — not the browser's own
    // installability heuristics, which e2e can't drive anyway.
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt") as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string; platform: string }>;
        promptCalls: number;
      };
      event.promptCalls = 0;
      event.prompt = () => {
        event.promptCalls++;
        return Promise.resolve();
      };
      event.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
      (window as unknown as { _bip: typeof event })._bip = event;
      window.dispatchEvent(event);
    });

    const install = page.getByRole("button", { name: "Installieren" });
    await expect(install).toBeVisible();

    await install.click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { _bip: { promptCalls: number } })._bip.promptCalls))
      .toBe(1);
    await expect(install).toBeHidden();
  });

  test("a dismissed install prompt stays dismissed across a reload", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt") as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string; platform: string }>;
      };
      event.prompt = () => Promise.resolve();
      event.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
      window.dispatchEvent(event);
    });

    await expect(page.getByRole("button", { name: "Installieren" })).toBeVisible();
    // ecke-notification's own dismiss control, wired to onEckeDismiss.
    await page.locator("ecke-notification").first().getByRole("button").first().click();
    await expect(page.getByRole("button", { name: "Installieren" })).toBeHidden();

    expect(await page.evaluate(() => localStorage.getItem("ecke-crm:install-dismissed"))).toBe("1");

    // And it actually survives a reload — the point of persisting it.
    await page.reload();
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt") as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string; platform: string }>;
      };
      event.prompt = () => Promise.resolve();
      event.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
      window.dispatchEvent(event);
    });
    await expect(page.getByRole("button", { name: "Installieren" })).toBeHidden();
  });
});
