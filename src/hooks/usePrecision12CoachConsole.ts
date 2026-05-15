/**
 * E4.1 — Hook read-only do Coach Console do Precision 12.
 *
 * `queryFn` faz só fetch — 4 queries bulk `.in()`, sem loop por aluno, sem
 * RPC. `select` roda as derivações puras de `precision12CoachConsole`
 * (memoizado automaticamente pelo react-query, já que `deriveAll` é uma
 * referência estável de módulo).
 *
 * Acesso: o CoachConsole é admin-only (AdminRoute). A RLS de `assessments`,
 * `questionnaire_responses` e `precision12_questionnaire_links` libera leitura
 * consolidada pra admin — nenhuma RPC / SECURITY DEFINER é necessária no MVP.
 *
 * Read-only: nenhuma mutation, nada além de SELECT.
 */

import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ASSESSMENT_TYPES } from "@/types/assessment";
import {
  deriveActionQueue,
  deriveAssessmentStatusCounts,
  deriveStudentProgress,
  type ActionQueueItem,
  type AssessmentStatusCounts,
  type CoachConsoleAssessment,
  type CoachConsoleLink,
  type CoachConsoleQuestionnaire,
  type CoachConsoleStudent,
  type StudentProgress,
} from "@/utils/precision12CoachConsole";

const QUESTIONNAIRE_TYPE = "questionnaire_precision12";

const ASSESSMENT_COLUMNS =
  "id, student_id, assessment_type, status, assessment_date, created_at" as const;
const QUESTIONNAIRE_COLUMNS =
  "assessment_id, parq_blocked, primary_adherence_barrier, sleep_quality, stress_level, energy_level, consistency_self_rating, life_stability, pain_status, uses_medications, has_medical_condition, injury_surgery_history" as const;
const LINK_COLUMNS = "assessment_id, used_at, revoked_at, expires_at" as const;

export interface Precision12CoachConsoleRaw {
  students: CoachConsoleStudent[];
  assessments: CoachConsoleAssessment[];
  responses: CoachConsoleQuestionnaire[];
  links: CoachConsoleLink[];
}

export interface Precision12CoachConsoleData
  extends Precision12CoachConsoleRaw {
  statusCounts: AssessmentStatusCounts;
  studentProgress: StudentProgress[];
  actionQueue: ActionQueueItem[];
}

async function fetchCoachConsoleData(): Promise<Precision12CoachConsoleRaw> {
  // 1. Todas as assessments Precision 12 (9 tipos). Sem `.limit()` — counts e
  //    fila precisam ser exatos. Se a escala crescer, E4.3 troca por RPC
  //    (vide condição de GO/NO-GO do plano E4).
  const { data: assessmentsRaw, error: assessmentsError } = await supabase
    .from("assessments")
    .select(ASSESSMENT_COLUMNS)
    .in("assessment_type", [...ASSESSMENT_TYPES]);
  if (assessmentsError) throw assessmentsError;
  const assessments = (assessmentsRaw ?? []) as CoachConsoleAssessment[];

  const studentIds = [...new Set(assessments.map((a) => a.student_id))];
  const questionnaireAssessmentIds = assessments
    .filter((a) => a.assessment_type === QUESTIONNAIRE_TYPE)
    .map((a) => a.id);

  // 2. Alunos Precision 12: `program_tier = 'precision_12'` OU com ao menos
  //    uma assessment P12 (fallback do plano pra alunos antigos sem a tag).
  const studentsQuery =
    studentIds.length > 0
      ? supabase
          .from("students")
          .select("id, name, program_tier")
          .or(`program_tier.eq.precision_12,id.in.(${studentIds.join(",")})`)
      : supabase
          .from("students")
          .select("id, name, program_tier")
          .eq("program_tier", "precision_12");
  const { data: studentsRaw, error: studentsError } = await studentsQuery;
  if (studentsError) throw studentsError;
  const students = (studentsRaw ?? []) as CoachConsoleStudent[];

  // 3 + 4. responses + links — só se houver questionário. Bulk `.in()`.
  let responses: CoachConsoleQuestionnaire[] = [];
  let links: CoachConsoleLink[] = [];
  if (questionnaireAssessmentIds.length > 0) {
    const [responsesRes, linksRes] = await Promise.all([
      supabase
        .from("questionnaire_responses")
        .select(QUESTIONNAIRE_COLUMNS)
        .in("assessment_id", questionnaireAssessmentIds),
      supabase
        .from("precision12_questionnaire_links")
        .select(LINK_COLUMNS)
        .in("assessment_id", questionnaireAssessmentIds),
    ]);
    if (responsesRes.error) throw responsesRes.error;
    if (linksRes.error) throw linksRes.error;
    responses = (responsesRes.data ?? []) as CoachConsoleQuestionnaire[];
    links = (linksRes.data ?? []) as CoachConsoleLink[];
  }

  return { students, assessments, responses, links };
}

/**
 * Roda as derivações puras sobre os dados crus. Referência estável de módulo
 * → o react-query memoiza o `select` (só recomputa quando o dado cru muda).
 */
function deriveAll(
  raw: Precision12CoachConsoleRaw,
): Precision12CoachConsoleData {
  return {
    ...raw,
    statusCounts: deriveAssessmentStatusCounts(raw.assessments),
    studentProgress: raw.students.map((s) =>
      deriveStudentProgress(s.id, raw.assessments),
    ),
    actionQueue: deriveActionQueue({
      students: raw.students,
      assessments: raw.assessments,
      responses: raw.responses,
    }),
  };
}

/** Hook read-only: KPIs, progresso por aluno e fila de ação do Precision 12. */
export function usePrecision12CoachConsole() {
  return useQuery({
    queryKey: ["precision12", "coach-console"],
    staleTime: 60 * 1000,
    queryFn: fetchCoachConsoleData,
    select: deriveAll,
  });
}
