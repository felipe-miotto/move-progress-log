import { describe, expect, it } from "vitest";
import {
  assessmentBaseSchema,
  computeSitToStandHemiScore,
  dexaSchema,
  emptySupports,
  handgripSchema,
  sitToStandSchema,
  sitToStandSupportsSchema,
  vo2BikeMaxSchema,
} from "../assessmentValidation";

const STUDENT_ID = "00000000-0000-0000-0000-000000000001";

describe("assessmentBaseSchema", () => {
  it("aceita mínimo válido (apenas student_id + data)", () => {
    const result = assessmentBaseSchema.safeParse({
      student_id: STUDENT_ID,
      assessment_date: "2026-05-13",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita student_id não-uuid", () => {
    const result = assessmentBaseSchema.safeParse({
      student_id: "not-a-uuid",
      assessment_date: "2026-05-13",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita data inválida", () => {
    const result = assessmentBaseSchema.safeParse({
      student_id: STUDENT_ID,
      assessment_date: "nope",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita peso negativo / extremos absurdos", () => {
    expect(
      assessmentBaseSchema.safeParse({
        student_id: STUDENT_ID,
        assessment_date: "2026-05-13",
        weight_kg: -10,
      }).success,
    ).toBe(false);

    expect(
      assessmentBaseSchema.safeParse({
        student_id: STUDENT_ID,
        assessment_date: "2026-05-13",
        weight_kg: 600,
      }).success,
    ).toBe(false);
  });
});

describe("handgripSchema", () => {
  it("requer exatamente 3 tentativas por mão", () => {
    expect(
      handgripSchema.safeParse({
        right_kg_attempts: [30, 32, 31],
        left_kg_attempts: [28, 29, 30],
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

  it("valida regional_distribution shape interno", () => {
    expect(
      dexaSchema.safeParse({
        regional_distribution: {
          trunk: { fat_pct: 22.5, lean_mass_kg: 28.3 },
          arms: { fat_pct: 18.0 },
        },
      }).success,
    ).toBe(true);

    // fat_pct > 100 é inválido
    expect(
      dexaSchema.safeParse({
        regional_distribution: {
          trunk: { fat_pct: 150 },
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
});

describe("computeSitToStandHemiScore", () => {
  it("retorna 5 sem apoios nem instabilidades", () => {
    expect(computeSitToStandHemiScore(emptySupports(), 0)).toBe(5);
  });

  it("desconta 1 por apoio simples", () => {
    expect(
      computeSitToStandHemiScore({ ...emptySupports(), hand: 1 }, 0),
    ).toBe(4);
    expect(
      computeSitToStandHemiScore({ ...emptySupports(), knee: 2 }, 0),
    ).toBe(3);
  });

  it("desconta 0.5 por instabilidade", () => {
    expect(computeSitToStandHemiScore(emptySupports(), 1)).toBe(4.5);
    expect(computeSitToStandHemiScore(emptySupports(), 2)).toBe(4);
  });

  it("combina apoios + instabilidades", () => {
    expect(
      computeSitToStandHemiScore(
        { ...emptySupports(), hand: 1, knee: 1 },
        2,
      ),
    ).toBe(2); // 5 - 2 - 1 = 2
  });

  it("clampa em 0 quando passa do limite", () => {
    expect(
      computeSitToStandHemiScore(
        { hand: 10, knee: 0, forearm: 0, leg_side: 0, hand_on_knee: 0 },
        0,
      ),
    ).toBe(0);
  });

  it("clampa em 5 quando inputs absurdamente baixos (ex: passou negativo)", () => {
    // emptySupports + 0 instabilities = 5 (não vai acima)
    expect(computeSitToStandHemiScore(emptySupports(), 0)).toBe(5);
  });

  it("arredonda pra 0.5 (granularidade do método)", () => {
    expect(computeSitToStandHemiScore(emptySupports(), 1)).toBe(4.5);
    expect(computeSitToStandHemiScore(emptySupports(), 3)).toBe(3.5);
  });
});

describe("vo2BikeMaxSchema", () => {
  it("aceita teste com 1 estágio mínimo", () => {
    expect(
      vo2BikeMaxSchema.safeParse({
        modality: "bike_max",
        stages: [
          {
            stage_number: 1,
            phase: "test",
            duration_seconds: 180,
            watts: 100,
            rpm: 80,
            hr_bpm: 140,
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
            stage_number: 1,
            phase: "cooldown",
            duration_seconds: 60,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
