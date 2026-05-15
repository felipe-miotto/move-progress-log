/**
 * E4.2 — Tabela read-only de progresso por aluno no ciclo Precision 12.
 *
 * Uma linha por aluno · 5 colunas de categoria (VO₂ / Força / Composição /
 * Funcional / Anamnese) · contagem de categorias completas · CTA pra abrir
 * o aluno. Reusa `deriveStudentProgress` do E4.1 via o hook.
 *
 * Status por categoria:
 *   ✓ done     — ao menos uma assessment `completed` no grupo
 *   ⚠ blocked  — sem `completed`, mas tem `blocked` (ação clínica)
 *   ⏳ pending — sem `completed`/`blocked`, mas tem `in_progress`
 *   — missing  — nenhuma assessment, ou só `aborted`
 */

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ASSESSMENT_CATEGORIES,
  type AssessmentCategory,
  type CategoryStatus,
  type CoachConsoleStudent,
  type StudentProgress,
} from "@/utils/precision12CoachConsole";

interface Precision12StudentProgressTableProps {
  students: readonly CoachConsoleStudent[];
  progress: readonly StudentProgress[];
}

const STATUS_LABEL: Record<CategoryStatus, string> = {
  done: "Feita",
  blocked: "Respondido, ação clínica",
  pending: "Em andamento",
  missing: "Sem registro",
};

function CategoryCell({
  status,
  category,
}: {
  status: CategoryStatus;
  category: AssessmentCategory;
}) {
  const ariaLabel = `${category}: ${STATUS_LABEL[status]}`;
  if (status === "done") {
    return (
      <CheckCircle2
        className="h-4 w-4 text-emerald-600 mx-auto"
        aria-label={ariaLabel}
      />
    );
  }
  if (status === "blocked") {
    return (
      <AlertTriangle
        className="h-4 w-4 text-amber-600 mx-auto"
        aria-label={ariaLabel}
      />
    );
  }
  if (status === "pending") {
    return (
      <Clock className="h-4 w-4 text-blue-600 mx-auto" aria-label={ariaLabel} />
    );
  }
  return (
    <span
      className="text-muted-foreground block text-center"
      aria-label={ariaLabel}
    >
      —
    </span>
  );
}

export function Precision12StudentProgressTable({
  students,
  progress,
}: Precision12StudentProgressTableProps) {
  if (students.length === 0) {
    return (
      <div
        className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground text-center"
        role="status"
        aria-live="polite"
      >
        Nenhum aluno Precision 12 encontrado.
      </div>
    );
  }

  const progressByStudent = new Map(progress.map((p) => [p.studentId, p]));
  const sortedStudents = [...students].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Aluno</TableHead>
            {ASSESSMENT_CATEGORIES.map((category) => (
              <TableHead
                key={category}
                className="text-center hidden sm:table-cell"
              >
                {category}
              </TableHead>
            ))}
            <TableHead className="text-center">Progresso</TableHead>
            <TableHead className="w-[100px] text-right">Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedStudents.map((student) => {
            const p = progressByStudent.get(student.id);
            const completed = p?.completedCategories ?? 0;
            const total = p?.totalCategories ?? ASSESSMENT_CATEGORIES.length;
            return (
              <TableRow key={student.id}>
                <TableCell className="font-medium">{student.name}</TableCell>
                {ASSESSMENT_CATEGORIES.map((category) => (
                  <TableCell
                    key={category}
                    className="text-center hidden sm:table-cell"
                  >
                    <CategoryCell
                      category={category}
                      status={p?.categories[category] ?? "missing"}
                    />
                  </TableCell>
                ))}
                <TableCell className="text-center tabular-nums text-sm">
                  {completed}/{total}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    aria-label={`Abrir ${student.name}`}
                  >
                    <Link to={`/alunos/${student.id}`}>
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
