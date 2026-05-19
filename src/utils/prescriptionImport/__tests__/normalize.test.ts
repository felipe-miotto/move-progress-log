/**
 * Unit tests do contrato puro de importação de prescrição.
 *
 * Foco:
 *   - normalização não inventa (campos ausentes viram null/false/"")
 *   - parseIntervalToSeconds aceita variantes BR/EN
 *   - validate gera issues `block` exatamente onde o contrato impede salvar
 *   - draftToCreatePrescriptionInput recusa quando há `block`
 *   - draftToCreatePrescriptionInput emite shape exato esperado por
 *     `createPrescriptionWithRelations`
 */
import { describe, expect, it } from "vitest";

import {
  draftToCreatePrescriptionInput,
  normalizeExerciseDraft,
  normalizePrescriptionDraft,
  parseIntervalToSeconds,
  validateExerciseDraft,
  validatePrescriptionDraft,
} from "../normalize";
import type { PrescriptionImportExerciseDraft } from "../types";

// ── parseIntervalToSeconds ─────────────────────────────────────────────────

describe("parseIntervalToSeconds", () => {
  it("number direto em segundos é preservado", () => {
    expect(parseIntervalToSeconds(60)).toBe(60);
    expect(parseIntervalToSeconds(0)).toBe(0);
    expect(parseIntervalToSeconds(90.4)).toBe(90);
  });

  it("number negativo → null (não inventa segundos negativos)", () => {
    expect(parseIntervalToSeconds(-1)).toBeNull();
    expect(parseIntervalToSeconds(Number.NaN)).toBeNull();
    expect(parseIntervalToSeconds(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("variantes em segundos: '90s', '90 seg', '90 segundos'", () => {
    expect(parseIntervalToSeconds("90s")).toBe(90);
    expect(parseIntervalToSeconds("90 s")).toBe(90);
    expect(parseIntervalToSeconds("90 seg")).toBe(90);
    expect(parseIntervalToSeconds("90 segundos")).toBe(90);
  });

  it("variantes em minutos: '1min', '1 min', '1 minuto', '2 mins'", () => {
    expect(parseIntervalToSeconds("1min")).toBe(60);
    expect(parseIntervalToSeconds("1 min")).toBe(60);
    expect(parseIntervalToSeconds("1 minuto")).toBe(60);
    expect(parseIntervalToSeconds("2 mins")).toBe(120);
  });

  it("decimal BR/US em minutos: '1.5 min' / '1,5 min'", () => {
    expect(parseIntervalToSeconds("1.5 min")).toBe(90);
    expect(parseIntervalToSeconds("1,5 min")).toBe(90);
  });

  it("composição min+seg: '1 min 30 s' / '1min30s'", () => {
    expect(parseIntervalToSeconds("1 min 30 s")).toBe(90);
    expect(parseIntervalToSeconds("1min30s")).toBe(90);
  });

  it("número sem unidade assume segundos", () => {
    expect(parseIntervalToSeconds("45")).toBe(45);
  });

  it("string vazia / não-numérica → null", () => {
    expect(parseIntervalToSeconds("")).toBeNull();
    expect(parseIntervalToSeconds("abc")).toBeNull();
    expect(parseIntervalToSeconds(null)).toBeNull();
    expect(parseIntervalToSeconds(undefined)).toBeNull();
  });
});

// ── normalizeExerciseDraft ─────────────────────────────────────────────────

describe("normalizeExerciseDraft — coerções sem inferir", () => {
  it("input vazio gera draft com campos nulos/defaults seguros", () => {
    const d = normalizeExerciseDraft({});
    expect(d.name).toBe("");
    expect(d.exercise_library_id).toBeNull();
    expect(d.matches).toEqual([]);
    expect(d.sets).toBe("");
    expect(d.reps).toBe("");
    expect(d.load).toBeNull();
    expect(d.rir).toBeNull();
    expect(d.pse).toBeNull();
    expect(d.interval_seconds).toBeNull();
    expect(d.training_method).toBeNull();
    expect(d.observations).toBeNull();
    expect(d.group_with_previous).toBe(false);
    // `should_track` default TRUE (regra do app).
    expect(d.should_track).toBe(true);
  });

  it("aceita aliases rir/rr/reserva (Excel pode usar qualquer um)", () => {
    expect(normalizeExerciseDraft({ rir: "2-3" }).rir).toBe("2-3");
    expect(normalizeExerciseDraft({ rr: "0" }).rir).toBe("0");
    expect(normalizeExerciseDraft({ reserva: "RM" }).rir).toBe("RM");
  });

  it("sets/reps numéricos viram string (sem perder)", () => {
    const d = normalizeExerciseDraft({ sets: 3, reps: 12 });
    expect(d.sets).toBe("3");
    expect(d.reps).toBe("12");
  });

  it("preserva formatos textuais de sets/reps (3-4, AMRAP, 30s, 1 min)", () => {
    expect(normalizeExerciseDraft({ sets: "3-4" }).sets).toBe("3-4");
    expect(normalizeExerciseDraft({ reps: "AMRAP" }).reps).toBe("AMRAP");
    expect(normalizeExerciseDraft({ reps: "30s" }).reps).toBe("30s");
    expect(normalizeExerciseDraft({ reps: "1 min" }).reps).toBe("1 min");
  });

  it("interval com alias 'intervalo' / 'interval'", () => {
    expect(normalizeExerciseDraft({ interval_seconds: 60 }).interval_seconds).toBe(60);
    expect(normalizeExerciseDraft({ intervalo: "1 min" }).interval_seconds).toBe(60);
    expect(normalizeExerciseDraft({ interval: "90s" }).interval_seconds).toBe(90);
  });

  it("training_method com alias 'method' / 'metodo'", () => {
    expect(normalizeExerciseDraft({ training_method: "SUPERSET" }).training_method).toBe("SUPERSET");
    expect(normalizeExerciseDraft({ method: "CIRCUITO" }).training_method).toBe("CIRCUITO");
    expect(normalizeExerciseDraft({ metodo: "EMOM" }).training_method).toBe("EMOM");
  });

  it("observations com alias 'obs' / 'observacoes'", () => {
    expect(normalizeExerciseDraft({ observations: "x" }).observations).toBe("x");
    expect(normalizeExerciseDraft({ obs: "y" }).observations).toBe("y");
    expect(normalizeExerciseDraft({ observacoes: "z" }).observations).toBe("z");
  });

  it("matches: ordena por similarity desc + filtra entradas sem id/name", () => {
    const d = normalizeExerciseDraft({
      matches: [
        { id: "a", name: "A", similarity: 0.6 },
        { id: "b", name: "B", similarity: 0.95 },
        { id: "", name: "ignored" },
        { id: "c", name: "C", similarity: 1.5 }, // clamp pra 1
      ],
    });
    expect(d.matches.map((m) => m.id)).toEqual(["c", "b", "a"]);
    expect(d.matches[0].similarity).toBe(1);
  });

  it("group_with_previous NUNCA infere true (default false)", () => {
    expect(normalizeExerciseDraft({}).group_with_previous).toBe(false);
    expect(normalizeExerciseDraft({ group_with_previous: undefined }).group_with_previous).toBe(false);
    expect(normalizeExerciseDraft({ group_with_previous: true }).group_with_previous).toBe(true);
    // Aliases tolerantes pra Excel:
    expect(normalizeExerciseDraft({ group_with_previous: "x" }).group_with_previous).toBe(true);
    expect(normalizeExerciseDraft({ group_with_previous: "sim" }).group_with_previous).toBe(true);
  });

  it("should_track: default TRUE, mas respeita explícito false", () => {
    expect(normalizeExerciseDraft({}).should_track).toBe(true);
    expect(normalizeExerciseDraft({ should_track: false }).should_track).toBe(false);
    expect(normalizeExerciseDraft({ should_track: "true" }).should_track).toBe(true);
  });
});

// ── normalizePrescriptionDraft ─────────────────────────────────────────────

describe("normalizePrescriptionDraft", () => {
  it("default prescription_type = 'group' (alinhado com createPrescription)", () => {
    expect(normalizePrescriptionDraft({}).prescription_type).toBe("group");
  });

  it("aceita variantes 'individual' / 'individuo' / 'grupo' / 'coletivo'", () => {
    expect(normalizePrescriptionDraft({ prescription_type: "individual" }).prescription_type).toBe("individual");
    expect(normalizePrescriptionDraft({ prescription_type: "Individuo" }).prescription_type).toBe("individual");
    expect(normalizePrescriptionDraft({ prescription_type: "GRUPO" }).prescription_type).toBe("group");
    expect(normalizePrescriptionDraft({ prescription_type: "coletivo" }).prescription_type).toBe("group");
    // Inválido cai no default seguro.
    expect(normalizePrescriptionDraft({ prescription_type: "xyz" }).prescription_type).toBe("group");
  });

  it("day_of_week com aliases 'dia' / 'dia_semana'", () => {
    expect(normalizePrescriptionDraft({ day_of_week: "Seg/Qui" }).day_of_week).toBe("Seg/Qui");
    expect(normalizePrescriptionDraft({ dia: "Ter" }).day_of_week).toBe("Ter");
    expect(normalizePrescriptionDraft({ dia_semana: "Qua" }).day_of_week).toBe("Qua");
  });

  it("exercises ausente / não-array → array vazio (não invent)", () => {
    expect(normalizePrescriptionDraft({}).exercises).toEqual([]);
    expect(normalizePrescriptionDraft({ exercises: "x" }).exercises).toEqual([]);
  });
});

// ── validateExerciseDraft ──────────────────────────────────────────────────

function baseValidExercise(): PrescriptionImportExerciseDraft {
  return {
    name: "Agachamento",
    exercise_library_id: "lib-1",
    matches: [{ id: "lib-1", name: "Agachamento livre", similarity: 0.95 }],
    sets: "3",
    reps: "10",
    load: null,
    rir: null,
    pse: null,
    interval_seconds: 60,
    training_method: null,
    observations: null,
    group_with_previous: false,
    should_track: true,
  };
}

describe("validateExerciseDraft", () => {
  it("draft completo + match resolvido → zero issues", () => {
    const issues = validateExerciseDraft(baseValidExercise(), "$.exercises[0]");
    expect(issues).toEqual([]);
  });

  it("falta name → block missing_required_field", () => {
    const issues = validateExerciseDraft(
      { ...baseValidExercise(), name: "" },
      "$.exercises[0]",
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "missing_required_field",
        severity: "block",
        path: "$.exercises[0].name",
      }),
    );
  });

  it("falta sets ou reps → block separado por path", () => {
    const issues = validateExerciseDraft(
      { ...baseValidExercise(), sets: "", reps: "" },
      "$.exercises[0]",
    );
    expect(issues.find((i) => i.path === "$.exercises[0].sets")?.severity).toBe("block");
    expect(issues.find((i) => i.path === "$.exercises[0].reps")?.severity).toBe("block");
  });

  it("exercise_library_id ausente + zero matches → block exercise_unmatched", () => {
    const issues = validateExerciseDraft(
      { ...baseValidExercise(), exercise_library_id: null, matches: [] },
      "$.exercises[0]",
    );
    expect(issues.find((i) => i.code === "exercise_unmatched")?.severity).toBe("block");
  });

  it("exercise_library_id ausente + match top alto E gap > 0.1 → warn (auto-aceitável)", () => {
    const issues = validateExerciseDraft(
      {
        ...baseValidExercise(),
        exercise_library_id: null,
        matches: [
          { id: "lib-1", name: "Agachamento livre", similarity: 0.95 },
          { id: "lib-2", name: "Outro", similarity: 0.8 },
        ],
      },
      "$.exercises[0]",
    );
    const matchIssue = issues.find((i) => i.code === "exercise_unmatched");
    expect(matchIssue?.severity).toBe("warn");
  });

  it("matches ambíguos (top < 0.9 OU gap < 0.1) → block exercise_ambiguous_match", () => {
    const lowTop = validateExerciseDraft(
      {
        ...baseValidExercise(),
        exercise_library_id: null,
        matches: [{ id: "lib-1", name: "Agachamento", similarity: 0.7 }],
      },
      "$.exercises[0]",
    );
    expect(lowTop.find((i) => i.code === "exercise_ambiguous_match")?.severity).toBe("block");

    const tightGap = validateExerciseDraft(
      {
        ...baseValidExercise(),
        exercise_library_id: null,
        matches: [
          { id: "lib-1", name: "Agachamento livre", similarity: 0.92 },
          { id: "lib-2", name: "Agachamento goblet", similarity: 0.88 },
        ],
      },
      "$.exercises[0]",
    );
    expect(tightGap.find((i) => i.code === "exercise_ambiguous_match")?.severity).toBe("block");
  });

  it("interval_seconds negativo → block invalid_numeric", () => {
    const issues = validateExerciseDraft(
      { ...baseValidExercise(), interval_seconds: -10 },
      "$.exercises[0]",
    );
    expect(issues.find((i) => i.code === "invalid_numeric")?.severity).toBe("block");
  });
});

// ── validatePrescriptionDraft ──────────────────────────────────────────────

describe("validatePrescriptionDraft", () => {
  it("name vazio → block", () => {
    const issues = validatePrescriptionDraft(
      {
        name: "",
        objective: null,
        day_of_week: null,
        prescription_type: "group",
        exercises: [],
      },
      "$",
    );
    expect(issues.find((i) => i.path === "$.name")?.severity).toBe("block");
  });

  it("agrega issues dos exercícios com path absoluto", () => {
    const issues = validatePrescriptionDraft(
      {
        name: "Treino A",
        objective: null,
        day_of_week: null,
        prescription_type: "group",
        exercises: [{ ...baseValidExercise(), name: "" }],
      },
      "$",
    );
    expect(issues.find((i) => i.path === "$.exercises[0].name")).toBeTruthy();
  });
});

// ── draftToCreatePrescriptionInput ─────────────────────────────────────────

describe("draftToCreatePrescriptionInput", () => {
  it("draft válido produz input com shape esperado pelo createPrescriptionWithRelations", () => {
    const result = draftToCreatePrescriptionInput({
      name: "Treino A",
      objective: "Força",
      day_of_week: "Seg/Qui",
      prescription_type: "individual",
      exercises: [
        {
          ...baseValidExercise(),
          load: "20 kg",
          rir: "2-3",
          pse: "8",
          training_method: "SUPERSET",
          observations: "manter forma",
          group_with_previous: true,
          should_track: true,
        },
        { ...baseValidExercise(), name: "Remada", exercise_library_id: "lib-2", matches: [{ id: "lib-2", name: "Remada", similarity: 1 }] },
      ],
    });
    expect(result.blocking_issues).toEqual([]);
    expect(result.input).not.toBeNull();
    expect(result.input?.name).toBe("Treino A");
    expect(result.input?.objective).toBe("Força");
    expect(result.input?.prescription_type).toBe("individual");
    expect(result.input?.exercises).toHaveLength(2);
    expect(result.input?.exercises[0]).toMatchObject({
      exercise_library_id: "lib-1",
      sets: "3",
      reps: "10",
      load: "20 kg",
      rir: "2-3",
      pse: "8",
      training_method: "SUPERSET",
      observations: "manter forma",
      group_with_previous: true,
      should_track: true,
      interval_seconds: 60,
    });
  });

  it("draft com block issue → input null + blocking_issues populado", () => {
    const result = draftToCreatePrescriptionInput({
      name: "",
      objective: null,
      day_of_week: null,
      prescription_type: "group",
      exercises: [{ ...baseValidExercise(), exercise_library_id: null, matches: [] }],
    });
    expect(result.input).toBeNull();
    expect(result.blocking_issues.length).toBeGreaterThan(0);
    expect(result.blocking_issues.every((i) => i.severity === "block")).toBe(true);
  });

  it("campos ausentes (load/rir/pse/training_method/observations) viram undefined no input", () => {
    const result = draftToCreatePrescriptionInput({
      name: "Treino B",
      objective: null,
      day_of_week: null,
      prescription_type: "group",
      exercises: [baseValidExercise()],
    });
    const ex0 = result.input?.exercises[0];
    expect(ex0?.load).toBeUndefined();
    expect(ex0?.rir).toBeUndefined();
    expect(ex0?.pse).toBeUndefined();
    expect(ex0?.training_method).toBeUndefined();
    expect(ex0?.observations).toBeUndefined();
  });
});
