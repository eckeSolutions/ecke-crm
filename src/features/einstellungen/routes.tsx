import { Route } from "react-router-dom";

import { RequireAdmin } from "@/auth/RequireAuth";
import { PlaceholderScreen } from "@/shell/PlaceholderScreen";

export const einstellungenRoutes = (
  <Route
    path="einstellungen"
    element={
      <RequireAdmin>
        <PlaceholderScreen title="Einstellungen" subtitle="Firmenprofil, JMAP, MFA" />
      </RequireAdmin>
    }
  />
);
