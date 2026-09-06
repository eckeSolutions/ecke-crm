import { useEffect, type RefObject } from "react";
import { useNavigate } from "react-router-dom";

/**
 * `<ecke-sidebar-nav>` / `<ecke-bottom-nav>` render real `<a href>` tags
 * inside their own shadow roots (see their .tsx source — this is
 * deliberate, a working link even before any JS framework attaches). For
 * an SPA that has to become a `navigate()` call instead of a full page
 * load, without the nav components knowing anything about React Router.
 *
 * A plain JSX `onClick` on the wrapping element does NOT work here —
 * confirmed live (6 Sep 2026): React delegates a single listener at the
 * root container and replays it via the *React fiber tree*, and for a
 * composed click whose real target lives inside a Web Component's shadow
 * root, `event.preventDefault()` inside that replayed handler sets
 * `defaultPrevented` on the native event (verified true in both places)
 * yet the browser still followed the link — same DOM, same composedPath,
 * only the *attachment method* differed from a working control test. A
 * real `addEventListener` via a ref sidesteps whatever that replay does
 * differently and reliably prevents it, so that's what this hook sets up.
 *
 * Click events cross a shadow boundary via `composedPath()`, which still
 * lists the shadow-internal `<a>` — so one delegated listener on the
 * wrapping element, not a per-item handler, catches every nav click. Left
 * alone: modifier-key clicks (open in new tab), non-left clicks, and an
 * explicit `target="_blank"`/external href, exactly like a plain <a>.
 */
export function useShellNavClick(ref: RefObject<HTMLElement | null>): void {
  const navigate = useNavigate();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event
        .composedPath()
        .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href === "#" || anchor.target === "_blank" || /^[a-z]+:/i.test(href)) return;

      event.preventDefault();
      // Route transitions via the View Transitions API (ROADMAP.md's App
      // shell decision) — React Router's `viewTransition` navigate option
      // wraps the update in `document.startViewTransition` correctly
      // (flushSync'd internally), unlike hand-wrapping `navigate()` in one
      // ourselves. No-ops safely in a browser without View Transitions
      // support.
      navigate(href, { viewTransition: true });
    };

    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [ref, navigate]);
}
