/**
 * E4.1 — Testes das derivações puras do Coach Console Precision 12.
 *
 * Fixtures pequenas, sem DOM, sem fetch. Cobre as 4 funções puras:
 * deriveAssessmentStatusCounts, deriveStudentProgress,
 * deriveQuestionnaireAlerts, deriveActionQueue.
 */

import { describe, expect, it } from "vitest";

import {
  ADHERENCE_RISK_MIN_FLAGS,
  ASSESSMENT_CATEGORIES,
  DEFAULT_PRECISION12_FILTERS,
  PRECISION12_ASSESSMENTS_TAB,
  buildPrecision12StudentDeepLink,
  canReissueQuestionnaireLink,
  categoryOf,
  countHiddenSmokeStudents,
  deriveActionQueue,
  deriveAssessmentStatusCounts,
  deriveQuestionnaireAlerts,
  deriveStudentProgress,
  filterActionQueue,
  filterStudentsForProgress,
  isSmokeStudent,
  type ActionQueueItem,
  type CoachConsoleAssessment,
  type CoachConsoleQuestionnaire,
  type CoachConsoleStudent,
  type Precision12Filters,
  type StudentProgress,
} from "../precision12CoachConsole";

// ── Fixture builders ─────────────────────────────────────────────────────────

function assessment(
  overrides: Partial<CoachConsoleAssessment> = {},
): CoachConsoleAssessment {
  return {
    id: "a1",
    student_id: "s1",
    assessment_type: "handgrip",
    status: "in_progress",
    assessment_date: "2026-05-01",
    created_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

/** Resposta "limpa" — nenhuma flag, nenhum alerta. */
function questionnaire(
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

function student(
  overrides: Partial<CoachConsoleStudent> = {},
): CoachConsoleStudent {
  return {
    id: "s1",
    name: "Aluno Teste",
    program_tier: "precision_12",
    ...overrides,
  };
}

// ── categorias ───────────────────────────────────────────────────────────────

describe("categorias", () => {
  it("são exatamente as 5 do Precision 12", () => {
    expect([...ASSESSMENT_CATEGORIES]).toEqual([
      "VO₂",
      "Força",
      "Composição",
      "Funcional",
      "Anamnese",
    ]);
  });

  it("os 5 tipos vo2_* mapeiam todos pra categoria VO₂", () => {
    for (const t of [
      "vo2_bike_max",
      "vo2_bike_submax",
      "vo2_treadmill_walk_submax",
      "vo2_treadmill_run_submax",
      "vo2_treadmill_run_max",
    ] as const) {
      expect(categoryOf(t)).toBe("VO₂");
    }
    expect(categoryOf("handgrip")).toBe("Força");
    expect(categoryOf("dexa")).toBe("Composição");
    expect(categoryOf("sit_to_stand")).toBe("Funcional");
    expect(categoryOf("questionnaire_precision12")).toBe("Anamnese");
  });
});

// ── 1. deriveAssessmentStatusCounts ──────────────────────────────────────────

describe("deriveAssessmentStatusCounts", () => {
  it("array vazio → tudo zero", () => {
    expect(deriveAssessmentStatusCounts([])).toEqual({
      total: 0,
      in_progress: 0,
      completed: 0,
      aborted: 0,
      blocked: 0,
    });
  });

  it("conta cada status", () => {
    const counts = deriveAssessmentStatusCounts([
      assessment({ id: "a1", status: "in_progress" }),
      assessment({ id: "a2", status: "completed" }),
      assessment({ id: "a3", status: "completed" }),
      assessment({ id: "a4", status: "blocked" }),
      assessment({ id: "a5", status: "aborted" }),
    ]);
    expect(counts).toEqual({
      total: 5,
      in_progress: 1,
      completed: 2,
      aborted: 1,
      blocked: 1,
    });
  });
});

// ── 2. deriveStudentProgress ─────────────────────────────────────────────────

describe("deriveStudentProgress", () => {
  it("aluno sem assessments → 5 categorias missing, 0 completas", () => {
    const progress = deriveStudentProgress("s1", []);
    expect(progress.completedCategories).toBe(0);
    expect(progress.totalCategories).toBe(5);
    for (const c of ASSESSMENT_CATEGORIES) {
      expect(progress.categories[c]).toBe("missing");
    }
  });

  it("completed → done; só aborted → missing", () => {
    const progress = deriveStudentProgress("s1", [
      assessment({ id: "a1", assessment_type: "handgrip", status: "completed" }),
      assessment({ id: "a2", assessment_type: "dexa", status: "aborted" }),
    ]);
    expect(progress.categories["Força"]).toBe("done");
    expect(progress.categories["Composição"]).toBe("missing");
    expect(progress.completedCategories).toBe(1);
  });

  it("só blocked → blocked; só in_progress → pending", () => {
    const progress = deriveStudentProgress("s1", [
      assessment({
        id: "a1",
        assessment_type: "questionnaire_precision12",
        status: "blocked",
      }),
      assessment({ id: "a2", assessment_type: "sit_to_stand", status: "in_progress" }),
    ]);
    expect(progress.categories["Anamnese"]).toBe("blocked");
    expect(progress.categories["Funcional"]).toBe("pending");
    expect(progress.completedCategories).toBe(0);
  });

  it("VO₂ satisfeita por um único tipo vo2_* (não soma as 5 variantes)", () => {
    const progress = deriveStudentProgress("s1", [
      assessment({ id: "a1", assessment_type: "vo2_bike_max", status: "completed" }),
    ]);
    expect(progress.categories["VO₂"]).toBe("done");
    expect(progress.completedCategories).toBe(1);
  });

  it("precedência: completed vence blocked vence in_progress na mesma categoria", () => {
    const progress = deriveStudentProgress("s1", [
      assessment({ id: "a1", assessment_type: "vo2_bike_max", status: "in_progress" }),
      assessment({ id: "a2", assessment_type: "vo2_bike_submax", status: "blocked" }),
      assessment({ id: "a3", assessment_type: "vo2_treadmill_run_max", status: "completed" }),
    ]);
    expect(progress.categories["VO₂"]).toBe("done");
  });

  it("filtra por studentId — assessment de outro aluno não vaza", () => {
    const progress = deriveStudentProgress("s1", [
      assessment({ id: "a1", student_id: "s2", assessment_type: "handgrip", status: "completed" }),
    ]);
    expect(progress.categories["Força"]).toBe("missing");
    expect(progress.completedCategories).toBe(0);
  });
});

// ── 3. deriveQuestionnaireAlerts ─────────────────────────────────────────────

describe("deriveQuestionnaireAlerts", () => {
  it("resposta limpa → nenhum alerta", () => {
    expect(deriveQuestionnaireAlerts(questionnaire())).toEqual([]);
  });

  it("parq_blocked=true → alerta parq_blocked", () => {
    const alerts = deriveQuestionnaireAlerts(questionnaire({ parq_blocked: true }));
    expect(alerts.map((a) => a.kind)).toContain("parq_blocked");
  });

  it("adherence_risk dispara só com >= 2 flags", () => {
    expect(ADHERENCE_RISK_MIN_FLAGS).toBe(2);

    // 1 flag (só sono ruim) → sem alerta
    const oneFlag = deriveQuestionnaireAlerts(
      questionnaire({ sleep_quality: 2 }),
    );
    expect(oneFlag.map((a) => a.kind)).not.toContain("adherence_risk");

    // 2 flags (sono ruim + estresse alto) → alerta
    const twoFlags = deriveQuestionnaireAlerts(
      questionnaire({ sleep_quality: 2, stress_level: 4 }),
    );
    expect(twoFlags.map((a) => a.kind)).toContain("adherence_risk");

    // 3 flags → alerta
    const threeFlags = deriveQuestionnaireAlerts(
      questionnaire({
        sleep_quality: 1,
        stress_level: 5,
        energy_level: 2,
      }),
    );
    expect(threeFlags.map((a) => a.kind)).toContain("adherence_risk");
  });

  it("thresholds são escala 1–5 (não 1–10)", () => {
    // sleep_quality 3 não é flag; 2 é. stress_level 3 não é flag; 4 é.
    const notFlagged = deriveQuestionnaireAlerts(
      questionnaire({ sleep_quality: 3, stress_level: 3 }),
    );
    expect(notFlagged.map((a) => a.kind)).not.toContain("adherence_risk");
    // barreira + consistência inconsistente = 2 flags reais → dispara
    const flagged = deriveQuestionnaireAlerts(
      questionnaire({
        primary_adherence_barrier: "time",
        consistency_self_rating: "inconsistent",
      }),
    );
    expect(flagged.map((a) => a.kind)).toContain("adherence_risk");
  });

  it("clinical_attention dispara por medicação / condição / lesão / dor", () => {
    expect(
      deriveQuestionnaireAlerts(questionnaire({ uses_medications: true })).map(
        (a) => a.kind,
      ),
    ).toContain("clinical_attention");
    expect(
      deriveQuestionnaireAlerts(
        questionnaire({ has_medical_condition: true }),
      ).map((a) => a.kind),
    ).toContain("clinical_attention");
    expect(
      deriveQuestionnaireAlerts(
        questionnaire({ injury_surgery_history: "cirurgia de joelho 2020" }),
      ).map((a) => a.kind),
    ).toContain("clinical_attention");
    expect(
      deriveQuestionnaireAlerts(questionnaire({ pain_status: "daily" })).map(
        (a) => a.kind,
      ),
    ).toContain("clinical_attention");
  });

  it("injury_surgery_history só em branco não dispara clinical_attention", () => {
    const alerts = deriveQuestionnaireAlerts(
      questionnaire({ injury_surgery_history: "   " }),
    );
    expect(alerts.map((a) => a.kind)).not.toContain("clinical_attention");
  });

  it("acumula múltiplos alertas", () => {
    const alerts = deriveQuestionnaireAlerts(
      questionnaire({
        parq_blocked: true,
        uses_medications: true,
        sleep_quality: 1,
        stress_level: 5,
      }),
    );
    expect(alerts.map((a) => a.kind).sort()).toEqual([
      "adherence_risk",
      "clinical_attention",
      "parq_blocked",
    ]);
  });
});

// ── 4. deriveActionQueue ─────────────────────────────────────────────────────

describe("deriveActionQueue", () => {
  it("fila vazia quando não há nada acionável", () => {
    const queue = deriveActionQueue({
      students: [student()],
      assessments: [
        assessment({ assessment_type: "handgrip", status: "completed" }),
      ],
      responses: [],
    });
    expect(queue).toEqual([]);
  });

  it("questionário blocked → item parq_blocked (prioridade 1)", () => {
    const queue = deriveActionQueue({
      students: [student()],
      assessments: [
        assessment({
          id: "a1",
          assessment_type: "questionnaire_precision12",
          status: "blocked",
        }),
      ],
      responses: [],
    });
    expect(queue).toHaveLength(1);
    expect(queue[0].alertType).toBe("parq_blocked");
    expect(queue[0].priority).toBe(1);
  });

  it("parq_blocked também dispara via response.parq_blocked", () => {
    const queue = deriveActionQueue({
      students: [student()],
      assessments: [
        assessment({
          id: "a1",
          assessment_type: "questionnaire_precision12",
          status: "completed",
        }),
      ],
      responses: [questionnaire({ assessment_id: "a1", parq_blocked: true })],
    });
    expect(queue.map((i) => i.alertType)).toEqual(["parq_blocked"]);
  });

  it("questionário in_progress sem resposta → questionnaire_pending (prioridade 2)", () => {
    const queue = deriveActionQueue({
      students: [student()],
      assessments: [
        assessment({
          id: "a1",
          assessment_type: "questionnaire_precision12",
          status: "in_progress",
        }),
      ],
      responses: [],
    });
    expect(queue[0].alertType).toBe("questionnaire_pending");
    expect(queue[0].priority).toBe(2);
  });

  it("avaliação presencial in_progress → assessment_incomplete (prioridade 3)", () => {
    const queue = deriveActionQueue({
      students: [student()],
      assessments: [
        assessment({ id: "a1", assessment_type: "dexa", status: "in_progress" }),
      ],
      responses: [],
    });
    expect(queue[0].alertType).toBe("assessment_incomplete");
    expect(queue[0].priority).toBe(3);
  });

  it("aluno sem nenhuma assessment → student_no_assessment (prioridade 5)", () => {
    const queue = deriveActionQueue({
      students: [student({ id: "s1" }), student({ id: "s2", name: "Outro" })],
      assessments: [assessment({ id: "a1", student_id: "s1", status: "completed" })],
      responses: [],
    });
    const item = queue.find((i) => i.alertType === "student_no_assessment");
    expect(item).toBeDefined();
    expect(item?.studentId).toBe("s2");
    expect(item?.priority).toBe(5);
    expect(item?.assessmentId).toBeNull();
  });

  it("questionário respondido com risco de adesão → adherence_risk (prioridade 6)", () => {
    const queue = deriveActionQueue({
      students: [student()],
      assessments: [
        assessment({
          id: "a1",
          assessment_type: "questionnaire_precision12",
          status: "completed",
        }),
      ],
      responses: [
        questionnaire({
          assessment_id: "a1",
          sleep_quality: 1,
          stress_level: 5,
        }),
      ],
    });
    expect(queue.map((i) => i.alertType)).toEqual(["adherence_risk"]);
    expect(queue[0].priority).toBe(6);
  });

  it("cada assessment gera no máximo 1 item — blocked não vira também adherence_risk", () => {
    const queue = deriveActionQueue({
      students: [student()],
      assessments: [
        assessment({
          id: "a1",
          assessment_type: "questionnaire_precision12",
          status: "blocked",
        }),
      ],
      responses: [
        questionnaire({
          assessment_id: "a1",
          parq_blocked: true,
          sleep_quality: 1,
          stress_level: 5,
        }),
      ],
    });
    expect(queue).toHaveLength(1);
    expect(queue[0].alertType).toBe("parq_blocked");
  });

  it("ordena por prioridade asc", () => {
    const queue = deriveActionQueue({
      students: [
        student({ id: "s1" }),
        student({ id: "s2" }),
        student({ id: "s3" }),
      ],
      assessments: [
        assessment({ id: "a3", student_id: "s3", assessment_type: "dexa", status: "in_progress" }),
        assessment({
          id: "a1",
          student_id: "s1",
          assessment_type: "questionnaire_precision12",
          status: "blocked",
        }),
        // s2 sem assessment → prioridade 5
      ],
      responses: [],
    });
    expect(queue.map((i) => i.priority)).toEqual([1, 3, 5]);
  });

  it("ignora assessment de aluno fora da lista (defensivo)", () => {
    const queue = deriveActionQueue({
      students: [student({ id: "s1" })],
      assessments: [
        assessment({ id: "a1", student_id: "s1", status: "completed" }),
        assessment({ id: "a2", student_id: "ghost", assessment_type: "dexa", status: "in_progress" }),
      ],
      responses: [],
    });
    expect(queue).toEqual([]);
  });
});

// ── 5. Filtros (E4.3a) ────────────────────────────────────────────────────────

function filters(
  overrides: Partial<Precision12Filters> = {},
): Precision12Filters {
  return { ...DEFAULT_PRECISION12_FILTERS, ...overrides };
}

function queueItem(
  overrides: Partial<ActionQueueItem> = {},
): ActionQueueItem {
  return {
    priority: 1,
    alertType: "parq_blocked",
    studentId: "s1",
    studentName: "Aluno Teste",
    assessmentId: "a1",
    assessmentType: "questionnaire_precision12",
    status: "blocked",
    assessmentDate: "2026-05-01",
    ...overrides,
  };
}

describe("DEFAULT_PRECISION12_FILTERS", () => {
  it("padrão oculta dados de smoke", () => {
    expect(DEFAULT_PRECISION12_FILTERS.hideTestData).toBe(true);
    expect(DEFAULT_PRECISION12_FILTERS.alertType).toBe("all");
    expect(DEFAULT_PRECISION12_FILTERS.progressStatus).toBe("all");
    expect(DEFAULT_PRECISION12_FILTERS.searchQuery).toBe("");
  });
});

describe("isSmokeStudent", () => {
  it("identifica prefixos SMOKE/TEST", () => {
    expect(isSmokeStudent({ name: "SMOKE João Teste" })).toBe(true);
    expect(isSmokeStudent({ name: "TEST Beta" })).toBe(true);
    expect(isSmokeStudent({ name: "[TEST] Charlie" })).toBe(true);
    expect(isSmokeStudent({ name: "smoke alpha" })).toBe(true); // case-insensitive
  });

  it("identifica substring SMOKE E3 (legado)", () => {
    expect(isSmokeStudent({ name: "Aluno SMOKE E3 cleanup" })).toBe(true);
  });

  it("não confunde nomes reais", () => {
    expect(isSmokeStudent({ name: "Smokey Robinson" })).toBe(false);
    expect(isSmokeStudent({ name: "Tester Joaquim" })).toBe(false);
    expect(isSmokeStudent({ name: "Maria Silva" })).toBe(false);
    expect(isSmokeStudent({ name: "" })).toBe(false);
    expect(isSmokeStudent({ name: "   " })).toBe(false);
  });
});

describe("countHiddenSmokeStudents", () => {
  it("retorna 0 quando hideTestData=false", () => {
    const list = [student({ name: "SMOKE A" }), student({ name: "Maria" })];
    expect(countHiddenSmokeStudents(list, false)).toBe(0);
  });

  it("conta smoke quando hideTestData=true", () => {
    const list = [
      student({ id: "s1", name: "SMOKE A" }),
      student({ id: "s2", name: "Maria" }),
      student({ id: "s3", name: "TEST B" }),
    ];
    expect(countHiddenSmokeStudents(list, true)).toBe(2);
  });
});

describe("filterActionQueue", () => {
  const items: ActionQueueItem[] = [
    queueItem({
      alertType: "parq_blocked",
      studentId: "s1",
      studentName: "João Silva",
    }),
    queueItem({
      alertType: "questionnaire_pending",
      studentId: "s2",
      studentName: "Maria",
      assessmentId: "a2",
      status: "in_progress",
    }),
    queueItem({
      alertType: "adherence_risk",
      studentId: "s3",
      studentName: "SMOKE Carlos",
      assessmentId: "a3",
      status: "completed",
    }),
  ];

  it("default mantém tudo exceto smoke", () => {
    const out = filterActionQueue(items, filters());
    expect(out.map((i) => i.studentId)).toEqual(["s1", "s2"]);
  });

  it("hideTestData=false mantém smoke", () => {
    const out = filterActionQueue(items, filters({ hideTestData: false }));
    expect(out.map((i) => i.studentId)).toEqual(["s1", "s2", "s3"]);
  });

  it("busca tolera acento/caixa", () => {
    expect(
      filterActionQueue(items, filters({ searchQuery: "joao" })).map(
        (i) => i.studentId,
      ),
    ).toEqual(["s1"]);
    expect(
      filterActionQueue(items, filters({ searchQuery: "MARIA" })).map(
        (i) => i.studentId,
      ),
    ).toEqual(["s2"]);
  });

  it("alertType filtra por tipo específico", () => {
    expect(
      filterActionQueue(
        items,
        filters({ alertType: "questionnaire_pending" }),
      ).map((i) => i.studentId),
    ).toEqual(["s2"]);
  });

  it("alertType=all preserva todos os tipos", () => {
    const out = filterActionQueue(
      items,
      filters({ alertType: "all", hideTestData: false }),
    );
    expect(out).toHaveLength(3);
  });

  it("busca vazia (só espaços) não filtra", () => {
    const out = filterActionQueue(items, filters({ searchQuery: "   " }));
    expect(out.map((i) => i.studentId)).toEqual(["s1", "s2"]);
  });

  it("usa mapa de alunos pra detectar smoke mesmo se o nome do item divergir", () => {
    const studentsById = new Map<string, CoachConsoleStudent>([
      ["s2", student({ id: "s2", name: "SMOKE renamed" })],
    ]);
    const out = filterActionQueue(items, filters(), studentsById);
    expect(out.map((i) => i.studentId)).toEqual(["s1"]);
  });
});

describe("filterStudentsForProgress", () => {
  const students: CoachConsoleStudent[] = [
    student({ id: "s1", name: "João" }),
    student({ id: "s2", name: "Maria" }),
    student({ id: "s3", name: "SMOKE Carlos" }),
  ];

  function progress(
    overrides: Partial<StudentProgress> = {},
  ): StudentProgress {
    return {
      studentId: "s1",
      categories: {
        "VO₂": "missing",
        "Força": "missing",
        "Composição": "missing",
        "Funcional": "missing",
        "Anamnese": "missing",
      },
      completedCategories: 0,
      totalCategories: 5,
      ...overrides,
    };
  }

  const studentProgress: StudentProgress[] = [
    progress({ studentId: "s1", completedCategories: 0 }),
    progress({
      studentId: "s2",
      categories: {
        "VO₂": "missing",
        "Força": "missing",
        "Composição": "missing",
        "Funcional": "missing",
        "Anamnese": "done",
      },
      completedCategories: 1,
    }),
    progress({
      studentId: "s3",
      categories: {
        "VO₂": "done",
        "Força": "done",
        "Composição": "missing",
        "Funcional": "missing",
        "Anamnese": "done",
      },
      completedCategories: 3,
    }),
  ];

  it("default oculta smoke", () => {
    const out = filterStudentsForProgress(
      students,
      studentProgress,
      [],
      filters(),
    );
    expect(out.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("hideTestData=false mostra smoke", () => {
    const out = filterStudentsForProgress(
      students,
      studentProgress,
      [],
      filters({ hideTestData: false }),
    );
    expect(out.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("busca filtra por nome (case/diacritic-insensitive)", () => {
    expect(
      filterStudentsForProgress(
        students,
        studentProgress,
        [],
        filters({ searchQuery: "JOAO" }),
      ).map((s) => s.id),
    ).toEqual(["s1"]);
  });

  it("progressStatus=no_completed mantém só quem não completou nenhuma", () => {
    const out = filterStudentsForProgress(
      students,
      studentProgress,
      [],
      filters({ progressStatus: "no_completed", hideTestData: false }),
    );
    expect(out.map((s) => s.id)).toEqual(["s1"]);
  });

  it("progressStatus=anamnese_done mantém só quem tem Anamnese done", () => {
    const out = filterStudentsForProgress(
      students,
      studentProgress,
      [],
      filters({ progressStatus: "anamnese_done", hideTestData: false }),
    );
    expect(out.map((s) => s.id)).toEqual(["s2", "s3"]);
  });

  it("progressStatus=parq_blocked cruza com a fila", () => {
    const queue: ActionQueueItem[] = [
      queueItem({ alertType: "parq_blocked", studentId: "s2" }),
    ];
    const out = filterStudentsForProgress(
      students,
      studentProgress,
      queue,
      filters({ progressStatus: "parq_blocked", hideTestData: false }),
    );
    expect(out.map((s) => s.id)).toEqual(["s2"]);
  });

  it("combina filtros (search + progressStatus + hideTestData)", () => {
    const out = filterStudentsForProgress(
      students,
      studentProgress,
      [],
      filters({
        searchQuery: "maria",
        progressStatus: "anamnese_done",
      }),
    );
    expect(out.map((s) => s.id)).toEqual(["s2"]);
  });
});

// ── 6. buildPrecision12StudentDeepLink (E4.3b) ────────────────────────────────

describe("buildPrecision12StudentDeepLink", () => {
  it("monta URL com tab=assessments sem assessmentId", () => {
    expect(buildPrecision12StudentDeepLink("student-123")).toBe(
      "/alunos/student-123?tab=assessments",
    );
  });

  it("aceita null como assessmentId (mesmo comportamento que omitir)", () => {
    expect(buildPrecision12StudentDeepLink("student-123", null)).toBe(
      "/alunos/student-123?tab=assessments",
    );
  });

  it("aceita undefined como assessmentId", () => {
    expect(buildPrecision12StudentDeepLink("student-123", undefined)).toBe(
      "/alunos/student-123?tab=assessments",
    );
  });

  it("inclui assessmentId quando presente", () => {
    expect(
      buildPrecision12StudentDeepLink(
        "student-123",
        "assessment-abc",
      ),
    ).toBe("/alunos/student-123?tab=assessments&assessmentId=assessment-abc");
  });

  it("usa a constante PRECISION12_ASSESSMENTS_TAB como source-of-truth", () => {
    // Sanity: helper sempre emite o tab declarado na constante exportada.
    expect(PRECISION12_ASSESSMENTS_TAB).toBe("assessments");
    expect(
      buildPrecision12StudentDeepLink("s1").includes(
        `tab=${PRECISION12_ASSESSMENTS_TAB}`,
      ),
    ).toBe(true);
  });

  it("é determinístico — mesma entrada produz mesma URL", () => {
    const url1 = buildPrecision12StudentDeepLink("s1", "a1");
    const url2 = buildPrecision12StudentDeepLink("s1", "a1");
    expect(url1).toBe(url2);
  });
});

// ── 7. canReissueQuestionnaireLink (E4.4) ─────────────────────────────────────

describe("canReissueQuestionnaireLink", () => {
  function reissuableItem(overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
    return {
      priority: 2,
      alertType: "questionnaire_pending",
      studentId: "s1",
      studentName: "Aluno Teste",
      assessmentId: "a1",
      assessmentType: "questionnaire_precision12",
      status: "in_progress",
      assessmentDate: "2026-05-01",
      ...overrides,
    };
  }

  it("true pra questionnaire_pending + in_progress + assessmentId presente", () => {
    expect(canReissueQuestionnaireLink(reissuableItem())).toBe(true);
  });

  it("false pra parq_blocked (mesmo com assessmentId e tipo certos)", () => {
    expect(
      canReissueQuestionnaireLink(
        reissuableItem({ alertType: "parq_blocked", status: "blocked" }),
      ),
    ).toBe(false);
  });

  it("false pra assessment_incomplete (não é questionário)", () => {
    expect(
      canReissueQuestionnaireLink(
        reissuableItem({
          alertType: "assessment_incomplete",
          assessmentType: "dexa",
        }),
      ),
    ).toBe(false);
  });

  it("false pra adherence_risk (status completed)", () => {
    expect(
      canReissueQuestionnaireLink(
        reissuableItem({ alertType: "adherence_risk", status: "completed" }),
      ),
    ).toBe(false);
  });

  it("false pra student_no_assessment (sem assessmentId)", () => {
    expect(
      canReissueQuestionnaireLink(
        reissuableItem({
          alertType: "student_no_assessment",
          assessmentId: null,
          assessmentType: null,
          status: null,
        }),
      ),
    ).toBe(false);
  });

  it("false quando status não é in_progress (blocked, completed, aborted)", () => {
    for (const status of ["blocked", "completed", "aborted"] as const) {
      expect(
        canReissueQuestionnaireLink(reissuableItem({ status })),
      ).toBe(false);
    }
  });

  it("false quando assessmentId é null (defensivo)", () => {
    expect(
      canReissueQuestionnaireLink(reissuableItem({ assessmentId: null })),
    ).toBe(false);
  });

  it("false quando assessmentType não é questionnaire_precision12", () => {
    expect(
      canReissueQuestionnaireLink(
        reissuableItem({ assessmentType: "handgrip" }),
      ),
    ).toBe(false);
  });
});
