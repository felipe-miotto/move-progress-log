/**
 * Schemas de validação Zod pra cada tipo de avaliação Precision 12.
 *
 * Garante shape + ranges + tipos coerentes ANTES de chegar ao Supabase.
 * Cobre os 9 tipos (8 forms de coach + questionnaire que é E3 separado).
 *
 * Validação adicional do banco (check constraints, generated columns,
 * RLS) continua valendo: esta camada é a primeira linha de defesa
 * client-side.
 *
 * Schemas espelham os check constraints SQL da migration
 * 20260513002546_precision12_assessment_foundation.sql e os nomes reais
 * gerados em src/integrations/supabase/types.ts.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Helpers comuns
// ---------------------------------------------------------------------------

/**
 * Data ISO do dia *local* do usuário (não UTC). Necessário porque
 * `new Date().toISOString().slice(0,10)` retorna a data UTC, que
 * difere do calendário local após 21h em fuso UTC-3 (Brasil).
 *
 * Use SEMPRE este helper pra default de `assessment_date` em forms —
 * usar `new Date().toISOString()` causa "data não pode estar no
 * futuro" à noite por divergência com a regra de validação do zod.
 */
export const localTodayIso = (): string => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

const isIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const emptyToNull = (value: unknown) =>
  value === "" || value === undefined ? null : value;

const nullableNumber = (schema: z.ZodNumber) =>
  z.preprocess(emptyToNull, schema.nullable().optional());

const requiredNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    schema,
  );

const nullableString = (max: number) =>
  z.preprocess(emptyToNull, z.string().max(max).nullable().optional());

const optionalScore0to10 = nullableNumber(z.number().min(0).max(10));

// ---------------------------------------------------------------------------
// Schemas comuns
// ---------------------------------------------------------------------------

/**
 * Campos comuns a todas as avaliações (parent row de `assessments`).
 * `assessment_type` é definido pelo form específico, não pelo wizard.
 */
export const assessmentBaseSchema = z.object({
  student_id: z.string().uuid("Aluno inválido"),
  assessment_date: z
    .string()
    .min(1, "Data obrigatória")
    .refine(isIsoDate, "Data inválida")
    .refine((date) => date <= localTodayIso(), "Data não pode estar no futuro"),
  age_years: nullableNumber(z.number().int().min(0).max(120)),
  weight_kg: nullableNumber(z.number().positive().max(500)),
  height_cm: nullableNumber(z.number().positive().max(300)),
  sex: z.enum(["M", "F"]).nullable().optional(),
  notes: nullableString(2000),
});

export type AssessmentBaseInput = z.infer<typeof assessmentBaseSchema>;

// ---------------------------------------------------------------------------
// 1. VO2 — bike máximo e submáximo, esteira (caminhar / correr / correr máx)
// ---------------------------------------------------------------------------

const vo2BaseSchema = z.object({
  fc_max_predicted: nullableNumber(z.number().int().min(30).max(250)),
  fc_peak: nullableNumber(z.number().int().min(30).max(250)),
  vo2_final: nullableNumber(z.number().positive().max(120)),
  vo2_classification: nullableString(80),
  recovery_drop_1min: nullableNumber(z.number().int().min(-30).max(150)),
  recovery_classification: nullableString(80),
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
  stage_order: requiredNumber(z.number().int().min(0).max(20)),
  time_label: nullableString(50),
  phase: z.enum(["warmup", "test", "recovery"]).nullable().optional(),
  load_value: nullableNumber(z.number().min(0).max(1000)),
  rpm_target: nullableString(50),
  watts_observed: nullableNumber(z.number().int().min(0).max(1000)),
  hr_final: nullableNumber(z.number().int().min(30).max(250)),
  pse: nullableNumber(z.number().int().min(6).max(10)),
  vo2_estimated: nullableNumber(z.number().positive().max(120)),
  notes: nullableString(500),
});

export type Vo2BikeStageInput = z.infer<typeof vo2BikeStageSchema>;

export const vo2BikeMaxSchema = vo2BaseSchema.extend({
  modality: z.literal("bike_max"),
  last_valid_load: nullableNumber(z.number().min(0).max(1000)),
  last_valid_watts: nullableNumber(z.number().int().min(0).max(1000)),
  stages: z.array(vo2BikeStageSchema).min(1, "Registre pelo menos 1 estágio"),
});

