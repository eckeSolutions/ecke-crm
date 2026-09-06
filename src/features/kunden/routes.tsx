import { Route } from "react-router-dom";

import { ClientDetailScreen } from "./components/ClientDetailScreen";
import { ClientFormScreen } from "./components/ClientFormScreen";
import { ClientListScreen } from "./components/ClientListScreen";

export const kundenRoutes = (
  <Route path="kunden">
    <Route index element={<ClientListScreen />} />
    <Route path="neu" element={<ClientFormScreen />} />
    {/* Contacts (individual people at a client) have no UI in the old app
        at all — new surface, rendered inside ClientDetailScreen rather than
        its own top-level route (ROADMAP.md's Phase 3 note). */}
    <Route path=":id" element={<ClientDetailScreen />} />
    <Route path=":id/bearbeiten" element={<ClientFormScreen />} />
  </Route>
);
