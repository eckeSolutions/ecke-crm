import { useCallback, useEffect, useState } from "react";

import { clearRunningTimer, elapsedMs as computeElapsedMs, loadRunningTimer, saveRunningTimer, type RunningTimer } from "./stopwatch";

/**
 * Thin React wrapper around stopwatch.ts's pure functions — ticks a
 * `now` every second while a timer is running so consumers don't each
 * run their own `setInterval`, and reads/writes the real `localStorage`.
 * Kept deliberately thin and untested directly (the logic worth testing
 * lives in stopwatch.ts's pure functions), same split as this feature's
 * duration.ts / the rest of the app's hooks.ts files.
 */
export function useStopwatch() {
  const [timer, setTimer] = useState<RunningTimer | null>(() => loadRunningTimer(localStorage));
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const start = useCallback((params: Omit<RunningTimer, "startedAt">) => {
    const next: RunningTimer = { ...params, startedAt: new Date().toISOString() };
    saveRunningTimer(localStorage, next);
    setNow(new Date());
    setTimer(next);
  }, []);

  const discard = useCallback(() => {
    clearRunningTimer(localStorage);
    setTimer(null);
  }, []);

  /**
   * Reads the running timer's data at the moment of stopping — it does
   * NOT clear the stored timer. The caller persists a `time_entries` row
   * from this, then calls `discard()` only once that succeeds, so a
   * failed save leaves the timer running rather than silently losing it
   * (the old app's cubit had the same "only clear on success" shape).
   */
  const stop = useCallback(() => {
    if (!timer) return null;
    return { ...timer, endedAt: new Date() };
  }, [timer]);

  return {
    timer,
    elapsedMs: timer ? computeElapsedMs(timer, now) : 0,
    start,
    discard,
    stop,
  };
}
