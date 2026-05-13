/**
 * Schemas de validação Zod pra cada tipo de avaliação Precision 12.
 *
 * Garante shape + ranges + tipos coerentes ANTES de chegar ao Supabase.
 * Cobre os 9 tipos (8 forms de coach + questionnaire que é E3 separado).
 *
 * Validação adicional do banco (check constraints, generated columns,
 * RLS) continua valendo — esta camada é a primeira linha de defesa
 * client-side.
 *
 * Schemas espelham os check constraints SQL da migration
 * 20260513002546_precision12_assessment_foundation.sql.
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Schemas comuns
// ────────────────────────────────────────────────────────────────────────────

/**
 * Campos comuns a todas as avaliações (parent row de `assessments`).
 * `assessment_type` é definido pelo form específico, não pelo wizard.
 */
export const assessmentBaseSchema = z.object({
  student_id: z.string().uuid("Aluno inválido"),
  assessment_date: z
    .string()
    .min(1, "Data obrigatória")
    .refine((date) => !Number.isNaN(new Date(date).getTime()), "Data inválida"),
  age_years: z.coerce.number().int().min(0).max(120).nullable().optional(),
  weight_kg: z.coerce.number().positive().max(500).nullable().optional(),
  height_cm: z.coerce.number().positive().max(300).nullable().optional(),
  sex: z.enum(["M", "F"]).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type AssessmentBaseInput = z.infer<typeof assessmentBaseSchema>;

// ────────────────────────────────────────────────────────────────────────────
// 1. VO₂ — bike máximo e submáximo, esteira (caminhar / correr / correr máx)
// ────────────────────────────────────────────────────────────────────────────

const vo2BaseSchema = z.object({
  vo2_estimated: z.coerce.number().positive().max(120).nullable().optional(),
  peak_hr_bpm: z.coerce.number().int().min(30).max(250).nullable().optional(),
  peak_pse: z.coerce.number().int().min(0).max(10).nullable().optional(),
  hr_recovery_1min_bpm: z.coerce
    .number()
    .int()
    .min(-30) // raro mas possível: FC continuou subindo após parada
    .max(100)
    .nullable()
    .optional(),
  abort_reason: z
    .enum([
      "pse_10",
      "cadence_failure",
      "pse_9_submax",
      "fc_above_90pct",
      "safety_bp",
      "safety_ischemia",
      "student_request",
      "equipment",
    ])
    .nullable()
    .optional(),
});

export const vo2BikeStageSchema = z.object({
  stage_number: z.coerce.number().int().min(0).max(20),
  phase: z.enum(["warmup", "test", "recovery"]),
  duration_seconds: z.coerce.number().int().min(0).max(3600),
  watts: z.coerce.number().min(0).max(1000).nullable().optional(),
  rpm: z.coerce.number().int().min(0).max(200).nullable().optional(),
  hr_bpm: z.coerce.number().int().min(30).max(250).nullable().optional(),
  pse: z.coerce.number().int().min(0).max(10).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type Vo2BikeStageInput = z.infer<typeof vo2BikeStageSchema>;

export const vo2BikeMaxSchema = vo2BaseSchema.extend({
  modality: z.literal("bike_max"),
  stages: z.array(vo2BikeStageSchema).min(1, "Registre pelo menos 1 estágio"),
});

export const vo2BikeSubmaxSchema = vo2BaseSchema.extend({
  modality: z.literal("bike_submax"),
  stages: z.array(vo2BikeStageSchema).min(1, "Registre pelo menos 1 estágio"),
});

export const vo2TreadmillSchema = vo2BaseSchema.extend({
  modality: z.enum(["treadmill_walk_submax", "treadmill_run_submax", "treadmill_run_max"]),
  treadmill_speed_kmh: z.coerce.number().min(0).max(30).nullable().optional(),
  treadmill_incline_pct: z.coerce.number().min(0).max(30).nullable().optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Handgrip (Mathiowetz 1985 — 3 tentativas/mão, best_kg generated)
// ────────────────────────────────────────────────────────────────────────────

const trialsTriple = z
  .array(z.coerce.number().min(0).max(150))
  .length(3, "3 tentativas obrigatórias");

export const handgripSchema = z.object({
  right_kg_attempts: trialsTriple,
  left_kg_attempts: trialsTriple,
  notes: z.string().max(500).nullable().optional(),
});

export type HandgripInput = z.infer<typeof handgripSchema>;

// ────────────────────────────────────────────────────────────────────────────
// 3. DEXA — 17 campos clínicos + jsonb regional_distribution
// ────────────────────────────────────────────────────────────────────────────

const dexaRegionSchema = z.object({
  fat_pct: z.coerce.number().min(0).max(100).nullable().optional(),
  lean_mass_kg: z.coerce.number().min(0).max(100).nullable().optional(),
  fat_mass_kg: z.coerce.number().min(0).max(100).nullable().optional(),
});

export const dexaRegionalDistributionSchema = z.object({
  trunk: dexaRegionSchema.optional(),
  arms: dexaRegionSchema.optional(),
  legs: dexaRegionSchema.optional(),
  android: dexaRegionSchema.optional(),
  gynoid: dexaRegionSchema.optional(),
});

export const dexaSchema = z.object({
  total_fat_pct: z.coerce.number().min(0).max(100).nullable().optional(),
  total_fat_mass_kg: z.coerce.number().min(0).max(200).nullable().optional(),
  total_lean_mass_kg: z.coerce.number().min(0).max(200).nullable().optional(),
  visceral_fat_kg: z.coerce.number().min(0).max(20).nullable().optional(),
  visceral_fat_cm2: z.coerce.number().min(0).max(500).nullable().optional(),
  bone_mineral_density_g_cm2: z.coerce.number().min(0).max(5).nullable().optional(),
  bone_mineral_content_g: z.coerce.number().min(0).max(5000).nullable().optional(),
  t_score: z.coerce.number().min(-10).max(10).nullable().optional(),
  z_score: z.coerce.number().min(-10).max(10).nullable().optional(),
  android_gynoid_ratio: z.coerce.number().min(0).max(5).nullable().optional(),
  appendicular_lean_mass_kg: z.coerce.number().min(0).max(100).nullable().optional(),
  asmm_index: z.coerce.number().min(0).max(20).nullable().optional(),
  visceral_classification: z
    .enum(["low", "moderate", "high", "very_high"])
    .nullable()
    .optional(),
  regional_distribution: dexaRegionalDistributionSchema.nullable().optional(),
  raw_extracted_json: z.unknown().nullable().optional(),
  pdf_storage_path: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type DexaInput = z.infer<typeof dexaSchema>;

// ────────────────────────────────────────────────────────────────────────────
// 4. Sit-to-Stand (Araújo 2012 split sentar/levantar)
//    Decisão MVP (PR #116): coach digita sit_score/rise_score JÁ
//    descontados. jsonb supports + int instabilities são audit trail.
// ────────────────────────────────────────────────────────────────────────────

export const sitToStandSupportsSchema = z.object({
  hand: z.coerce.number().int().min(0).max(10),
  knee: z.coerce.number().int().min(0).max(10),
  forearm: z.coerce.number().int().min(0).max(10),
  leg_side: z.coerce.number().int().min(0).max(10),
  hand_on_knee: z.coerce.number().int().min(0).max(10),
});

export type SitToStandSupportsInput = z.infer<typeof sitToStandSupportsSchema>;

export const sitToStandSchema = z.object({
  sit_score: z.coerce.number().min(0).max(5),
  sit_supports: sitToStandSupportsSchema,
  sit_instabilities: z.coerce.number().int().min(0).max(20),
  rise_score: z.coerce.number().min(0).max(5),
  rise_supports: sitToStandSupportsSchema,
  rise_instabilities: z.coerce.number().int().min(0).max(20),
  classification: z.string().max(50).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type SitToStandInput = z.infer<typeof sitToStandSchema>;

// ────────────────────────────────────────────────────────────────────────────
// 5. Cardiovascular baseline (PA + FCR + medicação) — opcional em qualquer
//    avaliação. Inclui PAR-Q parcial pra bloqueio de teste máximo.
// ────────────────────────────────────────────────────────────────────────────

export const cardiovascularBaselineSchema = z.object({
  systolic_bp_mmhg: z.coerce.number().int().min(40).max(300).nullable().optional(),
  diastolic_bp_mmhg: z.coerce.number().int().min(20).max(200).nullable().optional(),
  resting_hr_bpm: z.coerce.number().int().min(20).max(200).nullable().optional(),
  on_medication: z.boolean().nullable().optional(),
  medication_details: z.string().max(1000).nullable().optional(),
  physician_name: z.string().max(200).nullable().optional(),
  physician_contact: z.string().max(200).nullable().optional(),
  parq_chest_pain: z.boolean().nullable().optional(),
  parq_dizziness: z.boolean().nullable().optional(),
  parq_bone_joint_issue: z.boolean().nullable().optional(),
  parq_blood_pressure_meds: z.boolean().nullable().optional(),
  parq_heart_condition: z.boolean().nullable().optional(),
  parq_other_reason: z.string().max(500).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type CardiovascularBaselineInput = z.infer<typeof cardiovascularBaselineSchema>;

// ────────────────────────────────────────────────────────────────────────────
// 6. Subjective scores (6 valores 0-10) — opcional em qualquer avaliação
// ────────────────────────────────────────────────────────────────────────────

const score0to10 = z.coerce.number().min(0).max(10);

export const subjectiveScoresSchema = z.object({
  sleep_quality: score0to10.nullable().optional(),
  energy_level: score0to10.nullable().optional(),
  stress_level: score0to10.nullable().optional(),
  motivation: score0to10.nullable().optional(),
  body_pain: score0to10.nullable().optional(),
  hunger_level: score0to10.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type SubjectiveScoresInput = z.infer<typeof subjectiveScoresSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Helper: empty supports/instabilities pra defaults de form
// ────────────────────────────────────────────────────────────────────────────

export const emptySupports = (): SitToStandSupportsInput => ({
  hand: 0,
  knee: 0,
  forearm: 0,
  leg_side: 0,
  hand_on_knee: 0,
});

/**
 * Calcula o score sugerido de um hemiteste pelo método Fabrik
 * (back to basics, Araújo 2012):
 *   score = 5 - Σ(apoios) - 0.5 × Σ(instabilidades)
 * com clamp 0-5.
 *
 * Esta função é a base do preview MVP — UI do coach mostra esse valor
 * ao lado do input pra ele validar antes de digitar `sit_score` ou
 * `rise_score`. Não é usada na persistência (o coach digita o número
 * final).
 */
export const computeSitToStandHemiScore = (
  supports: SitToStandSupportsInput,
  instabilities: number,
): number => {
  const totalSupports =
    supports.hand +
    supports.knee +
    supports.forearm +
    supports.leg_side +
    supports.hand_on_knee;
  const raw = 5 - totalSupports - 0.5 * instabilities;
  return Math.max(0, Math.min(5, Math.round(raw * 2) / 2));
};
