import { useCallback, useEffect, useState } from "react";

/**
 * `beforeinstallprompt` is not in TypeScript's DOM lib (it's a
 * Chromium-only extension, not a W3C standard), so it's declared here
 * rather than cast away at the call site.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISSED_KEY = "ecke-crm:install-dismissed";

function alreadyInstalled(): boolean {
  // `standalone` is Safari/iOS's own non-standard flag; the media query
  // covers Chromium and installed-PWA Firefox.
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Phase 4's "install prompt": the browser fires `beforeinstallprompt` when
 * the app meets the installability criteria (manifest + service worker +
 * HTTPS). Calling `preventDefault()` on it suppresses Chromium's own
 * mini-infobar and hands us the event to re-fire later from a real user
 * gesture — the event is single-use, so it's dropped once `prompt()` has
 * resolved.
 *
 * Deliberately NOT wired to any offline capability: ROADMAP.md's Offline
 * row is installable + online-first, no sync engine and no offline writes.
 * Installing buys a standalone window and a precached shell, nothing more.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // Private mode / blocked storage — just show the prompt.
      return false;
    }
  });

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // Single-use: the browser will fire a fresh event if the user declines
    // and later becomes eligible again.
    setDeferred(null);
  }, [deferred]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Non-fatal: the prompt just reappears next session.
    }
  }, []);

  return {
    canInstall: deferred !== null && !dismissed && !alreadyInstalled(),
    install,
    dismiss,
  };
}
