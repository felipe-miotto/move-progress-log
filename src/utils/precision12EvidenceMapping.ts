/**
 * E5.5 — Mapeamento de dados crus (do hook `usePrecision12CoachConsole`)
 * para `Precision12EvidenceInput`, consumível pelo derivador E5.3.
 *
 * Apenas funções PURAS. Sem fetch novo, sem hook, sem mutation.
 *
 * Escopo conservador desta rodada: cobre **PAR-Q + Adesão** e resultados
 * físicos que já chegam com classificação persistida no banco
 * (VO₂, FC recovery, Handgrip, Sit-to-Stand). Domínios restantes ficam
 * como limitação documentada (ver
 * `LIMITATIONS_NOT_COVERED_YET` ao final):
 *
 *   - DEXA: o hook JÁ carrega `dexa_results` (E4.6), mas a classificação
 *     ("% gordura elevada para faixa etária", etc.) exige cortes
 *     populacionais por sexo/idade. Sem ranges, qualquer label viraria
 *     heurística sem base — preferimos NÃO emitir do que emitir errado.
 *
 * Quando esses ranges entrarem, basta adicionar mais mappers aqui — a
 * arquitetura é composicional (cada mapper monta uma fatia do
 * `Precision12EvidenceInput`).
 */

import {
  ADHERENCE_RISK_BARRIERS,
  ADHERENCE_RISK_MIN_FLAGS,
  ADHERENCE_RISK_THRESHOLDS,
  type CoachConsoleAssessment,
  type CoachConsoleHandgripResult,
  type CoachConsoleQuestionnaire,
  type CoachConsoleSitToStandResult,
  type CoachConsoleStudent,
  type CoachConsoleVo2Result,
} from "./precision12CoachConsole";
import {
  deriveEvidenceClaims,
  type Precision12EvidenceInput,
} from "./precision12EvidenceDerivation";
import {
  EVIDENCE_RISK_LEVEL_PRIORITY,
  type EvidenceClaim,
} from "./precision12Evidence";

// ────────────────────────────────────────────────────────────────────────────
// Mapping helpers (PURE)
// ────────────────────────────────────────────────────────────────────────────

const VO2_CLASSIFICATION_TO_CATALOG: Readonly<Record<string, string>> = {
  "Muito Fraco": "Muito fraco",
  "Muito fraco": "Muito fraco",
  Fraco: "Fraco",
  Regular: "Regular",
  Bom: "Bom",
  Excelente: "Excelente",
};

const FC_RECOVERY_CLASSIFICATION_TO_CATALOG: Readonly<Record<string, string>> = {
  Atenção: "Atenção",
  Adequada: "Adequada",
};

const HANDGRIP_CLASSIFICATION_TO_CATALOG: Readonly<Record<string, string>> = {
  Baixo: "Baixo",
  Médio: "Médio",
  Alto: "Alto",
};

const SIT_TO_STAND_CLASSIFICATION_TO_CATALOG: Readonly<Record<string, string>> = {
  Alerta: "Alerta",
  Intermediário: "Intermediário",
  Excelente: "Excelente",
};

function normalizeFromCatalogMap(
  classification: string | null | undefined,
  map: Readonly<Record<string, string>>,
): string | null {
  const trimmed = classification?.trim() ?? "";
  if (trimmed.length === 0) return null;
  return map[trimmed] ?? null;
}

export function normalizeVo2EvidenceClassification(
  classification: string | null | undefined,
): string | null {
  return normalizeFromCatalogMap(classification, VO2_CLASSIFICATION_TO_CATALOG);
}

export function normalizeFcRecoveryEvidenceClassification(
  classification: string | null | undefined,
): string | null {
  return normalizeFromCatalogMap(
    classification,
    FC_RECOVERY_CLASSIFICATION_TO_CATALOG,
  );
}

export function normalizeHandgripEvidenceClassification(
  classification: string | null | undefined,
): string | null {
  return normalizeFromCatalogMap(
    classification,
    HANDGRIP_CLASSIFICATION_TO_CATALOG,
  );
}

export function normalizeSitToStandEvidenceClassification(
  classification: string | null | undefined,
): string | null {
  return normalizeFromCatalogMap(
    classification,
    SIT_TO_STAND_CLASSIFICATION_TO_CATALOG,
  );
}

