import { Route } from "react-router-dom";

import { PlaceholderScreen } from "@/shell/PlaceholderScreen";

export const dashboardRoutes = (
  <Route index element={<PlaceholderScreen title="Übersicht" subtitle="Dashboard" />} />
);
