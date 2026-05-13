/**
 * Validação compartilhada do Questionário Precision 12 v1 (edge functions).
 *
 * Esta é a **cópia versionada server-side** dos enums + schema Zod que
 * vivem em `src/constants/precision12Questionnaire.ts` +
 * `src/utils/precision12QuestionnaireValidation.ts`.
 *
 * Por que cópia? Deno não resolve aliases Vite (`@/...`). Manter um
 * módulo self-contained aqui evita drift de imports cruzados e mantém
 * a edge function totalmente isolada do bundle React.
 *
 * Paridade: teste `src/utils/__tests__/precision12QuestionnaireParity.test.ts`
 * lê este arquivo como texto e confirma que as listas de codes batem
 * com as do app. Mudar code aqui sem atualizar o app (ou vice-versa)
 * quebra esse teste — defesa contra drift silencioso.
 *
 * Atualizar este arquivo somente em paralelo ao app, num único PR.
 */

import { z } from "https://esm.sh/zod@3.25.76";

// ============================================================================
// CODES — devem bater com src/constants/precision12Questionnaire.ts
// ============================================================================

export const GENDER_CODES = ["M", "F"] as const;
export const ROUTINE_CODES = [
  "sedentary_work",
  "active_work",
  "mixed_routine",
  "variable_shifts",
  "other",
] as const;
export const GOAL_CODES = [
  "reduce_body_fat",
  "gain_muscle",
  "improve_performance",
  "improve_mobility",
  "reduce_pain",
  "improve_health_longevity",
  "improve_energy_recovery",
  "other",
] as const;
export const EXERCISE_HISTORY_CODES = [
  "never_regular",
  "stopped_more_than_1_month",
  "returning_less_than_1_month",
  "regular_1_to_6_months",
  "regular_6_months_to_2_years",
  "regular_more_than_2_years",
] as const;
export const SESSION_DURATION_CODES = ["under_30", "30_to_45", "45_to_60", "over_60"] as const;
export const TRAINING_AVAILABLE_DAYS_CODES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export const TRAINING_PERIOD_CODES = ["morning", "afternoon", "evening", "variable"] as const;
export const EXTERNAL_TRAINING_RESOURCES_CODES = [
  "gym_near_home",
  "gym_near_work",
  "home_free_weights",
  "home_cardio",
  "outdoor",
  "guided_app",
  "external_trainer",
  "none",
  "other",
] as const;
export const PRIMARY_ADHERENCE_BARRIER_CODES = [
  "time",
  "energy_fatigue",
  "motivation",
  "pain_discomfort",
  "lack_of_results",
  "financial_cost",
  "other",
] as const;
export const PAIN_STATUS_CODES = ["daily", "during_training", "none"] as const;
export const PAIN_STATUS_REQUIRES_DETAILS = ["daily", "during_training"] as const;
export const PAIN_MOVEMENT_CODES = [
  "squat_sit_stand",
  "push",
  "pull",
  "trunk_rotation",
  "run_jump",
  "load_bearing",
  "other",
] as const;
export const BIGGEST_DIFFICULTY_CODES = [
  "time",
  "lack_of_guidance",
  "motivation",
  "pain_discomfort",
  "lack_of_results",
  "other",
] as const;
export const RECOVERY_STRATEGY_CODES = [
  "sauna",
  "cold_plunge",
  "breathing",
  "meditation",
  "myofascial_release",
  "massage",
  "none",
  "other",
] as const;
export const ALCOHOL_CODES = ["never", "occasional", "frequent"] as const;
export const TOBACCO_CODES = ["none", "cigarette", "vape", "both"] as const;
export const CAFFEINE_DOSES_CODES = ["none", "dose_1", "dose_2", "dose_3", "dose_4_or_more"] as const;
export const SLEEP_HOURS_CODES = ["under_5", "5_to_6", "6_to_7", "7_to_8", "over_8"] as const;
export const RECOVERY_QUALITY_CODES = [
  "always",
  "most_of_time",
  "sometimes",
  "rarely",
  "never",
] as const;
export const WEARABLE_BRAND_CODES = ["oura", "whoop", "other"] as const;
export const MOTIVATION_CODES = [
  "health_longevity",
  "performance",
  "aesthetics",
  "mental_clarity",
  "discipline_routine",
] as const;
export const DISCOMFORT_RESPONSE_CODES = ["avoid", "endure_with_reason", "seek_challenge"] as const;
export const DIFFICULTY_HELPER_CODES = [
  "clear_goals",
  "emotional_support",
  "rational_explanation",
  "competition",
  "freedom_to_adjust",
] as const;
export const MISSED_SESSION_RESPONSE_CODES = [
  "frustrated_self_blame",
  "accept_understand",
  "discouraged_quit_thought",
  "indifferent",
] as const;
export const FIRM_PROFESSIONAL_RESPONSE_CODES = [
  "increase_focus",
  "no_difference",
  "worsen_performance",
] as const;
export const ACCOMPANIMENT_PREFERENCE_CODES = [
  "prescriptive",
  "collaborative",
  "autonomous",
] as const;
export const CORRECTION_PREFERENCE_CODES = ["immediate", "after_attempt", "on_request"] as const;
export const CONSISTENCY_SELF_RATING_CODES = [
  "very_consistent",
  "consistent_when_motivated",
  "inconsistent",
  "disciplined_in_bursts",
] as const;
export const LIFE_STABILITY_CODES = [
  "stable_organized",
  "busy_controlled",
  "chaotic",
  "in_transition",
] as const;