function formatObservedNumber(
  value: number | null | undefined,
  unit: string,
  fractionDigits = 1,
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const fixed = value.toFixed(fractionDigits);
  const trimmed = fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return `${trimmed} ${unit}`;
}

/**
 * Conta as flags individuais de risco de adesão presentes numa resposta.
 * Alinhado com a lógica de `countAdherenceRiskFlags` interna do E4.1
 * (E5.6a / M-1): o `riskFlagCount` soma os MESMOS 7 sinais usados pelo
 * Coach Console para emitir o alerta `adherence_risk` na fila — evita
 * que fila e preview tenham noções divergentes de "risco de adesão" no
 * mesmo aluno.
 *
 * Critério (escala 1–5, ver `ADHERENCE_RISK_THRESHOLDS`):
 *
 *   Flags com claim individual no catálogo (`deriveAdherenceEvidenceClaims`):
 *     - sleepFlag    ← sleep_quality <= 2
 *     - stressFlag   ← stress_level >= 4
 *     - energyFlag   ← energy_level <= 2
 *     - barrierFlag  ← primary_adherence_barrier ∈ ADHERENCE_RISK_BARRIERS
 *
 *   Flags SEM claim individual no catálogo (contribuem só para o agregado;
 *   ver `QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET` e plano M-3 para cobertura
 *   individual futura):
 *     - consistencyFlag    ← consistency_self_rating === "inconsistent"
 *     - lifeStabilityFlag  ← life_stability === "chaotic"
 *     - painFlag           ← pain_status != null && pain_status !== "none"
 *
 * `riskFlagCount` é a soma das 7 flags acima — mesma fórmula do Coach
 * Console. A claim agregada "Risco de adesão (≥ 2 flags)" dispara quando
 * `riskFlagCount >= ADHERENCE_RISK_MIN_FLAGS` (2), igualando a fila.
 */
export function deriveAdherenceFlagsFromResponse(
  response: CoachConsoleQuestionnaire,
): {
  sleepFlag: boolean;
  stressFlag: boolean;
  energyFlag: boolean;
  barrierFlag: boolean;
  consistencyFlag: boolean;
  lifeStabilityFlag: boolean;
  painFlag: boolean;
  riskFlagCount: number;
} {
  const sleepFlag =
    response.sleep_quality != null &&
    response.sleep_quality <= ADHERENCE_RISK_THRESHOLDS.sleepQualityAtMost;
  const stressFlag =
    response.stress_level != null &&
    response.stress_level >= ADHERENCE_RISK_THRESHOLDS.stressLevelAtLeast;
  const energyFlag =
    response.energy_level != null &&
    response.energy_level <= ADHERENCE_RISK_THRESHOLDS.energyLevelAtMost;
  const barrierFlag =
    response.primary_adherence_barrier != null &&
    ADHERENCE_RISK_BARRIERS.includes(response.primary_adherence_barrier);

  // Sinais adicionais alinhados ao Console (M-1). Não disparam claim
  // individual aqui — só contribuem ao `riskFlagCount`. A cobertura
  // individual desses domínios fica como M-3 (plano futuro).
  const consistencyFlag = response.consistency_self_rating === "inconsistent";
  const lifeStabilityFlag = response.life_stability === "chaotic";
  const painFlag =
    response.pain_status != null && response.pain_status !== "none";

  const riskFlagCount =
    Number(sleepFlag) +
    Number(stressFlag) +
    Number(energyFlag) +
    Number(barrierFlag) +
    Number(consistencyFlag) +
    Number(lifeStabilityFlag) +
    Number(painFlag);

  return {
    sleepFlag,
    stressFlag,
    energyFlag,
    barrierFlag,
    consistencyFlag,
    lifeStabilityFlag,
    painFlag,
    riskFlagCount,
  };
}

/**
 * Converte uma resposta de questionário em `Precision12EvidenceInput`
 * preenchendo só os subdomínios suportados nesta rodada (PAR-Q + Adesão).
 *
 * `response === null/undefined` → input vazio (sem PAR-Q nem adesão).
 * `parq_blocked` nulo → não emite PAR-Q (preserva semântica E5.3:
 *   `null/undefined` → sem claim).
 */
