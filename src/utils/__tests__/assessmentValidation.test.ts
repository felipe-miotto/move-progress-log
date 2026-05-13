import { describe, expect, it } from "vitest";
import {
  assessmentBaseSchema,
  cardiovascularBaselineSchema,
  computeSitToStandHemiScore,
  dexaSchema,
  emptySupports,
  handgripSchema,
  sitToStandSchema,
  sitToStandSupportsSchema,
  subjectiveScoresSchema,
  vo2BikeMaxSchema,
} from "../assessmentValidation";

const STUDENT_ID = "00000000-0000-0000-0000-000000000001";

const todayIso = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

const tomorrowIso = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

describe("assessmentBaseSchema", () => {
  it("aceita mínimo válido (apenas student_id + data)", () => {
    const result = assessmentBaseSchema.safeParse({
      student_id: STUDENT_ID,
      assessment_date: todayIso(),
    });
    expect(result.success).toBe(true);
  });

  it("rejeita student_id não-uuid", () => {
    const result = assessmentBaseSchema.safeParse({
      student_id: "not-a-uuid",
      assessment_date: todayIso(),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita data inválida", () => {
    const result = assessmentBaseSchema.safeParse({
      student_id: STUDENT_ID,
      assessment_date: "2026-02-31",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita data futura", () => {
    const result = assessmentBaseSchema.safeParse({
      student_id: STUDENT_ID,
      assessment_date: tomorrowIso(),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita peso negativo / extremos absurdos", () => {
    expect(
      assessmentBaseSchema.safeParse({
        student_id: STUDENT_ID,
        assessment_date: todayIso(),
        weight_kg: -10,
      }).success,
    ).toBe(false);

    expect(
      assessmentBaseSchema.safeParse({
        student_id: STUDENT_ID,
        assessment_date: todayIso(),
        weight_kg: 600,
      }).success,
    ).toBe(false);
  });
});

describe("handgripSchema", () => {
  it("requer exatamente 3 tentativas por mão", () => {
    expect(
      handgripSchema.safeParse({
        dominant_hand: "right",
        right_kg_attempts: [30, 32, 31],
        left_kg_attempts: [28, 29, 30],
        right_kg: 32,
        left_kg: 30,
      }).success,
    ).toBe(true);

    expect(
      handgripSchema.safeParse({
        right_kg_attempts: [30, 32],
        left_kg_attempts: [28, 29, 30],
      }).success,
    ).toBe(false);
  });

  it("rejeita valores negativos", () => {
    expect(
      handgripSchema.safeParse({
        right_kg_attempts: [30, -1, 31],
        left_kg_attempts: [28, 29, 30],
      }).success,
    ).toBe(false);
  });
});

describe("dexaSchema", () => {
  it("aceita raw_extracted_json como qualquer shape", () => {
    expect(
      dexaSchema.safeParse({
        raw_extracted_json: { anything: "goes here", nested: { ok: 1 } },
      }).success,
    ).toBe(true);
  });

  it("valida regional_distribution shape interno com nomes reais", () => {
    expect(
      dexaSchema.safeParse({
        regional_distribution: {
          trunk: { fat_pct: 22.5, lean_mass_g: 28_300, fat_mass_g: 8_200 },
          arms_right: { fat_pct: 18.0, lean_mass_g: 3_200, fat_mass_g: 700 },
        },
      }).success,
    ).toBe(true);

    expect(
      dexaSchema.safeParse({
        regional_distribution: {
          trunk: { fat_pct: 150, lean_mass_g: 28_300, fat_mass_g: 8_200 },
        },
      }).success,
    ).toBe(false);
  });
});

describe("sitToStandSupportsSchema", () => {
  it("aceita counts >= 0", () => {
    expect(sitToStandSupportsSchema.safeParse(emptySupports()).success).toBe(true);
    expect(
      sitToStandSupportsSchema.safeParse({
        hand: 2,
        knee: 1,
        forearm: 0,
        leg_side: 0,
        hand_on_knee: 0,
      }).success,
    ).toBe(true);
  });

  it("rejeita counts negativos", () => {
    expect(
      sitToStandSupportsSchema.safeParse({
        ...emptySupports(),
        hand: -1,
      }).success,
    ).toBe(false);
  });
});

describe("sitToStandSchema", () => {
  it("aceita scores 0-5 com supports zerados", () => {
    expect(
      sitToStandSchema.safeParse({
        sit_score: 5,
        sit_supports: emptySupports(),
        sit_instabilities: 0,
        rise_score: 5,
        rise_supports: emptySupports(),
        rise_instabilities: 0,
      }).success,
    ).toBe(true);
  });

  it("rejeita score > 5 (cada hemiteste vale 0-5)", () => {
    expect(
      sitToStandSchema.safeParse({
        sit_score: 6,
        sit_supports: emptySupports(),
        sit_instabilities: 0,
        rise_score: 5,
        rise_supports: emptySupports(),
        rise_instabilities: 0,
      }).success,
    ).toBe(false);
  });

  it("rejeita score fora da granularidade de 0.5", () => {
    expect(
      sitToStandSchema.safeParse({
        sit_score: 3.25,
        sit_supports: emptySupports(),
        sit_instabilities: 0,
        rise_score: 5,
        rise_supports: emptySupports(),
        rise_instabilities: 0,
      }).success,
    ).toBe(false);
  });
});

describe("computeSitToStandHemiScore", () => {
  it("retorna 5 sem apoios nem instabilidades", () => {
    expect(computeSitToStandHemiScore(emptySupports(), 0)).toBe(5);
  });

  it("desconta 1 por apoio simples", () => {
    expect(computeSitToStandHemiScore({ ...emptySupports(), hand: 1 }, 0)).toBe(4);
    expect(computeSitToStandHemiScore({ ...emptySupports(), knee: 2 }, 0)).toBe(3);
  });

  it("desconta 0.5 por instabilidade", () => {
    expect(computeSitToStandHemiScore(emptySupports(), 1)).toBe(4.5);
    expect(computeSitToStandHemiScore(emptySupports(), 2)).toBe(4);
  });

  it("combina apoios + instabilidades", () => {
    expect(
      computeSitToStandHemiScore({ ...emptySupports(), hand: 1, knee: 1 }, 2),
    ).toBe(2);
  });

  it("clampa em 0 quando passa do limite", () => {
    expect(
      computeSitToStandHemiScore(
        { hand: 10, knee: 0, forearm: 0, leg_side: 0, hand_on_knee: 0 },
        0,
      ),
    ).toBe(0);
  });

  it("arredonda pra 0.5 (granularidade do método)", () => {
    expect(computeSitToStandHemiScore(emptySupports(), 1)).toBe(4.5);
    expect(computeSitToStandHemiScore(emptySupports(), 3)).toBe(3.5);
  });
});

describe("vo2BikeMaxSchema", () => {
  it("aceita teste com 1 estágio mínimo usando colunas reais", () => {
    expect(
      vo2BikeMaxSchema.safeParse({
        modality: "bike_max",
        last_valid_load: 5,
        last_valid_watts: 100,
        stages: [
          {
            stage_order: 1,
            phase: "test",
            time_label: "3:00",
            load_value: 5,
            rpm_target: "70-80",
            watts_observed: 100,
            hr_final: 140,
            pse: 7,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejeita teste sem estágios", () => {
    expect(
      vo2BikeMaxSchema.safeParse({ modality: "bike_max", stages: [] }).success,
    ).toBe(false);
  });

  it("rejeita phase fora do enum", () => {
    expect(
      vo2BikeMaxSchema.safeParse({
        modality: "bike_max",
        stages: [
          {
            stage_order: 1,
            phase: "cooldown",
            time_label: "1:00",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejeita PSE fora do check constraint SQL (6-10)", () => {
    expect(
      vo2BikeMaxSchema.safeParse({
        modality: "bike_max",
        stages: [
          {
            stage_order: 1,
            phase: "test",
            pse: 5,
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("cardiovascularBaselineSchema", () => {
  it("usa os nomes reais das colunas e ranges do banco", () => {
    expect(
      cardiovascularBaselineSchema.safeParse({
        systolic_mmhg: 120,
        diastolic_mmhg: 80,
        resting_hr_bpm: 60,
        on_medication: false,
      }).success,
    ).toBe(true);

    expect(
      cardiovascularBaselineSchema.safeParse({ systolic_mmhg: 40 }).success,
    ).toBe(false);
  });
});

describe("subjectiveScoresSchema", () => {
  it("usa os 6 scores reais 0-10", () => {
    expect(
      subjectiveScoresSchema.safeParse({
        recorded_at: todayIso(),
        sleep_score: 8,
        energy_score: 7,
        stress_score: 3,
        recovery_score: 8,
        wellbeing_score: 9,
        mood_score: 8,
      }).success,
    ).toBe(true);

    expect(subjectiveScoresSchema.safeParse({ mood_score: 11 }).success).toBe(false);
  });
});
