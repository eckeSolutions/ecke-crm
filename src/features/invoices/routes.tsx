import { Route } from "react-router-dom";

import { InvoiceEditorScreen } from "./components/InvoiceEditorScreen";
import { InvoiceListScreen } from "./components/InvoiceListScreen";

export const invoicesRoutes = (
  <Route path="invoices">
    <Route index element={<InvoiceListScreen />} />
    {/* Cross-screen handoff from time tracking arrives as
        query params — /invoices/new?client=<id>&entries=<ids> — read by
        InvoiceEditorScreen via useSearchParams, not router state. */}
    <Route path="new" element={<InvoiceEditorScreen />} />
    <Route path=":id" element={<InvoiceEditorScreen />} />
  </Route>
);
