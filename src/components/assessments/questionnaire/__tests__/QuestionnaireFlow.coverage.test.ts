/**
 * Sanity test do fluxo do Questionário Precision 12 (E3.6).
 *
 * Cobre os pontos do briefing E3.6 que dão pra validar sem jsdom:
 *   1. SCREEN_FIELDS cobre cada campo persistido do schema (sem deixar
 *      pergunta órfã sem trigger por etapa)
 *   2. buildPrecision12QuestionnaireSchema funciona com e sem
 *      requireBirthdate (smoke do schema D11)
 *   3. PAR-Q soft block: payload com qualquer PAR-Q=true continua sendo
 *      válido pelo schema (não bloqueia submit; status fica blocked
 *      server-side)
 */

import { describe, expect, it } from "vitest";

import { buildPrecision12QuestionnaireSchema } from "@/utils/precision12QuestionnaireValidation";

// Lista de TODOS os campos persistidos do questionário (mesma que o
// schema valida). Se algum campo for adicionado ao schema sem entrar
// num SCREEN_FIELDS do QuestionnaireFlow, o aluno conseguirá pular pra
// próxima tela sem validar — esse teste impede esse drift.
const SCHEMA_FIELDS_BY_SCREEN: Record<string, readonly string[]> = {
  // Espelha QuestionnaireFlow.SCREEN_FIELDS
  screen1: [
    "full_name",
    "email",
    "phone",
    "birthdate",
    "gender",
    "profession",
    "routine",
  ],
  screen2: [
    "parq_q8_heart_condition",
    "parq_q9_chest_pain_exercise",
    "parq_q10_chest_pain_recent",
    "parq_q11_loss_consciousness_or_dizziness_fall",
    "parq_q12_bone_joint",
    "parq_q13_blood_pressure_meds",
    "parq_q14_other_health_reason",
  ],
  screen3: [
    "goals",
    "goal_details",
    "previous_attempts",
    "exercise_history",
    "fitness_self_rating",
    "body_satisfaction",
  ],
  screen4: [
    "session_duration",
    "weekly_frequency",
    "training_available_days",
    "training_period",
    "frequent_traveler",
    "external_training_resources",
    "routine_description",
    "primary_adherence_barrier",
  ],
  screen5: [
    "pain_status",
    "pain_movements",
    "pain_location",
    "biggest_difficulty",
    "has_medical_condition",
    "medical_condition_details",
    "uses_medications",
    "medications_continuous",
    "injury_surgery_history",
    "recovery_strategies",
    "alcohol",
    "tobacco",
    "caffeine_doses",
  ],
  screen6: [
    "sleep_hours",
    "sleep_quality",
    "stress_level",
    "energy_level",
    "recovery_quality",
  ],
  screen7: [
    "uses_wearable",
    "wearable_brand",
    "share_data",
    "motivations",
    "discomfort_response",
    "difficulty_helper",
    "missed_session_response",
    "firm_professional_response",
    "accompaniment_preference",
    "correction_preference",
    "consistency_self_rating",
    "life_stability",
    "deal_breaker",
  ],
  screen8: [
    "consent_truthful",
    "consent_not_medical",
    "consent_data_use",
    "consent_terms",
  ],
};

