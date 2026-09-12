import { EckeButton, EckeNotification } from "@ds/stencil/react";

import { useInstallPrompt } from "./useInstallPrompt";

/**
 * Rendered once above the router, next to OfflineBanner — an install offer
 * shouldn't vanish because the user navigated mid-decision.
 */
export function InstallPrompt() {
  const { canInstall, install, dismiss } = useInstallPrompt();
  if (!canInstall) return null;

  return (
    <EckeNotification tone="info" dismissible onEckeDismiss={dismiss}>
      <span className="install-prompt">
        ecke CRM als App installieren?
        <EckeButton surface="glass" type="button" emphasis="secondary" onClick={() => void install()}>
          Installieren
        </EckeButton>
      </span>
    </EckeNotification>
  );
}
