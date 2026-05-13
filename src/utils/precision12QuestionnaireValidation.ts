/**
 * Validação e helpers do Questionário Precision 12 v1.
 *
 * Estrutura:
 *   1. Helpers de schema (texto livre, código de enum, etc.)
 *   2. Schemas Zod parciais por tela (8 telas)
 *   3. Schema principal `precision12QuestionnaireSchema` (input do form)
 *   4. 4 derivações canônicas obrigatórias:
 *       - deriveTrainingExperienceLevel
 *       - deriveActiveLast30Days
 *       - deriveParqBlocked
 *       - normalizeQuestionnairePayload
 *
 * NÃO usa `acsm_level` como nome (D2 corrigido). Use
 * `training_experience_level` — derivação operacional Fabrik, NÃO
 * classificação clínica ACSM formal.
 *
 * Princípios:
 *   - Schema valida INPUT do form (estado UI), não o que vai pro banco.
 *   - `normalizeQuestionnairePayload(input)` converte input validado em
 *     payload-ready pra INSERT em `questionnaire_responses`.
 *   - parq_blocked NUNCA vai no payload (generated column server-side).
 *   - Strings opcionais vazias viram null antes do INSERT.
 */

import { z } from "zod";

import {
  ACCOMPANIMENT_PREFERENCE_CODES,
  ALCOHOL_CODES,
  BIGGEST_DIFFICULTY_CODES,
  CAFFEINE_DOSES_CODES,
  CONSISTENCY_SELF_RATING_CODES,
  CORRECTION_PREFERENCE_CODES,
  DIFFICULTY_HELPER_CODES,
  DISCOMFORT_RESPONSE_CODES,
  EXERCISE_HISTORY_CODES,
  EXTERNAL_TRAINING_RESOURCES_CODES,
  FIRM_PROFESSIONAL_RESPONSE_CODES,
  GENDER_CODES,
  GOAL_CODES,
  LIFE_STABILITY_CODES,
  MISSED_SESSION_RESPONSE_CODES,
  MOTIVATION_CODES,
  PAIN_MOVEMENT_CODES,
  PAIN_STATUS_CODES,
  PAIN_STATUS_REQUIRES_DETAILS,
  PARQ_QUESTION_CODES,
  PRIMARY_ADHERENCE_BARRIER_CODES,
  QUESTIONNAIRE_VERSION,
  RECOVERY_QUALITY_CODES,
  RECOVERY_STRATEGY_CODES,
  ROUTINE_CODES,
  SESSION_DURATION_CODES,
  SLEEP_HOURS_CODES,
  TOBACCO_CODES,
  TRAINING_AVAILABLE_DAYS_CODES,
  TRAINING_PERIOD_CODES,
  WEARABLE_BRAND_CODES,
  WEEKLY_FREQUENCY_VALUES,
  type ExerciseHistoryCode,
  type QuestionnaireResponseInsert,
} from "@/constants/precision12Questionnaire";

// ────────────────────────────────────────────────────────────────────────────
// Helpers de schema
// ────────────────────────────────────────────────────────────────────────────

/**
 * String opcional com trim + limite de tamanho. Vazia/undefined vira undefined
 * (será convertida em null no `normalizeQuestionnairePayload`).
 */
