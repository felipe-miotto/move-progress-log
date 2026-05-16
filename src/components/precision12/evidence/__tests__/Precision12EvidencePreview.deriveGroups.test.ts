/**
 * E5.5 — Testes funcionais da função pura `deriveEvidenceGroups`
 * exportada de `Precision12EvidencePreview`.
 *
 * Foco: cross-join `students` + `assessments` + `responses` —
 * garantir que claims aparecem agrupadas pelo NOME do aluno, e que
 * dados ausentes não quebram a UI.
 */

import { describe, expect, it } from "vitest";

import type {
  CoachConsoleAssessment,
  CoachConsoleHandgripResult,
  CoachConsoleQuestionnaire,
  CoachConsoleSitToStandResult,
  CoachConsoleStudent,
  CoachConsoleVo2Result,
} from "@/utils/precision12CoachConsole";

import { deriveEvidenceGroups } from "@/utils/precision12EvidenceMapping";

function student(
  overrides: Partial<CoachConsoleStudent> = {},
): CoachConsoleStudent {
  return { id: "s1", name: "Alex Griebeler", program_tier: "precision_12", ...overrides };
}

function assessment(
  overrides: Partial<CoachConsoleAssessment> = {},
): CoachConsoleAssessment {
  return {
    id: "a1",
    student_id: "s1",
    assessment_type: "questionnaire_precision12",
    status: "completed",
    assessment_date: "2026-05-13",
    created_at: "2026-05-13T00:00:00Z",
    ...overrides,
  };
}

