/**
 * The six feature areas, in nav order. Shared between `<EckeSidebarNav>`
 * (desktop) and `<EckeBottomNav>` (mobile) — same vocabulary, same icons,
 * per the design system's own `SidebarNavItem`/`BottomNavItem` shapes.
 * `active` is computed per-render from the current route in AppShell, not
 * baked in here.
 */
export interface NavEntry {
  label: string;
  /** IconName from vendor/design-system — settings + wallet added in v0.3.1 for this. */
  icon: "layout-dashboard" | "users" | "clock" | "receipt" | "wallet" | "settings";
  path: string;
  /** Admin-only screens are simply omitted from the list — see useNavEntries(). */
  adminOnly?: boolean;
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  { label: "Übersicht", icon: "layout-dashboard", path: "/" },
  { label: "Kunden", icon: "users", path: "/kunden" },
  { label: "Zeiterfassung", icon: "clock", path: "/zeiterfassung" },
  { label: "Rechnungen", icon: "receipt", path: "/rechnungen" },
  { label: "Finanzen", icon: "wallet", path: "/finanzen" },
  { label: "Einstellungen", icon: "settings", path: "/einstellungen", adminOnly: true },
];

/** True if `pathname` is on `entry`'s path, matching /kunden/:id etc. as "Kunden" active. */
export function isNavEntryActive(entry: NavEntry, pathname: string): boolean {
  if (entry.path === "/") return pathname === "/";
  return pathname === entry.path || pathname.startsWith(`${entry.path}/`);
}