const optionalText = (max: number) =>
  z.preprocess(
    (val) => {
      if (val === null || val === undefined) return undefined;
      const trimmed = String(val).trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z.string().max(max, `Máximo ${max} caracteres`).optional(),
  );

/**
 * String obrigatória com trim + limite. Vazia rejeita.
 */
const requiredText = (max: number, msg = "Campo obrigatório") =>
  z.preprocess(
    (val) => (typeof val === "string" ? val.trim() : val),
    z.string().min(1, msg).max(max, `Máximo ${max} caracteres`),
  );

/**
 * Enum a partir de readonly array de codes. Tipa narrow.
 */
const codeEnum = <T extends readonly [string, ...string[]]>(
  codes: T,
  msg = "Opção inválida",
) =>
  z.enum(codes, { message: msg } as z.core.RawCreateParams);

/**
 * Array de codes únicos (rejeita duplicatas explicitamente).
 */
const codeArray = <T extends readonly [string, ...string[]]>(
  codes: T,
  msg = "Selecione opções válidas",
  minItems?: number,
) =>
  z
    .array(codeEnum(codes, msg))
    .refine(
      (arr) => new Set(arr).size === arr.length,
      "Não é permitido repetir opções",
    )
    .pipe(
      minItems !== undefined
        ? z.array(z.string()).min(minItems, `Selecione pelo menos ${minItems}`)
        : z.array(z.string()),
    ) as z.ZodType<T[number][]>;

// ────────────────────────────────────────────────────────────────────────────
// Tela 1 — Identificação básica
// ────────────────────────────────────────────────────────────────────────────

/**
 * Schema da tela 1. `birthdate` é opcional aqui — a obrigatoriedade
 * condicional (D11: obrigatório se students.birth_date IS NULL) é
 * aplicada no `precision12QuestionnaireSchema.superRefine` quando UI
 * fornecer o flag `requireBirthdate`.
 */
const tela1Schema = z.object({
  full_name: requiredText(200, "Nome obrigatório"),
  email: requiredText(200).pipe(z.string().email("E-mail inválido")),
  phone: requiredText(50),
  birthdate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"), z.null()])
    .optional(),
  gender: codeEnum(
    GENDER_CODES as readonly [string, ...string[]],
    "Selecione M ou F",
  ),
  profession: optionalText(200),
  routine: codeEnum(ROUTINE_CODES as readonly [string, ...string[]]),
});

// ────────────────────────────────────────────────────────────────────────────
// Tela 2 — PAR-Q (sempre 7 booleanos obrigatórios)
// ────────────────────────────────────────────────────────────────────────────

const tela2Schema = z.object({
  parq_q8_heart_condition: z.boolean(),
  parq_q9_chest_pain_exercise: z.boolean(),
  parq_q10_chest_pain_recent: z.boolean(),
  parq_q11_loss_consciousness_or_dizziness_fall: z.boolean(),
  parq_q12_bone_joint: z.boolean(),
  parq_q13_blood_pressure_meds: z.boolean(),
  parq_q14_other_health_reason: z.boolean(),
});

// ────────────────────────────────────────────────────────────────────────────
// Tela 3 — Objetivos e histórico
// ────────────────────────────────────────────────────────────────────────────

const tela3Schema = z.object({
  goals: codeArray(
    GOAL_CODES as readonly [string, ...string[]],
    "Selecione objetivos válidos",
    1,
  ).pipe(z.array(z.string()).max(2, "Selecione no máximo 2 objetivos")),
  goal_details: optionalText(2000),
  previous_attempts: optionalText(2000),
  exercise_history: codeEnum(
    EXERCISE_HISTORY_CODES as readonly [string, ...string[]],
  ),
  fitness_self_rating: z.number().int().min(1).max(5),
  body_satisfaction: z.number().int().min(1).max(5),
});

// ────────────────────────────────────────────────────────────────────────────
// Tela 4 — Disponibilidade e recursos
// ────────────────────────────────────────────────────────────────────────────

const tela4Schema = z.object({
  session_duration: codeEnum(
    SESSION_DURATION_CODES as readonly [string, ...string[]],
  ),
  weekly_frequency: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
  ]),
  training_available_days: codeArray(
    TRAINING_AVAILABLE_DAYS_CODES as readonly [string, ...string[]],
    "Selecione dias válidos",
    1,
  ),
  training_period: codeEnum(
    TRAINING_PERIOD_CODES as readonly [string, ...string[]],
  ),
  frequent_traveler: z.boolean(),
  external_training_resources: codeArray(
    EXTERNAL_TRAINING_RESOURCES_CODES as readonly [string, ...string[]],
  ).optional(),
  routine_description: optionalText(2000),
  primary_adherence_barrier: codeEnum(
    PRIMARY_ADHERENCE_BARRIER_CODES as readonly [string, ...string[]],
  ),
});

// ────────────────────────────────────────────────────────────────────────────
// Tela 5 — Saúde, dor e medicação (com condicionais)
// ────────────────────────────────────────────────────────────────────────────

