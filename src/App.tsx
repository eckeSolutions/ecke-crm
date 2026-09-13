import { Route, Routes } from "react-router-dom";

import { LoginPage } from "@/auth/LoginPage";
import { RequireAuth } from "@/auth/RequireAuth";
import { clientsRoutes } from "@/features/clients/routes";
import { dashboardRoutes } from "@/features/dashboard/routes";
import { financeRoutes } from "@/features/finance/routes";
import { invoicesRoutes } from "@/features/invoices/routes";
import { settingsRoutes } from "@/features/settings/routes";
import { timeTrackingRoutes } from "@/features/time-tracking/routes";
import { AppShell } from "@/shell/AppShell";
import { InstallPrompt } from "@/shell/InstallPrompt";
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
      <InstallPrompt />
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
          {clientsRoutes}
          {timeTrackingRoutes}
          {invoicesRoutes}
          {financeRoutes}
          {settingsRoutes}
        </Route>
      </Routes>
    </>
  );
}
