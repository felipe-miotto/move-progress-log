/**
 * Tests do schema + helpers do Questionário Precision 12 v1.
 *
 * Cobre os critérios do briefing E3.3:
 *   - Derivações training_experience_level / active_last_30_days (6 codes)
 *   - PAR-Q soft block com 0, 1 e múltiplos "sim"
 *   - Medicamentos true exige texto / false permite null
 *   - 4 consentimentos obrigatoriamente true
 *   - Wearable true exige marca
 *   - Medical condition true exige detalhe
 *   - Arrays rejeitam código inválido
 *   - Payload normalizado NÃO inclui parq_blocked
 *   - Payload normalizado usa corretamente os 6 campos novos
 */

import { describe, expect, it } from "vitest";

import {
  EXERCISE_HISTORY_CODES,
  type ExerciseHistoryCode,
} from "@/constants/precision12Questionnaire";
import {
  buildPrecision12QuestionnaireSchema,
  deriveActiveLast30Days,
  deriveParqBlocked,
  deriveTrainingExperienceLevel,
  normalizeQuestionnairePayload,
  precision12QuestionnaireSchema,
  type Precision12QuestionnaireInput,
} from "../precision12QuestionnaireValidation";

const ASSESSMENT_ID = "11111111-1111-1111-1111-111111111111";

/**
 * Factory de input válido (todos campos obrigatórios preenchidos + sem
 * gatilhos condicionais). Cada teste sobrescreve apenas o que importa.
 */
const validInput = (
  override: Partial<Precision12QuestionnaireInput> = {},
): Precision12QuestionnaireInput => ({
  // Tela 1
  full_name: "João da Silva",
  email: "joao@example.com",
  phone: "+5511999999999",
  birthdate: "1985-03-15",
  gender: "M",
  profession: undefined,
  routine: "mixed_routine",

  // Tela 2 — todos false (PAR-Q limpo)
  parq_q8_heart_condition: false,
  parq_q9_chest_pain_exercise: false,
  parq_q10_chest_pain_recent: false,
  parq_q11_loss_consciousness_or_dizziness_fall: false,
  parq_q12_bone_joint: false,
  parq_q13_blood_pressure_meds: false,
  parq_q14_other_health_reason: false,

  // Tela 3
  goals: ["improve_health_longevity"],
  goal_details: undefined,
  previous_attempts: undefined,
  exercise_history: "regular_1_to_6_months",
  fitness_self_rating: 3,
  body_satisfaction: 3,

  // Tela 4
  session_duration: "30_to_45",
  weekly_frequency: 3,
  training_available_days: ["monday", "wednesday", "friday"],
  training_period: "morning",
  frequent_traveler: false,
  external_training_resources: undefined,
  routine_description: undefined,
  primary_adherence_barrier: "time",

  // Tela 5 — sem dor, sem condição médica, sem medicamentos
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

  // Tela 6
  sleep_hours: "7_to_8",
  sleep_quality: 4,
  stress_level: 2,
  energy_level: 4,
  recovery_quality: "most_of_time",

  // Tela 7 — sem wearable
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

  // Tela 8 — consentimento completo
  consent_truthful: true,
  consent_not_medical: true,
  consent_data_use: true,
  consent_terms: true,

  ...override,
});

// ────────────────────────────────────────────────────────────────────────────
// Derivações
// ────────────────────────────────────────────────────────────────────────────

describe("deriveTrainingExperienceLevel", () => {
  const expected: Record<ExerciseHistoryCode, string> = {
    never_regular: "sedentary",
    stopped_more_than_1_month: "sedentary",
    returning_less_than_1_month: "transitioning",
    regular_1_to_6_months: "beginner",
    regular_6_months_to_2_years: "intermediate",
    regular_more_than_2_years: "advanced",
  };

  it("mapeia os 6 codes do exercise_history pra nível de experiência", () => {
    for (const code of EXERCISE_HISTORY_CODES) {
      expect(deriveTrainingExperienceLevel(code)).toBe(expected[code]);
    }
  });

  it("nunca chama essa função 'classificação ACSM' — é triagem operacional Fabrik", () => {
    // Teste documental: garante que o tipo retornado é training_experience_level,
    // não acsm_level. Se alguém renomear de volta, esse teste quebra.
    const result = deriveTrainingExperienceLevel("regular_1_to_6_months");
    // Type-level check: should be TrainingExperienceLevel, not "acsm_*"
    expect(["sedentary", "transitioning", "beginner", "intermediate", "advanced"]).toContain(
      result,
    );
  });
});

