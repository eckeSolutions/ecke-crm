import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // supabase/functions/** are Deno Edge Functions — a different runtime
    // (Deno globals, npm:/jsr: specifiers, no browser DOM) with their own
    // linter (`deno lint`), not this app's. infrastructure/ and scripts/
    // aren't part of the Vite project either. Scoped here rather than left
    // to `eslint .` sweeping in code this config's browser/React rules
    // don't actually apply to.
    ignores: ["dist", "dev-dist", "vendor", "supabase", "infrastructure", "scripts"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      // eslint-plugin-react-hooks@7's own "recommended-latest" export still
      // uses the legacy eslintrc `plugins: ["react-hooks"]` shape, which
      // ESLint 10's flat config rejects outright ("plugins" key defined as
      // an array of strings") — registering the plugin object here and
      // spreading just its `rules` below works around that.
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
);
