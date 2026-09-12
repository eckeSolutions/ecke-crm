import { defineConfig, devices } from "@playwright/test";

// Phase 4's e2e target is the *built* artifact served by `vite preview`,
// not the dev server — production is a static `dist/` behind Caddy (see
// Dockerfile/Caddyfile), and the dev server's built-in SPA fallback and
// unbundled modules hide exactly the class of bug that deploy step can
// introduce. Point E2E_BASE_URL at a deployed URL to run the same specs
// against staging instead.
// `localhost`, not `127.0.0.1`: `vite preview` binds to the hostname
// "localhost", which on a dual-stack Windows box resolves to ::1 only —
// polling 127.0.0.1 then never connects and Playwright times out waiting
// for a server that is in fact already up.
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:4173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Dark-only brand contract — no light mode exists to test.
    colorScheme: "dark",
    locale: "de-DE",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Serve only — `npm run test:e2e` builds first. Chaining the
        // build in here instead makes Playwright's readiness timeout
        // cover a cold `tsc -b && vite build` too, which is what made
        // this time out the first time it ran.
        command: "npx vite preview --port 4173 --strictPort",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
