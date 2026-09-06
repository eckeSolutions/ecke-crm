import { Route } from "react-router-dom";

import { PlaceholderScreen } from "@/shell/PlaceholderScreen";

export const kundenRoutes = (
  <Route path="kunden">
    <Route index element={<PlaceholderScreen title="Kunden" />} />
    <Route path="neu" element={<PlaceholderScreen title="Neuer Kunde" />} />
    {/* Contacts have no UI in the old app at all — new surface, tracked in
        ROADMAP.md's Phase 3. Lives under the client detail route, not its
        own top-level path. */}
    <Route path=":id" element={<PlaceholderScreen title="Kundendetails" />} />
    <Route path=":id/bearbeiten" element={<PlaceholderScreen title="Kunde bearbeiten" />} />
  </Route>
);
