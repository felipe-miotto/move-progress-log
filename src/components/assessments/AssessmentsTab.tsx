/**
 * Tab "Avaliações" no StudentDetailPage.
 *
 * Lista todas as avaliações do aluno, agrupadas/filtráveis por
 * categoria, com botão "Nova avaliação" abrindo o wizard.
 *
 * Detalhe drill-down abre um painel read-only com os dados salvos.
 */

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronRight, Plus, Stethoscope } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { ASSESSMENT_TYPE_METADATA } from "@/constants/assessmentProtocols";
import { useAssessmentsByStudent } from "@/hooks/useAssessments";
import type { Assessment, AssessmentType } from "@/types/assessment";

import { CreateAssessmentWizard } from "./CreateAssessmentWizard";
import { AssessmentDetailSheet } from "./AssessmentDetailSheet";

// ────────────────────────────────────────────────────────────────────────────

interface AssessmentsTabProps {
  studentId: string;
  studentDefaults?: {
    age_years?: number | null;
    weight_kg?: number | null;
    height_cm?: number | null;
    sex?: "M" | "F" | null;
  };
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: "Em andamento",
  completed: "Completa",
  aborted: "Abortada",
  blocked: "Bloqueada (PAR-Q)",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  in_progress: "secondary",
  aborted: "outline",
  blocked: "destructive",
};

const ALL_CATEGORIES = ["all", "VO₂", "Força", "Composição", "Funcional", "Anamnese"] as const;
type CategoryFilter = (typeof ALL_CATEGORIES)[number];

// ────────────────────────────────────────────────────────────────────────────

export const AssessmentsTab = ({ studentId, studentDefaults }: AssessmentsTabProps) => {
  const { data: assessments, isLoading } = useAssessmentsByStudent(studentId);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CategoryFilter>("all");

  const filtered = useMemo(() => {
    if (!assessments) return [];
    if (filter === "all") return assessments;
    return assessments.filter((a) => {
      const meta = ASSESSMENT_TYPE_METADATA[a.assessment_type as AssessmentType];
      return meta?.category === filter;
    });
  }, [assessments, filter]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, Assessment[]>();
    for (const a of filtered) {
      const key = a.assessment_date;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    return Array.from(groups.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!assessments || assessments.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Avaliações Precision 12</h2>
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nova avaliação
          </Button>
        </div>

        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Stethoscope className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-semibold">Nenhuma avaliação ainda</p>
            <p className="text-sm text-muted-foreground">
              Registre a primeira avaliação clínica deste aluno pra
              começar o programa Precision 12.
            </p>
          </div>
          <Button onClick={() => setWizardOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nova avaliação
          </Button>
        </Card>

        <CreateAssessmentWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          studentId={studentId}
          defaults={studentDefaults}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Avaliações Precision 12</h2>
        <Button size="sm" onClick={() => setWizardOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nova avaliação
        </Button>
      </div>

      {/* Filtro por categoria */}
      <div
        className="flex flex-wrap gap-1"
        role="group"
        aria-label="Filtrar avaliações por categoria"
      >
        {ALL_CATEGORIES.map((cat) => (
          <Button
            key={cat}
            size="sm"
            variant={filter === cat ? "default" : "outline"}
            onClick={() => setFilter(cat)}
            className="h-8 text-xs"
          >
            {cat === "all" ? "Todas" : cat}
            <Badge
              variant={filter === cat ? "secondary" : "outline"}
              className="ml-1.5 text-[10px]"
            >
              {cat === "all"
                ? assessments.length
                : assessments.filter(
                    (a) =>
                      ASSESSMENT_TYPE_METADATA[a.assessment_type as AssessmentType]
                        ?.category === cat,
                  ).length}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Lista agrupada por data */}
      {groupedByDate.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma avaliação na categoria "{filter}".
        </Card>
      ) : (
        <div className="space-y-3">
          {groupedByDate.map(([date, items]) => (
            <section key={date} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {format(parseISO(date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </h3>
              <div className="space-y-1.5">
                {items.map((a) => {
                  const meta =
                    ASSESSMENT_TYPE_METADATA[a.assessment_type as AssessmentType];
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setSelectedAssessmentId(a.id)}
                      aria-label={`Abrir detalhes de ${meta?.label ?? a.assessment_type}`}
                    >
                      <Card className="flex cursor-pointer items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/30">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm truncate">
                              {meta?.label ?? a.assessment_type}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {meta?.category ?? "?"}
                            </Badge>
                          </div>
                          {a.notes && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                              {a.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Badge variant={STATUS_VARIANTS[a.status] ?? "outline"}>
                            {STATUS_LABELS[a.status] ?? a.status}
                          </Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </Card>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <CreateAssessmentWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        studentId={studentId}
        defaults={studentDefaults}
      />
      <AssessmentDetailSheet
        assessmentId={selectedAssessmentId}
        open={selectedAssessmentId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedAssessmentId(null);
        }}
      />
    </div>
  );
};
