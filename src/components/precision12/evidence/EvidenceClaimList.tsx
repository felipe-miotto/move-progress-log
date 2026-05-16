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
        {claims.map((claim) => (
          <EvidenceClaimCard
            // Tripleta (domain, metric, classification) é única no catálogo
            // (verificado por unit tests do EVIDENCE_CATALOG em E5.1/E5.2);
            // a key permanece estável mesmo se a lista for filtrada ou
            // reordenada em superfícies futuras (Coach Console / drawer).
            // E5.6a / M-6: `deriveEvidenceGroups` deduplica claims dentro
            // do mesmo grupo, então essa key não colide aqui mesmo quando
            // duas responses do mesmo aluno gerariam a mesma claim. Se um
            // novo caller passar claims já contendo duplicatas, a key vai
            // colidir e o React vai emitir warning — sinal pra dedup
            // upstream, não pra trocar a key.
            key={`${claim.domain}-${claim.metric}-${claim.classification}`}
            claim={claim}
            showPrinciples={showPrinciples}
          />
        ))}
      </div>
    </section>
  );
}
