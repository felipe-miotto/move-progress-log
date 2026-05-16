/**
 * E5.5 — Mapeamento de dados crus (do hook `usePrecision12CoachConsole`)
 * para `Precision12EvidenceInput`, consumível pelo derivador E5.3.
 *
 * Apenas funções PURAS. Sem fetch novo, sem hook, sem mutation.
 *
 * Escopo conservador desta rodada: cobre **PAR-Q + Adesão**, derivados de
 * `questionnaire_responses` (já carregado pelo hook E4.1). Domínios
 * restantes ficam como limitação documentada (ver
 * `LIMITATIONS_NOT_COVERED_YET` ao final):
 *
 *   - VO₂ / Handgrip / Sit-to-Stand: o hook não carrega
 *     `vo2_results` / `handgrip_results` / `sit_to_stand_results` nem
 *     ref ranges (`classification.ts` exige lookup populacional por
 *     sexo/idade). Adicionar fetch + ranges é um PR separado.
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
  type CoachConsoleQuestionnaire,
  type CoachConsoleStudent,
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

/**
 * Identidade de uma claim para fins de dedup dentro do mesmo grupo:
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
 */
function dedupClaims(claims: readonly EvidenceClaim[]): EvidenceClaim[] {
  const seen = new Set<string>();
  const out: EvidenceClaim[] = [];
  for (const claim of claims) {
    const key = claimKey(claim);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(claim);
  }
  return out;
}

/**
 * Ordena claims por severidade do tom (`actionable` → `watchful` →
 * `informational` → `reassuring`), preservando a ordem original como
 * tie-break (Array.prototype.sort é estável desde V8 7.0 / 2018).
 * E5.6a / M-5.
 */
function sortClaimsBySeverity(
  claims: readonly EvidenceClaim[],
): EvidenceClaim[] {
  return [...claims].sort(
    (a, b) =>
      EVIDENCE_RISK_LEVEL_PRIORITY[a.riskLanguageLevel] -
      EVIDENCE_RISK_LEVEL_PRIORITY[b.riskLanguageLevel],
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
}: {
  students: readonly CoachConsoleStudent[];
  assessments: readonly CoachConsoleAssessment[];
  responses: readonly CoachConsoleQuestionnaire[];
}): StudentEvidenceGroup[] {
  const studentById = new Map(students.map((s) => [s.id, s]));
  const assessmentById = new Map(assessments.map((a) => [a.id, a]));

  const byStudentId = new Map<string, StudentEvidenceGroup>();

  for (const response of responses) {
    if (!response.assessment_id) continue;
    const assessment = assessmentById.get(response.assessment_id);
    if (!assessment) continue;
    const studentId = assessment.student_id;

    const input: Precision12EvidenceInput =
      mapQuestionnaireResponseToEvidenceInput(response);
    const claims = deriveEvidenceClaims(input);
    if (claims.length === 0) continue;

    const existing = byStudentId.get(studentId);
    if (existing) {
      existing.claims = [...existing.claims, ...claims];
      continue;
    }
    const student = studentById.get(studentId);
    byStudentId.set(studentId, {
      studentId,
      studentName: student?.name ?? "(aluno desconhecido)",
      claims,
    });
  }

  // M-6 + M-5: dedup ANTES de sort pra eliminar duplicatas sem reordenar
  // dentro do mesmo nível de severidade desnecessariamente.
  for (const group of byStudentId.values()) {
    group.claims = sortClaimsBySeverity(dedupClaims(group.claims));
  }

  // M-4: ordenação determinística por nome do aluno.
  const groups = Array.from(byStudentId.values());
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
 * da UI ("Cobertura atual: PAR-Q + Adesão") e em documentação.
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
    domain: "vo2_max",
    reason:
      "Hook do Coach Console não carrega vo2_results nem ref ranges; classificação requer lookup populacional por sexo/idade.",
  },
  {
    domain: "fc_recovery_1min",
    reason:
      "Hook do Coach Console não carrega vo2_results; recuperação de FC é coluna desse result.",
  },
  {
    domain: "handgrip",
    reason:
      "Hook do Coach Console não carrega handgrip_results nem ref ranges; classificação requer lookup populacional por sexo/idade.",
  },
  {
    domain: "sit_to_stand",
    reason:
      "Hook do Coach Console não carrega sit_to_stand_results nem ref ranges; classificação requer lookup por faixa etária.",
  },
  {
    domain: "dexa",
    reason:
      "Hook já carrega dexa_results (E4.6), mas classificação por marcador (body fat / visceral / androide-ginoide / ALM/h²) exige cortes populacionais por sexo/idade — sem ranges, preferimos não emitir do que emitir errado.",
  },
];

/**
 * Catálogo de campos do `CoachConsoleQuestionnaire` que o hook E4.1 JÁ
 * carrega mas que o mapping E5.6a ainda NÃO converte em claim individual,
 * com o motivo. Os 3 primeiros contribuem ao `riskFlagCount` agregado de
 * adesão (alinhado ao Console pelo M-1), mas não disparam claim própria.
 * Os 3 últimos disparam o alerta operacional `clinical_attention` na fila
 * do Console, mas o Evidence Layer ainda não cobre — cobertura individual
 * planejada como M-3 (ver plano para Codex).
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
      "Já conta como sinal no agregado de risco de adesão (mesma fila do coach); ainda sem card próprio no preview.",
  },
  {
    field: "life_stability",
    reason:
      "Já conta como sinal no agregado de risco de adesão (mesma fila do coach); ainda sem card próprio no preview.",
  },
  {
    field: "pain_status",
    reason:
      "Já conta como sinal no agregado de risco de adesão e também dispara 'atenção clínica' na fila; ainda sem card próprio no preview.",
  },
  {
    field: "uses_medications",
    reason:
      "Dispara 'atenção clínica' na fila do coach; ainda sem card próprio no preview (cobertura individual planejada).",
  },
  {
    field: "has_medical_condition",
    reason:
      "Dispara 'atenção clínica' na fila do coach; ainda sem card próprio no preview (cobertura individual planejada).",
  },
  {
    field: "injury_surgery_history",
    reason:
      "Dispara 'atenção clínica' na fila do coach quando preenchido; ainda sem card próprio no preview (cobertura individual planejada).",
  },
];
