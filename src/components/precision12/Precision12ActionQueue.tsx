/**
 * E4.2 — Fila de ação read-only do Coach Console Precision 12.
 *
 * Tabela priorizada com os itens derivados pelo hook E4.1. Cada linha tem
 * uma CTA pra abrir o aluno em outra rota — **sem ações mutáveis** nesta
 * etapa (sem reenviar link, sem marcar abortada, etc.).
 *
 * Microcopy: triagem operacional, NÃO diagnóstico.
 */

import { differenceInDays, parseISO } from "date-fns";
import { ChevronRight } from "lucide-react";
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
import type {
  ActionQueueAlertType,
  ActionQueueItem,
} from "@/utils/precision12CoachConsole";

interface Precision12ActionQueueProps {
  items: readonly ActionQueueItem[];
}

const ALERT_LABEL: Record<ActionQueueAlertType, string> = {
  parq_blocked: "PAR-Q bloqueado",
  questionnaire_pending: "Questionário pendente",
  assessment_incomplete: "Avaliação incompleta",
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
  student_no_assessment: "outline",
  adherence_risk: "secondary",
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

export function Precision12ActionQueue({ items }: Precision12ActionQueueProps) {
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
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[28%]">Aluno</TableHead>
            <TableHead>Alerta</TableHead>
            <TableHead className="hidden md:table-cell">Status</TableHead>
            <TableHead className="hidden lg:table-cell">Data</TableHead>
            <TableHead className="hidden lg:table-cell">Idade</TableHead>
            <TableHead className="w-[100px] text-right">Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => {
            const typeLabel = assessmentTypeLabel(item.assessmentType);
            return (
              <TableRow
                key={`${item.studentId}-${item.assessmentId ?? "no-assessment"}-${index}`}
              >
                <TableCell className="font-medium">{item.studentName}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <Badge
                      variant={ALERT_VARIANT[item.alertType]}
                      className="w-fit"
                    >
                      {ALERT_LABEL[item.alertType]}
                    </Badge>
                    {typeLabel && (
                      <span className="text-xs text-muted-foreground">
                        {typeLabel}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                  {item.status ? STATUS_LABEL[item.status] : "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground tabular-nums">
                  {item.assessmentDate ?? "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground tabular-nums">
                  {ageLabel(item.assessmentDate)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    aria-label={`Abrir ${item.studentName}`}
                  >
                    <Link to={`/alunos/${item.studentId}`}>
                      Abrir
                      <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
