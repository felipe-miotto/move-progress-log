/**
 * E5.5 — Preview read-only de evidências clínico-operacionais por aluno
 * no Coach Console Precision 12.
 *
 * Consome dados JÁ carregados pelo `usePrecision12CoachConsole` (E4.1) e
 * roda os derivadores E5.3 sem nova query. Renderiza cada conjunto de
 * claims dentro do componente burro `EvidenceClaimList` (E5.4),
 * agrupado por ALUNO (com nome legível, não UUID técnico).
 *
 * Cobertura atual (E5.5):
 *   - PAR-Q (a partir de questionnaire_responses.parq_blocked)
 *   - Sono/Estresse/Energia/Adesão (a partir das colunas da response)
 *
 * Cobertura PENDENTE (ver LIMITATIONS_NOT_COVERED_YET):
 *   - VO₂, FC recovery, Handgrip, Sit-to-Stand, DEXA
 *   Esses domínios precisam fetch adicional + lookups de ref_ranges.
 *   Próximo PR pode estender o hook E4.1 e adicionar mappers em
 *   `precision12EvidenceMapping.ts`.
 *
 * Read-only absoluto: sem hook próprio, sem fetch, sem mutation, sem
 * abertura automática de janela. Componente "burro".
 */

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  CoachConsoleAssessment,
  CoachConsoleQuestionnaire,
  CoachConsoleStudent,
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
  /** Repassa pra cada card (default: false). */
  showPrinciples?: boolean;
}

export function Precision12EvidencePreview({
  students,
  assessments,
  responses,
  showPrinciples = false,
}: Precision12EvidencePreviewProps) {
  const groups = useMemo(
    () => deriveEvidenceGroups({ students, assessments, responses }),
    [students, assessments, responses],
  );

  const totalClaims = groups.reduce((sum, g) => sum + g.claims.length, 0);

  return (
    <Card
      className="border"
      data-testid="precision12-evidence-preview"
      aria-labelledby="p12-evidence-preview-heading"
    >
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle
            id="p12-evidence-preview-heading"
            className="text-sm uppercase tracking-wide text-muted-foreground"
          >
            Evidência clínica-operacional · Preview
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {totalClaims} claim{totalClaims === 1 ? "" : "s"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Texto associativo, não diagnóstico. Cobertura atual:{" "}
          <strong>PAR-Q + Sono/Estresse/Energia/Adesão</strong>. Demais domínios
          ficam pendentes de dados (ver lista abaixo).
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
