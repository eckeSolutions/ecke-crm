import { Route, Routes } from "react-router-dom";

import { LoginPage } from "@/auth/LoginPage";
import { RequireAuth } from "@/auth/RequireAuth";
import { dashboardRoutes } from "@/features/dashboard/routes";
import { einstellungenRoutes } from "@/features/einstellungen/routes";
import { finanzenRoutes } from "@/features/finanzen/routes";
import { kundenRoutes } from "@/features/kunden/routes";
import { rechnungenRoutes } from "@/features/rechnungen/routes";
import { zeiterfassungRoutes } from "@/features/zeiterfassung/routes";
import { AppShell } from "@/shell/AppShell";
import { OfflineBanner } from "@/shell/OfflineBanner";

/**
 * Router > AuthProvider (see main.tsx) > this. Never a feature's route
 * definitions live here directly — each feature owns its own routes.tsx
 * and this file only spreads them, per the plan's extensibility contract
 * (Part C, "Project structure").
 */
export function App() {
  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          {dashboardRoutes}
          {kundenRoutes}
          {zeiterfassungRoutes}
          {rechnungenRoutes}
          {finanzenRoutes}
          {einstellungenRoutes}
        </Route>
      </Routes>
    </>
  );
}
