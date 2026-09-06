import { Route } from "react-router-dom";

import { PlaceholderScreen } from "@/shell/PlaceholderScreen";

export const rechnungenRoutes = (
  <Route path="rechnungen">
    <Route index element={<PlaceholderScreen title="Rechnungen" />} />
    {/* Cross-screen handoff from Zeiterfassung arrives as query params —
        /rechnungen/neu?client=<id>&entries=<ids> (plan's Part C) — read
        them here once the real editor lands, not via router state. */}
    <Route path="neu" element={<PlaceholderScreen title="Neue Rechnung" />} />
    <Route path=":id" element={<PlaceholderScreen title="Rechnung" />} />
  </Route>
);
