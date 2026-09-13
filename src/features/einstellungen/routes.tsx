import { Route } from "react-router-dom";

import { RequireAdmin } from "@/auth/RequireAuth";

import { EinstellungenScreen } from "./components/EinstellungenScreen";

export const einstellungenRoutes = (
  <Route
    path="einstellungen"
    element={
      <RequireAdmin>
        <EinstellungenScreen />
      </RequireAdmin>
    }
  />
);
