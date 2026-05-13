/**
 * Catálogo canônico de constantes do Questionário Precision 12 v1.
 *
 * Fonte de verdade: docs/precision12_questionnaire_v1.md (PR #124).
 * Schema destino: public.questionnaire_responses (PRs #113-#125).
 *
 * Princípios:
 *   - Todo código persistido é em inglês snake_case, ESTÁVEL entre versões.
 *   - Labels em PT vivem aqui (label visível ao aluno); banco recebe só code.
 *   - Metadata (severity, blocksTraining, requiresDetails, etc.) embarcada
 *     em opções específicas (ex: pain_status.daily tem severity 'high').
 *   - Mudar code = bump questionnaire_version + migration de dados.
 *   - Append-only: adicionar nova opção a um enum existente é forward-compat.
 *
 * Edge functions devem validar com schema equivalente em
 * `supabase/functions/_shared` ou outro módulo versionado.
 * Não manter cópias divergentes sem teste de paridade.
 */

import type { Database } from "@/integrations/supabase/types";

// ────────────────────────────────────────────────────────────────────────────
// Versão
// ────────────────────────────────────────────────────────────────────────────

export const QUESTIONNAIRE_VERSION = "precision12_v1" as const;
export type QuestionnaireVersion = typeof QUESTIONNAIRE_VERSION;

// ────────────────────────────────────────────────────────────────────────────
// Helper de tipo: opção genérica com label + code + metadata opcional
// ────────────────────────────────────────────────────────────────────────────

export interface QuestionOption<Code extends string = string> {
  /** Code estável persistido. Nunca traduzir. */
  code: Code;
  /** Label em PT-BR exibido ao aluno. Pode ser refinado sem bump de versão. */
  label: string;
  /** Metadata opcional usada por IA / UI condicional. */
  meta?: {
    /** Indica risco clínico/operacional da opção. */
    severity?: "low" | "medium" | "high";
    /** Categoria semântica auxiliar pra agrupar opções na UI. */
    category?: string;
    /** Se true, dispara `parq_blocked` ou similar (PAR-Q apenas). */
    blocksTraining?: boolean;
    /** Se true, exige campo textual adjacente (ex.: medications, medical condition). */
    requiresDetails?: boolean;
    /** Hint pra UI (ex.: ordem visual no Likert, ícone). */
    [key: string]: unknown;
  };
}

// Helper genérico: array readonly de codes a partir de array de options.
const codesOf = <T extends readonly QuestionOption[]>(opts: T) =>
  opts.map((o) => o.code) as readonly T[number]["code"][];

// ────────────────────────────────────────────────────────────────────────────
// Tela 1 — Identificação básica
// ────────────────────────────────────────────────────────────────────────────

export const GENDER_OPTIONS = [
  { code: "M", label: "Masculino" },
  { code: "F", label: "Feminino" },
] as const satisfies readonly QuestionOption[];

export const GENDER_CODES = codesOf(GENDER_OPTIONS);
export type GenderCode = (typeof GENDER_CODES)[number];

export const ROUTINE_OPTIONS = [
  { code: "sedentary_work", label: "Trabalho majoritariamente sentado" },
  { code: "active_work", label: "Trabalho com muita locomoção" },
  { code: "mixed_routine", label: "Rotina mista" },
  { code: "variable_shifts", label: "Turnos variáveis" },
  { code: "other", label: "Outro" },
] as const satisfies readonly QuestionOption[];