// ============================================================================
// Helpers de schema
// ============================================================================

const optionalText = (max: number) =>
  z.preprocess(
    (val) => {
      if (val === null || val === undefined) return undefined;
      const trimmed = String(val).trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z.string().max(max).optional(),
  );

const requiredText = (max: number, msg = "Campo obrigatório") =>
  z.preprocess(
    (val) => (typeof val === "string" ? val.trim() : val),
    z.string().min(1, msg).max(max),
  );

const codeEnum = <T extends readonly [string, ...string[]]>(codes: T) =>
  z.enum(codes);

const codeArrayUnique = <T extends readonly [string, ...string[]]>(codes: T) =>
  z
    .array(codeEnum(codes))
    .refine((arr) => new Set(arr).size === arr.length, "Não é permitido repetir opções");

// ============================================================================
// Schema base
// ============================================================================

const baseSchema = z.object({
  // Tela 1
  full_name: requiredText(200, "Nome obrigatório"),
  email: requiredText(200).pipe(z.string().email("E-mail inválido")),
  phone: requiredText(50),
  birthdate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    .optional(),
  gender: codeEnum(GENDER_CODES as readonly [string, ...string[]]),
  profession: optionalText(200),
  routine: codeEnum(ROUTINE_CODES as readonly [string, ...string[]]),

  // Tela 2 — PAR-Q
  parq_q8_heart_condition: z.boolean(),
  parq_q9_chest_pain_exercise: z.boolean(),
  parq_q10_chest_pain_recent: z.boolean(),
  parq_q11_loss_consciousness_or_dizziness_fall: z.boolean(),
  parq_q12_bone_joint: z.boolean(),
  parq_q13_blood_pressure_meds: z.boolean(),
  parq_q14_other_health_reason: z.boolean(),

  // Tela 3
  goals: codeArrayUnique(GOAL_CODES as readonly [string, ...string[]])
    .pipe(z.array(z.string()).min(1).max(2)),
  goal_details: optionalText(2000),
  previous_attempts: optionalText(2000),
  exercise_history: codeEnum(EXERCISE_HISTORY_CODES as readonly [string, ...string[]]),
  fitness_self_rating: z.number().int().min(1).max(5),
  body_satisfaction: z.number().int().min(1).max(5),

  // Tela 4
  session_duration: codeEnum(SESSION_DURATION_CODES as readonly [string, ...string[]]),
  weekly_frequency: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
  ]),
  training_available_days: codeArrayUnique(
    TRAINING_AVAILABLE_DAYS_CODES as readonly [string, ...string[]],
  ).pipe(z.array(z.string()).min(1)),
  training_period: codeEnum(TRAINING_PERIOD_CODES as readonly [string, ...string[]]),
  frequent_traveler: z.boolean(),
  external_training_resources: codeArrayUnique(
    EXTERNAL_TRAINING_RESOURCES_CODES as readonly [string, ...string[]],
  ).optional(),
  routine_description: optionalText(2000),
  primary_adherence_barrier: codeEnum(
    PRIMARY_ADHERENCE_BARRIER_CODES as readonly [string, ...string[]],
  ),

  // Tela 5
  pain_status: codeEnum(PAIN_STATUS_CODES as readonly [string, ...string[]]),
  pain_movements: codeArrayUnique(
    PAIN_MOVEMENT_CODES as readonly [string, ...string[]],
  ).optional(),
  pain_location: optionalText(500),
  biggest_difficulty: codeArrayUnique(
    BIGGEST_DIFFICULTY_CODES as readonly [string, ...string[]],
  ).optional(),
  has_medical_condition: z.boolean(),
  medical_condition_details: optionalText(2000),
  uses_medications: z.boolean(),
  medications_continuous: optionalText(2000),
  injury_surgery_history: optionalText(2000),
  recovery_strategies: codeArrayUnique(
    RECOVERY_STRATEGY_CODES as readonly [string, ...string[]],
  ).optional(),
  alcohol: codeEnum(ALCOHOL_CODES as readonly [string, ...string[]]).optional(),
  tobacco: codeEnum(TOBACCO_CODES as readonly [string, ...string[]]).optional(),
  caffeine_doses: codeEnum(CAFFEINE_DOSES_CODES as readonly [string, ...string[]]).optional(),

  // Tela 6
  sleep_hours: codeEnum(SLEEP_HOURS_CODES as readonly [string, ...string[]]),
  sleep_quality: z.number().int().min(1).max(5),
  stress_level: z.number().int().min(1).max(5),
  energy_level: z.number().int().min(1).max(5),
  recovery_quality: codeEnum(RECOVERY_QUALITY_CODES as readonly [string, ...string[]]),

  // Tela 7
  uses_wearable: z.boolean(),
  wearable_brand: codeEnum(WEARABLE_BRAND_CODES as readonly [string, ...string[]]).optional(),
  share_data: z.boolean().optional(),
  motivations: codeArrayUnique(MOTIVATION_CODES as readonly [string, ...string[]])
    .pipe(z.array(z.string()).min(1).max(2)),
  discomfort_response: codeEnum(DISCOMFORT_RESPONSE_CODES as readonly [string, ...string[]]),
  difficulty_helper: codeEnum(DIFFICULTY_HELPER_CODES as readonly [string, ...string[]]),
  missed_session_response: codeEnum(
    MISSED_SESSION_RESPONSE_CODES as readonly [string, ...string[]],
  ),
  firm_professional_response: codeEnum(
    FIRM_PROFESSIONAL_RESPONSE_CODES as readonly [string, ...string[]],
  ),
  accompaniment_preference: codeEnum(
    ACCOMPANIMENT_PREFERENCE_CODES as readonly [string, ...string[]],
  ),
  correction_preference: codeEnum(CORRECTION_PREFERENCE_CODES as readonly [string, ...string[]]),
  consistency_self_rating: codeEnum(
    CONSISTENCY_SELF_RATING_CODES as readonly [string, ...string[]],
  ),
  life_stability: codeEnum(LIFE_STABILITY_CODES as readonly [string, ...string[]]),
  deal_breaker: optionalText(2000),

  // Tela 8 — consentimentos (literal true)
  consent_truthful: z.literal(true),
  consent_not_medical: z.literal(true),
  consent_data_use: z.literal(true),
  consent_terms: z.literal(true),
});

