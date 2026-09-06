import { useEffect, useState } from "react";

/**
 * Installable + online-first (ROADMAP.md's Decisions locked) — there's no
 * offline-write path, so this exists purely to tell the user why an action
 * might be failing, not to unlock any offline capability.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
