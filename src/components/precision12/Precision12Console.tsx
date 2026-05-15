/**
 * E4.2 — Container do Coach Console Precision 12.
 *
 * Wraps as 3 superfícies read-only (KPIs, fila de ação, progresso por aluno)
 * em torno do hook `usePrecision12CoachConsole`. Sem ações mutáveis nesta
 * etapa — só leitura e CTAs de navegação pra `/alunos/:id`.
 */

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrecision12CoachConsole } from "@/hooks/usePrecision12CoachConsole";

import { Precision12ActionQueue } from "./Precision12ActionQueue";
import { Precision12KpiCards } from "./Precision12KpiCards";
import { Precision12StudentProgressTable } from "./Precision12StudentProgressTable";

function LoadingSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando Coach Console Precision 12…</span>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-md" />
        ))}
      </div>
      <Skeleton className="h-[260px] rounded-md" />
      <Skeleton className="h-[200px] rounded-md" />
    </div>
  );
}

export function Precision12Console() {
  const query = usePrecision12CoachConsole();

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

  const data = query.data;
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
        <Precision12ActionQueue items={data.actionQueue} />
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
        <Precision12StudentProgressTable
          students={data.students}
          progress={data.studentProgress}
        />
      </section>
    </div>
  );
}
