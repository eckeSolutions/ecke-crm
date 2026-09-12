import { useEffect, type RefObject } from "react";

/**
 * INTERIM — remove when design-system issue #5 lands (eckeSolutions/ecke.Solutions-Design-System#5).
 *
 * `ecke-sidebar-nav`'s footer renders a log-out glyph as a bare `<svg>`
 * with no button, no event and no slot, so it *looks* actionable and does
 * nothing. Until the component emits its own `eckeLogout`, this listens on
 * the host and matches that glyph in `composedPath()` — the same technique
 * `useShellNavClick` already uses for the nav's shadow-DOM `<a href>`s, and
 * for the same reason: a real `addEventListener`, never a JSX `onClick`,
 * for an event that crosses a shadow boundary.
 *
 * This deliberately reaches at a shadow-internal element, which CLAUDE.md
 * otherwise forbids; it is scoped to one selector, documented here, and
 * retires with the design-system fix. The alternative — a second, floating
 * log-out button next to a decorative one — is the duplication this
 * replaces.
 */
export function useSidebarLogoutClick(ref: RefObject<HTMLElement | null>, signOut: () => void) {
  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const hit = event
        .composedPath()
        .some((node) => node instanceof Element && node.classList.contains("sidebar-nav__logout"));
      if (!hit) return;
      event.preventDefault();
      signOut();
    };

    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [ref, signOut]);
}
