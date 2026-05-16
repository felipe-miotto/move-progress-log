/**
 * E4.2 — Fila de ação read-only do Coach Console Precision 12.
 * E4.4 — Adicionada ação controlada de reissue de link em itens
 *        `questionnaire_pending` (in_progress).
 * E4.5 — Adicionada ação controlada de revogação avulsa de link, condicionada
 *        à existência de link ativo no momento (via prop
 *        `activeLinkAssessmentIds` derivada pelo hook E4.1).
 *
 * Tabela priorizada com os itens derivados pelo hook E4.1. Cada linha tem
 * uma CTA "Abrir" (navegação read-only) e, quando aplicável, ações de
 * "Gerar novo link" (`Precision12ReissueLinkDialog`) e "Revogar"
 * (`Precision12RevokeLinkDialog`). Ambas as ações exigem confirmação
 * explícita e mutam exclusivamente via edge function service-role.
 *
 * Microcopy: triagem operacional, NÃO diagnóstico.
 *
 * E5.6b — UI/UX hardening da auditoria:
 *   F-1 altura de linha estável (sem flex-wrap; coluna comporta os 3 botões
 *       sem quebrar — medições reais: Abrir ~80px + Gerar novo link ~140px +
 *       Revogar ~88px + gaps = ~316px);
 *   F-2 botão "Revogar" diferenciado visualmente como destrutivo com
 *       cores LEGÍVEIS em tema dark (border-rose-500/40 + text-rose-300).
 *       NÃO usa `text-destructive` porque em dark o token é vermelho
 *       escuro (rgb 158,46,46) sobre bg-card (rgb 35,32,31) = contraste
 *       2.22 — falha WCAG AA. rose-300 dá 8.56;
 *   F-3 ordem Abrir → Gerar novo link → Revogar (CTA navegacional primeiro,
 *       reparadora no meio, destrutiva isolada à direita);
 *   N-1 microcopy "Gerar novo link" alinhada com a CTA dentro do dialog
 *       (antes a fila dizia "Reemitir link" e o dialog dizia "Gerar novo
 *       link" — coach confundia).
 *
 * E5.6c — densidade da fila + scroll responsivo:
 *   - coluna Ações afinada para w-[360px] (interno 328px; 316px de botões
 *     deixam ~12px de folga real — calculado com medições do DOM em prod;
 *     valor anterior do E5.6b se mostrou excessivo e comprimia as colunas
 *     vizinhas);
 *   - Status/Data/Idade ganham whitespace-nowrap pra não quebrar "Em
 *     andamento" / "2026-05-13" / "3 dias" em duas linhas — eram a causa
 *     real do row 113px no E5.6b (e não as ações, que já cabiam);
 *   - badge de alerta também recebe whitespace-nowrap (mantém "Questionário
 *     pendente" numa linha só);
 *   - wrapper externo ganha overflow-x-auto pra que viewports < 1280px
 *     façam scroll horizontal em vez de comprimir colunas.
 */

import { useState } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { Ban, ChevronRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ASSESSMENT_TYPE_METADATA } from "@/constants/assessmentProtocols";
import type { AssessmentStatus, AssessmentType } from "@/types/assessment";
import {
  buildPrecision12StudentDeepLink,
  canReissueQuestionnaireLink,
  canRevokeQuestionnaireLink,
  type ActionQueueAlertType,
  type ActionQueueItem,
  type DexaPendingReason,
} from "@/utils/precision12CoachConsole";

import { Precision12ReissueLinkDialog } from "./Precision12ReissueLinkDialog";
import { Precision12RevokeLinkDialog } from "./Precision12RevokeLinkDialog";

interface Precision12ActionQueueProps {
  items: readonly ActionQueueItem[];
  /**
   * E4.5 — `assessment_id`s que têm link ativo (não usado, não revogado,
   * não expirado). Quando vazio/undefined, o botão "Revogar link" não
   * aparece (default: nenhum link ativo).
   */
  activeLinkAssessmentIds?: ReadonlySet<string>;
}

