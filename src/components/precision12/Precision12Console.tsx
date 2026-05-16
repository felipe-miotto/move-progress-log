/**
 * E4.2 — Container do Coach Console Precision 12.
 *
 * Wraps as 3 superfícies read-only (KPIs, fila de ação, progresso por aluno)
 * em torno do hook `usePrecision12CoachConsole`. Sem ações mutáveis nesta
 * etapa — só leitura e CTAs de navegação pra `/alunos/:id`.
 *
 * E4.3a — adicionados filtros operacionais (busca, tipo de alerta, status de
 * progresso, ocultar dados de teste). KPIs continuam GLOBAIS — só fila e
 * tabela respondem aos filtros, propositalmente (panorama vs. recorte).
 */

import { useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrecision12CoachConsole } from "@/hooks/usePrecision12CoachConsole";
import {
  DEFAULT_PRECISION12_FILTERS,
  countHiddenSmokeStudents,
  filterActionQueue,
  filterStudentsForProgress,
  type Precision12Filters as Precision12FiltersType,
} from "@/utils/precision12CoachConsole";

import { Precision12ActionQueue } from "./Precision12ActionQueue";
import { Precision12Filters } from "./Precision12Filters";
import { Precision12KpiCards } from "./Precision12KpiCards";
import { Precision12StudentProgressTable } from "./Precision12StudentProgressTable";
import { Precision12EvidencePreview } from "./evidence";

function LoadingSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando Coach Console Precision 12…</span>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-md" />
        ))}
      </div>
      <Skeleton className="h-[120px] rounded-md" />
      <Skeleton className="h-[260px] rounded-md" />
      <Skeleton className="h-[200px] rounded-md" />
    </div>
  );
}

function FilteredEmpty({ label }: { label: string }) {
  return (
    <div
      className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground text-center"
      role="status"
      aria-live="polite"
    >
      {label}
    </div>
  );
}

export function Precision12Console() {
  const query = usePrecision12CoachConsole();
  const [filters, setFilters] = useState<Precision12FiltersType>(
    DEFAULT_PRECISION12_FILTERS,
  );

  const data = query.data;

  // Derivações memoizadas pra evitar refazer trabalho a cada keystroke da busca.
  const studentsById = useMemo(() => {
    if (!data) return new Map<string, (typeof data.students)[number]>();
    return new Map(data.students.map((s) => [s.id, s]));
  }, [data]);

  const hiddenSmokeCount = useMemo(
    () =>
      data ? countHiddenSmokeStudents(data.students, filters.hideTestData) : 0,
    [data, filters.hideTestData],
  );

  const filteredActionQueue = useMemo(
    () =>
      data ? filterActionQueue(data.actionQueue, filters, studentsById) : [],
    [data, filters, studentsById],
  );

  const filteredStudents = useMemo(
    () =>
      data
        ? filterStudentsForProgress(
            data.students,
            data.studentProgress,
            data.actionQueue,
            filters,
          )
        : [],
    [data, filters],
  );

  // E5.6a / M-2: o preview de evidências precisa respeitar os mesmos
  // filtros operacionais que a tabela de progresso e a fila — caso
  // contrário, "ocultar dados de teste" some o SMOKE da fila e da tabela
  // mas continua mostrando suas claims no preview. Filtramos em cascata:
  // students → assessments daqueles alunos → responses daqueles assessments.
  const filteredStudentIdsForEvidence = useMemo(
    () => new Set(filteredStudents.map((s) => s.id)),
    [filteredStudents],
  );
  const filteredAssessmentsForEvidence = useMemo(
    () =>
      data
        ? data.assessments.filter((a) =>
            filteredStudentIdsForEvidence.has(a.student_id),
          )
        : [],
    [data, filteredStudentIdsForEvidence],
  );
  const filteredAssessmentIdsForEvidence = useMemo(
    () => new Set(filteredAssessmentsForEvidence.map((a) => a.id)),
    [filteredAssessmentsForEvidence],
  );
  const filteredResponsesForEvidence = useMemo(
    () =>
      data
        ? data.responses.filter((r) =>
            filteredAssessmentIdsForEvidence.has(r.assessment_id),
          )
        : [],
    [data, filteredAssessmentIdsForEvidence],
  );

  if (query.isLoading) {
    return <LoadingSkeleton />;
  }

  if (query.isError) {
    const message =
      query.error instanceof Error ? query.error.message : "Erro inesperado";
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar o Coach Console</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{message}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden />
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!data || data.students.length === 0) {
    return (
      <div
        className="rounded-md border bg-muted/30 p-8 text-sm text-muted-foreground text-center"
        role="status"
        aria-live="polite"
      >
        Nenhum aluno Precision 12 encontrado.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Precision12KpiCards data={data} />

      <Precision12Filters
        filters={filters}
        onFiltersChange={setFilters}
        hiddenSmokeCount={hiddenSmokeCount}
      />

      <section aria-labelledby="precision12-queue-heading" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3
            id="precision12-queue-heading"
            className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Fila de ação
          </h3>
          <p className="text-xs text-muted-foreground">
            Triagem operacional — não substitui avaliação clínica.
          </p>
        </div>
        {data.actionQueue.length > 0 && filteredActionQueue.length === 0 ? (
          <FilteredEmpty label="Nenhuma ação corresponde aos filtros atuais." />
        ) : (
          <Precision12ActionQueue
            items={filteredActionQueue}
            activeLinkAssessmentIds={data.activeLinkAssessmentIds}
          />
        )}
      </section>

      <section
        aria-labelledby="precision12-progress-heading"
        className="space-y-2"
      >
        <h3
          id="precision12-progress-heading"
          className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Progresso por aluno (5 categorias)
        </h3>
        {data.students.length > 0 && filteredStudents.length === 0 ? (
          <FilteredEmpty label="Nenhum aluno corresponde aos filtros atuais." />
        ) : (
          <Precision12StudentProgressTable
            students={filteredStudents}
            progress={data.studentProgress}
          />
        )}
      </section>

      {/*
        E5.5 — Preview read-only de evidências clínico-operacionais.
        Consome `responses` e `students` JÁ carregados pelo hook E4.1
        (zero query nova). Cobertura inicial: PAR-Q + Sono/Estresse/
        Energia/Adesão. Demais domínios documentados como pendentes
        dentro do próprio componente (limitações em `<details>`).
        E5.6a / M-2: agora recebe os arrays JÁ filtrados (em cascata
        students→assessments→responses) pra respeitar os mesmos filtros
        operacionais que a fila e a tabela de progresso.
      */}
      <section
        aria-labelledby="precision12-evidence-preview-heading"
        className="space-y-2"
      >
        <h3
          id="precision12-evidence-preview-heading"
          className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Evidência clínica-operacional (preview)
        </h3>
        {data.students.length > 0 && filteredStudents.length === 0 ? (
          <FilteredEmpty label="Nenhuma evidência corresponde aos filtros atuais." />
        ) : (
          <Precision12EvidencePreview
            students={filteredStudents}
            assessments={filteredAssessmentsForEvidence}
            responses={filteredResponsesForEvidence}
          />
        )}
      </section>
    </div>
  );
}
