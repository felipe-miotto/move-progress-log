/**
 * E5.4 — Lista read-only de EvidenceClaims.
 *
 * Componente "burro": recebe `claims` e renderiza N `EvidenceClaimCard`.
 * Sem hook, sem fetch, sem mutation. Quando a lista está vazia, mostra
 * microcopy neutra alinhada ao tom do Evidence Layer (sem alarmismo,
 * sem promessa).
 */

import type { EvidenceClaim } from "@/utils/precision12Evidence";

import { EvidenceClaimCard } from "./EvidenceClaimCard";

interface EvidenceClaimListProps {
  claims: readonly EvidenceClaim[];
  /** Repassa pra cada card. Default: false. */
  showPrinciples?: boolean;
  /** Heading opcional acima da lista. */
  title?: string;
}

const EMPTY_MICROCOPY =
  "Nenhuma evidência clínica-operacional disponível para os dados atuais.";

export function EvidenceClaimList({
  claims,
  showPrinciples = false,
  title,
}: EvidenceClaimListProps) {
  if (claims.length === 0) {
    return (
      <div
        className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground text-center"
        role="status"
        aria-live="polite"
        data-testid="evidence-claim-list-empty"
      >
        {EMPTY_MICROCOPY}
      </div>
    );
  }

  return (
    <section
      aria-label={title ?? "Evidências clínicas-operacionais"}
      data-testid="evidence-claim-list"
      className="space-y-3"
    >
      {title && (
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      )}
      <div className="grid gap-3">
        {claims.map((claim, index) => (
          <EvidenceClaimCard
            // Catálogo pode ter múltiplas claims do mesmo domain/metric
            // (DEXA com múltiplos marcadores); o index assegura key estável
            // dentro da mesma lista renderizada.
            key={`${claim.domain}-${claim.metric}-${claim.classification}-${index}`}
            claim={claim}
            showPrinciples={showPrinciples}
          />
        ))}
      </div>
    </section>
  );
}
