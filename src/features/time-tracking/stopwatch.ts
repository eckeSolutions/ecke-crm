/**
 * Pure state for the running stopwatch. There is no "is running" column in
 * `time_entries` (docs/DATABASE_SCHEMA.md) — a running timer is client-only
 * state until `stop()` turns it into a real row — ported from the old
 * app's `TimeTrackingCubit`/`RunningTimer`.
 *
 * Persisted to `localStorage` (ROADMAP.md's "Offline" decision: "Running
 * stopwatch persisted to localStorage") so a reload or an accidental tab
 * close mid-timer doesn't lose it — `startedAt` is a real timestamp, so
 * elapsed time keeps counting correctly across the reload rather than
 * resetting to zero.
 *
 * Takes a `Storage`-shaped parameter rather than importing `localStorage`
 * directly so this stays unit-testable without a DOM (see the accompanying
 * .test.ts) — `useStopwatch.ts` is the thin hook that supplies the real
 * `localStorage` and the ticking interval.
 */

export interface RunningTimer {
  clientId: string;
  clientName: string;
  hourlyRate: number;
  description: string;
  /** ISO 8601 — `Date`s aren't JSON-serializable, so this is the wire format for localStorage too. */
  startedAt: string;
}

const STORAGE_KEY = "ecke-crm:running-timer";

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;
type Remover = Pick<Storage, "removeItem">;

function isRunningTimer(value: unknown): value is RunningTimer {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.clientId === "string" &&
    typeof v.clientName === "string" &&
    typeof v.hourlyRate === "number" &&
    typeof v.description === "string" &&
    typeof v.startedAt === "string" &&
    !Number.isNaN(new Date(v.startedAt).getTime())
  );
}

/** Returns `null` on a missing key, malformed JSON, or a shape that doesn't match — never throws. */
export function loadRunningTimer(storage: Reader): RunningTimer | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRunningTimer(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRunningTimer(storage: Writer, timer: RunningTimer): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(timer));
}

export function clearRunningTimer(storage: Remover): void {
  storage.removeItem(STORAGE_KEY);
}

/** Milliseconds elapsed since `timer` started, floored at 0 (a clock adjustment shouldn't show negative time). */
export function elapsedMs(timer: RunningTimer, now: Date): number {
  return Math.max(0, now.getTime() - new Date(timer.startedAt).getTime());
}

function twoDigits(n: number): string {
  return n.toString().padStart(2, "0");
}

/** e.g. `3_661_000` -> `"01:01:01"`. Unbounded hours (no wrap at 24h) — a forgotten-running timer should read "27:00:00", not silently reset. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${twoDigits(hours)}:${twoDigits(minutes)}:${twoDigits(seconds)}`;
}
