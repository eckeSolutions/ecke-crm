import { Route } from "react-router-dom";

import { RequireAdmin } from "@/auth/RequireAuth";

import { SettingsScreen } from "./components/SettingsScreen";

export const settingsRoutes = (
  <Route
    path="settings"
    element={
      <RequireAdmin>
        <SettingsScreen />
      </RequireAdmin>
    }
  />
);