interface ReissueTarget {
  studentId: string;
  studentName: string;
  assessmentId: string;
}

interface RevokeTarget {
  studentId: string;
  studentName: string;
  assessmentId: string;
}

const EMPTY_ACTIVE_LINK_IDS: ReadonlySet<string> = new Set<string>();

const ALERT_LABEL: Record<ActionQueueAlertType, string> = {
  parq_blocked: "PAR-Q bloqueado",
  questionnaire_pending: "Questionário pendente",
  assessment_incomplete: "Avaliação incompleta",
  dexa_pending: "DEXA pendente",
  student_no_assessment: "Sem avaliação no ciclo",
  adherence_risk: "Possível risco de adesão",
};

const ALERT_VARIANT: Record<
  ActionQueueAlertType,
  "default" | "secondary" | "destructive" | "outline"
> = {
  parq_blocked: "destructive",
  questionnaire_pending: "secondary",
  assessment_incomplete: "secondary",
  dexa_pending: "secondary",
  student_no_assessment: "outline",
  adherence_risk: "secondary",
};

/**
 * Microcopy dinâmica do alerta DEXA (E4.6 spec). Mostrada como sub-label
 * abaixo do Badge da fila, no lugar do `assessmentTypeLabel` quando o
 * alertType é `dexa_pending`.
 */
const DEXA_REASON_LABEL: Record<DexaPendingReason, string> = {
  awaiting_pdf_and_data: "DEXA aguardando laudo",
  missing_pdf: "DEXA sem PDF anexado",
  incomplete_data: "DEXA incompleto",
};

const STATUS_LABEL: Record<AssessmentStatus, string> = {
  in_progress: "Em andamento",
  completed: "Completa",
  blocked: "Bloqueada",
  aborted: "Abortada",
};

function ageLabel(dateISO: string | null): string {
  if (!dateISO) return "—";
  try {
    const days = differenceInDays(new Date(), parseISO(dateISO));
    if (days <= 0) return "hoje";
    if (days === 1) return "1 dia";
    return `${days} dias`;
  } catch {
    return "—";
  }
}

function assessmentTypeLabel(type: AssessmentType | null): string | null {
  if (!type) return null;
  return ASSESSMENT_TYPE_METADATA[type].label;
}

