/**
 * DE-locale formatting helpers used across the app's feature screens.
 * Ported verbatim from the old Flutter app's
 * `core/presentation/formatters.dart` — hand-rolled rather than
 * `Intl.NumberFormat`/`Intl.DateTimeFormat`, matching the old app's own
 * reasoning (avoids a locale-init step and keeps the exact separator/
 * abbreviation behaviour the old screens shipped with) plus keeping this
 * dependency-free.
 */

/** e.g. `1234.5` -> `"1.234,50 €"`. */
export function formatEuro(amount: number): string {
  const fixed = amount.toFixed(2);
  // toFixed(2) on a finite number always contains exactly one "." — the
  // non-null assertions here are that guarantee, not an unchecked cast.
  const [wholeRaw, decimalPart] = fixed.split(".") as [string, string];
  const wholePart = wholeRaw.replace("-", "");

  let grouped = "";
  for (let i = 0; i < wholePart.length; i++) {
    if (i > 0 && (wholePart.length - i) % 3 === 0) grouped += ".";
    grouped += wholePart[i];
  }

  const sign = amount < 0 ? "-" : "";
  return `${sign}${grouped},${decimalPart} €`;
}

/**
 * e.g. `formatDecimalDe(84.5, 1)` -> `"84,5"`. Use for any non-currency
 * decimal shown to the user (hours, quantities) — currency goes through
 * {@link formatEuro} instead.
 */
export function formatDecimalDe(value: number, decimals = 1): string {
  return value.toFixed(decimals).replace(".", ",");
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

/** e.g. `new Date(2026, 6, 25)` -> `"25.07.2026"`. */
export function formatDateDe(date: Date): string {
  return `${twoDigits(date.getDate())}.${twoDigits(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** e.g. `new Date(2026, 6, 25)` -> `"25.07."`. */
export function formatDateShortDe(date: Date): string {
  return `${twoDigits(date.getDate())}.${twoDigits(date.getMonth() + 1)}.`;
}

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;

/** e.g. `new Date(2026, 6, 1)` -> `"Jul"`. */
export function formatMonthAbbrevDe(date: Date): string {
  // getMonth() is always 0-11 for any real Date — the array always has an
  // entry.
  return MONTH_ABBREVIATIONS[date.getMonth()]!;
}
