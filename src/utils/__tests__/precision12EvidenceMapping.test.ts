/**
 * E5.5 — Testes do mapping `CoachConsoleQuestionnaire` →
 * `Precision12EvidenceInput`.
 */

import { describe, expect, it } from "vitest";

import {
  ADHERENCE_RISK_MIN_FLAGS,
  type CoachConsoleQuestionnaire,
} from "../precision12CoachConsole";
import { deriveEvidenceClaims } from "../precision12EvidenceDerivation";
import {
  LIMITATIONS_NOT_COVERED_YET,
  QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET,
  deriveAdherenceFlagsFromResponse,
  indexResponsesByAssessmentId,
  mapQuestionnaireResponseToEvidenceInput,
} from "../precision12EvidenceMapping";

function makeResponse(
  overrides: Partial<CoachConsoleQuestionnaire> = {},
): CoachConsoleQuestionnaire {
  return {
    assessment_id: "a1",
    parq_blocked: false,
    primary_adherence_barrier: null,
    sleep_quality: 5,
    stress_level: 1,
    energy_level: 5,
    consistency_self_rating: "very_consistent",
    life_stability: "stable_organized",
    pain_status: "none",
    uses_medications: false,
    has_medical_condition: false,
    injury_surgery_history: null,
    ...overrides,
  };
}

// ── deriveAdherenceFlagsFromResponse ────────────────────────────────────────

