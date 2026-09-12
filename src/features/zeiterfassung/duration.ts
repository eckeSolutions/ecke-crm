/**
 * Pure duration math for time entries. Ported from the old app's
 * `TimeTrackingCubit` (`rawMinutes < 1 ? 1 : rawMinutes`) and
 * `TimeEntry.durationHours`.
 *
 * The server's `round_duration_to_15` trigger (docs/DATABASE_SCHEMA.md §5)
 * rounds `duration_minutes` up to the next quarter-hour on INSERT/UPDATE —
 * this module sends it the raw span and lets the trigger do that rounding;
 * duplicating `ceil(x / 15) * 15` here would just be a second place for the
 * two to drift apart.
 */

/** Whole minutes between two instants, floored at 1 — a saved entry can never be zero-length. */
export function computeDurationMinutes(start: Date, end: Date): number {
  const rawMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  return Math.max(1, rawMinutes);
}

/** e.g. `45` minutes -> `0.75` hours. */
export function durationHours(durationMinutes: number): number {
  return durationMinutes / 60;
}