export function Precision12ActionQueue({
  items,
  activeLinkAssessmentIds = EMPTY_ACTIVE_LINK_IDS,
}: Precision12ActionQueueProps) {
  const [reissueTarget, setReissueTarget] = useState<ReissueTarget | null>(
    null,
  );
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);

  if (items.length === 0) {
    return (
      <div
        className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground text-center"
        role="status"
        aria-live="polite"
      >
        Nenhuma ação pendente.
      </div>
    );
  }

  return (
    <>
      {/*
        E5.6c — overflow-x-auto no wrapper garante que viewports menores
        que 1280px fazem scroll horizontal em vez de comprimir colunas
        e quebrar texto em duas linhas. Combina com whitespace-nowrap
        nas colunas Status/Data/Idade e no badge de alerta.
      */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[24%]">Aluno</TableHead>
              <TableHead>Alerta</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Data</TableHead>
              <TableHead className="hidden lg:table-cell">Idade</TableHead>
              <TableHead className="w-[360px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              // E4.6 — alertas `dexa_pending` mostram a microcopy dinâmica do
              // motivo no lugar do label do tipo de assessment. Para os
              // demais, mantém o nome do tipo (ex.: "Questionário Precision 12").
              const subLabel =
                item.alertType === "dexa_pending" && item.dexaPendingReason
                  ? DEXA_REASON_LABEL[item.dexaPendingReason]
                  : assessmentTypeLabel(item.assessmentType);
              const canReissue = canReissueQuestionnaireLink(item);
              const canRevoke = canRevokeQuestionnaireLink(
                item,
                activeLinkAssessmentIds,
              );
              return (
                <TableRow
                  key={`${item.studentId}-${item.assessmentId ?? "no-assessment"}-${index}`}
                >
                  <TableCell className="font-medium">{item.studentName}</TableCell>
                  <TableCell>
                    {/*
                      E5.6c — badge ganha whitespace-nowrap pra que
                      "Questionário pendente" / "Sem avaliação no ciclo"
                      etc. não quebrem em duas linhas quando o viewport
                      aperta. O sub-label (assessmentTypeLabel) ainda pode
                      quebrar livremente, porque é metadata complementar.
                    */}
                    <div className="flex flex-col gap-0.5">
                      <Badge
                        variant={ALERT_VARIANT[item.alertType]}
                        className="w-fit whitespace-nowrap"
                      >
                        {ALERT_LABEL[item.alertType]}
                      </Badge>
                      {subLabel && (
                        <span className="text-xs text-muted-foreground">
                          {subLabel}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {/*
                    E5.6c — Status/Data/Idade com whitespace-nowrap pra
                    proteger "Em andamento", "2026-05-13", "3 dias" de
                    quebrarem em duas linhas. Quando o viewport for muito
                    pequeno, o overflow-x-auto no wrapper externo entra em
                    ação em vez de comprimir esses textos.
                  */}
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                    {item.status ? STATUS_LABEL[item.status] : "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                    {item.assessmentDate ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                    {ageLabel(item.assessmentDate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {/*
                      E5.6b — ordem: navegação (Abrir) → reparadora (Gerar
                      novo link) → destrutiva (Revogar). Sem flex-wrap; a
                      coluna comporta os 3 botões sem quebrar altura de
                      linha (largura definida no TableHead acima, ajustada
                      em E5.6c após medições reais do DOM em prod).
                      Revogar usa variant outline com cores rose explícitas
                      pra diferenciar do Gerar novo link sem ofuscar com
                      vermelho cheio.
                    */}
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        aria-label={`Abrir ${item.studentName}`}
                      >
                        <Link
                          to={buildPrecision12StudentDeepLink(
                            item.studentId,
                            item.assessmentId,
                          )}
                        >
                          Abrir
                          <ChevronRight
                            className="ml-1 h-3.5 w-3.5"
                            aria-hidden
                          />
                        </Link>
                      </Button>
                      {canReissue && item.assessmentId !== null && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setReissueTarget({
                              studentId: item.studentId,
                              studentName: item.studentName,
                              assessmentId: item.assessmentId!,
                            })
                          }
                          aria-label={`Gerar novo link do questionário de ${item.studentName}`}
                        >
                          <RefreshCw
                            className="mr-1 h-3.5 w-3.5"
                            aria-hidden
                          />
                          Gerar novo link
                        </Button>
                      )}
                      {canRevoke && item.assessmentId !== null && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          // E5.6b/F-2 (corrigido na auditoria): usa cores
                          // explícitas rose-* em vez do token semântico
                          // `destructive` porque em tema dark o token resolve
                          // pra rgb(158,46,46), dando contraste 2.22 sobre
                          // bg-card — falha WCAG AA. rose-300 dá 8.56.
                          className="border-rose-500/50 text-rose-300 hover:border-rose-400 hover:bg-rose-500/10 hover:text-rose-200"
                          onClick={() =>
                            setRevokeTarget({
                              studentId: item.studentId,
                              studentName: item.studentName,
                              assessmentId: item.assessmentId!,
                            })
                          }
                          aria-label={`Revogar link do questionário de ${item.studentName}`}
                        >
                          <Ban
                            className="mr-1 h-3.5 w-3.5"
                            aria-hidden
                          />
                          Revogar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {reissueTarget && (
        <Precision12ReissueLinkDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setReissueTarget(null);
          }}
          studentId={reissueTarget.studentId}
          studentName={reissueTarget.studentName}
          assessmentId={reissueTarget.assessmentId}
        />
      )}

      {revokeTarget && (
        <Precision12RevokeLinkDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setRevokeTarget(null);
          }}
          studentId={revokeTarget.studentId}
          studentName={revokeTarget.studentName}
          assessmentId={revokeTarget.assessmentId}
        />
      )}
    </>
  );
}
