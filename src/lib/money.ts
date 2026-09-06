/**
 * §19 UStG (Kleinunternehmer): every amount in this app is VAT-free — there
 * is no tax rate, no gross/net split, anywhere. This module exists so that
 * fact is named once rather than assumed silently at every call site.
 */

/** The notice §19 UStG requires on every invoice. Never a computed VAT line. */
export const USTG_NOTICE = "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.";

export function sumLineTotals(items: readonly { line_total: number }[]): number {
  return items.reduce((sum, item) => sum + item.line_total, 0);
}

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}