export type Precision12SubmitInput = z.infer<typeof baseSchema>;

// ============================================================================
// Schema com superRefine (mesmas 6 condicionais do app)
// ============================================================================

export const precision12SubmitSchema = baseSchema.superRefine((data, ctx) => {
  // pain_status ≠ none → exige movements + location
  if ((PAIN_STATUS_REQUIRES_DETAILS as readonly string[]).includes(data.pain_status)) {
    const hasMovements =
      Array.isArray(data.pain_movements) && data.pain_movements.length > 0;
    const hasLocation = !!data.pain_location && data.pain_location.length > 0;
    if (!hasMovements) {
      ctx.addIssue({
        code: "custom",
        path: ["pain_movements"],
        message: "Selecione pelo menos um movimento que causa dor",
      });
    }
    if (!hasLocation) {
      ctx.addIssue({
        code: "custom",
        path: ["pain_location"],
        message: "Descreva o local da dor",
      });
    }
  }

  if (data.has_medical_condition && !data.medical_condition_details) {
    ctx.addIssue({
      code: "custom",
      path: ["medical_condition_details"],
      message: "Descreva a condição médica",
    });
  }

  if (data.uses_medications && !data.medications_continuous) {
    ctx.addIssue({
      code: "custom",
      path: ["medications_continuous"],
      message: "Liste os medicamentos contínuos",
    });
  }

  if (data.uses_wearable && !data.wearable_brand) {
    ctx.addIssue({
      code: "custom",
      path: ["wearable_brand"],
      message: "Informe qual dispositivo",
    });
  }

  // `none` exclusivo em external_training_resources
  if (
    Array.isArray(data.external_training_resources) &&
    data.external_training_resources.includes("none") &&
    data.external_training_resources.length > 1
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["external_training_resources"],
      message: "Se selecionar 'Nenhum', não marque outras opções",
    });
  }

  // `none` exclusivo em recovery_strategies
  if (
    Array.isArray(data.recovery_strategies) &&
    data.recovery_strategies.includes("none") &&
    data.recovery_strategies.length > 1
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["recovery_strategies"],
      message: "Se selecionar 'Nenhuma', não marque outras opções",
    });
  }
});

