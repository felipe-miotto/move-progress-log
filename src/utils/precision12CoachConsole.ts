/**
 * E4.1 — Derivações puras do Coach Console do Precision 12.
 *
 * Funções puras (sem fetch, sem React) que transformam dados crus de
 * `assessments` / `questionnaire_responses` em KPIs, progresso por aluno,
 * alertas e fila de ação. O fetch read-only vive em
 * `usePrecision12CoachConsole`.
 *
 * Categorias: os 9 tipos de avaliação se agrupam em 5 categorias via
 * `ASSESSMENT_TYPE_METADATA[type].category` — reusado aqui, não recriado.
 * VO₂ é satisfeita por qualquer um dos 5 tipos `vo2_*` (o aluno faz um
 * protocolo, não os cinco).
 */

import { ASSESSMENT_TYPE_METADATA } from "@/constants/assessmentProtocols";
import type { AssessmentStatus, AssessmentType } from "@/types/assessment";

// ────────────────────────────────────────────────────────────────────────────
// Tipos de entrada — shapes enxutos, só as colunas que o E4.1 lê.
// Mantidos standalone (não Pick<> dos tipos full) pra fixtures de teste
// triviais e pra desacoplar as funções puras do schema do banco.
// ────────────────────────────────────────────────────────────────────────────

export interface CoachConsoleAssessment {
  id: string;
  student_id: string;
  assessment_type: AssessmentType;
  status: AssessmentStatus;
  assessment_date: string;
  created_at: string;
}

export interface CoachConsoleQuestionnaire {
  assessment_id: string;
  parq_blocked: boolean | null;
  primary_adherence_barrier: string | null;
  sleep_quality: number | null;
  stress_level: number | null;
  energy_level: number | null;
  consistency_self_rating: string | null;
  life_stability: string | null;
  pain_status: string | null;
  uses_medications: boolean | null;
  has_medical_condition: boolean | null;
  injury_surgery_history: string | null;
}

export interface CoachConsoleStudent {
  id: string;
  name: string;
  program_tier: string;
}

