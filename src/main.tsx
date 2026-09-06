import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// Tokens + components/components.css. NOT sufficient on its own for the
// dark-only contract — see the second import below.
import "@ds/styles.css";
// stencil/'s own global stylesheet: `color-scheme: dark` (native <select>
// popups, scrollbars, date pickers, autofill — anything the UA renders
// itself, not something ecke-* components can style) + the pre-hydration
// `:not(:defined)` skeleton for every component. styles.css doesn't
// include this (it only @imports tokens/*.css + components.css) — tracked
// as a design-system gap worth folding into styles.css itself in
// ROADMAP.md, not duplicated by hand here since its skeleton tag list
// would then drift out of sync with the component list.
import "@ds/stencil/src/global/global.css";

import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { queryClient } from "./lib/queryClient";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
