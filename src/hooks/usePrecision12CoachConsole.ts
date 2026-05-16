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
  deriveActiveLinkAssessmentIds,
  deriveAssessmentStatusCounts,
  deriveStudentProgress,
  type ActionQueueItem,
  type AssessmentStatusCounts,
  type CoachConsoleAssessment,
  type CoachConsoleDexaResult,
  type CoachConsoleHandgripResult,
  type CoachConsoleLink,
  type CoachConsoleQuestionnaire,
  type CoachConsoleSitToStandResult,
  type CoachConsoleStudent,
  type CoachConsoleVo2Result,
  type StudentProgress,
} from "@/utils/precision12CoachConsole";

const QUESTIONNAIRE_TYPE = "questionnaire_precision12";
const DEXA_TYPE = "dexa";
const HANDGRIP_TYPE = "handgrip";
const SIT_TO_STAND_TYPE = "sit_to_stand";

const ASSESSMENT_COLUMNS =
  "id, student_id, assessment_type, status, assessment_date, created_at" as const;
const QUESTIONNAIRE_COLUMNS =
  "assessment_id, parq_blocked, primary_adherence_barrier, sleep_quality, stress_level, energy_level, consistency_self_rating, life_stability, pain_status, uses_medications, has_medical_condition, injury_surgery_history" as const;
const LINK_COLUMNS = "assessment_id, used_at, revoked_at, expires_at" as const;
const VO2_COLUMNS =
  "assessment_id, vo2_final, vo2_classification, recovery_drop_1min, recovery_classification" as const;
const HANDGRIP_COLUMNS = "assessment_id, best_kg, classification" as const;
const SIT_TO_STAND_COLUMNS =
  "assessment_id, total_score, classification" as const;
// E4.6 — Subset enxuto do schema `dexa_results` usado pela triagem do
// Coach Console. Mantido alinhado com `CoachConsoleDexaResult`.
const DEXA_COLUMNS =
  "assessment_id, fat_mass_kg, fat_pct, lean_mass_kg, visceral_fat_g, android_gynoid_ratio, appendicular_lean_mass_kg, imma_baumgartner, fmi, bmr_harris_benedict_kcal, bmr_mifflin_stjeor_kcal, conclusion_text, scan_pdf_storage_path, scan_pdf_url" as const;

export interface Precision12CoachConsoleRaw {
  students: CoachConsoleStudent[];
  assessments: CoachConsoleAssessment[];
  responses: CoachConsoleQuestionnaire[];
  /** E5.5b — resultados físicos já classificados, read-only. */
  vo2Results: CoachConsoleVo2Result[];
  handgripResults: CoachConsoleHandgripResult[];
  sitToStandResults: CoachConsoleSitToStandResult[];
  links: CoachConsoleLink[];
  /** E4.6 — usado para emitir alerta `dexa_pending` na fila. */
  dexaResults: CoachConsoleDexaResult[];
}

export interface Precision12CoachConsoleData
  extends Precision12CoachConsoleRaw {
  statusCounts: AssessmentStatusCounts;
  studentProgress: StudentProgress[];
  actionQueue: ActionQueueItem[];
  /**
   * E4.5 — Conjunto de `assessment_id` com link ativo (não usado, não
   * revogado, não expirado). Usado pela UI pra decidir se mostra o
   * botão "Revogar link" na fila.
   */
  activeLinkAssessmentIds: Set<string>;
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
  const vo2AssessmentIds = assessments
    .filter((a) => a.assessment_type.startsWith("vo2_"))
    .map((a) => a.id);
  const handgripAssessmentIds = assessments
    .filter((a) => a.assessment_type === HANDGRIP_TYPE)
    .map((a) => a.id);
  const sitToStandAssessmentIds = assessments
    .filter((a) => a.assessment_type === SIT_TO_STAND_TYPE)
    .map((a) => a.id);
  // E4.6 — IDs das DEXA. Só fazemos a query se houver alguma DEXA — evita
  // request vazio com .in("assessment_id", []) (gera 400 em alguns clients).
  const dexaAssessmentIds = assessments
    .filter((a) => a.assessment_type === DEXA_TYPE)
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

  // 5. Resultados físicos já classificados (E5.5b). Bulk `.in()` por tabela,
  // sem ranges novos e sem cálculo clínico no client.
  let vo2Results: CoachConsoleVo2Result[] = [];
  if (vo2AssessmentIds.length > 0) {
    const { data: vo2Raw, error: vo2Error } = await supabase
      .from("vo2_assessment_details")
      .select(VO2_COLUMNS)
      .in("assessment_id", vo2AssessmentIds);
    if (vo2Error) throw vo2Error;
    vo2Results = (vo2Raw ?? []) as CoachConsoleVo2Result[];
  }

  let handgripResults: CoachConsoleHandgripResult[] = [];
  if (handgripAssessmentIds.length > 0) {
    const { data: handgripRaw, error: handgripError } = await supabase
      .from("handgrip_results")
      .select(HANDGRIP_COLUMNS)
      .in("assessment_id", handgripAssessmentIds);
    if (handgripError) throw handgripError;
    handgripResults = (handgripRaw ?? []) as CoachConsoleHandgripResult[];
  }

  let sitToStandResults: CoachConsoleSitToStandResult[] = [];
  if (sitToStandAssessmentIds.length > 0) {
    const { data: sitToStandRaw, error: sitToStandError } = await supabase
      .from("sit_to_stand_results")
      .select(SIT_TO_STAND_COLUMNS)
      .in("assessment_id", sitToStandAssessmentIds);
    if (sitToStandError) throw sitToStandError;
    sitToStandResults =
      (sitToStandRaw ?? []) as CoachConsoleSitToStandResult[];
  }

  // 6. dexa_results (E4.6) — só se houver assessment DEXA. RLS via JOIN com
  //    assessments→students libera SELECT pra admin sem RPC.
  let dexaResults: CoachConsoleDexaResult[] = [];
  if (dexaAssessmentIds.length > 0) {
    const { data: dexaRaw, error: dexaError } = await supabase
      .from("dexa_results")
      .select(DEXA_COLUMNS)
      .in("assessment_id", dexaAssessmentIds);
    if (dexaError) throw dexaError;
    dexaResults = (dexaRaw ?? []) as CoachConsoleDexaResult[];
  }

  return {
    students,
    assessments,
    responses,
    vo2Results,
    handgripResults,
    sitToStandResults,
    links,
    dexaResults,
  };
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
      dexaResults: raw.dexaResults,
    }),
    activeLinkAssessmentIds: deriveActiveLinkAssessmentIds(raw.links),
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
