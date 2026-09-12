import { EckeBottomNav, EckeCornerGlow, EckeSidebarNav } from "@ds/stencil/react";
import { useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";

import "./AppShell.css";
import { isNavEntryActive, NAV_ENTRIES } from "./nav-items";
import { useSidebarLogoutClick } from "./useSidebarLogoutClick";
import { useShellNavClick } from "./useShellNavClick";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * `<ecke-sidebar-nav>` (desktop) <-> `<ecke-bottom-nav>` (mobile), swapped
 * at 768px — ported from the design system's own `appShellStage()`
 * (stencil/src/stories-utils/stage.ts). Neither nav component owns that
 * breakpoint itself (confirmed: zero @media in either's .scss), so it
 * lives here, in AppShell.css, same as the prototype.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const { profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const bottomNavRef = useRef<HTMLDivElement>(null);
  useShellNavClick(sidebarRef);
  useShellNavClick(bottomNavRef);
  useSidebarLogoutClick(sidebarRef, () => void signOut());

  const visibleEntries = NAV_ENTRIES.filter((entry) => !entry.adminOnly || profile?.role === "admin");
  const items = visibleEntries.map((entry) => ({
    label: entry.label,
    icon: entry.icon,
    href: entry.path,
    active: isNavEntryActive(entry, pathname),
  }));

  // Below 768px there is no sidebar, so its footer log-out glyph is gone
  // too. Rather than float a second button over the content — which reads
  // as a duplicate on desktop and collides with page-header actions —
  // sign-out becomes a trailing bottom-nav item. With six nav entries and
  // maxVisible 4 it lands in the overflow "More" menu, which is where a
  // secondary account action belongs anyway. No `href`: it is an action,
  // so it is driven by eckeNavSelect, not by useShellNavClick's anchor
  // interception.
  const LOGOUT_LABEL = "Abmelden";
  const bottomItems = [...items, { label: LOGOUT_LABEL, icon: "log-out" as const }];

  const displayName = profile?.full_name || profile?.email || "…";
  const user = profile
    ? { name: displayName, role: profile.role === "admin" ? "Admin" : "Mitarbeiter", initials: initials(displayName) }
    : undefined;

  return (
    <div className="app-shell">
      {/* Exactly one per surface — the design system treats the dot-glow as
          a singular brand decoration, not a repeatable pattern. */}
      <EckeCornerGlow />
      <div className="app-shell__sidebar" ref={sidebarRef}>
        <EckeSidebarNav
          items={items}
          user={user}
          collapsed={collapsed}
          onEckeCollapse={(e) => setCollapsed(e.detail)}
        />
      </div>

      {/* A real <main> landmark, not a div: Lighthouse's landmark-one-main
          audit failed without one, and it is the region screen-reader users
          jump to. Styling is unaffected — the CSS targets the class. */}
      <main className="app-shell__main">
        <Outlet />
      </main>

      <div className="app-shell__bottom" ref={bottomNavRef}>
        <EckeBottomNav
          items={bottomItems}
          onEckeNavSelect={(e) => {
            if (e.detail.item.label === LOGOUT_LABEL) void signOut();
          }}
        />
      </div>
    </div>
  );
}
