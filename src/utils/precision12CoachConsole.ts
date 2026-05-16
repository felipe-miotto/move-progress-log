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

export interface CoachConsoleVo2Result {
  assessment_id: string;
  vo2_final: number | null;
  vo2_classification: string | null;
  recovery_drop_1min: number | null;
  recovery_classification: string | null;
}

export interface CoachConsoleHandgripResult {
  assessment_id: string;
  best_kg: number | null;
  classification: string | null;
}

export interface CoachConsoleSitToStandResult {
  assessment_id: string;
  total_score: number | null;
  classification: string | null;
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

/**
 * Subset de `dexa_results` lido pelo Coach Console — apenas as colunas
 * usadas para decidir se o alerta DEXA #4 (E4.6) deve aparecer. O schema
 * real (vide migration `*_precision12_assessment_foundation.sql`) tem
 * mais colunas (z_score, percentile, raw_extracted_json etc.) que não
 * são essenciais pra triagem operacional.
 *
 * `regional_distribution` é JSONB no banco; tratamos como `unknown` pra
 * não acoplar a estrutura JSON. A spec do E4.6 explicita que esse campo
 * NÃO é obrigatório.
 */
export interface CoachConsoleDexaResult {
  assessment_id: string;
  fat_mass_kg: number | null;
  fat_pct: number | null;
  lean_mass_kg: number | null;
  visceral_fat_g: number | null;
  android_gynoid_ratio: number | null;
  appendicular_lean_mass_kg: number | null;
  imma_baumgartner: number | null;
  fmi: number | null;
  bmr_harris_benedict_kcal: number | null;
  bmr_mifflin_stjeor_kcal: number | null;
  conclusion_text: string | null;
  scan_pdf_storage_path: string | null;
  scan_pdf_url: string | null;
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
 * Tipos de alerta da fila. Prioridade #4 (`dexa_pending`) foi adicionada
 * pelo E4.6 — depende de `dexa_results` e fica entre `assessment_incomplete`
 * (#3) e `student_no_assessment` (#5).
 */
export type ActionQueueAlertType =
  | "parq_blocked" //          prioridade 1
  | "questionnaire_pending" // prioridade 2
  | "assessment_incomplete" // prioridade 3
  | "dexa_pending" //          prioridade 4
  | "student_no_assessment" // prioridade 5
  | "adherence_risk"; //       prioridade 6

const PRIORITY: Record<ActionQueueAlertType, number> = {
  parq_blocked: 1,
  questionnaire_pending: 2,
  assessment_incomplete: 3,
  dexa_pending: 4,
  student_no_assessment: 5,
  adherence_risk: 6,
};

/**
 * Sub-razão do alerta `dexa_pending` (E4.6). Mapeada pela UI pra microcopy
 * dinâmica ("DEXA aguardando laudo" / "DEXA sem PDF anexado" / "DEXA
 * incompleto"). `null` no derive significa "sem alerta".
 */
export type DexaPendingReason =
  | "awaiting_pdf_and_data" //   sem row em dexa_results
  | "missing_pdf" //             tem row, mas sem PDF
  | "incomplete_data"; //        tem PDF, mas faltam campos essenciais

export interface ActionQueueItem {
  priority: number;
  alertType: ActionQueueAlertType;
  studentId: string;
  studentName: string;
  assessmentId: string | null;
  assessmentType: AssessmentType | null;
  status: AssessmentStatus | null;
  assessmentDate: string | null;
  /**
   * Preenchido somente em itens `dexa_pending` (E4.6). Para outros
   * alertTypes, `null`. Permite a UI escolher a microcopy correta sem
   * recomputar a razão do alerta.
   */
  dexaPendingReason?: DexaPendingReason | null;
}

export interface DeriveActionQueueInput {
  students: readonly CoachConsoleStudent[];
  assessments: readonly CoachConsoleAssessment[];
  responses: readonly CoachConsoleQuestionnaire[];
  /**
   * E4.6 — opcional pra compatibilidade. Quando ausente/undefined, os
   * alertas `dexa_pending` continuam sendo emitidos com razão
   * `awaiting_pdf_and_data` (mais conservador: trata como se nenhum
   * `dexa_results` existisse).
   */
  dexaResults?: readonly CoachConsoleDexaResult[];
}

const QUESTIONNAIRE_TYPE: AssessmentType = "questionnaire_precision12";
const DEXA_TYPE: AssessmentType = "dexa";

/**
 * Campos essenciais de `dexa_results` para considerar a avaliação "documentada"
 * (E4.6 spec). `regional_distribution` foi propositalmente NÃO incluído nesta
 * etapa — fica como melhoria futura quando o fluxo de extração JSON estiver
 * estável. PDF é tratado separadamente em `hasDexaPdf`.
 */
const DEXA_ESSENTIAL_NUMERIC_FIELDS = [
  "fat_mass_kg",
  "fat_pct",
  "lean_mass_kg",
  "visceral_fat_g",
  "android_gynoid_ratio",
  "appendicular_lean_mass_kg",
  "imma_baumgartner",
  "fmi",
  "bmr_harris_benedict_kcal",
  "bmr_mifflin_stjeor_kcal",
] as const satisfies readonly (keyof CoachConsoleDexaResult)[];

function hasDexaPdf(result: CoachConsoleDexaResult): boolean {
  const path = result.scan_pdf_storage_path?.trim() ?? "";
  const url = result.scan_pdf_url?.trim() ?? "";
  return path.length > 0 || url.length > 0;
}

function hasDexaEssentialData(result: CoachConsoleDexaResult): boolean {
  for (const field of DEXA_ESSENTIAL_NUMERIC_FIELDS) {
    const value = result[field];
    if (value === null || value === undefined) return false;
  }
  const conclusion = result.conclusion_text?.trim() ?? "";
  if (conclusion.length === 0) return false;
  return true;
}

/**
 * Decide se uma avaliação DEXA precisa de atenção do coach.
 *
 * Casos (E4.6 spec):
 *   - Sem `dexa_results` → `"awaiting_pdf_and_data"` (laudo nunca chegou).
 *   - Com row, sem PDF (nenhum dos dois campos) → `"missing_pdf"`.
 *   - Com PDF, faltando campos essenciais → `"incomplete_data"`.
 *   - Tudo presente → `null` (sem alerta).
 *
 * PDF tem precedência sobre dados: se faltar PDF, o reason é
 * `"missing_pdf"` mesmo que os dados também estejam faltando — o coach
 * resolve o PDF primeiro e o resto pode estar lá ou virá com ele.
 */
export function deriveDexaPendingReason(
  result: CoachConsoleDexaResult | null | undefined,
): DexaPendingReason | null {
  if (!result) return "awaiting_pdf_and_data";
  if (!hasDexaPdf(result)) return "missing_pdf";
  if (!hasDexaEssentialData(result)) return "incomplete_data";
  return null;
}

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
  const { students, assessments, responses, dexaResults } = input;
  const studentById = new Map(students.map((s) => [s.id, s]));
  const responseByAssessment = new Map(
    responses.map((r) => [r.assessment_id, r]),
  );
  const dexaResultByAssessment = new Map(
    (dexaResults ?? []).map((r) => [r.assessment_id, r]),
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
    const isDexa = assessment.assessment_type === DEXA_TYPE;
    const response = responseByAssessment.get(assessment.id);

    if (
      isQuestionnaire &&
      (assessment.status === "blocked" || response?.parq_blocked === true)
    ) {
      items.push({
        ...base,
        alertType: "parq_blocked",
        priority: PRIORITY.parq_blocked,
        dexaPendingReason: null,
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
        dexaPendingReason: null,
      });
    } else if (isDexa && assessment.status === "in_progress") {
      // E4.6 — DEXA in_progress recebe alerta especializado dexa_pending
      // (prio 4) com razão dinâmica, em vez do genérico assessment_incomplete.
      // Quando o assessment está documentado por completo, deriveDexaPendingReason
      // retorna null → nenhum item é emitido (mesmo com status in_progress, a UI
      // pode considerar concluído pendendo só de marcação manual; sem alerta
      // operacional). `aborted`/`completed` nunca caem aqui.
      const reason = deriveDexaPendingReason(
        dexaResultByAssessment.get(assessment.id),
      );
      if (reason !== null) {
        items.push({
          ...base,
          alertType: "dexa_pending",
          priority: PRIORITY.dexa_pending,
          dexaPendingReason: reason,
        });
      }
    } else if (!isQuestionnaire && assessment.status === "in_progress") {
      items.push({
        ...base,
        alertType: "assessment_incomplete",
        priority: PRIORITY.assessment_incomplete,
        dexaPendingReason: null,
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
          dexaPendingReason: null,
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
        dexaPendingReason: null,
      });
    }
  }

  // Prioridade asc; em empate, assessment mais antiga primeiro.
  return items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (a.assessmentDate ?? "").localeCompare(b.assessmentDate ?? "");
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Filtros operacionais (E4.3a)
//
// Funções puras de filtragem usadas pela UI do Coach Console.
// Princípio: KPIs permanecem GLOBAIS (não filtrados); só a fila de ação e a
// tabela de progresso por aluno respondem aos filtros — assim o coach ainda
// enxerga o panorama enquanto investiga subconjuntos.
// ────────────────────────────────────────────────────────────────────────────

/** Filtro por status agregado na tabela de progresso. */
export type ProgressStatusFilter =
  | "all"
  | "no_completed" //   aluno sem nenhuma categoria `done`
  | "anamnese_done" //  aluno com Anamnese `done`
  | "parq_blocked"; //  aluno com algum item parq_blocked na fila

export interface Precision12Filters {
  /** Busca textual por nome do aluno (case/diacritic-insensitive). */
  searchQuery: string;
  /** Filtro do tipo de alerta na fila. `all` mostra todos. */
  alertType: ActionQueueAlertType | "all";
  /** Filtro do status agregado na tabela de progresso. */
  progressStatus: ProgressStatusFilter;
  /** Quando true, oculta alunos de teste/smoke (default). */
  hideTestData: boolean;
}

/**
 * Default operacional: smoke oculto. Coach normalmente trabalha em produção;
 * quem precisa ver smoke (QA, dev) liga o toggle.
 */
export const DEFAULT_PRECISION12_FILTERS: Precision12Filters = {
  searchQuery: "",
  alertType: "all",
  progressStatus: "all",
  hideTestData: true,
};

/**
 * Heurística pra identificar aluno de smoke/teste. Match em prefixo `SMOKE `,
 * `TEST ` ou `[TEST]`, e em substring `SMOKE E3` (legado do E3 cleanup).
 * Conservadora — só nomes que o coach reconhece como teste.
 */
export function isSmokeStudent(student: { name: string }): boolean {
  const name = (student.name ?? "").trim();
  if (name.length === 0) return false;
  const upper = name.toUpperCase();
  return (
    upper.startsWith("SMOKE ") ||
    upper.startsWith("TEST ") ||
    upper.startsWith("[TEST]") ||
    upper.includes("SMOKE E3")
  );
}

/**
 * Conta quantos alunos de smoke estariam visíveis se o toggle estivesse
 * desligado. Usado pelo banner "Dados de teste ocultos: N".
 */
export function countHiddenSmokeStudents(
  students: readonly CoachConsoleStudent[],
  hideTestData: boolean,
): number {
  if (!hideTestData) return 0;
  return students.reduce(
    (acc, s) => (isSmokeStudent(s) ? acc + 1 : acc),
    0,
  );
}

/**
 * Normaliza texto pra busca tolerante a acentos/caixa.
 * Ex.: "João" e "JOAO" batem na mesma query "joao".
 */
function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Filtra a fila de ação aplicando os filtros do console. */
export function filterActionQueue(
  items: readonly ActionQueueItem[],
  filters: Precision12Filters,
  studentsById?: ReadonlyMap<string, CoachConsoleStudent>,
): ActionQueueItem[] {
  const needle = normalizeForSearch(filters.searchQuery);
  return items.filter((item) => {
    if (filters.alertType !== "all" && item.alertType !== filters.alertType) {
      return false;
    }
    if (filters.hideTestData) {
      // Tenta resolver via mapa de alunos (mais confiável que name match).
      const student = studentsById?.get(item.studentId);
      const reference = student ?? { name: item.studentName };
      if (isSmokeStudent(reference)) return false;
    }
    if (needle.length > 0) {
      const hay = normalizeForSearch(item.studentName);
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * Aplica filtros à lista de alunos pra tabela de progresso.
 * O filtro `progressStatus` exige cruzar com `studentProgress` (no_completed,
 * anamnese_done) e `actionQueue` (parq_blocked).
 */
export function filterStudentsForProgress(
  students: readonly CoachConsoleStudent[],
  studentProgress: readonly StudentProgress[],
  actionQueue: readonly ActionQueueItem[],
  filters: Precision12Filters,
): CoachConsoleStudent[] {
  const needle = normalizeForSearch(filters.searchQuery);
  const progressById = new Map(studentProgress.map((p) => [p.studentId, p]));
  const parqBlockedIds = new Set(
    actionQueue
      .filter((item) => item.alertType === "parq_blocked")
      .map((item) => item.studentId),
  );

  return students.filter((student) => {
    if (filters.hideTestData && isSmokeStudent(student)) return false;
    if (needle.length > 0) {
      if (!normalizeForSearch(student.name).includes(needle)) return false;
    }
    if (filters.progressStatus !== "all") {
      const p = progressById.get(student.id);
      if (filters.progressStatus === "no_completed") {
        if (!p || p.completedCategories > 0) return false;
      } else if (filters.progressStatus === "anamnese_done") {
        if (!p || p.categories["Anamnese"] !== "done") return false;
      } else if (filters.progressStatus === "parq_blocked") {
        if (!parqBlockedIds.has(student.id)) return false;
      }
    }
    return true;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Deep links read-only (E4.3b)
//
// O Coach Console abre o aluno em `/alunos/:id` — esse helper monta a URL
// já no contexto da aba "Avaliações", opcionalmente sinalizando qual
// `assessmentId` deve abrir/destacar. Read-only, sem mutation: só compõe
// uma URL determinística pra `react-router-dom`.
// ────────────────────────────────────────────────────────────────────────────

/** Aba do StudentDetailPage que abre direto no contexto Precision 12. */
export const PRECISION12_ASSESSMENTS_TAB = "assessments" as const;

/**
 * URL canônica pra abrir um aluno (E4.3b) no Coach Console.
 *
 * Formato:
 *   /alunos/<studentId>?tab=assessments
 *   /alunos/<studentId>?tab=assessments&assessmentId=<uuid>
 *
 * `assessmentId` é opcional: só sai na URL quando há um item específico de
 * fila relacionado a uma assessment (parq_blocked, questionnaire_pending,
 * assessment_incomplete, adherence_risk). CTAs por aluno (tabela de
 * progresso) emitem só `tab=assessments`.
 */
export function buildPrecision12StudentDeepLink(
  studentId: string,
  assessmentId: string | null | undefined = null,
): string {
  const params = new URLSearchParams({ tab: PRECISION12_ASSESSMENTS_TAB });
  if (assessmentId) params.set("assessmentId", assessmentId);
  return `/alunos/${studentId}?${params.toString()}`;
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Elegibilidade pra reissue de link de questionário (E4.4)
//
// Espelha o invariante server-side da edge function
// `create-precision12-questionnaire-link`: `REISSUABLE_STATUSES =
// {"in_progress"}` (PR #136). Quem é elegível no client:
//
//   - alertType === "questionnaire_pending"          (sinal da fila)
//   - assessmentType === "questionnaire_precision12" (tipo certo)
//   - status === "in_progress"                       (server topa)
//   - assessmentId !== null                          (precisa pra reusar)
//
// `parq_blocked` (status `blocked`), `completed` e `aborted` ficam de fora —
// o edge function recusa, e a UI também deve recusar pra não acender botão
// que dá erro. Itens `student_no_assessment` também não, pois não há
// assessment pra reemitir.
// ────────────────────────────────────────────────────────────────────────────

const QUESTIONNAIRE_ASSESSMENT_TYPE: AssessmentType = "questionnaire_precision12";

/**
 * Defesa em profundidade: a edge function já tem o guard correto, mas o
 * client filtra antes de tentar pra não mostrar uma ação que vai falhar.
 */
export function canReissueQuestionnaireLink(item: ActionQueueItem): boolean {
  return (
    item.alertType === "questionnaire_pending" &&
    item.assessmentType === QUESTIONNAIRE_ASSESSMENT_TYPE &&
    item.status === "in_progress" &&
    item.assessmentId !== null
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 8. Revogação manual de link (E4.5)
//
// Espelha o invariante do schema: link ativo = `used_at IS NULL AND
// revoked_at IS NULL AND expires_at > now()`. Cliente computa o conjunto
// de assessment_ids com link ativo a partir do snapshot já fetchado por
// `usePrecision12CoachConsole`, sem segunda query.
//
// `canRevokeQuestionnaireLink` é defesa em profundidade do guard server-side
// (`REVOCABLE_ASSESSMENT_STATUSES = {"in_progress"}` em
// `revoke-precision12-questionnaire-link/index.ts`).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Filtra os links fetched pelo hook e retorna o conjunto de `assessment_id`
 * com link ATIVO (não usado, não revogado, não expirado). `now` é injetável
 * pra teste determinístico.
 */
export function deriveActiveLinkAssessmentIds(
  links: readonly CoachConsoleLink[],
  now: Date = new Date(),
): Set<string> {
  const ids = new Set<string>();
  const nowMs = now.getTime();
  for (const link of links) {
    if (link.used_at !== null) continue;
    if (link.revoked_at !== null) continue;
    // expires_at é NOT NULL no schema, mas tolerante a string vazia.
    const expiresMs = Date.parse(link.expires_at);
    if (Number.isNaN(expiresMs) || expiresMs <= nowMs) continue;
    ids.add(link.assessment_id);
  }
  return ids;
}

/**
 * Critérios pra exibir "Revogar link":
 *   - item é alerta de questionário pendente (alertType `questionnaire_pending`)
 *   - assessment é do tipo `questionnaire_precision12`
 *   - status do assessment é `in_progress`
 *   - existe assessmentId
 *   - existe LINK ATIVO pra esse assessmentId (não usado, não revogado, não expirado)
 *
 * Diferença em relação a `canReissueQuestionnaireLink`: reissue funciona
 * mesmo sem link ativo (a edge cria um do zero); revoke só faz sentido se
 * há algo pra revogar.
 */
export function canRevokeQuestionnaireLink(
  item: ActionQueueItem,
  activeLinkAssessmentIds: ReadonlySet<string>,
): boolean {
  if (item.alertType !== "questionnaire_pending") return false;
  if (item.assessmentType !== QUESTIONNAIRE_ASSESSMENT_TYPE) return false;
  if (item.status !== "in_progress") return false;
  if (item.assessmentId === null) return false;
  return activeLinkAssessmentIds.has(item.assessmentId);
}