export const ROUTINE_CODES = codesOf(ROUTINE_OPTIONS);
export type RoutineCode = (typeof ROUTINE_CODES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Tela 2 — PAR-Q (7 perguntas booleanas; soft block)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Codes dos 7 PAR-Q (Q8-Q14 do PDF original). Cada um é mapeado pra coluna
 * boolean específica em questionnaire_responses (vide types.ts).
 *
 * Qualquer resposta `true` dispara `parq_blocked` (generated column SQL).
 */
export const PARQ_QUESTIONS = [
  {
    code: "parq_q8_heart_condition",
    label: "Algum médico já disse que você possui problema cardíaco e recomendou atividade física apenas com supervisão?",
    meta: { blocksTraining: true },
  },
  {
    code: "parq_q9_chest_pain_exercise",
    label: "Você sente ou já sentiu dor no peito ao praticar atividade física?",
    meta: { blocksTraining: true },
  },
  {
    code: "parq_q10_chest_pain_recent",
    label: "Você sentiu dor no peito no último mês?",
    meta: { blocksTraining: true },
  },
  {
    code: "parq_q11_loss_consciousness_or_dizziness_fall",
    label: "Você já perdeu a consciência ou caiu por tontura?",
    meta: { blocksTraining: true },
  },
  {
    code: "parq_q12_bone_joint",
    label: "Você possui problema ósseo ou articular que pode piorar com atividade física?",
    meta: { blocksTraining: true },
  },
  {
    code: "parq_q13_blood_pressure_meds",
    label: "Algum médico já prescreveu medicamento para pressão arterial ou coração?",
    meta: { blocksTraining: true },
  },
  {
    code: "parq_q14_other_health_reason",
    label: "Existe algum outro motivo de saúde que possa impedir sua prática segura de exercícios?",
    meta: { blocksTraining: true },
  },
] as const satisfies readonly QuestionOption[];

export const PARQ_QUESTION_CODES = codesOf(PARQ_QUESTIONS);
export type ParqQuestionCode = (typeof PARQ_QUESTION_CODES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Tela 3 — Objetivos e histórico
// ────────────────────────────────────────────────────────────────────────────

export const GOAL_OPTIONS = [
  { code: "reduce_body_fat", label: "Reduzir gordura corporal" },
  { code: "gain_muscle", label: "Ganhar massa muscular" },
  { code: "improve_performance", label: "Melhorar performance física" },
  { code: "improve_mobility", label: "Melhorar mobilidade/flexibilidade" },
  { code: "reduce_pain", label: "Reduzir dores/desconfortos" },
  { code: "improve_health_longevity", label: "Melhorar saúde geral/longevidade" },
  { code: "improve_energy_recovery", label: "Melhorar energia e recuperação" },
  { code: "other", label: "Outro" },
] as const satisfies readonly QuestionOption[];

export const GOAL_CODES = codesOf(GOAL_OPTIONS);
export type GoalCode = (typeof GOAL_CODES)[number];

/**
 * Histórico de exercícios — input do aluno. Cada code mapeia
 * deterministicamente pra `training_experience_level` + `active_last_30_days`
 * (ver `precision12QuestionnaireValidation.ts`).
 */
export const EXERCISE_HISTORY_OPTIONS = [
  {
    code: "never_regular",
    label: "Nunca treinei com regularidade",
  },
  {
    code: "stopped_more_than_1_month",
    label: "Já treinei, mas estou parado(a) há mais de 1 mês",
  },
  {
    code: "returning_less_than_1_month",
    label: "Estou voltando — treinando há menos de 1 mês",
  },
  {
    code: "regular_1_to_6_months",
    label: "Treino regularmente há 1 a 6 meses",
  },
  {
    code: "regular_6_months_to_2_years",
    label: "Treino regularmente há 6 meses a 2 anos",
  },
  {
    code: "regular_more_than_2_years",
    label: "Treino regularmente há mais de 2 anos",
  },
] as const satisfies readonly QuestionOption[];

export const EXERCISE_HISTORY_CODES = codesOf(EXERCISE_HISTORY_OPTIONS);
export type ExerciseHistoryCode = (typeof EXERCISE_HISTORY_CODES)[number];

/**
 * Likert 1-5 reutilizado em fitness_self_rating, body_satisfaction,
 * sleep_quality, stress_level, energy_level.
 */
export const LIKERT_5 = [1, 2, 3, 4, 5] as const;
export type LikertValue = (typeof LIKERT_5)[number];

// ────────────────────────────────────────────────────────────────────────────
// Tela 4 — Disponibilidade e recursos
// ────────────────────────────────────────────────────────────────────────────

export const SESSION_DURATION_OPTIONS = [
  { code: "under_30", label: "Menos de 30 min" },
  { code: "30_to_45", label: "30 a 45 min" },
  { code: "45_to_60", label: "45 a 60 min" },
  { code: "over_60", label: "Mais de 60 min" },
] as const satisfies readonly QuestionOption[];

export const SESSION_DURATION_CODES = codesOf(SESSION_DURATION_OPTIONS);
export type SessionDurationCode = (typeof SESSION_DURATION_CODES)[number];

export const WEEKLY_FREQUENCY_VALUES = [1, 2, 3, 4, 5, 6, 7] as const;
export type WeeklyFrequencyValue = (typeof WEEKLY_FREQUENCY_VALUES)[number];

/**
 * Dias da semana disponíveis pra treino (campo novo D6 da spec).
 * Diferente de `weekly_frequency` (quantidade) — aqui são QUAIS dias.
 */
export const TRAINING_AVAILABLE_DAYS_OPTIONS = [
  { code: "monday", label: "Segunda" },
  { code: "tuesday", label: "Terça" },
  { code: "wednesday", label: "Quarta" },
  { code: "thursday", label: "Quinta" },
  { code: "friday", label: "Sexta" },
  { code: "saturday", label: "Sábado" },
  { code: "sunday", label: "Domingo" },
] as const satisfies readonly QuestionOption[];

export const TRAINING_AVAILABLE_DAYS_CODES = codesOf(TRAINING_AVAILABLE_DAYS_OPTIONS);
export type TrainingAvailableDayCode = (typeof TRAINING_AVAILABLE_DAYS_CODES)[number];

export const TRAINING_PERIOD_OPTIONS = [
  { code: "morning", label: "Manhã" },
  { code: "afternoon", label: "Tarde" },
  { code: "evening", label: "Noite" },
  { code: "variable", label: "Varia muito" },
] as const satisfies readonly QuestionOption[];

export const TRAINING_PERIOD_CODES = codesOf(TRAINING_PERIOD_OPTIONS);
export type TrainingPeriodCode = (typeof TRAINING_PERIOD_CODES)[number];

/**
 * Recursos de treino fora da Fabrik (campo novo D7).
 */
export const EXTERNAL_TRAINING_RESOURCES_OPTIONS = [
  { code: "gym_near_home", label: "Academia perto de casa" },
  { code: "gym_near_work", label: "Academia perto do trabalho" },
  { code: "home_free_weights", label: "Equipamento em casa (peso livre)" },
  { code: "home_cardio", label: "Equipamento em casa (cardio)" },
  { code: "outdoor", label: "Espaços ao ar livre" },
  { code: "guided_app", label: "Aplicativo de treino guiado" },
  { code: "external_trainer", label: "Personal trainer particular" },
  { code: "none", label: "Nenhum" },
  { code: "other", label: "Outro" },
] as const satisfies readonly QuestionOption[];

export const EXTERNAL_TRAINING_RESOURCES_CODES = codesOf(EXTERNAL_TRAINING_RESOURCES_OPTIONS);
export type ExternalTrainingResourceCode = (typeof EXTERNAL_TRAINING_RESOURCES_CODES)[number];

/**
 * Maior barreira de adesão (campo novo D8). Usado pelo Coach Console como
 * flag preventivo de churn.
 */
export const PRIMARY_ADHERENCE_BARRIER_OPTIONS = [
  {
    code: "time",
    label: "Falta de tempo",
    meta: { category: "routine_stress" },
  },
  {
    code: "energy_fatigue",
    label: "Falta de energia/cansaço",
    meta: { category: "routine_stress" },
  },
  {
    code: "motivation",
    label: "Falta de motivação",
    meta: { category: "emotional" },
  },
  {
    code: "pain_discomfort",
    label: "Dor ou desconforto",
    meta: { category: "clinical" },
  },
  {
    code: "lack_of_results",
    label: "Falta de resultados visíveis",
    meta: { category: "expectations" },
  },
  {
    code: "financial_cost",
    label: "Custo financeiro",
    meta: { category: "external" },
  },
  { code: "other", label: "Outro" },
] as const satisfies readonly QuestionOption[];

export const PRIMARY_ADHERENCE_BARRIER_CODES = codesOf(PRIMARY_ADHERENCE_BARRIER_OPTIONS);
export type PrimaryAdherenceBarrierCode = (typeof PRIMARY_ADHERENCE_BARRIER_CODES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Tela 5 — Saúde, dor e medicação
// ────────────────────────────────────────────────────────────────────────────

export const PAIN_STATUS_OPTIONS = [
  {
    code: "daily",
    label: "Sim, no dia a dia",
    meta: { severity: "high", requiresDetails: true },
  },
  {
    code: "during_training",
    label: "Sim, ao treinar",
    meta: { severity: "medium", requiresDetails: true },
  },
  {
    code: "none",
    label: "Não",
    meta: { severity: "low" },
  },
] as const satisfies readonly QuestionOption[];

export const PAIN_STATUS_CODES = codesOf(PAIN_STATUS_OPTIONS);
export type PainStatusCode = (typeof PAIN_STATUS_CODES)[number];

/**
 * Codes do pain_status que disparam coleta de `pain_movements` + `pain_location`.
 * (Pra usar no schema condicional do zod.)
 */
export const PAIN_STATUS_REQUIRES_DETAILS = PAIN_STATUS_OPTIONS.filter(
  (opt) => opt.meta?.requiresDetails === true,
).map((opt) => opt.code) as readonly PainStatusCode[];

export const PAIN_MOVEMENT_OPTIONS = [
  { code: "squat_sit_stand", label: "Agachar / sentar / levantar" },
  { code: "push", label: "Empurrar" },
  { code: "pull", label: "Puxar" },
  { code: "trunk_rotation", label: "Girar o tronco" },
  { code: "run_jump", label: "Correr / pular" },
  { code: "load_bearing", label: "Sustentar carga" },
  { code: "other", label: "Outro" },
] as const satisfies readonly QuestionOption[];

export const PAIN_MOVEMENT_CODES = codesOf(PAIN_MOVEMENT_OPTIONS);
export type PainMovementCode = (typeof PAIN_MOVEMENT_CODES)[number];

export const BIGGEST_DIFFICULTY_OPTIONS = [
  { code: "time", label: "Falta de tempo" },
  { code: "lack_of_guidance", label: "Falta de orientação personalizada" },
  { code: "motivation", label: "Falta de motivação" },
  { code: "pain_discomfort", label: "Dor ou desconforto" },
  { code: "lack_of_results", label: "Falta de resultados" },
  { code: "other", label: "Outro" },
] as const satisfies readonly QuestionOption[];

export const BIGGEST_DIFFICULTY_CODES = codesOf(BIGGEST_DIFFICULTY_OPTIONS);
export type BiggestDifficultyCode = (typeof BIGGEST_DIFFICULTY_CODES)[number];

export const RECOVERY_STRATEGY_OPTIONS = [
  { code: "sauna", label: "Sauna" },
  { code: "cold_plunge", label: "Imersão em gelo" },
  { code: "breathing", label: "Exercícios de respiração" },
  { code: "meditation", label: "Meditação / mindfulness" },
  { code: "myofascial_release", label: "Liberação miofascial" },
  { code: "massage", label: "Massagem" },
  { code: "none", label: "Nenhuma" },
  { code: "other", label: "Outra" },
] as const satisfies readonly QuestionOption[];

export const RECOVERY_STRATEGY_CODES = codesOf(RECOVERY_STRATEGY_OPTIONS);
export type RecoveryStrategyCode = (typeof RECOVERY_STRATEGY_CODES)[number];

export const ALCOHOL_OPTIONS = [
  { code: "never", label: "Nunca" },
  { code: "occasional", label: "Ocasionalmente" },
  { code: "frequent", label: "Frequentemente" },
] as const satisfies readonly QuestionOption[];

export const ALCOHOL_CODES = codesOf(ALCOHOL_OPTIONS);
export type AlcoholCode = (typeof ALCOHOL_CODES)[number];

export const TOBACCO_OPTIONS = [
  { code: "none", label: "Não uso" },
  { code: "cigarette", label: "Cigarro" },
  { code: "vape", label: "Vape" },
  { code: "both", label: "Ambos" },
] as const satisfies readonly QuestionOption[];

export const TOBACCO_CODES = codesOf(TOBACCO_OPTIONS);
export type TobaccoCode = (typeof TOBACCO_CODES)[number];

export const CAFFEINE_DOSES_OPTIONS = [
  { code: "none", label: "0" },
  { code: "dose_1", label: "1" },
  { code: "dose_2", label: "2" },
  { code: "dose_3", label: "3" },
  { code: "dose_4_or_more", label: "4 ou mais" },
] as const satisfies readonly QuestionOption[];

export const CAFFEINE_DOSES_CODES = codesOf(CAFFEINE_DOSES_OPTIONS);
export type CaffeineDosesCode = (typeof CAFFEINE_DOSES_CODES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Tela 6 — Sono, recuperação e estresse
// ────────────────────────────────────────────────────────────────────────────

export const SLEEP_HOURS_OPTIONS = [
  { code: "under_5", label: "Menos de 5h" },
  { code: "5_to_6", label: "5–6h" },
  { code: "6_to_7", label: "6–7h" },
  { code: "7_to_8", label: "7–8h" },
  { code: "over_8", label: "Mais de 8h" },
] as const satisfies readonly QuestionOption[];

export const SLEEP_HOURS_CODES = codesOf(SLEEP_HOURS_OPTIONS);
export type SleepHoursCode = (typeof SLEEP_HOURS_CODES)[number];

export const RECOVERY_QUALITY_OPTIONS = [
  { code: "always", label: "Sempre" },
  { code: "most_of_time", label: "Na maioria das vezes" },
  { code: "sometimes", label: "Às vezes" },
  { code: "rarely", label: "Raramente" },
  { code: "never", label: "Não" },
] as const satisfies readonly QuestionOption[];

export const RECOVERY_QUALITY_CODES = codesOf(RECOVERY_QUALITY_OPTIONS);
export type RecoveryQualityCode = (typeof RECOVERY_QUALITY_CODES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Tela 7 — Wearable + perfil comportamental
// ────────────────────────────────────────────────────────────────────────────

/**
 * Marca de wearable. Oura é integração ativa MVP; Whoop é persistido fiel
 * (integração futura); `other` reservado pra brands fora desses 2.
 */
export const WEARABLE_BRAND_OPTIONS = [
  {
    code: "oura",
    label: "Oura Ring",
    meta: { category: "active_integration" },
  },
  {
    code: "whoop",
    label: "Whoop",
    meta: { category: "future_integration" },
  },
  {
    code: "other",
    label: "Outro",
    meta: { category: "no_integration" },
  },
] as const satisfies readonly QuestionOption[];

export const WEARABLE_BRAND_CODES = codesOf(WEARABLE_BRAND_OPTIONS);
export type WearableBrandCode = (typeof WEARABLE_BRAND_CODES)[number];

export const MOTIVATION_OPTIONS = [
  {
    code: "health_longevity",
    label: "Saúde e longevidade",
    meta: { category: "intrinsic" },
  },
  {
    code: "performance",
    label: "Performance e superação",
    meta: { category: "achievement" },
  },
  {
    code: "aesthetics",
    label: "Estética",
    meta: { category: "extrinsic" },
  },
  {
    code: "mental_clarity",
    label: "Controle do estresse / clareza mental",
    meta: { category: "wellbeing" },
  },
  {
    code: "discipline_routine",
    label: "Disciplina e rotina",
    meta: { category: "structure" },
  },
] as const satisfies readonly QuestionOption[];

export const MOTIVATION_CODES = codesOf(MOTIVATION_OPTIONS);
export type MotivationCode = (typeof MOTIVATION_CODES)[number];

export const DISCOMFORT_RESPONSE_OPTIONS = [
  { code: "avoid", label: "Evitar ao máximo" },
  { code: "endure_with_reason", label: "Aguentar se tiver um bom motivo" },
  { code: "seek_challenge", label: "Gostar do desafio e buscar isso" },
] as const satisfies readonly QuestionOption[];

export const DISCOMFORT_RESPONSE_CODES = codesOf(DISCOMFORT_RESPONSE_OPTIONS);
export type DiscomfortResponseCode = (typeof DISCOMFORT_RESPONSE_CODES)[number];

export const DIFFICULTY_HELPER_OPTIONS = [
  { code: "clear_goals", label: "Metas claras" },
  { code: "emotional_support", label: "Incentivo emocional" },
  { code: "rational_explanation", label: "Explicação racional" },
  { code: "competition", label: "Competição" },
  { code: "freedom_to_adjust", label: "Liberdade para ajustar o ritmo" },
] as const satisfies readonly QuestionOption[];

export const DIFFICULTY_HELPER_CODES = codesOf(DIFFICULTY_HELPER_OPTIONS);
export type DifficultyHelperCode = (typeof DIFFICULTY_HELPER_CODES)[number];

export const MISSED_SESSION_RESPONSE_OPTIONS = [
  {
    code: "frustrated_self_blame",
    label: "Fica frustrado(a) e se cobra",
    meta: { category: "emotional_strain" },
  },
  {
    code: "accept_understand",
    label: "Aceita e tenta entender",
    meta: { category: "resilient" },
  },
  {
    code: "discouraged_quit_thought",
    label: "Desanima e pensa em desistir",
    meta: { category: "high_risk", severity: "high" },
  },
  {
    code: "indifferent",
    label: "Não se importa muito",
    meta: { category: "low_engagement" },
  },
] as const satisfies readonly QuestionOption[];

export const MISSED_SESSION_RESPONSE_CODES = codesOf(MISSED_SESSION_RESPONSE_OPTIONS);
export type MissedSessionResponseCode = (typeof MISSED_SESSION_RESPONSE_CODES)[number];

export const FIRM_PROFESSIONAL_RESPONSE_OPTIONS = [
  { code: "increase_focus", label: "Aumentar meu foco" },
  { code: "no_difference", label: "Não fazer diferença" },
  { code: "worsen_performance", label: "Piorar meu rendimento" },
] as const satisfies readonly QuestionOption[];

export const FIRM_PROFESSIONAL_RESPONSE_CODES = codesOf(FIRM_PROFESSIONAL_RESPONSE_OPTIONS);
export type FirmProfessionalResponseCode = (typeof FIRM_PROFESSIONAL_RESPONSE_CODES)[number];

export const ACCOMPANIMENT_PREFERENCE_OPTIONS = [
  { code: "prescriptive", label: "Diga exatamente o que fazer" },
  { code: "collaborative", label: "Decida junto com você" },
  { code: "autonomous", label: "Dê mais liberdade" },
] as const satisfies readonly QuestionOption[];

export const ACCOMPANIMENT_PREFERENCE_CODES = codesOf(ACCOMPANIMENT_PREFERENCE_OPTIONS);
export type AccompanimentPreferenceCode = (typeof ACCOMPANIMENT_PREFERENCE_CODES)[number];

export const CORRECTION_PREFERENCE_OPTIONS = [
  { code: "immediate", label: "Imediatamente durante a execução" },
  { code: "after_attempt", label: "Depois de tentar" },
  { code: "on_request", label: "Só se eu perguntar" },
] as const satisfies readonly QuestionOption[];

export const CORRECTION_PREFERENCE_CODES = codesOf(CORRECTION_PREFERENCE_OPTIONS);
export type CorrectionPreferenceCode = (typeof CORRECTION_PREFERENCE_CODES)[number];

export const CONSISTENCY_SELF_RATING_OPTIONS = [
  { code: "very_consistent", label: "Muito consistente" },
  { code: "consistent_when_motivated", label: "Consistente quando motivado(a)" },
  {
    code: "inconsistent",
    label: "Inconstante",
    meta: { severity: "medium", category: "adherence_risk" },
  },
  { code: "disciplined_in_bursts", label: "Muito disciplinado(a) por períodos curtos" },
] as const satisfies readonly QuestionOption[];

export const CONSISTENCY_SELF_RATING_CODES = codesOf(CONSISTENCY_SELF_RATING_OPTIONS);
export type ConsistencySelfRatingCode = (typeof CONSISTENCY_SELF_RATING_CODES)[number];

export const LIFE_STABILITY_OPTIONS = [
  { code: "stable_organized", label: "Estável e organizada" },
  { code: "busy_controlled", label: "Corrida, mas sob controle" },
  {
    code: "chaotic",
    label: "Caótica e imprevisível",
    meta: { severity: "high", category: "external_instability" },
  },
  { code: "in_transition", label: "Em transição" },
] as const satisfies readonly QuestionOption[];

export const LIFE_STABILITY_CODES = codesOf(LIFE_STABILITY_OPTIONS);
export type LifeStabilityCode = (typeof LIFE_STABILITY_CODES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Tela 8 — Consentimento (4 checkboxes obrigatórios)
// ────────────────────────────────────────────────────────────────────────────

export const CONSENT_FLAGS = [
  {
    code: "consent_truthful",
    label: "Declaro que as informações fornecidas são verdadeiras",
  },
  {
    code: "consent_not_medical",
    label: "Estou ciente de que este programa não substitui acompanhamento médico",
  },
  {
    code: "consent_data_use",
    label: "Autorizo o uso dos meus dados para personalização do plano e acompanhamento interno da Fabrik",
  },
  {
    code: "consent_terms",
    label: "Concordo com os termos de participação do programa",
  },
] as const satisfies readonly QuestionOption[];

export const CONSENT_FLAG_CODES = codesOf(CONSENT_FLAGS);
export type ConsentFlagCode = (typeof CONSENT_FLAG_CODES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Tipo derivado pro payload de questionnaire_responses
// ────────────────────────────────────────────────────────────────────────────

/**
 * Shape do Insert/Update aceito pela tabela `questionnaire_responses`,
 * via types.ts regenerado pelo Lovable. Reexportado aqui pra evitar import
 * direto de types.ts em validation/UI.
 */
export type QuestionnaireResponseInsert =
  Database["public"]["Tables"]["questionnaire_responses"]["Insert"];

export type QuestionnaireResponseRow =
  Database["public"]["Tables"]["questionnaire_responses"]["Row"];
