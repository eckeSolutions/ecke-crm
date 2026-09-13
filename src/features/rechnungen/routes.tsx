import { Route } from "react-router-dom";

import { InvoiceEditorScreen } from "./components/InvoiceEditorScreen";
import { InvoiceListScreen } from "./components/InvoiceListScreen";

export const rechnungenRoutes = (
  <Route path="rechnungen">
    <Route index element={<InvoiceListScreen />} />
    {/* Cross-screen handoff from Zeiterfassung arrives as query params —
        /rechnungen/neu?client=<id>&entries=<ids> — read by
        InvoiceEditorScreen via useSearchParams, not router state. */}
    <Route path="neu" element={<InvoiceEditorScreen />} />
    <Route path=":id" element={<InvoiceEditorScreen />} />
  </Route>
);
