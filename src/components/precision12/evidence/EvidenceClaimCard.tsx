/**
 * E5.4 — Card read-only de uma EvidenceClaim do Precision 12.
 *
 * Renderiza o conteúdo já validado pelo catálogo (E5.1/E5.2) sem invenção
 * de texto. Sem ações mutáveis, sem chamadas a backend, sem storage, sem
 * abertura automática de janelas. Apenas exibe o que o caller passou.
 *
 * Tom visual é modulado por `riskLanguageLevel`:
 *   • reassuring     — borda/badge "Favorável" em verde sóbrio
 *   • informational  — neutro
 *   • watchful       — "Atenção" em âmbar
 *   • actionable     — "Próximo passo" em vermelho-pálido (NUNCA emergência)
 *
 * Acessibilidade:
 *   • Cada seção tem heading semântico oculto pra screen reader.
 *   • Links de fontes abrem em nova aba com `rel="noopener noreferrer"`.
 *
 * O card NÃO destaca os 4 princípios na UI principal — eles permanecem no
 * shape do objeto pra debug/teste e podem ser expostos opcionalmente via
 * prop `showPrinciples`.
 */

import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  EVIDENCE_DOMAIN_LABEL,
  EVIDENCE_RISK_LEVEL_LABEL,
  type EvidenceClaim,
  type EvidenceRiskLanguageLevel,
} from "@/utils/precision12Evidence";

interface EvidenceClaimCardProps {
  claim: EvidenceClaim;
  /** Mostra bloco de debug com as 4 flags de princípio. Default: false. */
  showPrinciples?: boolean;
}

const RISK_LEVEL_VARIANT: Record<
  EvidenceRiskLanguageLevel,
  "default" | "secondary" | "destructive" | "outline"
> = {
  reassuring: "secondary",
  informational: "outline",
  watchful: "secondary",
  actionable: "destructive",
};

const RISK_LEVEL_BORDER: Record<EvidenceRiskLanguageLevel, string> = {
  // Cores sóbrias propositadamente — sem alarmismo. `destructive` aqui é
  // visualmente vermelho-pálido (variant shadcn), nunca emergência.
  reassuring: "border-emerald-500/40",
  informational: "border-border",
  watchful: "border-amber-500/40",
  actionable: "border-rose-500/40",
};

export function EvidenceClaimCard({
  claim,
  showPrinciples = false,
}: EvidenceClaimCardProps) {
  const riskLabel = EVIDENCE_RISK_LEVEL_LABEL[claim.riskLanguageLevel];
  const riskVariant = RISK_LEVEL_VARIANT[claim.riskLanguageLevel];
  const borderClass = RISK_LEVEL_BORDER[claim.riskLanguageLevel];

  return (
    <Card
      className={`${borderClass} border`}
      data-testid="evidence-claim-card"
      data-risk-level={claim.riskLanguageLevel}
      data-domain={claim.domain}
    >
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {EVIDENCE_DOMAIN_LABEL[claim.domain]}
            </p>
            <CardTitle className="text-base leading-snug">
              {claim.classification}
            </CardTitle>
          </div>
          <Badge variant={riskVariant} className="shrink-0">
            {riskLabel}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Métrica: <span className="font-mono">{claim.metric}</span>
          {claim.observedValue && (
            <>
              {" · "}
              Valor observado:{" "}
              <span className="font-semibold text-foreground">
                {claim.observedValue}
              </span>
            </>
          )}
        </p>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <section aria-labelledby={`evidence-${claim.metric}-interpretation`}>
          <h4
            id={`evidence-${claim.metric}-interpretation`}
            className="sr-only"
          >
            Interpretação
          </h4>
          <p className="text-sm leading-relaxed">{claim.interpretation}</p>
        </section>

        <section aria-labelledby={`evidence-${claim.metric}-summary`}>
          <h4
            id={`evidence-${claim.metric}-summary`}
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Evidência
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {claim.evidenceSummary}
          </p>
        </section>

        <section aria-labelledby={`evidence-${claim.metric}-action`}>
          <h4
            id={`evidence-${claim.metric}-action`}
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Ação para o coach
          </h4>
          <p className="mt-1 text-sm leading-relaxed">{claim.coachAction}</p>
        </section>

        <Separator />

        <section aria-labelledby={`evidence-${claim.metric}-sources`}>
          <h4
            id={`evidence-${claim.metric}-sources`}
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Fontes
          </h4>
          <ul className="mt-1 space-y-1.5 text-xs">
            {claim.sources.map((source, index) => (
              <li
                key={`${source.url}-${index}`}
                className="leading-relaxed text-muted-foreground"
              >
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground hover:underline"
                >
                  {source.title}
                </a>
                {" — "}
                {source.citation}
                {source.population && (
                  <span className="italic"> · {source.population}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <Alert role="note" aria-label="Aviso clínico">
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="text-sm leading-relaxed">
            <span className="font-semibold">Aviso clínico:</span>{" "}
            {claim.disclaimer}
          </AlertDescription>
        </Alert>

        {showPrinciples && (
          <section
            aria-labelledby={`evidence-${claim.metric}-principles`}
            className="rounded-md border border-dashed border-border p-2"
          >
            <h4
              id={`evidence-${claim.metric}-principles`}
              className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Princípios (debug)
            </h4>
            <ul className="mt-1 grid grid-cols-2 gap-x-3 text-[11px] text-muted-foreground">
              {(
                [
                  ["real_endpoint", claim.principles.real_endpoint],
                  ["is_associative", claim.principles.is_associative],
                  [
                    "modifiability_explicit",
                    claim.principles.modifiability_explicit,
                  ],
                  ["multidimensional", claim.principles.multidimensional],
                ] as const
              ).map(([flag, value]) => (
                <li key={flag}>
                  {value ? "✓" : "✗"} {flag}
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