// ============================================================================
// Normalização (espelha src/utils/precision12QuestionnaireValidation.ts)
// ============================================================================

const nullIfEmpty = (v: string | null | undefined): string | null =>
  !v || v.trim() === "" ? null : v.trim();

const nullIfEmptyArray = <T>(arr: T[] | null | undefined): T[] | null =>
  !arr || arr.length === 0 ? null : arr;

/**
 * Limpa input validado pra payload jsonb pronto pra ser enviado ao RPC
 * `submit_precision12_questionnaire_response`. RPC injeta
 * assessment_id, questionnaire_version e submitted_at server-side.
 *
 * `parq_blocked`, `created_at`, `updated_at`, `submitted_at` NUNCA vão
 * no payload — todos são generated/server-side. RPC remove explicitamente
 * (defesa em profundidade).
 */
export function normalizeForSubmit(input: Precision12SubmitInput): Record<string, unknown> {
  const painRequiresDetails = (PAIN_STATUS_REQUIRES_DETAILS as readonly string[]).includes(
    input.pain_status,
  );

  return {
    full_name: input.full_name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    birthdate: input.birthdate ?? null,
    gender: input.gender,
    profession: nullIfEmpty(input.profession ?? null),
    routine: input.routine,

    parq_q8_heart_condition: input.parq_q8_heart_condition,
    parq_q9_chest_pain_exercise: input.parq_q9_chest_pain_exercise,
    parq_q10_chest_pain_recent: input.parq_q10_chest_pain_recent,
    parq_q11_loss_consciousness_or_dizziness_fall:
      input.parq_q11_loss_consciousness_or_dizziness_fall,
    parq_q12_bone_joint: input.parq_q12_bone_joint,
    parq_q13_blood_pressure_meds: input.parq_q13_blood_pressure_meds,
    parq_q14_other_health_reason: input.parq_q14_other_health_reason,

    goals: input.goals,
    goal_details: nullIfEmpty(input.goal_details ?? null),
    previous_attempts: nullIfEmpty(input.previous_attempts ?? null),
    exercise_history: input.exercise_history,
    fitness_self_rating: input.fitness_self_rating,
    body_satisfaction: input.body_satisfaction,

    session_duration: input.session_duration,
    weekly_frequency: input.weekly_frequency,
    training_available_days: input.training_available_days,
    training_period: input.training_period,
    frequent_traveler: input.frequent_traveler,
    external_training_resources: nullIfEmptyArray(input.external_training_resources ?? null),
    routine_description: nullIfEmpty(input.routine_description ?? null),
    primary_adherence_barrier: input.primary_adherence_barrier,

    pain_status: input.pain_status,
    pain_movements: painRequiresDetails
      ? nullIfEmptyArray(input.pain_movements ?? null)
      : null,
    pain_location: painRequiresDetails ? nullIfEmpty(input.pain_location ?? null) : null,
    biggest_difficulty: nullIfEmptyArray(input.biggest_difficulty ?? null),
    has_medical_condition: input.has_medical_condition,
    medical_condition_details: input.has_medical_condition
      ? nullIfEmpty(input.medical_condition_details ?? null)
      : null,
    uses_medications: input.uses_medications,
    medications_continuous: input.uses_medications
      ? nullIfEmpty(input.medications_continuous ?? null)
      : null,
    injury_surgery_history: nullIfEmpty(input.injury_surgery_history ?? null),
    recovery_strategies: nullIfEmptyArray(input.recovery_strategies ?? null),
    alcohol: input.alcohol ?? null,
    tobacco: input.tobacco ?? null,
    caffeine_doses: input.caffeine_doses ?? null,

    sleep_hours: input.sleep_hours,
    sleep_quality: input.sleep_quality,
    stress_level: input.stress_level,
    energy_level: input.energy_level,
    recovery_quality: input.recovery_quality,

    uses_wearable: input.uses_wearable,
    wearable_brand: input.uses_wearable ? input.wearable_brand ?? null : null,
    share_data: input.uses_wearable ? input.share_data ?? null : null,
    motivations: input.motivations,
    discomfort_response: input.discomfort_response,
    difficulty_helper: input.difficulty_helper,
    missed_session_response: input.missed_session_response,
    firm_professional_response: input.firm_professional_response,
    accompaniment_preference: input.accompaniment_preference,
    correction_preference: input.correction_preference,
    consistency_self_rating: input.consistency_self_rating,
    life_stability: input.life_stability,
    deal_breaker: nullIfEmpty(input.deal_breaker ?? null),

    consent_truthful: input.consent_truthful,
    consent_not_medical: input.consent_not_medical,
    consent_data_use: input.consent_data_use,
    consent_terms: input.consent_terms,
  };
}
