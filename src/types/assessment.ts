/**
 * Tipos do módulo de Avaliação Fabrik Precision 12.
 *
 * Espelha o schema definido em
 * supabase/migrations/20260513002546_precision12_assessment_foundation.sql
 *
 * Os 9 tipos de avaliação são modelados como discriminated union via
 * `assessment_type`. Cada tipo tem uma tabela filha própria.
 */

// ────────────────────────────────────────────────────────────────────────────
// Enums e literais
// ────────────────────────────────────────────────────────────────────────────

export const ASSESSMENT_TYPES = [
  "vo2_bike_max",
  "vo2_bike_submax",
  "vo2_treadmill_walk_submax",
  "vo2_treadmill_run_submax",
  "vo2_treadmill_run_max",
  "handgrip",
  "dexa",
  "sit_to_stand",
  "questionnaire_precision12",
] as const;

export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const ASSESSMENT_STATUSES = [
  "in_progress",
  "completed",
  "aborted",
  "blocked",
] as const;

export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export type AssessmentSex = "M" | "F";

export type BikeStagePhase = "warmup" | "test" | "recovery";

export const BIKE_ABORT_REASONS = [
  "pse_10",
  "cadence_failure",
  "pse_9_submax",
  "fc_above_90pct",
  "safety_bp",
  "safety_ischemia",
  "student_request",
  "equipment",
] as const;

export type BikeAbortReason = (typeof BIKE_ABORT_REASONS)[number];

// Modalidades de sessão (sincronizado com check constraint em workout_sessions.modality)
export const WORKOUT_MODALITIES = [
  "functional",
  "spin",
  "walking",
  "running",
  "strength",
  "swimming",
  "other",
] as const;

export type WorkoutModality = (typeof WORKOUT_MODALITIES)[number];

// Tipo de cliente Precision 12
export const STUDENT_TYPES = ["fabrik", "precision_external"] as const;
export type StudentType = (typeof STUDENT_TYPES)[number];

export const PROGRAM_TIERS = ["regular", "precision_12"] as const;
export type ProgramTier = (typeof PROGRAM_TIERS)[number];

// Papéis de profissionais externos
export const EXTERNAL_PROFESSIONAL_ROLES = [
  "physical_coach",
  "physician",
  "nutritionist",
  "physiotherapist",
  "psychologist",
  "other",
] as const;

export type ExternalProfessionalRole =
  (typeof EXTERNAL_PROFESSIONAL_ROLES)[number];

