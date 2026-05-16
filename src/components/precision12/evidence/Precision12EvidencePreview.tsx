/**
 * E5.5 — Preview read-only de evidências clínico-operacionais por aluno
 * no Coach Console Precision 12.
 *
 * Consome dados JÁ carregados pelo `usePrecision12CoachConsole` (E4.1) e
 * roda os derivadores E5.3 sem nova query. Renderiza cada conjunto de
 * claims dentro do componente burro `EvidenceClaimList` (E5.4),
 * agrupado por ALUNO (com nome legível, não UUID técnico).
 *
 * Cobertura atual (E5.5/E5.5b):
 *   - VO₂ e FC recovery (a partir de vo2_assessment_details)
 *   - Handgrip (a partir de handgrip_results)
 *   - Sit-to-Stand (a partir de sit_to_stand_results)
 *   - PAR-Q (a partir de questionnaire_responses.parq_blocked)
 *   - Sono/Estresse/Energia/Adesão (a partir das colunas da response)
 *
 * Cobertura PENDENTE (ver LIMITATIONS_NOT_COVERED_YET):
 *   - DEXA
 *   DEXA precisa cortes por sexo/idade antes de emitir claims.
 *
 * Read-only absoluto: sem hook próprio, sem fetch, sem mutation, sem
 * abertura automática de janela. Componente "burro".
 */

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type {
  CoachConsoleAssessment,
  CoachConsoleHandgripResult,
  CoachConsoleQuestionnaire,
  CoachConsoleSitToStandResult,
  CoachConsoleStudent,
  CoachConsoleVo2Result,
} from "@/utils/precision12CoachConsole";
import {
  LIMITATIONS_NOT_COVERED_YET,
  QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET,
  deriveEvidenceGroups,
} from "@/utils/precision12EvidenceMapping";

import { EvidenceClaimList } from "./EvidenceClaimList";

interface Precision12EvidencePreviewProps {
  /** Mesmos `students` carregados pelo hook E4.1. */
  students: readonly CoachConsoleStudent[];
  /**
   * Mesmas `assessments` carregadas pelo hook E4.1. Usado pra cruzar
   * `response.assessment_id` → `assessment.student_id` → `student.name`,
   * de modo que cada grupo na preview mostre nome do aluno e não UUID.
   */
  assessments: readonly CoachConsoleAssessment[];
  /** Mesmas `responses` carregadas pelo hook E4.1. */
  responses: readonly CoachConsoleQuestionnaire[];
  /** Resultados VO₂ já classificados, carregados pelo hook do console. */
  vo2Results: readonly CoachConsoleVo2Result[];
  /** Resultados handgrip já classificados, carregados pelo hook do console. */
  handgripResults: readonly CoachConsoleHandgripResult[];
  /** Resultados sit-to-stand já classificados, carregados pelo hook do console. */
  sitToStandResults: readonly CoachConsoleSitToStandResult[];
  /** Repassa pra cada card (default: false). */
  showPrinciples?: boolean;
}

export function Precision12EvidencePreview({
  students,
  assessments,
  responses,
  vo2Results,
  handgripResults,
  sitToStandResults,
  showPrinciples = false,
}: Precision12EvidencePreviewProps) {
  const groups = useMemo(
    () =>
      deriveEvidenceGroups({
        students,
        assessments,
        responses,
        vo2Results,
        handgripResults,
        sitToStandResults,
      }),
    [
      students,
      assessments,
      responses,
      vo2Results,
      handgripResults,
      sitToStandResults,
    ],
  );

  const totalClaims = groups.reduce((sum, g) => sum + g.claims.length, 0);

  return (
    <Card
      className="border"
      data-testid="precision12-evidence-preview"
      aria-labelledby="precision12-evidence-preview-heading"
    >
      {/*
        E5.6b / N-5 — este header não usa heading próprio (chassi de Card
        sem CardTitle) pra evitar duplicar o H3 que a seção pai já
        renderiza no Console. O Card é rotulado por `aria-labelledby`
        apontando ao H3 da seção (id="precision12-evidence-preview-heading"
        definido no Precision12Console). Mantém o badge de contagem e a
        microcopy.
        E5.6c — adicionada uma âncora visual discreta ("Triagem
        operacional") à esquerda do badge pra equilibrar o header. NÃO é
        um heading semântico (é <span>); o rotulamento acessível continua
        sendo o aria-labelledby acima.
      */}
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Triagem operacional
          </span>
          <Badge variant="outline" className="text-[10px]">
            {totalClaims} claim{totalClaims === 1 ? "" : "s"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Texto associativo, não diagnóstico. Cobertura atual:{" "}
          <strong>
            VO₂/FC + Handgrip + Sit-to-Stand + PAR-Q + Sono/Estresse/Energia/Adesão
          </strong>
          . DEXA fica pendente de cortes por sexo/idade (ver lista abaixo).
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {groups.length === 0 ? (
          <EvidenceClaimList claims={[]} showPrinciples={showPrinciples} />
        ) : (
          groups.map((group) => (
            <section
              key={group.studentId}
              aria-label={`Evidências de ${group.studentName}`}
              className="space-y-2"
              data-testid="evidence-student-group"
              data-student-id={group.studentId}
            >
              <p className="text-sm font-medium">
                Aluno:{" "}
                <span className="font-semibold" data-testid="evidence-student-name">
                  {group.studentName}
                </span>
              </p>
              <EvidenceClaimList
                claims={group.claims}
                showPrinciples={showPrinciples}
              />
            </section>
          ))
        )}

        <details
          className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground"
          data-testid="evidence-preview-limitations"
        >
          <summary className="cursor-pointer font-semibold">
            Limitações conhecidas ({LIMITATIONS_NOT_COVERED_YET.length} domínios
            + {QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET.length} campos do questionário
            ainda não cobertos)
          </summary>
          <div className="mt-2 space-y-3">
            <div>
              <p className="font-semibold uppercase tracking-wide text-[10px]">
                Domínios sem dados ou ref ranges
              </p>
              <ul
                className="mt-1 space-y-1"
                data-testid="evidence-preview-limitations-domains"
              >
                {LIMITATIONS_NOT_COVERED_YET.map((item) => (
                  <li key={item.domain}>
                    <span className="font-mono">{item.domain}</span> —{" "}
                    {item.reason}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold uppercase tracking-wide text-[10px]">
                Campos do questionário sem claim individual
              </p>
              <ul
                className="mt-1 space-y-1"
                data-testid="evidence-preview-limitations-fields"
              >
                {QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET.map((item) => (
                  <li key={item.field}>
                    <span className="font-mono">{item.field}</span> —{" "}
                    {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