export function mapQuestionnaireResponseToEvidenceInput(
  response: CoachConsoleQuestionnaire | null | undefined,
): Precision12EvidenceInput {
  if (!response) return {};

  const adherence = deriveAdherenceFlagsFromResponse(response);

  // Threshold de "risco agregado" alinhado ao E4.1 (`ADHERENCE_RISK_MIN_FLAGS`).
  // Quando abaixo do mínimo, omitimos riskFlagCount pra evitar emissão de
  // claim agregada quando só há 1 sinal isolado.
  const riskFlagCountForInput =
    adherence.riskFlagCount >= ADHERENCE_RISK_MIN_FLAGS
      ? adherence.riskFlagCount
      : undefined;

  return {
    parq:
      response.parq_blocked === null ? {} : { blocked: response.parq_blocked },
    adherence: {
      sleepFlag: adherence.sleepFlag,
      stressFlag: adherence.stressFlag,
      energyFlag: adherence.energyFlag,
      barrierFlag: adherence.barrierFlag,
      ...(riskFlagCountForInput !== undefined && {
        riskFlagCount: riskFlagCountForInput,
      }),
    },
  };
}

export function mapVo2ResultToEvidenceInput(
  result: CoachConsoleVo2Result | null | undefined,
): Precision12EvidenceInput {
  if (!result) return {};
  return {
    vo2: {
      classification: normalizeVo2EvidenceClassification(
        result.vo2_classification,
      ),
      observedValue: formatObservedNumber(result.vo2_final, "ml/kg/min", 1),
    },
    fcRecovery1Min: {
      classification: normalizeFcRecoveryEvidenceClassification(
        result.recovery_classification,
      ),
      observedValue: formatObservedNumber(result.recovery_drop_1min, "bpm", 0),
    },
  };
}

export function mapHandgripResultToEvidenceInput(
  result: CoachConsoleHandgripResult | null | undefined,
): Precision12EvidenceInput {
  if (!result) return {};
  return {
    handgrip: {
      classification: normalizeHandgripEvidenceClassification(
        result.classification,
      ),
      observedValue: formatObservedNumber(result.best_kg, "kg", 1),
    },
  };
}

export function mapSitToStandResultToEvidenceInput(
  result: CoachConsoleSitToStandResult | null | undefined,
): Precision12EvidenceInput {
  if (!result) return {};
  return {
    sitToStand: {
      classification: normalizeSitToStandEvidenceClassification(
        result.classification,
      ),
      observedValue: formatObservedNumber(result.total_score, "pontos", 1),
    },
  };
}

/**
 * Indexa as responses por `assessment_id` pra lookup O(1) pela UI.
 * Defensivo: ignora linhas sem `assessment_id`.
 */
export function indexResponsesByAssessmentId(
  responses: readonly CoachConsoleQuestionnaire[],
): Map<string, CoachConsoleQuestionnaire> {
  const map = new Map<string, CoachConsoleQuestionnaire>();
  for (const r of responses) {
    if (r.assessment_id) map.set(r.assessment_id, r);
  }
  return map;
}

// ────────────────────────────────────────────────────────────────────────────
// Cross-join students + assessments + responses (E5.5)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resultado da derivação por aluno: agrupa N responses do mesmo aluno
 * num único bloco de claims. Quando há múltiplas responses do mesmo
 * aluno (raro, mas possível com reissue + retry), as claims passam por
 * dedup (E5.6a / M-6) e por sort de severidade (E5.6a / M-5).
 */
export interface StudentEvidenceGroup {
  studentId: string;
  studentName: string;
  claims: EvidenceClaim[];
}

interface StudentEvidenceGroupDraft {
  studentId: string;
  studentName: string;
  claimEntries: EvidenceClaimEntry[];
}

interface EvidenceClaimEntry {
  claim: EvidenceClaim;
  dedupKey: string;
}

/**
 * Identidade base de uma claim para fins de dedup dentro do mesmo grupo:
 * `${domain}-${metric}-${classification}` é única no catálogo
 * (validado em testes do E5.1/E5.2). Mantida em sincronia com a `key`
 * usada pelo `EvidenceClaimList` (E5.4).
 */
function claimKey(claim: EvidenceClaim): string {
  return `${claim.domain}-${claim.metric}-${claim.classification}`;
}

/**
 * Remove claims duplicadas preservando a primeira ocorrência
 * (E5.6a / M-6). Útil quando duas responses do mesmo aluno geram a
 * mesma claim PAR-Q (reissue + retry).
 *
 * Resultados físicos usam `assessmentId + claimKey` como chave de dedup para
 * preservar retestes separados, mesmo quando a classificação se repete.
 */