export const REPORT_TYPES = ["initial", "monthly", "final"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_STATUSES = ["draft", "reviewed", "sent"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Tabela mãe
// ────────────────────────────────────────────────────────────────────────────

export interface Assessment {
  id: string;
  student_id: string;
  trainer_id: string | null;
  /**
   * LEGACY — espelha a coluna `professional_id` da tabela `assessments`
   * herdada do módulo funcional anterior. Coexiste com `trainer_id`
   * (canônico). Tornado nullable pela migration de hardening pré-E2
   * (2026-05-13). Código novo do Precision 12 deve escrever apenas
   * `trainer_id`; este campo fica disponível só pra leitura/compat.
   */
  professional_id: string | null;
  assessment_type: AssessmentType;
  assessment_date: string; // ISO date
  status: AssessmentStatus;
  /**
   * LEGACY — timestamps herdados do schema antigo, separados de
   * `assessment_date` (a data do encontro presencial). Quase sempre
   * preenchidos via DEFAULT, mantidos como compat. UI nova usa
   * `assessment_date` + `status` pra fluxo.
   */
  started_at: string | null;
  completed_at: string | null;
  age_years: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  sex: AssessmentSex | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Tabelas filhas — discriminated por assessment_type
// ────────────────────────────────────────────────────────────────────────────

export interface Vo2AssessmentDetails {
  assessment_id: string;
  fc_max_predicted: number | null;
  fc_peak: number | null;
  vo2_final: number | null;
  vo2_classification: string | null;
  recovery_drop_1min: number | null;
  recovery_classification: string | null;
  // Esteira
  total_time_min: number | null;
  final_speed_kmh: number | null;
  final_incline_pct: number | null;
  protocol_name: string | null;
  // Bike
  last_valid_load: number | null;
  last_valid_watts: number | null;
  abort_reason: BikeAbortReason | null;
}

export interface Vo2BikeStage {
  id: string;
  assessment_id: string;
  stage_order: number;
  time_label: string | null;
  phase: BikeStagePhase | null;
  load_value: number | null;
  rpm_target: string | null;
  watts_observed: number | null;
  hr_final: number | null;
  pse: number | null;
  vo2_estimated: number | null;
  notes: string | null;
}

export interface HandgripResults {
  assessment_id: string;
  dominant_hand: "left" | "right" | null;
  right_kg_attempts: number[];
  left_kg_attempts: number[];
  right_kg: number | null;
  left_kg: number | null;
  best_kg: number | null;
  classification: string | null;
}

export interface DexaResults {
  assessment_id: string;
  // 9 base
  total_mass_kg: number | null;
  fat_mass_kg: number | null;
  fat_pct: number | null;
  lean_mass_kg: number | null;
  bone_mass_kg: number | null;
  bone_density_z_score: number | null;
  visceral_fat_g: number | null;
  android_gynoid_ratio: number | null;
  scan_pdf_url: string | null;
  // TMB
  bmr_harris_benedict_kcal: number | null;
  bmr_mifflin_stjeor_kcal: number | null;
  // 6 promovidos
  appendicular_lean_mass_kg: number | null;
  imma_baumgartner: number | null;
  fmi: number | null;
  fat_percentile: number | null;
  regional_distribution: DexaRegionalDistribution | null;
  conclusion_text: string | null;
  // Storage + extração
  scan_pdf_storage_path: string | null;
  raw_extracted_json: Record<string, unknown> | null;
  extraction_confidence: number | null;
  extraction_method: "manual" | "ai" | "hybrid" | null;
}

export interface DexaRegionalDistribution {
  trunk?: DexaRegion;
  arms_right?: DexaRegion;
  arms_left?: DexaRegion;
  legs_right?: DexaRegion;
  legs_left?: DexaRegion;
  gynoid?: DexaRegion;
  android?: DexaRegion;
}

export interface DexaRegion {
  fat_pct: number;
  lean_mass_g: number;
  fat_mass_g: number;
}

export interface SitToStandSupports {
  hand: number;
  knee: number;
  forearm: number;
  leg_side: number;
  hand_on_knee: number;
}

export interface SitToStandResults {
  assessment_id: string;
  sit_score: number | null;
  sit_supports: SitToStandSupports;
  sit_instabilities: number;
  rise_score: number | null;
  rise_supports: SitToStandSupports;
  rise_instabilities: number;
  total_score: number | null; // generated by DB
  classification: string | null;
  notes: string | null;
}

export interface CardiovascularBaseline {
  assessment_id: string;
  systolic_mmhg: number | null;
  diastolic_mmhg: number | null;
  resting_hr_bpm: number | null;
  on_medication: boolean;
  medication_details: string | null;
  reference_doctor_name: string | null;
  reference_doctor_contact: string | null;
  classification: string | null;
}

export interface SubjectiveScores {
  id: string;
  student_id: string;
  assessment_id: string | null;
  recorded_at: string;
  sleep_score: number | null;
  energy_score: number | null;
  stress_score: number | null;
  recovery_score: number | null;
  wellbeing_score: number | null;
  mood_score: number | null;
  notes: string | null;
  created_at: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Profissionais externos
// ────────────────────────────────────────────────────────────────────────────

export interface StudentExternalProfessional {
  id: string;
  student_id: string;
  role: ExternalProfessionalRole;
  name: string;
  contact_phone: string | null;
  contact_email: string | null;
  organization: string | null;
  specialty: string | null;
  receives_reports: boolean;
  report_version_preference: "patient" | "technical" | "both" | null;
  notes: string | null;
  added_at: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Precision reports
// ────────────────────────────────────────────────────────────────────────────

export interface PrecisionReport {
  id: string;
  student_id: string;
  report_type: ReportType;
  cycle_number: number | null;
  total_cycles: number;
  week_number: number | null;
  period_start: string | null;
  period_end: string | null;
  generated_at: string;
  // Coach narrative
  anchor_quote: string | null;
  anchor_message: string | null;
  strategic_reading: string | null;
  goal_calibration: string | null;
  realistic_scenario: string | null;
  ambitious_scenario: string | null;
  bilateral_agreement_student: string[] | null;
  bilateral_agreement_fabrik: string[] | null;
  // Periódicos
  what_improved: string[] | null;
  what_needs_attention: string[] | null;
  student_quotes: Array<{ type: string; text: string }> | null;
  numbers_narrative: string | null;
  // Final
  goals_status: GoalStatus[] | null;
  monthly_journey: MonthlyJourneyEntry[] | null;
  lessons_learned: { what_worked: string[]; ongoing_challenges: string[] } | null;
  next_cycle_proposal: string | null;
  next_cycle_priorities: Array<{ order: number; title: string; description: string }> | null;
  closing_message: string | null;
  // Próximos passos
  next_steps: Array<{ order: number; title: string; description: string }> | null;
  top_priorities: Array<{ order: number; title: string; description: string }> | null;
  // Assinatura
  analyst_id: string | null;
  analyst_name: string | null;
  analyst_role: string;
  // PDF
  pdf_storage_path: string | null;
  pdf_generated_at: string | null;
  status: ReportStatus;
}

export interface GoalStatus {
  metric: string;
  start: number;
  end: number;
  target: number;
  pct_progress: number;
  status: "atingida" | "parcial" | "modesta" | "nao_atingida";
}

export interface MonthlyJourneyEntry {
  month: number;
  summary: string;
  key_changes: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Questionário Precision 12
// ────────────────────────────────────────────────────────────────────────────

export interface QuestionnaireResponses {
  assessment_id: string;
  questionnaire_version: string;
  // Bloco 1
  full_name: string | null;
  email: string | null;
  phone: string | null;
  birthdate: string | null;
  gender: AssessmentSex | null;
  profession: string | null;
  routine: string | null;
  // Bloco 2 — PAR-Q
  parq_q8_heart_condition: boolean | null;
  parq_q9_chest_pain_exercise: boolean | null;
  parq_q10_chest_pain_recent: boolean | null;
  parq_q11_loss_consciousness_or_dizziness_fall: boolean | null;
  parq_q12_bone_joint: boolean | null;
  parq_q13_blood_pressure_meds: boolean | null;
  parq_q14_other_health_reason: boolean | null;
  parq_blocked: boolean; // generated
  // Bloco 3
  goals: string[] | null;
  goal_details: string | null;
  previous_attempts: string | null;
  // Bloco 4
  exercise_history: string | null;
  fitness_self_rating: number | null;
  body_satisfaction: number | null;
  // Bloco 5
  session_duration: string | null;
  weekly_frequency: number | null;
  training_available_days: string[] | null;
  training_period: string | null;
  frequent_traveler: boolean | null;
  external_training_resources: string[] | null;
  routine_description: string | null;
  primary_adherence_barrier: string | null;
  // Bloco 6
  pain_status: string | null;
  pain_movements: string[] | null;
  pain_location: string | null;
  biggest_difficulty: string[] | null;
  // Bloco 7
  sleep_hours: string | null;
  sleep_quality: number | null;
  stress_level: number | null;
  energy_level: number | null;
  recovery_quality: string | null;
  // Bloco 8
  uses_wearable: boolean | null;
  wearable_brand: string | null;
  share_data: boolean | null;
  // Bloco 9
  has_medical_condition: boolean | null;
  medical_condition_details: string | null;
  uses_medications: boolean | null;
  medications_continuous: string | null;
  injury_surgery_history: string | null;
  recovery_strategies: string[] | null;
  alcohol: string | null;
  tobacco: string | null;
  caffeine_doses: string | null;
  // Bloco 10
  motivations: string[] | null;
  discomfort_response: string | null;
  difficulty_helper: string | null;
  missed_session_response: string | null;
  firm_professional_response: string | null;
  accompaniment_preference: string | null;
  correction_preference: string | null;
  consistency_self_rating: string | null;
  life_stability: string | null;
  deal_breaker: string | null;
  // Bloco 11
  consent_truthful: boolean | null;
  consent_not_medical: boolean | null;
  consent_data_use: boolean | null;
  consent_terms: boolean | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}
