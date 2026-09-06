import { EckeCard, EckePageHeader } from "@ds/stencil/react";

/**
 * Phase 2's routes exist so every nav target is real and deep-linkable
 * before Phase 3 ports the actual feature (ROADMAP.md's Phase 2
 * "Done when"). Replace with the real screen as each feature lands.
 */
export function PlaceholderScreen({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <EckePageHeader pageTitle={title} subtitle={subtitle} />
      <EckeCard surface="solid">
        <p>Diese Ansicht folgt in Phase 3.</p>
      </EckeCard>
    </>
  );
}
