import { EckeButton } from "@ds/stencil/react";
import { useEffect, useRef, type ComponentProps, type ComponentRef, type FormEvent, type ReactNode } from "react";

/**
 * Why this exists — a shadow-DOM limitation, confirmed live (Playwright,
 * against a production build):
 *
 *   `ecke-button` is `shadow: true` and renders a plain
 *   `<button type="submit">` inside its own shadow root. The HTML
 *   form-owner algorithm does not cross a shadow boundary, so that
 *   button's `.form` is `null` and clicking it fires **no** submit event
 *   on the light-DOM `<form>` around it. It is not a form-associated
 *   custom element either (`formAssociated !== true`), so nothing bridges
 *   it. The same applies to implicit submission: pressing Enter inside
 *   `ecke-input` cannot submit a form the input doesn't own either.
 *
 * So `<form onSubmit={...}><EckeButton type="submit">` — the shape every
 * form in this app started with — silently does nothing. `Form` +
 * `SubmitButton` restore both paths explicitly.
 *
 * The durable fix belongs in the design system (make `ecke-button` a
 * form-associated custom element via ElementInternals, so `type="submit"`
 * behaves natively); this is the app-side bridge until that lands. See
 * ROADMAP.md's Phase 4 entry.
 */

/** Finds the `<form>` a control lives in, crossing out of any shadow root. */
function ownerForm(el: HTMLElement | null): HTMLFormElement | null {
  return el?.closest("form") ?? null;
}

export function SubmitButton({
  children,
  ...props
}: Omit<ComponentProps<typeof EckeButton>, "type" | "onClick"> & { children: ReactNode }) {
  const ref = useRef<ComponentRef<typeof EckeButton>>(null);

  return (
    <EckeButton
      {...props}
      ref={ref}
      // `type="button"`, deliberately: the inner native button's own
      // `submit` type is inert across the shadow boundary, and leaving it
      // set would only suggest otherwise.
      type="button"
      onClick={() => {
        // requestSubmit() rather than calling the react-hook-form handler
        // directly, so the form's own `onSubmit` stays the single entry
        // point and validation/`isSubmitting` behave exactly as they
        // would with a native button.
        // The wrapper types this ref as the Stencil component class; at
        // runtime it is the `<ecke-button>` custom element itself.
        ownerForm(ref.current as unknown as HTMLElement | null)?.requestSubmit();
      }}
    >
      {children}
    </EckeButton>
  );
}

export function Form({
  onSubmit,
  children,
  ...props
}: Omit<ComponentProps<"form">, "onSubmit" | "noValidate"> & {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = ref.current;
    if (!form) return;

    // A real addEventListener via a ref, not a JSX onKeyDown — the same
    // rule CLAUDE.md records for nav clicks: this event originates inside
    // a component's shadow root, and React's root-delegated synthetic
    // dispatch is not something to rely on for composed events here.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.isComposing) return;

      // Enter inside a multi-line control inserts a newline — never submits.
      const path = event.composedPath();
      if (path.some((node) => node instanceof HTMLElement && node.tagName === "ECKE-TEXTAREA")) return;
      if (path.some((node) => node instanceof HTMLTextAreaElement)) return;

      form.requestSubmit();
    };

    form.addEventListener("keydown", onKeyDown);
    return () => form.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <form {...props} ref={ref} onSubmit={onSubmit} noValidate>
      {children}
    </form>
  );
}
