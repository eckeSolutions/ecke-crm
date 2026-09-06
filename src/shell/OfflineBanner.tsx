import { EckeNotification } from "@ds/stencil/react";

import { useOnlineStatus } from "./useOnlineStatus";

/**
 * Installable + online-first, no offline writes (ROADMAP.md's Decisions
 * locked) — this is the whole offline story: tell the user, don't pretend
 * to keep working. Rendered once, above the router, so it survives a
 * route change or a bounce to /login.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <EckeNotification tone="warning">
      Kein Internetzugang — Änderungen sind gerade nicht möglich.
    </EckeNotification>
  );
}