export const vo2BikeSubmaxSchema = vo2BaseSchema.extend({
  modality: z.literal("bike_submax"),
  last_valid_load: nullableNumber(z.number().min(0).max(1000)),
  last_valid_watts: nullableNumber(z.number().int().min(0).max(1000)),
  stages: z.array(vo2BikeStageSchema).min(1, "Registre pelo menos 1 estágio"),
});

export const vo2TreadmillSchema = vo2BaseSchema.extend({
  modality: z.enum(["treadmill_walk_submax", "treadmill_run_submax", "treadmill_run_max"]),
  total_time_min: nullableNumber(z.number().min(0).max(300)),
  final_speed_kmh: nullableNumber(z.number().min(0).max(30)),
  final_incline_pct: nullableNumber(z.number().min(0).max(30)),
  protocol_name: nullableString(100),
});

// ---------------------------------------------------------------------------
// 2. Handgrip (Mathiowetz 1985 — 3 tentativas/mão, best_kg generated)
// ---------------------------------------------------------------------------

const trialsTriple = z
  .array(requiredNumber(z.number().min(0).max(150)))
  .length(3, "3 tentativas obrigatórias");

export const handgripSchema = z.object({
  dominant_hand: z.enum(["left", "right"]).nullable().optional(),
  right_kg_attempts: trialsTriple,
  left_kg_attempts: trialsTriple,
  right_kg: nullableNumber(z.number().min(0).max(150)),
  left_kg: nullableNumber(z.number().min(0).max(150)),
  classification: nullableString(80),
});

export type HandgripInput = z.infer<typeof handgripSchema>;

// ---------------------------------------------------------------------------
// 3. DEXA — campos clínicos + jsonb regional_distribution
// ---------------------------------------------------------------------------

/**
 * Cada sub-campo regional é INDIVIDUALMENTE opcional / nullable.
 *
 * Por que: a IA extrai `regional_distribution` por região anatômica
 * a partir do laudo DEXA, mas laudos de clínicas diferentes preenchem
 * subconjuntos diferentes — algumas trazem só `fat_pct` por região,
 * outras só `lean_mass_g`, outras todas as 3. Exigir as 3 chaves via
 * `requiredNumber` bloqueava o submit quando a IA preenchia regiões
 * parciais, e como a seção "Distribuição regional (opcional)" do form
 * fica colapsada, o erro de validação ficava escondido — o coach via
 * "não salva" sem dica de onde estava o problema.
 *
 * Garantias mantidas:
 *   - Ranges (0-100 pra %, 0-100_000 pra gramas) continuam aplicados
 *     QUANDO o valor está presente — valores absurdos seguem falhando.
 *   - A região inteira continua `optional()` (omissão da chave OK).
 *   - O wrapper `dexaRegionalDistributionSchema` continua
 *     `nullable().optional()` no `dexaSchema` (toda a seção opcional).
 */
const dexaRegionSchema = z.object({
  fat_pct: nullableNumber(z.number().min(0).max(100)),
  lean_mass_g: nullableNumber(z.number().min(0).max(100_000)),
  fat_mass_g: nullableNumber(z.number().min(0).max(100_000)),
});

export const dexaRegionalDistributionSchema = z.object({
  trunk: dexaRegionSchema.optional(),
  arms_right: dexaRegionSchema.optional(),
  arms_left: dexaRegionSchema.optional(),
  legs_right: dexaRegionSchema.optional(),
  legs_left: dexaRegionSchema.optional(),
  android: dexaRegionSchema.optional(),
  gynoid: dexaRegionSchema.optional(),
});