describe("deriveAdherenceFlagsFromResponse", () => {
  it("resposta limpa → todas as 7 flags false e count 0", () => {
    const flags = deriveAdherenceFlagsFromResponse(makeResponse());
    expect(flags).toEqual({
      sleepFlag: false,
      stressFlag: false,
      energyFlag: false,
      barrierFlag: false,
      consistencyFlag: false,
      lifeStabilityFlag: false,
      painFlag: false,
      riskFlagCount: 0,
    });
  });

  it("sleep_quality <= 2 dispara sleepFlag", () => {
    expect(deriveAdherenceFlagsFromResponse(makeResponse({ sleep_quality: 2 })).sleepFlag).toBe(true);
    expect(deriveAdherenceFlagsFromResponse(makeResponse({ sleep_quality: 3 })).sleepFlag).toBe(false);
  });

  it("stress_level >= 4 dispara stressFlag", () => {
    expect(deriveAdherenceFlagsFromResponse(makeResponse({ stress_level: 4 })).stressFlag).toBe(true);
    expect(deriveAdherenceFlagsFromResponse(makeResponse({ stress_level: 3 })).stressFlag).toBe(false);
  });

  it("energy_level <= 2 dispara energyFlag", () => {
    expect(deriveAdherenceFlagsFromResponse(makeResponse({ energy_level: 2 })).energyFlag).toBe(true);
    expect(deriveAdherenceFlagsFromResponse(makeResponse({ energy_level: 3 })).energyFlag).toBe(false);
  });

  it("barreira em ADHERENCE_RISK_BARRIERS dispara barrierFlag", () => {
    expect(
      deriveAdherenceFlagsFromResponse(
        makeResponse({ primary_adherence_barrier: "time" }),
      ).barrierFlag,
    ).toBe(true);
    // Barreiras NÃO listadas (financial_cost, other) não disparam.
    expect(
      deriveAdherenceFlagsFromResponse(
        makeResponse({ primary_adherence_barrier: "financial_cost" }),
      ).barrierFlag,
    ).toBe(false);
  });

  // ── E5.6a / M-1: 3 sinais adicionais alinhados ao Coach Console ────────
  it("consistency_self_rating === 'inconsistent' dispara consistencyFlag (M-1)", () => {
    expect(
      deriveAdherenceFlagsFromResponse(
        makeResponse({ consistency_self_rating: "inconsistent" }),
      ).consistencyFlag,
    ).toBe(true);
    expect(
      deriveAdherenceFlagsFromResponse(
        makeResponse({ consistency_self_rating: "moderately_consistent" }),
      ).consistencyFlag,
    ).toBe(false);
  });

  it("life_stability === 'chaotic' dispara lifeStabilityFlag (M-1)", () => {
    expect(
      deriveAdherenceFlagsFromResponse(
        makeResponse({ life_stability: "chaotic" }),
      ).lifeStabilityFlag,
    ).toBe(true);
    expect(
      deriveAdherenceFlagsFromResponse(
        makeResponse({ life_stability: "stable_organized" }),
      ).lifeStabilityFlag,
    ).toBe(false);
  });

  it("pain_status !== 'none' dispara painFlag (M-1)", () => {
    // Enum real do questionário (PAIN_STATUS_OPTIONS):
    //   'daily' (dor no dia a dia), 'during_training' (dor ao treinar), 'none'.
    expect(
      deriveAdherenceFlagsFromResponse(
        makeResponse({ pain_status: "daily" }),
      ).painFlag,
    ).toBe(true);
    expect(
      deriveAdherenceFlagsFromResponse(
        makeResponse({ pain_status: "during_training" }),
      ).painFlag,
    ).toBe(true);
    // pain_status === 'none' não dispara.
    expect(
      deriveAdherenceFlagsFromResponse(
        makeResponse({ pain_status: "none" }),
      ).painFlag,
    ).toBe(false);
    // pain_status null não dispara (defensivo).
    expect(
      deriveAdherenceFlagsFromResponse(
        makeResponse({ pain_status: null }),
      ).painFlag,
    ).toBe(false);
  });

  it("riskFlagCount é a soma das 7 flags (0..7) — alinhado ao Console (M-1)", () => {
    const all = deriveAdherenceFlagsFromResponse(
      makeResponse({
        sleep_quality: 1,
        stress_level: 5,
        energy_level: 1,
        primary_adherence_barrier: "motivation",
        consistency_self_rating: "inconsistent",
        life_stability: "chaotic",
        pain_status: "daily",
      }),
    );
    expect(all.riskFlagCount).toBe(7);
  });

  it("aluno só com pain_status='during_training' + consistency='inconsistent' → riskFlagCount 2 (cenário-chave M-1)", () => {
    // Antes do M-1, esse cenário disparava o alerta `adherence_risk` no
    // Console mas NÃO emitia a claim agregada no preview. Agora os dois
    // sistemas concordam — riskFlagCount >= 2 emite a claim.
    const flags = deriveAdherenceFlagsFromResponse(
      makeResponse({
        consistency_self_rating: "inconsistent",
        pain_status: "during_training",
      }),
    );
    expect(flags.sleepFlag).toBe(false);
    expect(flags.stressFlag).toBe(false);
    expect(flags.energyFlag).toBe(false);
    expect(flags.barrierFlag).toBe(false);
    expect(flags.consistencyFlag).toBe(true);
    expect(flags.painFlag).toBe(true);
    expect(flags.riskFlagCount).toBe(2);
  });

  it("1 flag isolada das 3 novas (pain_status='daily') → riskFlagCount 1, abaixo do mínimo (M-1)", () => {
    // Espelha o teste já existente para 1 flag isolada das 4 antigas,
    // garantindo que o threshold ADHERENCE_RISK_MIN_FLAGS aplica
    // uniformemente aos 7 sinais.
    const flags = deriveAdherenceFlagsFromResponse(
      makeResponse({ pain_status: "daily" }),
    );
    expect(flags.painFlag).toBe(true);
    expect(flags.consistencyFlag).toBe(false);
    expect(flags.lifeStabilityFlag).toBe(false);
    expect(flags.riskFlagCount).toBe(1);
  });

  it("valores null em scores não disparam flag", () => {
    const flags = deriveAdherenceFlagsFromResponse(
      makeResponse({
        sleep_quality: null,
        stress_level: null,
        energy_level: null,
      }),
    );
    expect(flags.sleepFlag).toBe(false);
    expect(flags.stressFlag).toBe(false);
    expect(flags.energyFlag).toBe(false);
  });
});

// ── mapQuestionnaireResponseToEvidenceInput ─────────────────────────────────