const tela5Schema = z.object({
  pain_status: codeEnum(PAIN_STATUS_CODES as readonly [string, ...string[]]),
  pain_movements: codeArray(
    PAIN_MOVEMENT_CODES as readonly [string, ...string[]],
  ).optional(),
  pain_location: optionalText(500),
  biggest_difficulty: codeArray(
    BIGGEST_DIFFICULTY_CODES as readonly [string, ...string[]],
  ).optional(),
  has_medical_condition: z.boolean(),
  medical_condition_details: optionalText(2000),
  uses_medications: z.boolean(),
  medications_continuous: optionalText(2000),
  injury_surgery_history: optionalText(2000),
  recovery_strategies: codeArray(
    RECOVERY_STRATEGY_CODES as readonly [string, ...string[]],
  ).optional(),
  alcohol: codeEnum(ALCOHOL_CODES as readonly [string, ...string[]]).optional(),
  tobacco: codeEnum(TOBACCO_CODES as readonly [string, ...string[]]).optional(),
  caffeine_doses: codeEnum(
    CAFFEINE_DOSES_CODES as readonly [string, ...string[]],
  ).optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Tela 6 — Sono, recuperação e estresse
// ────────────────────────────────────────────────────────────────────────────

const tela6Schema = z.object({
  sleep_hours: codeEnum(SLEEP_HOURS_CODES as readonly [string, ...string[]]),
  sleep_quality: z.number().int().min(1).max(5),
  stress_level: z.number().int().min(1).max(5),
  energy_level: z.number().int().min(1).max(5),
  recovery_quality: codeEnum(
    RECOVERY_QUALITY_CODES as readonly [string, ...string[]],
  ),
});

// ────────────────────────────────────────────────────────────────────────────
// Tela 7 — Wearable + perfil comportamental
// ────────────────────────────────────────────────────────────────────────────

const tela7Schema = z.object({
  uses_wearable: z.boolean(),
  wearable_brand: codeEnum(
    WEARABLE_BRAND_CODES as readonly [string, ...string[]],
  ).optional(),
  share_data: z.boolean().optional(),
  motivations: codeArray(
    MOTIVATION_CODES as readonly [string, ...string[]],
    "Selecione motivações válidas",
    1,
  ).pipe(z.array(z.string()).max(2, "Selecione no máximo 2 motivações")),
  discomfort_response: codeEnum(
    DISCOMFORT_RESPONSE_CODES as readonly [string, ...string[]],
  ),
  difficulty_helper: codeEnum(
    DIFFICULTY_HELPER_CODES as readonly [string, ...string[]],
  ),
  missed_session_response: codeEnum(
    MISSED_SESSION_RESPONSE_CODES as readonly [string, ...string[]],
  ),
  firm_professional_response: codeEnum(
    FIRM_PROFESSIONAL_RESPONSE_CODES as readonly [string, ...string[]],
  ),
  accompaniment_preference: codeEnum(
    ACCOMPANIMENT_PREFERENCE_CODES as readonly [string, ...string[]],
  ),
  correction_preference: codeEnum(
    CORRECTION_PREFERENCE_CODES as readonly [string, ...string[]],
  ),
  consistency_self_rating: codeEnum(
    CONSISTENCY_SELF_RATING_CODES as readonly [string, ...string[]],
  ),
  life_stability: codeEnum(
    LIFE_STABILITY_CODES as readonly [string, ...string[]],
  ),
  deal_breaker: optionalText(2000),
});

// ────────────────────────────────────────────────────────────────────────────
// Tela 8 — Consentimento (todos 4 obrigatórios = true)
// ────────────────────────────────────────────────────────────────────────────

const tela8Schema = z.object({
  consent_truthful: z.literal(true, {
    message: "Confirme veracidade das informações",
  }),
  consent_not_medical: z.literal(true, {
    message: "Confirme ciência sobre acompanhamento médico",
  }),
  consent_data_use: z.literal(true, {
    message: "Autorize uso dos dados pra personalização",
  }),
  consent_terms: z.literal(true, {
    message: "Concorde com os termos de participação",
  }),
});

// ────────────────────────────────────────────────────────────────────────────
// Schema principal (input do form, com condicionais cross-field)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Schema completo. Aplica condicionais cross-field via `superRefine`:
 *   - pain_status ∈ requiresDetails → exige pain_movements OU pain_location
 *   - has_medical_condition=true → exige medical_condition_details
 *   - uses_medications=true → exige medications_continuous (não vazio)
 *   - uses_wearable=true → exige wearable_brand
 *   - birthdate obrigatório se contexto indicar (D11)
 *
 * O parâmetro `ctx.requireBirthdate` deve ser injetado pela UI / edge
 * function quando o aluno não tem `students.birth_date`. Por padrão é
 * `false` (assume que já tem cadastro).
 */
const baseSchema = z.object({
  ...tela1Schema.shape,
  ...tela2Schema.shape,
  ...tela3Schema.shape,
  ...tela4Schema.shape,
  ...tela5Schema.shape,
  ...tela6Schema.shape,
  ...tela7Schema.shape,
  ...tela8Schema.shape,
});

export type Precision12QuestionnaireInput = z.infer<typeof baseSchema>;

export interface Precision12QuestionnaireContext {
  /** Se true, exige birthdate no input (D11). */
  requireBirthdate?: boolean;
}

/**
 * Builder pro schema completo com superRefine. Recebe contexto pra aplicar
 * condicionais que dependem de estado externo (ex: cadastro do aluno).
 */
export function buildPrecision12QuestionnaireSchema(
  ctx: Precision12QuestionnaireContext = {},
) {
  return baseSchema.superRefine((data, refinement) => {
    // D11 — birthdate obrigatório se contexto pedir
    if (ctx.requireBirthdate && !data.birthdate) {
      refinement.addIssue({
        code: "custom",
        path: ["birthdate"],
        message: "Data de nascimento obrigatória",
      });
    }

    // Condicional 1 — pain_status ≠ none → pain_movements (≥1) E pain_location (texto não vazio)
    // Conforme spec docs/precision12_questionnaire_v1.md (Tela 5.2 e 5.3 são DEPENDENTES
    // quando pain_status != none, exigindo as duas informações para o coach poder agir).
    if (
      (PAIN_STATUS_REQUIRES_DETAILS as readonly string[]).includes(data.pain_status)
    ) {
      const hasMovements =
        Array.isArray(data.pain_movements) && data.pain_movements.length > 0;
      const hasLocation = !!data.pain_location && data.pain_location.length > 0;
      if (!hasMovements) {
        refinement.addIssue({
          code: "custom",
          path: ["pain_movements"],
          message: "Selecione pelo menos um movimento que causa dor",
        });
      }
      if (!hasLocation) {
        refinement.addIssue({
          code: "custom",
          path: ["pain_location"],
          message: "Descreva o local da dor",
        });
      }
    }

    // Condicional 2 — has_medical_condition → medical_condition_details
    if (data.has_medical_condition && !data.medical_condition_details) {
      refinement.addIssue({
        code: "custom",
        path: ["medical_condition_details"],
        message: "Descreva a condição médica",
      });
    }

    // Condicional 3 — uses_medications → medications_continuous
    if (data.uses_medications && !data.medications_continuous) {
      refinement.addIssue({
        code: "custom",
        path: ["medications_continuous"],
        message: "Liste os medicamentos contínuos",
      });
    }

    // Condicional 4 — uses_wearable → wearable_brand
    if (data.uses_wearable && !data.wearable_brand) {
      refinement.addIssue({
        code: "custom",
        path: ["wearable_brand"],
        message: "Informe qual dispositivo",
      });
    }

    // Condicional 5 — `none` exclusivo em external_training_resources
    // Se aluno marcou "Nenhum", não faz sentido marcar outras opções junto.
    if (
      Array.isArray(data.external_training_resources) &&
      data.external_training_resources.includes("none") &&
      data.external_training_resources.length > 1
    ) {
      refinement.addIssue({
        code: "custom",
        path: ["external_training_resources"],
        message: "Se selecionar 'Nenhum', não marque outras opções",
      });
    }

    // Condicional 6 — `none` exclusivo em recovery_strategies
    if (
      Array.isArray(data.recovery_strategies) &&
      data.recovery_strategies.includes("none") &&
      data.recovery_strategies.length > 1
    ) {
      refinement.addIssue({
        code: "custom",
        path: ["recovery_strategies"],
        message: "Se selecionar 'Nenhuma', não marque outras opções",
      });
    }
  });
}

/**
 * Schema padrão sem requireBirthdate. Use `buildPrecision12QuestionnaireSchema`
 * quando UI/edge function souber que o aluno não tem birth_date cadastrado.
 */
export const precision12QuestionnaireSchema =
  buildPrecision12QuestionnaireSchema();

// ────────────────────────────────────────────────────────────────────────────
// Derivações canônicas
// ────────────────────────────────────────────────────────────────────────────

export type TrainingExperienceLevel =
  | "sedentary"
  | "transitioning"
  | "beginner"
  | "intermediate"
  | "advanced";

const HISTORY_TO_TRAINING_EXPERIENCE: Record<
  ExerciseHistoryCode,
  TrainingExperienceLevel
> = {
  never_regular: "sedentary",
  stopped_more_than_1_month: "sedentary",
  returning_less_than_1_month: "transitioning",
  regular_1_to_6_months: "beginner",
  regular_6_months_to_2_years: "intermediate",
  regular_more_than_2_years: "advanced",
};

const HISTORY_TO_ACTIVE_LAST_30_DAYS: Record<ExerciseHistoryCode, boolean> = {
  never_regular: false,
  stopped_more_than_1_month: false,
  returning_less_than_1_month: true,
  regular_1_to_6_months: true,
  regular_6_months_to_2_years: true,
  regular_more_than_2_years: true,
};

/**
 * Deriva nível de experiência de treino do aluno a partir do
 * `exercise_history` (Tela 3.4).
 *
 * NÃO é classificação ACSM clínica formal — é uma triagem operacional
 * Fabrik inspirada em pré-participação. Não usar pra prescrição médica.
 */
export function deriveTrainingExperienceLevel(
  exerciseHistory: ExerciseHistoryCode,
): TrainingExperienceLevel {
  return HISTORY_TO_TRAINING_EXPERIENCE[exerciseHistory];
}

/**
 * Deriva se aluno esteve ativo nos últimos 30 dias (flag boolean) a partir
 * do `exercise_history`.
 */
export function deriveActiveLast30Days(
  exerciseHistory: ExerciseHistoryCode,
): boolean {
  return HISTORY_TO_ACTIVE_LAST_30_DAYS[exerciseHistory];
}

/**
 * Calcula `parq_blocked` localmente (preview). No banco a coluna é
 * generated; aqui é só pra UI mostrar aviso pré-submit.
 */
export function deriveParqBlocked(payload: {
  parq_q8_heart_condition?: boolean | null;
  parq_q9_chest_pain_exercise?: boolean | null;
  parq_q10_chest_pain_recent?: boolean | null;
  parq_q11_loss_consciousness_or_dizziness_fall?: boolean | null;
  parq_q12_bone_joint?: boolean | null;
  parq_q13_blood_pressure_meds?: boolean | null;
  parq_q14_other_health_reason?: boolean | null;
}): boolean {
  return PARQ_QUESTION_CODES.some((code) => payload[code] === true);
}

// ────────────────────────────────────────────────────────────────────────────
// Normalização pro payload Insert
// ────────────────────────────────────────────────────────────────────────────

/**
 * Converte input validado em payload pronto pra INSERT em
 * `questionnaire_responses`. Aplica:
 *   - trim final
 *   - vazios opcionais → null
 *   - medications_continuous = null se uses_medications=false
 *   - medical_condition_details = null se has_medical_condition=false
 *   - wearable_brand/share_data = null se uses_wearable=false
 *   - questionnaire_version preenchido
 *   - parq_blocked NUNCA presente (generated column)
 *   - submitted_at NUNCA presente (edge function preenche server-side)
 *
 * Args:
 *   input: dados validados do form
 *   assessmentId: FK pra row mãe em `assessments`
 */
export function normalizeQuestionnairePayload(
  input: Precision12QuestionnaireInput,
  assessmentId: string,
): QuestionnaireResponseInsert {
  const nullIfEmpty = (v: string | null | undefined): string | null =>
    !v || v.trim() === "" ? null : v.trim();

  const nullIfEmptyArray = <T>(arr: T[] | null | undefined): T[] | null =>
    !arr || arr.length === 0 ? null : arr;

  // Limpar campos condicionais quando a dependência é false
  const medicationsContinuous = input.uses_medications
    ? nullIfEmpty(input.medications_continuous ?? null)
    : null;

  const medicalConditionDetails = input.has_medical_condition
    ? nullIfEmpty(input.medical_condition_details ?? null)
    : null;

  const wearableBrand = input.uses_wearable ? input.wearable_brand ?? null : null;
  const shareData = input.uses_wearable ? input.share_data ?? null : null;

  // pain_movements/pain_location só relevantes se pain_status ≠ none
  const painStatusRequiresDetails = (
    PAIN_STATUS_REQUIRES_DETAILS as readonly string[]
  ).includes(input.pain_status);
  const painMovements = painStatusRequiresDetails
    ? nullIfEmptyArray(input.pain_movements ?? null)
    : null;
  const painLocation = painStatusRequiresDetails
    ? nullIfEmpty(input.pain_location ?? null)
    : null;

  return {
    assessment_id: assessmentId,
    questionnaire_version: QUESTIONNAIRE_VERSION,

    // Tela 1
    full_name: input.full_name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    birthdate: input.birthdate ?? null,
    gender: input.gender,
    profession: nullIfEmpty(input.profession ?? null),
    routine: input.routine,

    // Tela 2 — PAR-Q (parq_blocked NÃO vai aqui)
    parq_q8_heart_condition: input.parq_q8_heart_condition,
    parq_q9_chest_pain_exercise: input.parq_q9_chest_pain_exercise,
    parq_q10_chest_pain_recent: input.parq_q10_chest_pain_recent,
    parq_q11_loss_consciousness_or_dizziness_fall:
      input.parq_q11_loss_consciousness_or_dizziness_fall,
    parq_q12_bone_joint: input.parq_q12_bone_joint,
    parq_q13_blood_pressure_meds: input.parq_q13_blood_pressure_meds,
    parq_q14_other_health_reason: input.parq_q14_other_health_reason,

    // Tela 3
    goals: input.goals,
    goal_details: nullIfEmpty(input.goal_details ?? null),
    previous_attempts: nullIfEmpty(input.previous_attempts ?? null),
    exercise_history: input.exercise_history,
    fitness_self_rating: input.fitness_self_rating,
    body_satisfaction: input.body_satisfaction,

    // Tela 4
    session_duration: input.session_duration,
    weekly_frequency: input.weekly_frequency,
    training_available_days: input.training_available_days,
    training_period: input.training_period,
    frequent_traveler: input.frequent_traveler,
    external_training_resources: nullIfEmptyArray(
      input.external_training_resources ?? null,
    ),
    routine_description: nullIfEmpty(input.routine_description ?? null),
    primary_adherence_barrier: input.primary_adherence_barrier,

    // Tela 5
    pain_status: input.pain_status,
    pain_movements: painMovements,
    pain_location: painLocation,
    biggest_difficulty: nullIfEmptyArray(input.biggest_difficulty ?? null),
    has_medical_condition: input.has_medical_condition,
    medical_condition_details: medicalConditionDetails,
    uses_medications: input.uses_medications,
    medications_continuous: medicationsContinuous,
    injury_surgery_history: nullIfEmpty(input.injury_surgery_history ?? null),
    recovery_strategies: nullIfEmptyArray(input.recovery_strategies ?? null),
    alcohol: input.alcohol ?? null,
    tobacco: input.tobacco ?? null,
    caffeine_doses: input.caffeine_doses ?? null,

    // Tela 6
    sleep_hours: input.sleep_hours,
    sleep_quality: input.sleep_quality,
    stress_level: input.stress_level,
    energy_level: input.energy_level,
    recovery_quality: input.recovery_quality,

    // Tela 7
    uses_wearable: input.uses_wearable,
    wearable_brand: wearableBrand,
    share_data: shareData,
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

    // Tela 8 — todos obrigatoriamente true (schema garante)
    consent_truthful: input.consent_truthful,
    consent_not_medical: input.consent_not_medical,
    consent_data_use: input.consent_data_use,
    consent_terms: input.consent_terms,

    // submitted_at é preenchido server-side pela edge function
    // (não setamos aqui; deixar Postgres aceitar default null e edge updar)
  };
}