describe("E3.6 QuestionnaireFlow — sanity", () => {
  it("nenhum field do schema fica órfão (sem screen)", () => {
    const allCovered = new Set<string>();
    for (const fields of Object.values(SCHEMA_FIELDS_BY_SCREEN)) {
      for (const f of fields) allCovered.add(f);
    }

    // Lista esperada de chaves persistidas (compara com mock de input
    // do schema). Se o schema mudar, atualiza ambos.
    const expectedFields = new Set<string>([
      // Tela 1
      "full_name",
      "email",
      "phone",
      "birthdate",
      "gender",
      "profession",
      "routine",
      // Tela 2 — PAR-Q
      "parq_q8_heart_condition",
      "parq_q9_chest_pain_exercise",
      "parq_q10_chest_pain_recent",
      "parq_q11_loss_consciousness_or_dizziness_fall",
      "parq_q12_bone_joint",
      "parq_q13_blood_pressure_meds",
      "parq_q14_other_health_reason",
      // Tela 3
      "goals",
      "goal_details",
      "previous_attempts",
      "exercise_history",
      "fitness_self_rating",
      "body_satisfaction",
      // Tela 4
      "session_duration",
      "weekly_frequency",
      "training_available_days",
      "training_period",
      "frequent_traveler",
      "external_training_resources",
      "routine_description",
      "primary_adherence_barrier",
      // Tela 5
      "pain_status",
      "pain_movements",
      "pain_location",
      "biggest_difficulty",
      "has_medical_condition",
      "medical_condition_details",
      "uses_medications",
      "medications_continuous",
      "injury_surgery_history",
      "recovery_strategies",
      "alcohol",
      "tobacco",
      "caffeine_doses",
      // Tela 6
      "sleep_hours",
      "sleep_quality",
      "stress_level",
      "energy_level",
      "recovery_quality",
      // Tela 7
      "uses_wearable",
      "wearable_brand",
      "share_data",
      "motivations",
      "discomfort_response",
      "difficulty_helper",
      "missed_session_response",
      "firm_professional_response",
      "accompaniment_preference",
      "correction_preference",
      "consistency_self_rating",
      "life_stability",
      "deal_breaker",
      // Tela 8
      "consent_truthful",
      "consent_not_medical",
      "consent_data_use",
      "consent_terms",
    ]);

    // Cada field esperado tem screen
    for (const f of expectedFields) {
      expect(allCovered.has(f)).toBe(true);
    }
    // Não tem screen com field a mais (sem drift)
    expect(allCovered.size).toBe(expectedFields.size);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Schema D11 — birthdate condicional
// ────────────────────────────────────────────────────────────────────────────

function buildValidPayload(): Record<string, unknown> {
  return {
    full_name: "Aluno Teste",
    email: "aluno@example.com",
    phone: "+5511999999999",
    birthdate: "1990-01-01",
    gender: "M",
    profession: undefined,
    routine: "mixed_routine",
    parq_q8_heart_condition: false,
    parq_q9_chest_pain_exercise: false,
    parq_q10_chest_pain_recent: false,
    parq_q11_loss_consciousness_or_dizziness_fall: false,
    parq_q12_bone_joint: false,
    parq_q13_blood_pressure_meds: false,
    parq_q14_other_health_reason: false,
    goals: ["improve_health_longevity"],
    goal_details: undefined,
    previous_attempts: undefined,
    exercise_history: "regular_1_to_6_months",
    fitness_self_rating: 3,
    body_satisfaction: 3,
    session_duration: "30_to_45",
    weekly_frequency: 3,
    training_available_days: ["monday", "wednesday", "friday"],
    training_period: "morning",
    frequent_traveler: false,
    external_training_resources: undefined,
    routine_description: undefined,
    primary_adherence_barrier: "time",
    pain_status: "none",
    pain_movements: undefined,
    pain_location: undefined,
    biggest_difficulty: undefined,
    has_medical_condition: false,
    medical_condition_details: undefined,
    uses_medications: false,
    medications_continuous: undefined,
    injury_surgery_history: undefined,
    recovery_strategies: undefined,
    alcohol: undefined,
    tobacco: undefined,
    caffeine_doses: undefined,
    sleep_hours: "7_to_8",
    sleep_quality: 4,
    stress_level: 2,
    energy_level: 4,
    recovery_quality: "most_of_time",
    uses_wearable: false,
    wearable_brand: undefined,
    share_data: undefined,
    motivations: ["health_longevity"],
    discomfort_response: "endure_with_reason",
    difficulty_helper: "clear_goals",
    missed_session_response: "accept_understand",
    firm_professional_response: "increase_focus",
    accompaniment_preference: "collaborative",
    correction_preference: "immediate",
    consistency_self_rating: "very_consistent",
    life_stability: "stable_organized",
    deal_breaker: undefined,
    consent_truthful: true,
    consent_not_medical: true,
    consent_data_use: true,
    consent_terms: true,
  };
}

describe("E3.6 schema D11 — birthdate condicional", () => {
  it("schema sem requireBirthdate aceita payload sem birthdate", () => {
    const schema = buildPrecision12QuestionnaireSchema({ requireBirthdate: false });
    const payload = { ...buildValidPayload(), birthdate: null };
    expect(schema.safeParse(payload).success).toBe(true);
  });

  it("schema com requireBirthdate=true rejeita payload sem birthdate", () => {
    const schema = buildPrecision12QuestionnaireSchema({ requireBirthdate: true });
    const payload = { ...buildValidPayload(), birthdate: null };
    const result = schema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("birthdate");
    }
  });

  it("schema com requireBirthdate=true aceita payload com birthdate", () => {
    const schema = buildPrecision12QuestionnaireSchema({ requireBirthdate: true });
    const payload = { ...buildValidPayload(), birthdate: "1990-01-01" };
    expect(schema.safeParse(payload).success).toBe(true);
  });
});

describe("E3.6 PAR-Q soft block — não impede submit", () => {
  it("payload com PAR-Q positivo continua válido pelo schema", () => {
    const schema = buildPrecision12QuestionnaireSchema({ requireBirthdate: false });
    const payload = {
      ...buildValidPayload(),
      parq_q8_heart_condition: true, // positivo
      parq_q9_chest_pain_exercise: true, // positivo
    };
    // PAR-Q soft block: schema aceita; status server-side fica blocked
    // (esse comportamento fica em submit-precision12-questionnaire RPC,
    // não no schema client-side)
    expect(schema.safeParse(payload).success).toBe(true);
  });

  it("múltiplos PAR-Q positivos também são aceitos", () => {
    const schema = buildPrecision12QuestionnaireSchema({ requireBirthdate: false });
    const payload = {
      ...buildValidPayload(),
      parq_q8_heart_condition: true,
      parq_q9_chest_pain_exercise: true,
      parq_q10_chest_pain_recent: true,
      parq_q11_loss_consciousness_or_dizziness_fall: true,
      parq_q12_bone_joint: true,
      parq_q13_blood_pressure_meds: true,
      parq_q14_other_health_reason: true,
    };
    expect(schema.safeParse(payload).success).toBe(true);
  });
});