describe("mapQuestionnaireResponseToEvidenceInput", () => {
  it("response null → input vazio", () => {
    expect(mapQuestionnaireResponseToEvidenceInput(null)).toEqual({});
  });

  it("response undefined → input vazio", () => {
    expect(mapQuestionnaireResponseToEvidenceInput(undefined)).toEqual({});
  });

  it("parq_blocked === null → não inclui blocked no parq subobject", () => {
    const input = mapQuestionnaireResponseToEvidenceInput(
      makeResponse({ parq_blocked: null }),
    );
    expect(input.parq).toEqual({});
  });

  it("parq_blocked === true é propagado", () => {
    const input = mapQuestionnaireResponseToEvidenceInput(
      makeResponse({ parq_blocked: true }),
    );
    expect(input.parq).toEqual({ blocked: true });
  });

  it("parq_blocked === false é propagado", () => {
    const input = mapQuestionnaireResponseToEvidenceInput(
      makeResponse({ parq_blocked: false }),
    );
    expect(input.parq).toEqual({ blocked: false });
  });

  it("resposta limpa NÃO emite riskFlagCount (abaixo do mínimo agregado)", () => {
    expect(ADHERENCE_RISK_MIN_FLAGS).toBe(2);
    const input = mapQuestionnaireResponseToEvidenceInput(makeResponse());
    expect(input.adherence?.riskFlagCount).toBeUndefined();
    expect(input.adherence?.sleepFlag).toBe(false);
    expect(input.adherence?.stressFlag).toBe(false);
    expect(input.adherence?.energyFlag).toBe(false);
    expect(input.adherence?.barrierFlag).toBe(false);
  });

  it("1 flag isolada → emite a flag mas NÃO emite riskFlagCount", () => {
    const input = mapQuestionnaireResponseToEvidenceInput(
      makeResponse({ sleep_quality: 1 }),
    );
    expect(input.adherence?.sleepFlag).toBe(true);
    expect(input.adherence?.riskFlagCount).toBeUndefined();
  });

  it(">= 2 flags → emite riskFlagCount agregado", () => {
    const input = mapQuestionnaireResponseToEvidenceInput(
      makeResponse({ sleep_quality: 1, stress_level: 5 }),
    );
    expect(input.adherence?.sleepFlag).toBe(true);
    expect(input.adherence?.stressFlag).toBe(true);
    expect(input.adherence?.riskFlagCount).toBe(2);
  });

  it("integra com deriveEvidenceClaims — resposta com 2 flags gera claims agregada + individuais", () => {
    const input = mapQuestionnaireResponseToEvidenceInput(
      makeResponse({
        parq_blocked: true,
        sleep_quality: 1,
        stress_level: 5,
      }),
    );
    const claims = deriveEvidenceClaims(input);
    const labels = claims.map((c) => c.classification);
    expect(labels).toContain("PAR-Q positivo (blocked)");
    expect(labels).toContain("Sono insuficiente");
    expect(labels).toContain("Estresse alto");
    expect(labels).toContain("Risco de adesão (≥ 2 flags)");
  });

  it("integra com deriveEvidenceClaims — resposta limpa + parq cleared → 1 claim de PAR-Q cleared", () => {
    const input = mapQuestionnaireResponseToEvidenceInput(makeResponse());
    const claims = deriveEvidenceClaims(input);
    const labels = claims.map((c) => c.classification);
    expect(labels).toContain("PAR-Q sem sinalizações");
    // Nenhuma claim de adesão (flags false e count abaixo do mínimo)
    expect(labels.filter((l) => l.includes("Sono"))).toEqual([]);
    expect(labels.filter((l) => l.includes("Estresse"))).toEqual([]);
  });

  // ── E5.6a / M-1: integração com cenário-chave de paridade Console ↔ preview
  it(
    "M-1: pain_status='during_training' + consistency='inconsistent' → emite 'Risco de adesão (≥ 2 flags)' (paridade c/ Console)",
    () => {
      const input = mapQuestionnaireResponseToEvidenceInput(
        makeResponse({
          parq_blocked: false, // só pra ter PAR-Q cleared no resultado
          consistency_self_rating: "inconsistent",
          pain_status: "during_training",
        }),
      );
      // Os 4 flags individuais (sleep/stress/energy/barrier) seguem false.
      expect(input.adherence?.sleepFlag).toBe(false);
      expect(input.adherence?.stressFlag).toBe(false);
      expect(input.adherence?.energyFlag).toBe(false);
      expect(input.adherence?.barrierFlag).toBe(false);
      // riskFlagCount agora soma os 7 — bate com o Console.
      expect(input.adherence?.riskFlagCount).toBe(2);
      const labels = deriveEvidenceClaims(input).map((c) => c.classification);
      expect(labels).toContain("PAR-Q sem sinalizações");
      expect(labels).toContain("Risco de adesão (≥ 2 flags)");
      // Não emite claims individuais para consistency/pain (M-3 pendente).
      expect(labels.filter((l) => l.includes("Sono"))).toEqual([]);
      expect(labels.filter((l) => l.includes("Estresse"))).toEqual([]);
      expect(labels.filter((l) => l.includes("Baixa energia"))).toEqual([]);
      expect(labels.filter((l) => l.includes("Barreira"))).toEqual([]);
    },
  );
});