export interface CoachConsoleLink {
  assessment_id: string;
  used_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Categorias de avaliação (5) — derivadas de ASSESSMENT_TYPE_METADATA
// ────────────────────────────────────────────────────────────────────────────

export type AssessmentCategory =
  (typeof ASSESSMENT_TYPE_METADATA)[AssessmentType]["category"];

/** As 5 categorias, na ordem do wizard. */
export const ASSESSMENT_CATEGORIES = [
  "VO₂",
  "Força",
  "Composição",
  "Funcional",
  "Anamnese",
] as const satisfies readonly AssessmentCategory[];

/** Categoria de um tipo de avaliação. Reusa o mapeamento do app. */
export function categoryOf(type: AssessmentType): AssessmentCategory {
  return ASSESSMENT_TYPE_METADATA[type].category;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Contagem de status
// ────────────────────────────────────────────────────────────────────────────

export interface AssessmentStatusCounts {
  total: number;
  in_progress: number;
  completed: number;
  aborted: number;
  blocked: number;
}

/** Conta as assessments Precision 12 por status. */
export function deriveAssessmentStatusCounts(
  assessments: readonly CoachConsoleAssessment[],
): AssessmentStatusCounts {
  const counts: AssessmentStatusCounts = {
    total: assessments.length,
    in_progress: 0,
    completed: 0,
    aborted: 0,
    blocked: 0,
  };
  for (const a of assessments) {
    counts[a.status] += 1;
  }
  return counts;
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Progresso por aluno (cobertura das 5 categorias)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Status de uma categoria pro aluno:
 *  - `done`     → tem ao menos uma assessment `completed` no grupo
 *  - `blocked`  → sem `completed`, mas tem `blocked` (respondido, ação clínica)
 *  - `pending`  → sem `completed`/`blocked`, mas tem `in_progress`
 *  - `missing`  → nenhuma assessment no grupo (ou só `aborted`)
 */
export type CategoryStatus = "done" | "blocked" | "pending" | "missing";

export interface StudentProgress {
  studentId: string;
  categories: Record<AssessmentCategory, CategoryStatus>;
  /** Categorias com status `done` (0–5). */
  completedCategories: number;
  /** Sempre 5. */
  totalCategories: number;
}

function computeCategoryStatus(
  category: AssessmentCategory,
  assessments: readonly CoachConsoleAssessment[],
): CategoryStatus {
  const inCategory = assessments.filter(
    (a) => categoryOf(a.assessment_type) === category,
  );
  if (inCategory.some((a) => a.status === "completed")) return "done";
  if (inCategory.some((a) => a.status === "blocked")) return "blocked";
  if (inCategory.some((a) => a.status === "in_progress")) return "pending";
  return "missing"; // sem assessment, ou só `aborted`
}

/**
 * Cobertura do ciclo Precision 12 pra um aluno, por categoria.
 * `aborted` não conta como feito. VO₂ satisfeita por qualquer `vo2_*`.
 */
export function deriveStudentProgress(
  studentId: string,
  assessments: readonly CoachConsoleAssessment[],
): StudentProgress {
  const mine = assessments.filter((a) => a.student_id === studentId);
  const categories = Object.fromEntries(
    ASSESSMENT_CATEGORIES.map((category) => [
      category,
      computeCategoryStatus(category, mine),
    ]),
  ) as Record<AssessmentCategory, CategoryStatus>;
  const completedCategories = ASSESSMENT_CATEGORIES.filter(
    (category) => categories[category] === "done",
  ).length;
  return {
    studentId,
    categories,
    completedCategories,
    totalCategories: ASSESSMENT_CATEGORIES.length,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Alertas derivados do questionário
// ────────────────────────────────────────────────────────────────────────────

export type QuestionnaireAlertKind =
  | "parq_blocked"
  | "adherence_risk"
  | "clinical_attention";

export interface QuestionnaireAlert {
  kind: QuestionnaireAlertKind;
  /** Microcopy operacional — triagem/sinal, NÃO diagnóstico. */
  message: string;
}

/**
 * Barreiras de adesão que contam como sinal de risco — 5 dos 7 códigos de
 * `primary_adherence_barrier`. `financial_cost` e `other` ficam de fora
 * porque não são sinal comportamental de adesão.
 */
export const ADHERENCE_RISK_BARRIERS: readonly string[] = [
  "time",
  "energy_fatigue",
  "motivation",
  "pain_discomfort",
  "lack_of_results",
];

/**
 * Cortes dos scores que contam como flag de risco de adesão.
 *
 * ⚠️ As colunas `sleep_quality` / `stress_level` / `energy_level` são escalas
 * 1–5 (check constraint na migration de foundation do Precision 12), NÃO 1–10.
 * O plano E4 original citava cortes de escala 1–10 (<=5 / >=7 / <=4) —
 * corrigidos aqui pra 1–5. Os cortes exatos são um KNOB de produto: ajustar
 * este const se a triagem ficar larga/estreita demais (não exige refactor).
 */
export const ADHERENCE_RISK_THRESHOLDS = {
  /** 1–5, maior = melhor → <= 2 é sono ruim. */
  sleepQualityAtMost: 2,
  /** 1–5, maior = pior → >= 4 é estresse alto. */
  stressLevelAtLeast: 4,
  /** 1–5, maior = melhor → <= 2 é energia baixa. */
  energyLevelAtMost: 2,
} as const;

/** Nº mínimo de flags pra disparar o alerta de risco de adesão. */
export const ADHERENCE_RISK_MIN_FLAGS = 2;

/** Conta as flags de risco de adesão presentes numa resposta. */
function countAdherenceRiskFlags(
  response: CoachConsoleQuestionnaire,
): number {
  let flags = 0;
  if (
    response.primary_adherence_barrier != null &&
    ADHERENCE_RISK_BARRIERS.includes(response.primary_adherence_barrier)
  ) {
    flags += 1;
  }
  if (
    response.sleep_quality != null &&
    response.sleep_quality <= ADHERENCE_RISK_THRESHOLDS.sleepQualityAtMost
  ) {
    flags += 1;
  }
  if (
    response.stress_level != null &&
    response.stress_level >= ADHERENCE_RISK_THRESHOLDS.stressLevelAtLeast
  ) {
    flags += 1;
  }
  if (
    response.energy_level != null &&
    response.energy_level <= ADHERENCE_RISK_THRESHOLDS.energyLevelAtMost
  ) {
    flags += 1;
  }
  if (response.consistency_self_rating === "inconsistent") flags += 1;
  if (response.life_stability === "chaotic") flags += 1;
  if (response.pain_status != null && response.pain_status !== "none") {
    flags += 1;
  }
  return flags;
}

/**
 * Alertas operacionais derivados de uma resposta de questionário.
 * Microcopy de triagem — nunca diagnóstico nem recomendação prescritiva.
 */
export function deriveQuestionnaireAlerts(
  response: CoachConsoleQuestionnaire,
): QuestionnaireAlert[] {
  const alerts: QuestionnaireAlert[] = [];

  if (response.parq_blocked === true) {
    alerts.push({
      kind: "parq_blocked",
      message: "PAR-Q positivo — revisar antes de liberar treino intenso.",
    });
  }

  if (countAdherenceRiskFlags(response) >= ADHERENCE_RISK_MIN_FLAGS) {
    alerts.push({
      kind: "adherence_risk",
      message:
        "Possível risco de adesão — barreira principal + sono/energia/estresse.",
    });
  }

  const needsClinicalAttention =
    response.uses_medications === true ||
    response.has_medical_condition === true ||
    (response.injury_surgery_history != null &&
      response.injury_surgery_history.trim() !== "") ||
    (response.pain_status != null && response.pain_status !== "none");
  if (needsClinicalAttention) {
    alerts.push({
      kind: "clinical_attention",
      message:
        "Aluno reportou medicação / condição / lesão — checar antes de prescrever.",
    });
  }

  return alerts;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Fila de ação do coach
// ────────────────────────────────────────────────────────────────────────────

/**
 * Tipos de alerta da fila. Prioridade #4 do plano ("DEXA sem PDF/conclusão")
 * fica pro E4.3 — exige buscar `dexa_results`, fora do escopo de dados do E4.1.
 */
export type ActionQueueAlertType =
  | "parq_blocked" //          prioridade 1
  | "questionnaire_pending" // prioridade 2
  | "assessment_incomplete" // prioridade 3
  | "student_no_assessment" // prioridade 5
  | "adherence_risk"; //       prioridade 6

const PRIORITY: Record<ActionQueueAlertType, number> = {
  parq_blocked: 1,
  questionnaire_pending: 2,
  assessment_incomplete: 3,
  student_no_assessment: 5,
  adherence_risk: 6,
};

export interface ActionQueueItem {
  priority: number;
  alertType: ActionQueueAlertType;
  studentId: string;
  studentName: string;
  assessmentId: string | null;
  assessmentType: AssessmentType | null;
  status: AssessmentStatus | null;
  assessmentDate: string | null;
}

export interface DeriveActionQueueInput {
  students: readonly CoachConsoleStudent[];
  assessments: readonly CoachConsoleAssessment[];
  responses: readonly CoachConsoleQuestionnaire[];
}

const QUESTIONNAIRE_TYPE: AssessmentType = "questionnaire_precision12";

/**
 * Fila priorizada de ação do coach. Cada assessment gera no máximo 1 item,
 * no seu maior nível de prioridade; alunos sem nenhuma assessment geram o
 * item de prioridade 5. Ordenada por prioridade asc, depois data asc.
 *
 * Nota: `links` NÃO é input aqui — o status do assessment é a fonte primária
 * de "pendência" (decisão do plano). O E4.2 usa os links só como contexto
 * visual nas linhas da fila.
 */
export function deriveActionQueue(
  input: DeriveActionQueueInput,
): ActionQueueItem[] {
  const { students, assessments, responses } = input;
  const studentById = new Map(students.map((s) => [s.id, s]));
  const responseByAssessment = new Map(
    responses.map((r) => [r.assessment_id, r]),
  );
  const items: ActionQueueItem[] = [];

  // Por assessment — no máximo 1 item, no maior nível de prioridade.
  for (const assessment of assessments) {
    const student = studentById.get(assessment.student_id);
    if (!student) continue; // assessment de aluno fora da lista (defensivo)

    const base = {
      studentId: student.id,
      studentName: student.name,
      assessmentId: assessment.id,
      assessmentType: assessment.assessment_type,
      status: assessment.status,
      assessmentDate: assessment.assessment_date,
    };
    const isQuestionnaire = assessment.assessment_type === QUESTIONNAIRE_TYPE;
    const response = responseByAssessment.get(assessment.id);

    if (
      isQuestionnaire &&
      (assessment.status === "blocked" || response?.parq_blocked === true)
    ) {
      items.push({
        ...base,
        alertType: "parq_blocked",
        priority: PRIORITY.parq_blocked,
      });
    } else if (
      isQuestionnaire &&
      assessment.status === "in_progress" &&
      !response
    ) {
      items.push({
        ...base,
        alertType: "questionnaire_pending",
        priority: PRIORITY.questionnaire_pending,
      });
    } else if (!isQuestionnaire && assessment.status === "in_progress") {
      items.push({
        ...base,
        alertType: "assessment_incomplete",
        priority: PRIORITY.assessment_incomplete,
      });
    } else if (isQuestionnaire && response) {
      const hasAdherenceRisk = deriveQuestionnaireAlerts(response).some(
        (alert) => alert.kind === "adherence_risk",
      );
      if (hasAdherenceRisk) {
        items.push({
          ...base,
          alertType: "adherence_risk",
          priority: PRIORITY.adherence_risk,
        });
      }
    }
  }

  // Por aluno — alunos Precision 12 sem nenhuma assessment.
  const studentIdsWithAssessment = new Set(
    assessments.map((a) => a.student_id),
  );
  for (const student of students) {
    if (!studentIdsWithAssessment.has(student.id)) {
      items.push({
        priority: PRIORITY.student_no_assessment,
        alertType: "student_no_assessment",
        studentId: student.id,
        studentName: student.name,
        assessmentId: null,
        assessmentType: null,
        status: null,
        assessmentDate: null,
      });
    }
  }

  // Prioridade asc; em empate, assessment mais antiga primeiro.
  return items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (a.assessmentDate ?? "").localeCompare(b.assessmentDate ?? "");
  });
}