function response(
  overrides: Partial<CoachConsoleQuestionnaire> = {},
): CoachConsoleQuestionnaire {
  return {
    assessment_id: "a1",
    parq_blocked: true,
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

function vo2Result(
  overrides: Partial<CoachConsoleVo2Result> = {},
): CoachConsoleVo2Result {
  return {
    assessment_id: "vo2-1",
    vo2_final: 35.2,
    vo2_classification: "Bom",
    recovery_drop_1min: 10,
    recovery_classification: "Atenção",
    ...overrides,
  };
}

function handgripResult(
  overrides: Partial<CoachConsoleHandgripResult> = {},
): CoachConsoleHandgripResult {
  return {
    assessment_id: "hg-1",
    best_kg: 24,
    classification: "Baixo",
    ...overrides,
  };
}

function sitToStandResult(
  overrides: Partial<CoachConsoleSitToStandResult> = {},
): CoachConsoleSitToStandResult {
  return {
    assessment_id: "s2s-1",
    total_score: 8,
    classification: "Excelente",
    ...overrides,
  };
}

describe("deriveEvidenceGroups — cross-join básico", () => {
  it("input vazio → []", () => {
    expect(
      deriveEvidenceGroups({ students: [], assessments: [], responses: [] }),
    ).toEqual([]);
  });

  it("response → assessment → student.name", () => {
    const groups = deriveEvidenceGroups({
      students: [student()],
      assessments: [assessment()],
      responses: [response()],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].studentId).toBe("s1");
    expect(groups[0].studentName).toBe("Alex Griebeler");
    expect(groups[0].claims.length).toBeGreaterThan(0);
  });

  it("response cuja assessment não está na lista → ignora silenciosamente", () => {
    const groups = deriveEvidenceGroups({
      students: [student()],
      assessments: [],
      responses: [response({ assessment_id: "ghost" })],
    });
    expect(groups).toEqual([]);
  });

  it("response sem assessment_id → ignora silenciosamente", () => {
    const groups = deriveEvidenceGroups({
      students: [student()],
      assessments: [assessment()],
      responses: [response({ assessment_id: "" })],
    });
    expect(groups).toEqual([]);
  });

  it("student ausente do mapa → fallback 'aluno desconhecido' (não engole silenciosamente)", () => {
    const groups = deriveEvidenceGroups({
      students: [], // sem o aluno
      assessments: [assessment({ student_id: "s-ghost" })],
      responses: [response()],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].studentId).toBe("s-ghost");
    expect(groups[0].studentName).toContain("desconhecido");
  });

  it("response que não gera nenhuma claim → não cria grupo", () => {
    // parq_blocked null + sem flags de adesão → 0 claims
    const groups = deriveEvidenceGroups({
      students: [student()],
      assessments: [assessment()],
      responses: [response({ parq_blocked: null })],
    });
    expect(groups).toEqual([]);
  });
});

describe("deriveEvidenceGroups — múltiplos alunos / múltiplas responses", () => {
  it("2 alunos, 1 response cada → 2 grupos com nomes diferentes", () => {
    const groups = deriveEvidenceGroups({
      students: [student(), student({ id: "s2", name: "Ana Paula Prado" })],
      assessments: [
        assessment({ id: "a1", student_id: "s1" }),
        assessment({ id: "a2", student_id: "s2" }),
      ],
      responses: [
        response({ assessment_id: "a1" }),
        response({ assessment_id: "a2" }),
      ],
    });
    expect(groups).toHaveLength(2);
    const names = groups.map((g) => g.studentName);
    // E5.6a / M-4: ordenação determinística por nome — Alex antes de Ana.
    expect(names).toEqual(["Alex Griebeler", "Ana Paula Prado"]);
  });

  it("2 responses do mesmo aluno → 1 grupo com claims concatenadas", () => {
    const groups = deriveEvidenceGroups({
      students: [student()],
      assessments: [
        assessment({ id: "a1", student_id: "s1" }),
        assessment({ id: "a2", student_id: "s1" }),
      ],
      responses: [
        response({ assessment_id: "a1", parq_blocked: true }),
        response({
          assessment_id: "a2",
          parq_blocked: false,
          sleep_quality: 1,
          stress_level: 5,
        }),
      ],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].studentName).toBe("Alex Griebeler");
    const classifications = groups[0].claims.map((c) => c.classification);
    expect(classifications).toContain("PAR-Q positivo (blocked)");
    expect(classifications).toContain("PAR-Q sem sinalizações");
    expect(classifications).toContain("Sono insuficiente");
    expect(classifications).toContain("Estresse alto");
  });
});

describe("deriveEvidenceGroups — resultados físicos E5.5b", () => {
  it("VO₂ result gera claims VO₂ + FC recovery no grupo do aluno", () => {
    const groups = deriveEvidenceGroups({
      students: [student()],
      assessments: [
        assessment({
          id: "vo2-1",
          student_id: "s1",
          assessment_type: "vo2_bike_max",
        }),
      ],
      responses: [],
      vo2Results: [vo2Result()],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].studentName).toBe("Alex Griebeler");
    expect(groups[0].claims.map((c) => c.domain)).toEqual([
      "fc_recovery_1min",
      "vo2_max",
    ]);
    expect(groups[0].claims.map((c) => c.observedValue)).toEqual([
      "10 bpm",
      "35.2 ml/kg/min",
    ]);
  });

  it("Handgrip e Sit-to-Stand entram junto com questionnaire no mesmo grupo", () => {
    const groups = deriveEvidenceGroups({
      students: [student()],
      assessments: [
        assessment({ id: "a1", student_id: "s1" }),
        assessment({
          id: "hg-1",
          student_id: "s1",
          assessment_type: "handgrip",
        }),
        assessment({
          id: "s2s-1",
          student_id: "s1",
          assessment_type: "sit_to_stand",
        }),
      ],
      responses: [response({ assessment_id: "a1", parq_blocked: false })],
      handgripResults: [handgripResult()],
      sitToStandResults: [sitToStandResult()],
    });
    expect(groups).toHaveLength(1);
    const domains = groups[0].claims.map((c) => c.domain);
    expect(domains).toContain("questionnaire_parq");
    expect(domains).toContain("handgrip");
    expect(domains).toContain("sit_to_stand");
  });

  it("resultado físico cuja assessment não está na lista é ignorado", () => {
    const groups = deriveEvidenceGroups({
      students: [student()],
      assessments: [],
      responses: [],
      vo2Results: [vo2Result({ assessment_id: "ghost" })],
      handgripResults: [handgripResult({ assessment_id: "ghost" })],
      sitToStandResults: [sitToStandResult({ assessment_id: "ghost" })],
    });
    expect(groups).toEqual([]);
  });
});

// ── E5.6a / M-4: ordenação determinística de grupos ─────────────────────────

describe("deriveEvidenceGroups — M-4 ordenação determinística", () => {
  it("ordena grupos por studentName ASC mesmo quando responses vêm fora de ordem", () => {
    const groups = deriveEvidenceGroups({
      students: [
        student({ id: "s1", name: "Zé da Silva" }),
        student({ id: "s2", name: "Ana Paula" }),
        student({ id: "s3", name: "Beto Almeida" }),
      ],
      assessments: [
        assessment({ id: "a1", student_id: "s1" }),
        assessment({ id: "a2", student_id: "s2" }),
        assessment({ id: "a3", student_id: "s3" }),
      ],
      // Ordem das responses propositalmente embaralhada — não deve afetar
      // a ordem dos grupos no resultado.
      responses: [
        response({ assessment_id: "a1" }), // Zé primeiro
        response({ assessment_id: "a3" }), // Beto
        response({ assessment_id: "a2" }), // Ana por último
      ],
    });
    expect(groups.map((g) => g.studentName)).toEqual([
      "Ana Paula",
      "Beto Almeida",
      "Zé da Silva",
    ]);
  });

  it("ordenação é estável (locale pt-BR, insensível a acento)", () => {
    const groups = deriveEvidenceGroups({
      students: [
        student({ id: "s1", name: "Ávila" }),
        student({ id: "s2", name: "Augusto" }),
      ],
      assessments: [
        assessment({ id: "a1", student_id: "s1" }),
        assessment({ id: "a2", student_id: "s2" }),
      ],
      responses: [
        response({ assessment_id: "a2" }),
        response({ assessment_id: "a1" }),
      ],
    });
    // "Augusto" (sem acento) > "Ávila" no compare insensível a acento.
    expect(groups.map((g) => g.studentName)).toEqual(["Augusto", "Ávila"]);
  });
});

// ── E5.6a / M-5: sort por severidade dentro de cada grupo ───────────────────

describe("deriveEvidenceGroups — M-5 sort por severidade", () => {
  it("claims ordenadas: actionable → watchful → informational → reassuring", () => {
    const groups = deriveEvidenceGroups({
      students: [student()],
      assessments: [assessment()],
      // PAR-Q+ (actionable) + Sono insuficiente (watchful) + Estresse alto (watchful)
      // Como riskFlagCount = 2, dispara também "Risco de adesão (≥ 2 flags)" (watchful).
      responses: [
        response({
          parq_blocked: true,
          sleep_quality: 1,
          stress_level: 5,
        }),
      ],
    });
    expect(groups).toHaveLength(1);
    const levels = groups[0].claims.map((c) => c.riskLanguageLevel);
    // Primeiro claim deve ser o actionable; reassuring (se houvesse) viria por último.
    expect(levels[0]).toBe("actionable");
    // Todos os watchful vêm depois do actionable.
    const firstWatchfulIndex = levels.findIndex((l) => l === "watchful");
    expect(firstWatchfulIndex).toBeGreaterThan(0);
    // Nenhum non-actionable aparece ANTES do primeiro actionable.
    expect(levels.indexOf("actionable")).toBe(0);
  });

  it("reassuring fica por último quando convive com watchful/actionable", () => {
    const groups = deriveEvidenceGroups({
      students: [student()],
      assessments: [
        assessment({ id: "a1", student_id: "s1" }),
        assessment({ id: "a2", student_id: "s1" }),
      ],
      responses: [
        // Response #1: PAR-Q cleared (reassuring)
        response({ assessment_id: "a1", parq_blocked: false }),
        // Response #2: PAR-Q+ (actionable) + sono ruim (watchful)
        response({
          assessment_id: "a2",
          parq_blocked: true,
          sleep_quality: 1,
        }),
      ],
    });
    expect(groups).toHaveLength(1);
    const levels = groups[0].claims.map((c) => c.riskLanguageLevel);
    expect(levels[0]).toBe("actionable");
    expect(levels[levels.length - 1]).toBe("reassuring");
  });
});

// ── E5.6a / M-6: dedup de claims dentro do mesmo grupo ──────────────────────

describe("deriveEvidenceGroups — M-6 dedup de claims duplicadas", () => {
  it("2 responses idênticas do mesmo aluno → claims únicas (sem duplicata)", () => {
    const sameResponse = response({ parq_blocked: true });
    const groups = deriveEvidenceGroups({
      students: [student()],
      assessments: [
        assessment({ id: "a1", student_id: "s1" }),
        assessment({ id: "a2", student_id: "s1" }),
      ],
      responses: [
        { ...sameResponse, assessment_id: "a1" },
        { ...sameResponse, assessment_id: "a2" },
      ],
    });
    expect(groups).toHaveLength(1);
    const classifications = groups[0].claims.map((c) => c.classification);
    // Deve aparecer só UMA vez, mesmo vindo de 2 responses iguais.
    const parqCount = classifications.filter(
      (c) => c === "PAR-Q positivo (blocked)",
    ).length;
    expect(parqCount).toBe(1);
  });

  it("dedup preserva ordem da PRIMEIRA ocorrência", () => {
    const groups = deriveEvidenceGroups({
      students: [student()],
      assessments: [
        assessment({ id: "a1", student_id: "s1" }),
        assessment({ id: "a2", student_id: "s1" }),
      ],
      responses: [
        // Response #1: PAR-Q+ (actionable)
        response({ assessment_id: "a1", parq_blocked: true }),
        // Response #2: PAR-Q+ DE NOVO (igual) + sono ruim (watchful)
        response({
          assessment_id: "a2",
          parq_blocked: true,
          sleep_quality: 1,
        }),
      ],
    });
    expect(groups).toHaveLength(1);
    const classifications = groups[0].claims.map((c) => c.classification);
    // Não deve haver duplicata; ordem: PAR-Q+ → Sono insuficiente (após sort
    // por severidade: actionable vem antes de watchful).
    expect(classifications.filter((c) => c === "PAR-Q positivo (blocked)"))
      .toHaveLength(1);
    expect(classifications).toContain("Sono insuficiente");
  });
});

describe("deriveEvidenceGroups — imutabilidade", () => {
  it("não muta os arrays de entrada", () => {
    const s = [student()];
    const a = [assessment()];
    const r = [response()];
    const before = JSON.stringify({ s, a, r });
    deriveEvidenceGroups({ students: s, assessments: a, responses: r });
    expect(JSON.stringify({ s, a, r })).toBe(before);
  });
});