describe("deriveActiveLast30Days", () => {
  it("retorna false para never_regular e stopped_more_than_1_month", () => {
    expect(deriveActiveLast30Days("never_regular")).toBe(false);
    expect(deriveActiveLast30Days("stopped_more_than_1_month")).toBe(false);
  });

  it("retorna true para todos os outros codes", () => {
    expect(deriveActiveLast30Days("returning_less_than_1_month")).toBe(true);
    expect(deriveActiveLast30Days("regular_1_to_6_months")).toBe(true);
    expect(deriveActiveLast30Days("regular_6_months_to_2_years")).toBe(true);
    expect(deriveActiveLast30Days("regular_more_than_2_years")).toBe(true);
  });

  it("cobre exaustivamente os 6 codes do exercise_history", () => {
    for (const code of EXERCISE_HISTORY_CODES) {
      const result = deriveActiveLast30Days(code);
      expect(typeof result).toBe("boolean");
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PAR-Q soft block
// ────────────────────────────────────────────────────────────────────────────

describe("deriveParqBlocked", () => {
  it("retorna false quando todos os 7 PAR-Q são false (limpo)", () => {
    expect(
      deriveParqBlocked({
        parq_q8_heart_condition: false,
        parq_q9_chest_pain_exercise: false,
        parq_q10_chest_pain_recent: false,
        parq_q11_loss_consciousness_or_dizziness_fall: false,
        parq_q12_bone_joint: false,
        parq_q13_blood_pressure_meds: false,
        parq_q14_other_health_reason: false,
      }),
    ).toBe(false);
  });

  it("retorna true com 1 PAR-Q positivo", () => {
    expect(
      deriveParqBlocked({
        parq_q8_heart_condition: false,
        parq_q9_chest_pain_exercise: true, // único positivo
        parq_q10_chest_pain_recent: false,
        parq_q11_loss_consciousness_or_dizziness_fall: false,
        parq_q12_bone_joint: false,
        parq_q13_blood_pressure_meds: false,
        parq_q14_other_health_reason: false,
      }),
    ).toBe(true);
  });

  it("retorna true com múltiplos PAR-Q positivos", () => {
    expect(
      deriveParqBlocked({
        parq_q8_heart_condition: true,
        parq_q9_chest_pain_exercise: false,
        parq_q10_chest_pain_recent: false,
        parq_q11_loss_consciousness_or_dizziness_fall: false,
        parq_q12_bone_joint: true,
        parq_q13_blood_pressure_meds: false,
        parq_q14_other_health_reason: true,
      }),
    ).toBe(true);
  });

  it("trata null/undefined como false (defensivo)", () => {
    expect(
      deriveParqBlocked({
        parq_q8_heart_condition: null,
        parq_q9_chest_pain_exercise: undefined,
        parq_q10_chest_pain_recent: false,
        parq_q11_loss_consciousness_or_dizziness_fall: false,
        parq_q12_bone_joint: false,
        parq_q13_blood_pressure_meds: false,
        parq_q14_other_health_reason: false,
      }),
    ).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Schema cross-field
// ────────────────────────────────────────────────────────────────────────────

describe("precision12QuestionnaireSchema — happy path", () => {
  it("aceita input completo válido", () => {
    const result = precision12QuestionnaireSchema.safeParse(validInput());
    expect(result.success).toBe(true);
  });
});

describe("precision12QuestionnaireSchema — medicamentos", () => {
  it("uses_medications=true exige medications_continuous", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({ uses_medications: true, medications_continuous: undefined }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasMedField = result.error.issues.some((issue) =>
        issue.path.includes("medications_continuous"),
      );
      expect(hasMedField).toBe(true);
    }
  });

  it("uses_medications=true + medications_continuous preenchido valida", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({
        uses_medications: true,
        medications_continuous: "Losartana 50mg/dia",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("uses_medications=false permite medications_continuous null/empty", () => {
    expect(
      precision12QuestionnaireSchema.safeParse(
        validInput({ uses_medications: false, medications_continuous: undefined }),
      ).success,
    ).toBe(true);

    expect(
      precision12QuestionnaireSchema.safeParse(
        validInput({ uses_medications: false, medications_continuous: "" }),
      ).success,
    ).toBe(true);
  });
});

describe("precision12QuestionnaireSchema — consentimento", () => {
  it("rejeita se algum dos 4 consents for false", () => {
    expect(
      precision12QuestionnaireSchema.safeParse(
        validInput({ consent_truthful: false as unknown as true }),
      ).success,
    ).toBe(false);

    expect(
      precision12QuestionnaireSchema.safeParse(
        validInput({ consent_not_medical: false as unknown as true }),
      ).success,
    ).toBe(false);

    expect(
      precision12QuestionnaireSchema.safeParse(
        validInput({ consent_data_use: false as unknown as true }),
      ).success,
    ).toBe(false);

    expect(
      precision12QuestionnaireSchema.safeParse(
        validInput({ consent_terms: false as unknown as true }),
      ).success,
    ).toBe(false);
  });

  it("aceita se todos os 4 consents = true", () => {
    expect(precision12QuestionnaireSchema.safeParse(validInput()).success).toBe(
      true,
    );
  });
});

describe("precision12QuestionnaireSchema — wearable", () => {
  it("uses_wearable=true exige wearable_brand", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({ uses_wearable: true, wearable_brand: undefined }),
    );
    expect(result.success).toBe(false);
  });

  it("uses_wearable=true + wearable_brand=whoop persiste whoop", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({
        uses_wearable: true,
        wearable_brand: "whoop",
        share_data: true,
      }),
    );
    expect(result.success).toBe(true);

    if (result.success) {
      const payload = normalizeQuestionnairePayload(result.data, ASSESSMENT_ID);
      expect(payload.wearable_brand).toBe("whoop");
      expect(payload.share_data).toBe(true);
    }
  });
});

describe("precision12QuestionnaireSchema — medical condition", () => {
  it("has_medical_condition=true exige medical_condition_details", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({
        has_medical_condition: true,
        medical_condition_details: undefined,
      }),
    );
    expect(result.success).toBe(false);
  });

  it("has_medical_condition=false permite medical_condition_details vazio", () => {
    expect(
      precision12QuestionnaireSchema.safeParse(
        validInput({
          has_medical_condition: false,
          medical_condition_details: undefined,
        }),
      ).success,
    ).toBe(true);
  });
});

describe("precision12QuestionnaireSchema — arrays rejeitam código inválido", () => {
  it("goals rejeita code fora do enum", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({ goals: ["fake_goal_code"] as unknown as never[] }),
    );
    expect(result.success).toBe(false);
  });

  it("training_available_days rejeita day fora do enum", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({
        training_available_days: ["monday", "funday"] as unknown as never[],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("training_available_days rejeita duplicatas", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({
        training_available_days: ["monday", "monday", "tuesday"],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("external_training_resources aceita codes válidos", () => {
    expect(
      precision12QuestionnaireSchema.safeParse(
        validInput({
          external_training_resources: ["gym_near_home", "outdoor"],
        }),
      ).success,
    ).toBe(true);
  });

  it("motivations rejeita > 2 itens (máx 2)", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({
        motivations: ["health_longevity", "performance", "aesthetics"],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("goals rejeita > 2 itens (máx 2)", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({
        goals: ["reduce_body_fat", "gain_muscle", "improve_performance"],
      }),
    );
    expect(result.success).toBe(false);
  });
});

describe("precision12QuestionnaireSchema — pain status condicional (movements E location)", () => {
  it("pain_status=daily sem nenhum dos dois (movements/location) rejeita", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({
        pain_status: "daily",
        pain_movements: undefined,
        pain_location: undefined,
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("pain_movements");
      expect(paths).toContain("pain_location");
    }
  });

  it("pain_status=daily só com movements (sem location) rejeita", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({
        pain_status: "daily",
        pain_movements: ["squat_sit_stand"],
        pain_location: undefined,
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("pain_location");
    }
  });

  it("pain_status=daily só com location (sem movements) rejeita", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({
        pain_status: "daily",
        pain_movements: undefined,
        pain_location: "Joelho direito ao agachar",
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("pain_movements");
    }
  });

  it("pain_status=daily com AMBOS movements + location aceita", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({
        pain_status: "daily",
        pain_movements: ["squat_sit_stand"],
        pain_location: "Joelho direito ao agachar",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("pain_status=during_training com AMBOS aceita", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({
        pain_status: "during_training",
        pain_movements: ["push", "pull"],
        pain_location: "Ombro esquerdo em exercícios overhead",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("pain_status=none não exige nenhum dos dois", () => {
    expect(
      precision12QuestionnaireSchema.safeParse(
        validInput({ pain_status: "none" }),
      ).success,
    ).toBe(true);
  });
});

describe("precision12QuestionnaireSchema — `none` exclusivo em arrays multi", () => {
  it("external_training_resources=['none'] aceita", () => {
    expect(
      precision12QuestionnaireSchema.safeParse(
        validInput({ external_training_resources: ["none"] }),
      ).success,
    ).toBe(true);
  });

  it("external_training_resources=['none','outdoor'] rejeita", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({ external_training_resources: ["none", "outdoor"] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("external_training_resources");
    }
  });

  it("recovery_strategies=['none'] aceita", () => {
    expect(
      precision12QuestionnaireSchema.safeParse(
        validInput({ recovery_strategies: ["none"] }),
      ).success,
    ).toBe(true);
  });

  it("recovery_strategies=['none','sauna'] rejeita", () => {
    const result = precision12QuestionnaireSchema.safeParse(
      validInput({ recovery_strategies: ["none", "sauna"] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("recovery_strategies");
    }
  });
});

describe("precision12QuestionnaireSchema — birthdate condicional (D11)", () => {
  it("schema padrão: birthdate é opcional", () => {
    expect(
      precision12QuestionnaireSchema.safeParse(validInput({ birthdate: null }))
        .success,
    ).toBe(true);
  });

  it("schema com requireBirthdate=true: birthdate obrigatório", () => {
    const schema = buildPrecision12QuestionnaireSchema({
      requireBirthdate: true,
    });
    const result = schema.safeParse(validInput({ birthdate: null }));
    expect(result.success).toBe(false);
  });

  it("schema com requireBirthdate=true + birthdate preenchido aceita", () => {
    const schema = buildPrecision12QuestionnaireSchema({
      requireBirthdate: true,
    });
    expect(schema.safeParse(validInput({ birthdate: "1990-01-01" })).success).toBe(
      true,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// normalizeQuestionnairePayload
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeQuestionnairePayload — saneamento", () => {
  it("payload NÃO inclui parq_blocked (generated column)", () => {
    const payload = normalizeQuestionnairePayload(validInput(), ASSESSMENT_ID);
    expect(payload).not.toHaveProperty("parq_blocked");
  });

  it("payload NÃO inclui submitted_at (edge function preenche server-side)", () => {
    const payload = normalizeQuestionnairePayload(validInput(), ASSESSMENT_ID);
    expect(payload).not.toHaveProperty("submitted_at");
  });

  it("preenche questionnaire_version = precision12_v1", () => {
    const payload = normalizeQuestionnairePayload(validInput(), ASSESSMENT_ID);
    expect(payload.questionnaire_version).toBe("precision12_v1");
  });

  it("preenche assessment_id do argumento", () => {
    const payload = normalizeQuestionnairePayload(validInput(), ASSESSMENT_ID);
    expect(payload.assessment_id).toBe(ASSESSMENT_ID);
  });

  it("trima strings de campos obrigatórios", () => {
    const payload = normalizeQuestionnairePayload(
      validInput({ full_name: "  Maria  " }),
      ASSESSMENT_ID,
    );
    expect(payload.full_name).toBe("Maria");
  });

  it("vazios opcionais viram null no payload", () => {
    const payload = normalizeQuestionnairePayload(
      validInput({ goal_details: undefined, profession: undefined }),
      ASSESSMENT_ID,
    );
    expect(payload.goal_details).toBeNull();
    expect(payload.profession).toBeNull();
  });

  it("medications_continuous=null quando uses_medications=false", () => {
    const payload = normalizeQuestionnairePayload(
      validInput({
        uses_medications: false,
        medications_continuous: "deveria ser ignorado",
      }),
      ASSESSMENT_ID,
    );
    expect(payload.medications_continuous).toBeNull();
  });

  it("medications_continuous preservado quando uses_medications=true", () => {
    const payload = normalizeQuestionnairePayload(
      validInput({
        uses_medications: true,
        medications_continuous: "Losartana 50mg",
      }),
      ASSESSMENT_ID,
    );
    expect(payload.medications_continuous).toBe("Losartana 50mg");
  });

  it("medical_condition_details=null quando has_medical_condition=false", () => {
    const payload = normalizeQuestionnairePayload(
      validInput({
        has_medical_condition: false,
        medical_condition_details: "deveria ser ignorado",
      }),
      ASSESSMENT_ID,
    );
    expect(payload.medical_condition_details).toBeNull();
  });

  it("wearable_brand/share_data=null quando uses_wearable=false", () => {
    const payload = normalizeQuestionnairePayload(
      validInput({
        uses_wearable: false,
        wearable_brand: undefined,
        share_data: undefined,
      }),
      ASSESSMENT_ID,
    );
    expect(payload.wearable_brand).toBeNull();
    expect(payload.share_data).toBeNull();
  });

  it("pain_movements/pain_location=null quando pain_status=none", () => {
    const payload = normalizeQuestionnairePayload(
      validInput({
        pain_status: "none",
        pain_movements: ["squat_sit_stand"], // deveria ser ignorado
        pain_location: "deveria ser ignorado",
      }),
      ASSESSMENT_ID,
    );
    expect(payload.pain_movements).toBeNull();
    expect(payload.pain_location).toBeNull();
  });
});

describe("normalizeQuestionnairePayload — 6 campos novos da E3.2", () => {
  it("training_available_days persiste array de codes válidos", () => {
    const payload = normalizeQuestionnairePayload(
      validInput({ training_available_days: ["tuesday", "thursday", "saturday"] }),
      ASSESSMENT_ID,
    );
    expect(payload.training_available_days).toEqual([
      "tuesday",
      "thursday",
      "saturday",
    ]);
  });

  it("external_training_resources persiste array ou null se vazio", () => {
    const payloadWithItems = normalizeQuestionnairePayload(
      validInput({ external_training_resources: ["gym_near_home", "outdoor"] }),
      ASSESSMENT_ID,
    );
    expect(payloadWithItems.external_training_resources).toEqual([
      "gym_near_home",
      "outdoor",
    ]);

    const payloadEmpty = normalizeQuestionnairePayload(
      validInput({ external_training_resources: undefined }),
      ASSESSMENT_ID,
    );
    expect(payloadEmpty.external_training_resources).toBeNull();
  });

  it("primary_adherence_barrier persiste code", () => {
    const payload = normalizeQuestionnairePayload(
      validInput({ primary_adherence_barrier: "energy_fatigue" }),
      ASSESSMENT_ID,
    );
    expect(payload.primary_adherence_barrier).toBe("energy_fatigue");
  });

  it("uses_medications boolean persiste fielmente", () => {
    const payloadTrue = normalizeQuestionnairePayload(
      validInput({
        uses_medications: true,
        medications_continuous: "Atorvastatina 20mg",
      }),
      ASSESSMENT_ID,
    );
    expect(payloadTrue.uses_medications).toBe(true);

    const payloadFalse = normalizeQuestionnairePayload(
      validInput({ uses_medications: false }),
      ASSESSMENT_ID,
    );
    expect(payloadFalse.uses_medications).toBe(false);
  });

  it("medications_continuous persiste texto trimado quando uses_medications=true", () => {
    const payload = normalizeQuestionnairePayload(
      validInput({
        uses_medications: true,
        medications_continuous: "  Anticoncepcional contínuo  ",
      }),
      ASSESSMENT_ID,
    );
    expect(payload.medications_continuous).toBe("Anticoncepcional contínuo");
  });

  it("injury_surgery_history persiste texto livre (sem limite temporal — D5)", () => {
    const payload = normalizeQuestionnairePayload(
      validInput({
        injury_surgery_history:
          "Cirurgia LCA joelho direito em 2015, ainda limita agachamento profundo",
      }),
      ASSESSMENT_ID,
    );
    expect(payload.injury_surgery_history).toContain("2015");
  });

  it("todos os 6 campos novos estão presentes no payload (não foram esquecidos)", () => {
    const payload = normalizeQuestionnairePayload(
      validInput({
        training_available_days: ["monday"],
        external_training_resources: ["home_cardio"],
        primary_adherence_barrier: "motivation",
        uses_medications: true,
        medications_continuous: "Vitamina D",
        injury_surgery_history: "Nenhuma",
      }),
      ASSESSMENT_ID,
    );
    expect(payload.training_available_days).toBeDefined();
    expect(payload.external_training_resources).toBeDefined();
    expect(payload.primary_adherence_barrier).toBeDefined();
    expect(payload.uses_medications).toBeDefined();
    expect(payload.medications_continuous).toBeDefined();
    expect(payload.injury_surgery_history).toBeDefined();
  });
});