function dedupClaimEntries(
  entries: readonly EvidenceClaimEntry[],
): EvidenceClaimEntry[] {
  const seen = new Set<string>();
  const out: EvidenceClaimEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.dedupKey)) continue;
    seen.add(entry.dedupKey);
    out.push(entry);
  }
  return out;
}

/**
 * Ordena claims por severidade do tom (`actionable` → `watchful` →
 * `informational` → `reassuring`), preservando a ordem original como
 * tie-break (Array.prototype.sort é estável desde V8 7.0 / 2018).
 * E5.6a / M-5.
 */
function sortClaimEntriesBySeverity(
  entries: readonly EvidenceClaimEntry[],
): EvidenceClaimEntry[] {
  return [...entries].sort(
    (a, b) =>
      EVIDENCE_RISK_LEVEL_PRIORITY[a.claim.riskLanguageLevel] -
      EVIDENCE_RISK_LEVEL_PRIORITY[b.claim.riskLanguageLevel],
  );
}

/**
 * Cruza `students` + `assessments` + `responses` e devolve grupos por
 * aluno. Apenas alunos com pelo menos 1 claim entram no resultado.
 *
 * Defensivo:
 *   - response sem `assessment_id` → ignorada
 *   - assessment ausente (fila de Coach Console pode descartar assessments
 *     fora do escopo) → ignorado
 *   - student ausente (idem) → fallback para "(aluno desconhecido)"
 *     mantendo `student_id` técnico, pra UI não engolir silenciosamente
 *
 * Ordenação determinística (E5.6a):
 *   - Grupos: por `studentName` ASC, locale pt-BR, sem distinção de acento
 *     (M-4). "(aluno desconhecido)" cai por último naturalmente pelo
 *     parêntese, mas é tratado como qualquer nome no compare.
 *   - Claims dentro de cada grupo: dedup (M-6) → sort por severidade (M-5).
 *
 * Pura (não faz fetch, não muta input nem catálogo).
 */
export function deriveEvidenceGroups({
  students,
  assessments,
  responses,
  vo2Results = [],
  handgripResults = [],
  sitToStandResults = [],
}: {
  students: readonly CoachConsoleStudent[];
  assessments: readonly CoachConsoleAssessment[];
  responses: readonly CoachConsoleQuestionnaire[];
  vo2Results?: readonly CoachConsoleVo2Result[];
  handgripResults?: readonly CoachConsoleHandgripResult[];
  sitToStandResults?: readonly CoachConsoleSitToStandResult[];
}): StudentEvidenceGroup[] {
  const studentById = new Map(students.map((s) => [s.id, s]));
  const assessmentById = new Map(assessments.map((a) => [a.id, a]));

  const byStudentId = new Map<string, StudentEvidenceGroupDraft>();

  const appendClaimEntries = (
    studentId: string,
    claimEntries: EvidenceClaimEntry[],
  ) => {
    if (claimEntries.length === 0) return;
    const existing = byStudentId.get(studentId);
    if (existing) {
      existing.claimEntries = [...existing.claimEntries, ...claimEntries];
      return;
    }
    const student = studentById.get(studentId);
    byStudentId.set(studentId, {
      studentId,
      studentName: student?.name ?? "(aluno desconhecido)",
      claimEntries,
    });
  };

  const appendClaimsFromAssessment = (
    assessmentId: string,
    input: Precision12EvidenceInput,
    options: { dedupScope?: string; requireCompleted?: boolean } = {},
  ) => {
    if (!assessmentId) return;
    const assessment = assessmentById.get(assessmentId);
    if (!assessment) return;
    if (options.requireCompleted && assessment.status !== "completed") return;
    const claims = deriveEvidenceClaims(input);
    const claimEntries = claims.map((claim) => ({
      claim,
      dedupKey:
        options.dedupScope != null
          ? `${options.dedupScope}:${claimKey(claim)}`
          : claimKey(claim),
    }));
    appendClaimEntries(assessment.student_id, claimEntries);
  };

  for (const response of responses) {
    appendClaimsFromAssessment(
      response.assessment_id,
      mapQuestionnaireResponseToEvidenceInput(response),
    );
  }

  for (const result of vo2Results) {
    appendClaimsFromAssessment(
      result.assessment_id,
      mapVo2ResultToEvidenceInput(result),
      { dedupScope: result.assessment_id, requireCompleted: true },
    );
  }

  for (const result of handgripResults) {
    appendClaimsFromAssessment(
      result.assessment_id,
      mapHandgripResultToEvidenceInput(result),
      { dedupScope: result.assessment_id, requireCompleted: true },
    );
  }

  for (const result of sitToStandResults) {
    appendClaimsFromAssessment(
      result.assessment_id,
      mapSitToStandResultToEvidenceInput(result),
      { dedupScope: result.assessment_id, requireCompleted: true },
    );
  }

  // M-6 + M-5: dedup ANTES de sort pra eliminar duplicatas sem reordenar
  // dentro do mesmo nível de severidade desnecessariamente.
  for (const group of byStudentId.values()) {
    group.claimEntries = sortClaimEntriesBySeverity(
      dedupClaimEntries(group.claimEntries),
    );
  }

  // M-4: ordenação determinística por nome do aluno.
  const groups: StudentEvidenceGroup[] = Array.from(byStudentId.values()).map(
    (group) => ({
      studentId: group.studentId,
      studentName: group.studentName,
      claims: group.claimEntries.map((entry) => entry.claim),
    }),
  );
  groups.sort((a, b) =>
    a.studentName.localeCompare(b.studentName, "pt-BR", {
      sensitivity: "base",
    }),
  );
  return groups;
}