// ── indexResponsesByAssessmentId ────────────────────────────────────────────

describe("indexResponsesByAssessmentId", () => {
  it("array vazio → Map vazio", () => {
    expect(indexResponsesByAssessmentId([]).size).toBe(0);
  });

  it("indexa por assessment_id", () => {
    const r1 = makeResponse({ assessment_id: "a1" });
    const r2 = makeResponse({ assessment_id: "a2" });
    const idx = indexResponsesByAssessmentId([r1, r2]);
    expect(idx.size).toBe(2);
    expect(idx.get("a1")).toBe(r1);
    expect(idx.get("a2")).toBe(r2);
  });

  it("response sem assessment_id é ignorada (defensivo)", () => {
    const r1 = makeResponse({ assessment_id: "" });
    const idx = indexResponsesByAssessmentId([r1]);
    expect(idx.size).toBe(0);
  });
});

// ── LIMITATIONS_NOT_COVERED_YET ─────────────────────────────────────────────

describe("LIMITATIONS_NOT_COVERED_YET", () => {
  it("documenta os 5 domínios ainda não cobertos por mappers", () => {
    const domains = LIMITATIONS_NOT_COVERED_YET.map((l) => l.domain);
    expect(domains).toContain("vo2_max");
    expect(domains).toContain("fc_recovery_1min");
    expect(domains).toContain("handgrip");
    expect(domains).toContain("sit_to_stand");
    expect(domains).toContain("dexa");
  });

  it("cada item tem reason não-vazio explicando o motivo", () => {
    for (const item of LIMITATIONS_NOT_COVERED_YET) {
      expect(item.reason.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET (E5.6a / M-7) ───────────────────────

describe("QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET (M-7)", () => {
  it("documenta os 6 campos do questionário sem claim individual", () => {
    const fields = QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET.map((l) => l.field);
    expect(fields).toContain("consistency_self_rating");
    expect(fields).toContain("life_stability");
    expect(fields).toContain("pain_status");
    expect(fields).toContain("uses_medications");
    expect(fields).toContain("has_medical_condition");
    expect(fields).toContain("injury_surgery_history");
    expect(QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET).toHaveLength(6);
  });

  it("cada item tem reason não-vazio explicando o motivo", () => {
    for (const item of QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET) {
      expect(item.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("os 3 primeiros campos sinalizam contribuição ao agregado de risco de adesão", () => {
    // Esses 3 campos viram contribuição agregada de adesão (alinhado ao Console).
    // O texto deve mencionar "agregado" / "fila do coach" pra que o coach
    // entenda a relação sem precisar conhecer nomenclatura interna ("M-1").
    const aggregatedFields = QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET.filter(
      (item) => item.reason.toLowerCase().includes("agregado"),
    ).map((item) => item.field);
    expect(aggregatedFields).toEqual(
      expect.arrayContaining([
        "consistency_self_rating",
        "life_stability",
        "pain_status",
      ]),
    );
  });

  it("os 3 últimos campos sinalizam disparo de 'atenção clínica' na fila", () => {
    const clinicalAttentionFields = QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET.filter(
      (item) => item.reason.toLowerCase().includes("atenção clínica"),
    ).map((item) => item.field);
    expect(clinicalAttentionFields).toEqual(
      expect.arrayContaining([
        "pain_status", // contribui pro agregado E dispara clinical_attention
        "uses_medications",
        "has_medical_condition",
        "injury_surgery_history",
      ]),
    );
  });

  it("nenhum reason exibe jargão interno tipo 'M-1', 'M-3' ou 'riskFlagCount' (texto vai pra UI do coach)", () => {
    // O <details> "Limitações conhecidas" renderiza esses reasons literalmente
    // no preview. Manter linguagem operacional, sem códigos internos.
    for (const item of QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET) {
      expect(item.reason).not.toMatch(/\bM-[0-9]/);
      expect(item.reason).not.toMatch(/riskFlagCount/);
      expect(item.reason).not.toMatch(/E[0-9]\.[0-9]/);
      expect(item.reason).not.toMatch(/clinical_attention/);
    }
  });
});
