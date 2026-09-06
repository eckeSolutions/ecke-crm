import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "Installable + online-first" (ROADMAP.md's Decisions locked): the
      // service worker precaches the app shell + design-system assets for
      // fast/offline *loading*, but there is no sync engine and no offline
      // writes — Supabase GETs below are NetworkFirst (read resilience,
      // never stale-serve a mutation), and every write still requires a
      // live connection.
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "ecke.Solutions CRM",
        short_name: "ecke CRM",
        description: "Kunden, Zeiterfassung, Rechnungen, Finanzen — ecke.Solutions",
        lang: "de",
        // --bg-page from vendor/design-system/tokens/colors.css — the shell
        // renders on this before any component CSS paints, so the browser
        // chrome/splash screen matches instead of flashing white.
        theme_color: "#061b2b",
        background_color: "#061b2b",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the built app shell + design-system CSS/JS (whatever
        // Vite emits into dist/) — the manifest icons are handled by
        // includeAssets/manifest.icons above, not globbed twice.
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        runtimeCaching: [
          {
            // Supabase PostgREST reads only — never cache a write, and
            // never treat a stale cached GET as authoritative over a
            // reachable network (NetworkFirst tries the network first,
            // only falling back to the cache when offline).
            urlPattern: ({ url, request }: { url: URL; request: Request }) =>
              request.method === "GET" && url.pathname.includes("/rest/v1/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-rest-get",
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    // vendor/design-system/stencil/react has its own, separate node_modules
    // (its own `npm ci`, no workspace link to this one) — react/react-dom
    // there resolve to a different copy of the same version than ours,
    // which breaks every hook the wrapper components call ("Invalid hook
    // call" / "Cannot read properties of null (reading 'useRef')",
    // confirmed live 6 Sep 2026). dedupe forces both resolutions onto this
    // project's single copy.
    dedupe: ["react", "react-dom"],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The design-system submodule, built in place (see package.json's
      // "setup"/"postinstall") — not an npm dependency, so it's an alias
      // onto the checked-out path, not a node_modules resolution.
      "@ds": fileURLToPath(new URL("./vendor/design-system", import.meta.url)),
    },
  },
});