export const dexaSchema = z.object({
  total_mass_kg: nullableNumber(z.number().min(0).max(500)),
  fat_mass_kg: nullableNumber(z.number().min(0).max(300)),
  fat_pct: nullableNumber(z.number().min(0).max(100)),
  lean_mass_kg: nullableNumber(z.number().min(0).max(300)),
  bone_mass_kg: nullableNumber(z.number().min(0).max(20)),
  bone_density_z_score: nullableNumber(z.number().min(-10).max(10)),
  visceral_fat_g: nullableNumber(z.number().min(0).max(20_000)),
  android_gynoid_ratio: nullableNumber(z.number().min(0).max(5)),
  scan_pdf_url: nullableString(1000),
  bmr_harris_benedict_kcal: nullableNumber(z.number().int().min(0).max(5000)),
  bmr_mifflin_stjeor_kcal: nullableNumber(z.number().int().min(0).max(5000)),
  appendicular_lean_mass_kg: nullableNumber(z.number().min(0).max(100)),
  imma_baumgartner: nullableNumber(z.number().min(0).max(30)),
  fmi: nullableNumber(z.number().min(0).max(80)),
  fat_percentile: nullableNumber(z.number().int().min(0).max(100)),
  regional_distribution: dexaRegionalDistributionSchema.nullable().optional(),
  conclusion_text: nullableString(5000),
  scan_pdf_storage_path: nullableString(1000),
  raw_extracted_json: z.unknown().nullable().optional(),
  extraction_confidence: nullableNumber(z.number().min(0).max(1)),
  extraction_method: z.enum(["manual", "ai", "hybrid"]).nullable().optional(),
});

export type DexaInput = z.infer<typeof dexaSchema>;

// ---------------------------------------------------------------------------
// 4. Sit-to-Stand (Araújo 2012 split sentar/levantar)
//    Decisão MVP (PR #116): coach digita sit_score/rise_score JÁ
//    descontados. jsonb supports + int instabilities são audit trail.
// ---------------------------------------------------------------------------

export const sitToStandSupportsSchema = z.object({
  hand: requiredNumber(z.number().int().min(0).max(10)),
  knee: requiredNumber(z.number().int().min(0).max(10)),
  forearm: requiredNumber(z.number().int().min(0).max(10)),
  leg_side: requiredNumber(z.number().int().min(0).max(10)),
  hand_on_knee: requiredNumber(z.number().int().min(0).max(10)),
});

export type SitToStandSupportsInput = z.infer<typeof sitToStandSupportsSchema>;

const hemiScore = requiredNumber(z.number().min(0).max(5).multipleOf(0.5));

export const sitToStandSchema = z.object({
  sit_score: hemiScore,
  sit_supports: sitToStandSupportsSchema,
  sit_instabilities: requiredNumber(z.number().int().min(0).max(20)),
  rise_score: hemiScore,
  rise_supports: sitToStandSupportsSchema,
  rise_instabilities: requiredNumber(z.number().int().min(0).max(20)),
  classification: nullableString(50),
  notes: nullableString(500),
});

export type SitToStandInput = z.infer<typeof sitToStandSchema>;

// ---------------------------------------------------------------------------
// 5. Cardiovascular baseline (PA + FCR + medicação) — opcional em qualquer
//    avaliação.
// ---------------------------------------------------------------------------

export const cardiovascularBaselineSchema = z.object({
  systolic_mmhg: nullableNumber(z.number().int().min(60).max(260)),
  diastolic_mmhg: nullableNumber(z.number().int().min(30).max(160)),
  resting_hr_bpm: nullableNumber(z.number().int().min(30).max(200)),
  on_medication: z.boolean().nullable().optional(),
  medication_details: nullableString(1000),
  reference_doctor_name: nullableString(200),
  reference_doctor_contact: nullableString(200),
  classification: nullableString(80),
});

export type CardiovascularBaselineInput = z.infer<typeof cardiovascularBaselineSchema>;

// ---------------------------------------------------------------------------
// 6. Subjective scores (6 valores 0-10) — opcional em qualquer avaliação
// ---------------------------------------------------------------------------

export const subjectiveScoresSchema = z.object({
  recorded_at: z
    .string()
    .refine(isIsoDate, "Data inválida")
    .refine((date) => date <= localTodayIso(), "Data não pode estar no futuro")
    .optional(),
  sleep_score: optionalScore0to10,
  energy_score: optionalScore0to10,
  stress_score: optionalScore0to10,
  recovery_score: optionalScore0to10,
  wellbeing_score: optionalScore0to10,
  mood_score: optionalScore0to10,
  notes: nullableString(500),
});

export type SubjectiveScoresInput = z.infer<typeof subjectiveScoresSchema>;

// ---------------------------------------------------------------------------
// Helper: empty supports/instabilities pra defaults de form
// ---------------------------------------------------------------------------

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
 *   score = 5 - soma(apoios) - 0.5 * soma(instabilidades)
 * com clamp 0-5 e granularidade de 0.5.
 *
 * Esta função é a base do preview MVP. Não é usada na persistência:
 * o coach digita o número final.
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