// ────────────────────────────────────────────────────────────────────────────
// Limitações conhecidas (E5.5)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Catálogo de domínios que o catálogo (E5.1/E5.2) cobre mas que esta
 * rodada NÃO mapeia, e o motivo. Exposto pra ser usado em estados vazios
 * da UI e em documentação.
 *
 * Quando um domínio sair daqui, basta adicionar o mapper correspondente
 * acima e atualizar `mapQuestionnaireResponseToEvidenceInput` (ou criar
 * novo mapper) sem mudar a UI.
 */
export const LIMITATIONS_NOT_COVERED_YET: ReadonlyArray<{
  domain: string;
  reason: string;
}> = [
  {
    domain: "dexa",
    reason:
      "Hook já carrega dexa_results (E4.6), mas classificação por marcador (body fat / visceral / androide-ginoide / ALM/h²) exige cortes populacionais por sexo/idade — sem ranges, preferimos não emitir do que emitir errado.",
  },
];

/**
 * Catálogo de campos do `CoachConsoleQuestionnaire` que o hook E4.1 JÁ
 * carrega mas que o mapping ainda NÃO converte em claim individual, com
 * o motivo. Os 3 primeiros contribuem ao `riskFlagCount` agregado de
 * adesão (alinhamento E5.6a), mas não emitem claim própria. Os 3 últimos
 * são sinais clínicos relevantes do questionário sem cobertura individual
 * no Evidence Layer ainda (cobertura planejada para um próximo lote).
 *
 * E5.6c — copy reescrita pra descrever cada campo apenas como sinal
 * clínico do questionário, sem prometer comportamento de outras
 * superfícies da UI que poderiam não corresponder à realidade do
 * `deriveActionQueue`.
 *
 * Exposto pra documentação inline na UI (preview) e pra que extensões
 * futuras tenham um lugar único pra remover entries quando o mapper passar
 * a cobrir o campo.
 */
export const QUESTIONNAIRE_FIELDS_NOT_MAPPED_YET: ReadonlyArray<{
  field: keyof CoachConsoleQuestionnaire;
  reason: string;
}> = [
  {
    field: "consistency_self_rating",
    reason:
      "Já conta como sinal no agregado de risco de adesão; ainda sem card próprio no preview.",
  },
  {
    field: "life_stability",
    reason:
      "Já conta como sinal no agregado de risco de adesão; ainda sem card próprio no preview.",
  },
  {
    field: "pain_status",
    reason:
      "Já conta como sinal no agregado de risco de adesão quando indica dor; ainda sem card próprio no preview.",
  },
  {
    field: "uses_medications",
    reason:
      "Sinal clínico relevante do questionário; ainda sem card próprio no preview (cobertura individual planejada).",
  },
  {
    field: "has_medical_condition",
    reason:
      "Sinal clínico relevante do questionário; ainda sem card próprio no preview (cobertura individual planejada).",
  },
  {
    field: "injury_surgery_history",
    reason:
      "Sinal clínico relevante quando preenchido; ainda sem card próprio no preview (cobertura individual planejada).",
  },
];
