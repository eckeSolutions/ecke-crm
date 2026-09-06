import { Route } from "react-router-dom";

import { PlaceholderScreen } from "@/shell/PlaceholderScreen";

export const zeiterfassungRoutes = (
  <Route path="zeiterfassung" element={<PlaceholderScreen title="Zeiterfassung" subtitle="Stoppuhr & Einträge" />} />
);
