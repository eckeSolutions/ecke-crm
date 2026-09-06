import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      globals: false,
      css: true,
      // Default include (**/*.test.*) also sweeps in
      // vendor/design-system/stencil/dist/**/*.cmp.test.js — that
      // submodule's OWN compiled test output, meant for its own
      // stencil/vitest.config.ts (real-Chromium browser mode), not this
      // jsdom project. Scope to src/ explicitly instead of trying to
      // exclude every vendor test glob.
      include: ["src/**/*.test.{ts,tsx}"],
    },
  }),
);
