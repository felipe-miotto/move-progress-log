/**
 * E5.1 — Precision 12 Evidence Layer (foundation).
 *
 * Camada de wording clínico-operacional usada pra compor microcopy nas
 * superfícies do Coach Console e — futuramente — pelo gerador de relatório
 * PDF (E6). Este arquivo entrega APENAS:
 *
 *   • Tipos do `EvidenceClaim` (com flags dos 4 princípios)
 *   • Lookup `getEvidenceClaim(domain, classification)`
 *   • Helpers de validação de segurança (`hasProhibitedTerm`,
 *     `validateEvidencePrinciples`, `validateEvidenceClaim`)
 *   • Catálogo inicial de claims por domínio (subset suficiente pra exercitar
 *     a estrutura; ampliação fica pra etapas seguintes do E5)
 *   • Disclaimers obrigatórios por domínio
 *
 * Princípios fundamentais (refletem o spec do E5.1):
 *
 *   1. Nunca diagnosticar.
 *   2. Linguagem ASSOCIATIVA, não causal absoluta ("pode estar associado",
 *      "sugere", "indica necessidade de acompanhamento" — NUNCA "você tem",
 *      "garante", "causa", "doença").
 *   3. Distinguir dado observado vs interpretação (a Claim separa
 *      `observedValue` de `interpretation`).
 *   4. Sempre integrar com contexto clínico/treino (disclaimers + flag
 *      `multidimensional`).
 *   5. Sem alarmismo (nível `riskLanguageLevel` modula o tom).
 *
 * DEXA: o laudo vem de clínica parceira. O app interpreta pra
 * acompanhamento de performance/composição, NÃO substitui laudo médico —
 * isso vai explícito no `disclaimer` de cada claim de domínio DEXA.
 *
 * PAR-Q `blocked`: claim de orientação para revisão clínica / encaminhamento
 * profissional, sem prescrição.
 *
 * Sem migration, sem RPC, sem edge function, sem PDF, sem mutation —
 * apenas estrutura + funções puras + testes.
 */

// ────────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────────

/** Domínios clínicos cobertos pelo Evidence Layer (E5.1 spec). */
export type EvidenceDomain =
  | "vo2_max"
  | "fc_recovery_1min"
  | "handgrip"
  | "sit_to_stand"
  | "dexa"
  | "questionnaire_parq"
  | "sleep_stress_energy_adherence";

/** Lista exaustiva dos domínios; usada por testes pra garantir cobertura. */
export const EVIDENCE_DOMAINS: readonly EvidenceDomain[] = [
  "vo2_max",
  "fc_recovery_1min",
  "handgrip",
  "sit_to_stand",
  "dexa",
  "questionnaire_parq",
  "sleep_stress_energy_adherence",
] as const;

/**
 * Tonalidade da linguagem da claim. NUNCA é alarmista.
 *
 *   • `reassuring`     — resultado favorável; reforço positivo.
 *   • `informational`  — contextualização neutra.
 *   • `watchful`       — sinal de atenção; acompanhamento próximo.
 *   • `actionable`     — exige próximo passo claro (revisão/encaminhamento/
 *                        ajuste de treino), sem alarmismo.
 */
export type EvidenceRiskLanguageLevel =
  | "reassuring"
  | "informational"
  | "watchful"
  | "actionable";

/** Referência primária citada por uma claim. */
export interface EvidenceSource {
  title: string;
  citation: string;
  url: string;
  /** População/desenho do estudo, se relevante (RCT, meta-análise, n). */
  population?: string;
}

/**
 * Flags dos 4 princípios do wording clínico. Todas devem ser `true` em
 * claims publicadas. `validateEvidencePrinciples` é a guarda.
 */
export interface EvidencePrinciples {
  /** Cita desfecho real (mortalidade, morbidade, qualidade de vida). */
  real_endpoint: boolean;
  /** Linguagem associativa, não causal absoluta. */
  is_associative: boolean;
  /** Aponta caminho de modificabilidade. */
  modifiability_explicit: boolean;
  /** Reconhece contexto multidimensional — não trata métrica isolada. */
  multidimensional: boolean;
}

/**
 * Uma claim do Evidence Layer. Estrutura desacoplada do valor observado:
 * `observedValue` é sempre `null` no catálogo; o caller usa
 * `instantiateClaim(claim, observedValue)` quando vai renderizar.
 */
export interface EvidenceClaim {
  /** Domínio clínico. */
  domain: EvidenceDomain;
  /** Identificador da métrica (ex.: `"vo2_max"`, `"handgrip_kg"`). */
  metric: string;
  /**
   * Valor observado no contexto da renderização — sempre `null` no catálogo
   * (estrutura sem dado). O caller injeta no momento do uso via
   * `instantiateClaim`.
   */
  observedValue: string | null;
  /** Classificação textual (ex.: `"Fraco"`, `"PAR-Q positivo"`). */
  classification: string;
  /**
   * Interpretação ASSOCIATIVA — nunca diagnóstica. Frases como "pode estar
   * associado a", "sugere", "indica necessidade de acompanhamento".
   */
  interpretation: string;
  /** Resumo da evidência (1-2 frases). */
  evidenceSummary: string;
  /**
   * Ação recomendada ao COACH (não ao paciente; não substitui consulta
   * clínica). Para PAR-Q `blocked`, deve orientar revisão/encaminhamento.
   */
  coachAction: string;
  /** Tonalidade. */
  riskLanguageLevel: EvidenceRiskLanguageLevel;
  /** Fontes primárias (>= 1). */
  sources: EvidenceSource[];
  /**
   * Disclaimer obrigatório. Para DEXA, sempre reforça que o app NÃO
   * substitui o laudo da clínica parceira.
   */
  disclaimer: string;
  /** 4 princípios — todos `true` em claims publicadas. */
  principles: EvidencePrinciples;
}

// ────────────────────────────────────────────────────────────────────────────
// Termos PROIBIDOS por princípio 1+2 (não diagnosticar, não causar)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Lista de termos/expressões que SOZINHOS tornam uma claim insegura.
 * Verificada caso-insensível em `interpretation`, `evidenceSummary` e
 * `coachAction` por `hasProhibitedTerm`.
 *
 * A lista é conservadora — se um termo legítimo virar problema (ex.:
 * "causa raiz" em coachAction de adesão), revisar AQUI e nos testes.
 */
export const EVIDENCE_PROHIBITED_TERMS: readonly string[] = [
  // Verbos diagnósticos
  "diagnostica",
  "diagnóstico de",
  "diagnostico de",
  // Causal absoluta
  "garante",
  "garantido",
  "causa direta",
  "causa de",
  "provoca",
  // Posse de patologia
  "você tem",
  "voce tem",
  "tem sarcopenia",
  "tem osteoporose",
  "tem síndrome",
  "tem sindrome",
  // Nomes de patologias quando aplicadas como rótulo
  "doença",
  "doenca",
  "patologia",
  "transtorno",
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Disclaimers obrigatórios por domínio
// ────────────────────────────────────────────────────────────────────────────

/**
 * Mínimo de palavras-chave que o disclaimer de cada domínio DEVE conter,
 * validado por `validateEvidenceClaim`. Garante que claims DEXA reforcem
 * "não substitui laudo" e claims PAR-Q reforcem "revisar/encaminhar".
 */
export const EVIDENCE_DOMAIN_DISCLAIMER_KEYWORDS: Record<
  EvidenceDomain,
  readonly string[]
> = {
  vo2_max: ["acompanhamento", "treino"],
  fc_recovery_1min: ["acompanhamento", "contexto"],
  handgrip: ["acompanhamento", "treino"],
  sit_to_stand: ["acompanhamento"],
  dexa: ["laudo", "não substitui"],
  questionnaire_parq: ["triagem", "não substitui"],
  sleep_stress_energy_adherence: ["acompanhamento", "contexto"],
} as const;

/**
 * Palavras-chave que o `coachAction` de claims PAR-Q `blocked` precisa
 * conter — bloqueia coachAction que sugira treino sem revisão clínica.
 */
export const PARQ_BLOCKED_COACH_ACTION_KEYWORDS: readonly string[] = [
  "revis",
  "encaminh",
  "acompanhamento clínico",
  "acompanhamento clinico",
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Helpers / validadores
// ────────────────────────────────────────────────────────────────────────────

/**
 * Retorna a lista de termos proibidos encontrados no texto (case-insensitive),
 * ou array vazio quando o texto é seguro. Não trata bordas de palavra
 * porque proibições como "doença" devem pegar "doença renal" etc.
 */
export function hasProhibitedTerm(text: string): string[] {
  const haystack = text.toLowerCase();
  const hits: string[] = [];
  for (const term of EVIDENCE_PROHIBITED_TERMS) {
    if (haystack.includes(term)) hits.push(term);
  }
  return hits;
}

/**
 * Asserta que todas as flags dos 4 princípios são `true`. Retorna a lista
 * de flags faltantes; vazia significa OK.
 */
export function validateEvidencePrinciples(
  principles: EvidencePrinciples,
): (keyof EvidencePrinciples)[] {
  const missing: (keyof EvidencePrinciples)[] = [];
  if (!principles.real_endpoint) missing.push("real_endpoint");
  if (!principles.is_associative) missing.push("is_associative");
  if (!principles.modifiability_explicit) missing.push("modifiability_explicit");
  if (!principles.multidimensional) missing.push("multidimensional");
  return missing;
}

export interface EvidenceClaimValidationIssue {
  field: keyof EvidenceClaim | "principles" | "disclaimerKeywords" | "parqBlockedCoachAction";
  detail: string;
}

/**
 * Validador completo de uma claim. Retorna lista de issues — vazia quando
 * a claim é considerada segura pra publicação. Não modifica a claim.
 *
 * Cobre:
 *   • Nenhum termo proibido em interpretation/evidenceSummary/coachAction.
 *   • Pelo menos 1 fonte primária.
 *   • Disclaimer não vazio.
 *   • Disclaimer contém todas as palavras-chave do domínio.
 *   • Todas as 4 flags de princípio = true.
 *   • Para PAR-Q `blocked`, coachAction contém keyword de revisão/encaminhamento.
 */
export function validateEvidenceClaim(
  claim: EvidenceClaim,
): EvidenceClaimValidationIssue[] {
  const issues: EvidenceClaimValidationIssue[] = [];

  // 1. Linguagem proibida.
  for (const field of ["interpretation", "evidenceSummary", "coachAction"] as const) {
    const hits = hasProhibitedTerm(claim[field]);
    if (hits.length > 0) {
      issues.push({
        field,
        detail: `linguagem proibida: ${hits.join(", ")}`,
      });
    }
  }

  // 2. Pelo menos uma fonte primária.
  if (!claim.sources || claim.sources.length === 0) {
    issues.push({ field: "sources", detail: "claim publicada precisa de ≥ 1 fonte" });
  }

  // 3. Disclaimer não vazio.
  if (!claim.disclaimer || claim.disclaimer.trim().length === 0) {
    issues.push({ field: "disclaimer", detail: "disclaimer obrigatório" });
  }

  // 4. Disclaimer contém keywords do domínio.
  const keywords = EVIDENCE_DOMAIN_DISCLAIMER_KEYWORDS[claim.domain];
  const disclaimerLower = (claim.disclaimer ?? "").toLowerCase();
  const missingKw = keywords.filter((kw) => !disclaimerLower.includes(kw.toLowerCase()));
  if (missingKw.length > 0) {
    issues.push({
      field: "disclaimerKeywords",
      detail: `disclaimer de "${claim.domain}" precisa conter: ${missingKw.join(", ")}`,
    });
  }

  // 5. Os 4 princípios.
  const principleMisses = validateEvidencePrinciples(claim.principles);
  if (principleMisses.length > 0) {
    issues.push({
      field: "principles",
      detail: `princípios faltando: ${principleMisses.join(", ")}`,
    });
  }

  // 6. PAR-Q blocked precisa orientar revisão/encaminhamento.
  if (
    claim.domain === "questionnaire_parq" &&
    /blocked|positivo|bloqueado/i.test(claim.classification)
  ) {
    const coachActionLower = claim.coachAction.toLowerCase();
    const hasGuidance = PARQ_BLOCKED_COACH_ACTION_KEYWORDS.some((kw) =>
      coachActionLower.includes(kw),
    );
    if (!hasGuidance) {
      issues.push({
        field: "parqBlockedCoachAction",
        detail:
          "claim PAR-Q bloqueado deve orientar revisão clínica ou encaminhamento profissional",
      });
    }
  }

  return issues;
}

/**
 * Instancia uma claim do catálogo com um valor observado dinâmico.
 * Helper trivial — mantém imutabilidade do catálogo.
 */
export function instantiateClaim(
  claim: EvidenceClaim,
  observedValue: string,
): EvidenceClaim {
  return { ...claim, observedValue };
}

/** Lookup `(domain, classification)` → claim ou `null`. */
export function getEvidenceClaim(
  domain: EvidenceDomain,
  classification: string,
): EvidenceClaim | null {
  return (
    EVIDENCE_CATALOG.find(
      (c) => c.domain === domain && c.classification === classification,
    ) ?? null
  );
}

/** Todas as claims de um domínio (ordem do catálogo). */
export function getClaimsByDomain(domain: EvidenceDomain): EvidenceClaim[] {
  return EVIDENCE_CATALOG.filter((c) => c.domain === domain);
}

// ────────────────────────────────────────────────────────────────────────────
// Catálogo inicial — subset suficiente pra exercitar a estrutura
//
// Esta lista NÃO esgota todas as classificações possíveis de cada domínio.
// Etapas seguintes do E5 (E5.2/E5.3) populam o restante. O contrato de
// segurança valida cada entrada via `validateEvidenceClaim` em teste.
// ────────────────────────────────────────────────────────────────────────────

const ALL_PRINCIPLES_OK: EvidencePrinciples = {
  real_endpoint: true,
  is_associative: true,
  modifiability_explicit: true,
  multidimensional: true,
};

/**
 * Catálogo canônico de fontes usadas pelas claims. Cada claim publicada deve
 * combinar pelo menos uma fonte de referência/classificação com uma fonte de
 * associação com desfecho real quando o domínio permitir.
 */
export const EVIDENCE_SOURCE_CATALOG = {
  VO2_FRIEND_2022: {
    title:
      "Updated Reference Standards for Cardiorespiratory Fitness Measured with Cardiopulmonary Exercise Testing: Data from FRIEND",
    citation: "Kaminsky LA et al., 2022, Mayo Clinic Proceedings",
    url: "https://pubmed.ncbi.nlm.nih.gov/34809986/",
    population:
      "FRIEND Registry; percentis de VO₂pico por sexo, década e modalidade (esteira/bike)",
  },
  VO2_KODAMA_2009: {
    title:
      "Cardiorespiratory Fitness as a Quantitative Predictor of All-Cause Mortality and Cardiovascular Events",
    citation: "Kodama S et al., 2009, JAMA",
    url: "https://jamanetwork.com/journals/jama/fullarticle/1108396",
    population:
      "Meta-análise de coortes prospectivas; desfechos de mortalidade e eventos cardiovasculares",
  },
  EXERCISE_ACSM_GARBER_2011: {
    title:
      "Quantity and Quality of Exercise for Developing and Maintaining Cardiorespiratory, Musculoskeletal, and Neuromotor Fitness",
    citation: "Garber CE et al., 2011, Medicine & Science in Sports & Exercise",
    url: "https://pubmed.ncbi.nlm.nih.gov/21694556/",
    population: "ACSM Position Stand para prescrição de exercício em adultos",
  },
  FC_RECOVERY_COLE_1999: {
    title:
      "Heart-rate recovery immediately after exercise as a predictor of mortality",
    citation: "Cole CR et al., 1999, New England Journal of Medicine",
    url: "https://pubmed.ncbi.nlm.nih.gov/10536127/",
    population: "n=2.428 adultos, follow-up 6 anos",
  },
  FC_RECOVERY_NISHIME_2000: {
    title:
      "Heart Rate Recovery and Treadmill Exercise Score as Predictors of Mortality in Patients Referred for Exercise ECG",
    citation: "Nishime EO et al., 2000, JAMA",
    url: "https://jamanetwork.com/journals/jama/fullarticle/193090",
    population: "coorte clínica; mortalidade e teste ergométrico",
  },
  FC_RECOVERY_VIVEKANANTHAN_2003: {
    title:
      "Heart rate recovery after exercise is a predictor of mortality, independent of angiographic severity of coronary disease",
    citation: "Vivekananthan DP et al., 2003, Journal of the American College of Cardiology",
    url: "https://pubmed.ncbi.nlm.nih.gov/12957428/",
    population: "n=2.935 pacientes com angiografia; follow-up 6 anos",
  },
  HANDGRIP_MATHIOWETZ_1985: {
    title: "Grip and pinch strength: normative data for adults",
    citation: "Mathiowetz V et al., 1985, Archives of Physical Medicine and Rehabilitation",
    url: "https://pubmed.ncbi.nlm.nih.gov/3970660/",
    population: "638 adultos; normas por sexo, idade e mão",
  },
  HANDGRIP_DODDS_2014: {
    title:
      "Grip Strength across the Life Course: Normative Data from Twelve British Studies",
    citation: "Dodds RM et al., 2014, PLOS ONE",
    url: "https://journals.plos.org/plosone/doi?id=10.1371/journal.pone.0113637",
    population: "12 estudos populacionais britânicos; idades 4 a 90+ anos",
  },
  HANDGRIP_LEONG_2015: {
    title:
      "Prognostic value of grip strength: findings from the Prospective Urban Rural Epidemiology (PURE) study",
    citation: "Leong DP et al., 2015, The Lancet",
    url: "https://pubmed.ncbi.nlm.nih.gov/25982160/",
    population: "n=139.691 adultos, 17 países, 4 anos de seguimento",
  },
  HANDGRIP_EWGSOP2_2019: {
    title: "Sarcopenia: revised European consensus on definition and diagnosis",
    citation: "Cruz-Jentoft AJ et al., 2019, Age and Ageing",
    url: "https://pubmed.ncbi.nlm.nih.gov/30312372/",
    population: "Consenso europeu; força muscular como marcador central",
  },
  SIT_TO_STAND_ARAUJO_2012: {
    title:
      "Ability to sit and rise from the floor as a predictor of all-cause mortality",
    citation:
      "Brito LBB et al., 2012/2014, European Journal of Preventive Cardiology",
    url: "https://journals.sagepub.com/doi/abs/10.1177/2047487312471759",
    population: "n=2.002 adultos 51-80 anos, 6,3 anos de seguimento",
  },
  SIT_TO_STAND_ARAUJO_2020: {
    title:
      "Sitting-rising test: Sex- and age-reference scores derived from 6141 adults",
    citation: "Araújo CGS et al., 2020, European Journal of Preventive Cardiology",
    url: "https://journals.sagepub.com/doi/10.1177/2047487319847004",
    population: "n=6.141 adultos; scores de referência por sexo e idade",
  },
  DEXA_KELLY_2009: {
    title:
      "Dual Energy X-Ray Absorptiometry Body Composition Reference Values from NHANES",
    citation: "Kelly TL et al., 2009, PLOS ONE",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2737140/",
    population: "NHANES 1999-2004; referência populacional por DXA",
  },
  DEXA_GALLAGHER_2000: {
    title:
      "Healthy percentage body fat ranges: an approach for developing guidelines based on body mass index",
    citation: "Gallagher D et al., 2000, American Journal of Clinical Nutrition",
    url: "https://www.sciencedirect.com/science/article/pii/S0002916523067606",
    population: "faixas de % gordura por sexo/idade derivadas de referência BMI",
  },
  DEXA_BAUMGARTNER_1998: {
    title: "Epidemiology of sarcopenia among the elderly in New Mexico",
    citation: "Baumgartner RN et al., 1998, American Journal of Epidemiology",
    url: "https://pubmed.ncbi.nlm.nih.gov/9554417/",
    population: "cortes de massa muscular apendicular relativa à altura",
  },
  DEXA_ISCD_2013: {
    title:
      "The Official Positions of the International Society for Clinical Densitometry: acquisition of DXA body composition and repeatability",
    citation: "International Society for Clinical Densitometry, 2013, Journal of Clinical Densitometry",
    url: "https://pubmed.ncbi.nlm.nih.gov/24183641/",
    population: "posicionamento oficial sobre aquisição/análise de composição por DXA",
  },
  PARQ_WARBURTON_2011: {
    title:
      "International launch of the PAR-Q+ and ePARmed-X+: The Physical Activity Readiness Questionnaire for Everyone",
    citation: "Warburton DER, Jamnik VK, Bredin SSD, Gledhill N et al., 2011, Health & Fitness Journal of Canada",
    url: "https://hfjc.library.ubc.ca/index.php/HFJC/article/download/103/66/323",
    population: "instrumento internacional de triagem pré-participação",
  },
  PARQ_ACSM_THOMPSON_2013: {
    title:
      "ACSM's new preparticipation health screening recommendations from ACSM's Guidelines for Exercise Testing and Prescription",
    citation: "Thompson PD et al., 2013, Current Sports Medicine Reports",
    url: "https://pubmed.ncbi.nlm.nih.gov/23851406/",
    population: "guideline ACSM para triagem pré-exercício",
  },
  SLEEP_AASM_SRS_2015: {
    title:
      "Recommended Amount of Sleep for a Healthy Adult: A Joint Consensus Statement of the AASM and Sleep Research Society",
    citation: "Watson NF et al., 2015, Journal of Clinical Sleep Medicine",
    url: "https://pubmed.ncbi.nlm.nih.gov/25979105/",
    population: "consenso AASM/SRS para duração de sono em adultos",
  },
  STRESS_COHEN_1983: {
    title: "A Global Measure of Perceived Stress",
    citation: "Cohen S, Kamarck T, Mermelstein R, 1983, Journal of Health and Social Behavior",
    url: "https://www.cmu.edu/dietrich/psychology/stress-immunity-disease-lab/publications/scalesmeasurements/pdfs/globalmeas83.pdf",
    population: "desenvolvimento/validação da Perceived Stress Scale",
  },
  ENERGY_RYAN_1997: {
    title:
      "On energy, personality, and health: subjective vitality as a dynamic reflection of well-being",
    citation: "Ryan RM, Frederick C, 1997, Journal of Personality",
    url: "https://pubmed.ncbi.nlm.nih.gov/9327588/",
    population: "seis estudos sobre vitalidade subjetiva, energia e bem-estar",
  },
  ADHERENCE_EYNON_2019: {
    title:
      "Assessing the psychosocial factors associated with adherence to exercise referral schemes: A systematic review",
    citation: "Eynon M et al., 2019, Scandinavian Journal of Medicine & Science in Sports",
    url: "https://pubmed.ncbi.nlm.nih.gov/30742334/",
    population: "revisão sistemática; 24 estudos de adesão em programas de exercício",
  },
} as const satisfies Record<string, EvidenceSource>;

const {
  VO2_FRIEND_2022,
  VO2_KODAMA_2009,
  EXERCISE_ACSM_GARBER_2011,
  FC_RECOVERY_COLE_1999,
  FC_RECOVERY_NISHIME_2000,
  FC_RECOVERY_VIVEKANANTHAN_2003,
  HANDGRIP_MATHIOWETZ_1985,
  HANDGRIP_DODDS_2014,
  HANDGRIP_LEONG_2015,
  HANDGRIP_EWGSOP2_2019,
  SIT_TO_STAND_ARAUJO_2012,
  SIT_TO_STAND_ARAUJO_2020,
  DEXA_KELLY_2009,
  DEXA_GALLAGHER_2000,
  DEXA_BAUMGARTNER_1998,
  DEXA_ISCD_2013,
  PARQ_WARBURTON_2011,
  PARQ_ACSM_THOMPSON_2013,
  SLEEP_AASM_SRS_2015,
  STRESS_COHEN_1983,
  ENERGY_RYAN_1997,
  ADHERENCE_EYNON_2019,
} = EVIDENCE_SOURCE_CATALOG;

const VO2_SOURCES = [
  VO2_FRIEND_2022,
  VO2_KODAMA_2009,
  EXERCISE_ACSM_GARBER_2011,
];
const FC_RECOVERY_SOURCES = [
  FC_RECOVERY_COLE_1999,
  FC_RECOVERY_NISHIME_2000,
  FC_RECOVERY_VIVEKANANTHAN_2003,
];
const HANDGRIP_REFERENCE_SOURCES = [
  HANDGRIP_MATHIOWETZ_1985,
  HANDGRIP_DODDS_2014,
  HANDGRIP_LEONG_2015,
];
const HANDGRIP_WATCHFUL_SOURCES = [
  HANDGRIP_MATHIOWETZ_1985,
  HANDGRIP_DODDS_2014,
  HANDGRIP_LEONG_2015,
  HANDGRIP_EWGSOP2_2019,
];
const SIT_TO_STAND_SOURCES = [
  SIT_TO_STAND_ARAUJO_2012,
  SIT_TO_STAND_ARAUJO_2020,
];
const DEXA_BODY_FAT_SOURCES = [
  DEXA_KELLY_2009,
  DEXA_GALLAGHER_2000,
  DEXA_ISCD_2013,
];
const DEXA_LEAN_MASS_SOURCES = [
  DEXA_KELLY_2009,
  DEXA_BAUMGARTNER_1998,
  DEXA_ISCD_2013,
];
const PARQ_SOURCES = [PARQ_WARBURTON_2011, PARQ_ACSM_THOMPSON_2013];
const ADHERENCE_SOURCES = [
  SLEEP_AASM_SRS_2015,
  STRESS_COHEN_1983,
  ENERGY_RYAN_1997,
  ADHERENCE_EYNON_2019,
];

/** Catálogo ampliado. Ordem é apenas pra leitura humana; não é semântica. */
export const EVIDENCE_CATALOG: readonly EvidenceClaim[] = [
  // ── VO2 ────────────────────────────────────────────────────────────────
  {
    domain: "vo2_max",
    metric: "vo2_max",
    observedValue: null,
    classification: "Muito fraco",
    interpretation:
      "VO₂ máx na faixa Muito fraco sugere reserva aeróbica baixa para idade/sexo e pode estar associado a maior risco cardiometabólico em coortes populacionais.",
    evidenceSummary:
      "FRIEND oferece percentis contemporâneos de VO₂pico; Kodama et al. mostra associação dose-resposta entre menor aptidão cardiorrespiratória e maior risco de mortalidade/eventos cardiovasculares.",
    coachAction:
      "Priorizar base aeróbica progressiva e baixa barreira de adesão. Reavaliar tolerância, recuperação e sinais de fadiga antes de progredir intensidade.",
    riskLanguageLevel: "actionable",
    sources: VO2_SOURCES,
    disclaimer:
      "Faixas de referência são populacionais; o resultado individual deve ser integrado ao contexto de treino e ao acompanhamento clínico do aluno.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "vo2_max",
    metric: "vo2_max",
    observedValue: null,
    classification: "Fraco",
    interpretation:
      "VO₂ máx na faixa Fraco pode estar associado a maior risco cardiometabólico e menor capacidade aeróbica funcional, considerando a idade/sexo do aluno.",
    evidenceSummary:
      "FRIEND fornece referência contemporânea de VO₂pico por sexo/idade/modalidade; a meta-análise de Kodama et al. mostra associação inversa entre aptidão cardiorrespiratória e mortalidade/eventos cardiovasculares.",
    coachAction:
      "Considerar progressão estruturada em condicionamento aeróbico (zona 2 + alguns intervalados) e reavaliar em 12 semanas. Decisão de carga deve integrar o contexto do aluno e eventual acompanhamento clínico paralelo.",
    riskLanguageLevel: "watchful",
    sources: VO2_SOURCES,
    disclaimer:
      "Faixas de referência são populacionais; o resultado individual deve ser integrado ao contexto de treino e ao acompanhamento clínico do aluno.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "vo2_max",
    metric: "vo2_max",
    observedValue: null,
    classification: "Regular",
    interpretation:
      "VO₂ máx na faixa Regular sugere capacidade aeróbica intermediária para idade/sexo; há espaço claro para ganho de condicionamento com progressão consistente.",
    evidenceSummary:
      "FRIEND contextualiza percentis por sexo/idade; ACSM orienta combinação de volume aeróbico e progressão de intensidade para desenvolver aptidão cardiorrespiratória.",
    coachAction:
      "Manter frequência aeróbica mínima consistente, aumentar volume de forma gradual e incluir estímulos moderados conforme recuperação e adesão permitirem.",
    riskLanguageLevel: "informational",
    sources: VO2_SOURCES,
    disclaimer:
      "Faixas de referência são populacionais; o resultado individual deve ser integrado ao contexto de treino e ao acompanhamento clínico do aluno.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "vo2_max",
    metric: "vo2_max",
    observedValue: null,
    classification: "Bom",
    interpretation:
      "VO₂ máx na faixa Bom sugere capacidade aeróbica adequada para a idade/sexo do aluno e está associado a menor risco cardiometabólico em coortes grandes.",
    evidenceSummary:
      "FRIEND contextualiza percentis de VO₂pico; evidência epidemiológica em meta-análise mostra que maior aptidão cardiorrespiratória se associa a menor mortalidade e menor risco cardiovascular.",
    coachAction:
      "Manter rotina aeróbica; pode-se trabalhar progressão de performance (limiares, economia de corrida/bike). Integrar com objetivos do aluno e contexto de treino.",
    riskLanguageLevel: "reassuring",
    sources: VO2_SOURCES,
    disclaimer:
      "Mesmo com resultado favorável, manter acompanhamento periódico e reler dentro do contexto multidimensional do treino e do estilo de vida.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "vo2_max",
    metric: "vo2_max",
    observedValue: null,
    classification: "Excelente",
    interpretation:
      "VO₂ máx na faixa Excelente sugere aptidão cardiorrespiratória alta para idade/sexo e está associado a perfil de risco mais favorável em estudos populacionais.",
    evidenceSummary:
      "FRIEND define percentis altos de VO₂pico; evidência epidemiológica associa maior aptidão cardiorrespiratória a menor mortalidade e menor risco cardiovascular.",
    coachAction:
      "Preservar base aeróbica, individualizar estímulos de performance e evitar que progressão de intensidade comprometa recuperação, força e adesão.",
    riskLanguageLevel: "reassuring",
    sources: VO2_SOURCES,
    disclaimer:
      "Resultado favorável não elimina necessidade de acompanhamento periódico e leitura dentro do contexto integral de treino e estilo de vida.",
    principles: ALL_PRINCIPLES_OK,
  },

  // ── FC Recovery 1min ───────────────────────────────────────────────────
  {
    domain: "fc_recovery_1min",
    metric: "fc_recovery_1min_bpm",
    observedValue: null,
    classification: "Atenção",
    interpretation:
      "Redução de FC ≤ 12 bpm no primeiro minuto após esforço pode estar associada a menor capacidade de recuperação autonômica e merece acompanhamento.",
    evidenceSummary:
      "Cole et al. e Nishime et al. mostram associação entre recuperação reduzida de FC no primeiro minuto e mortalidade; Vivekananthan et al. reforça a associação mesmo considerando gravidade angiográfica.",
    coachAction:
      "Reavaliar em sessões subsequentes para verificar consistência; integrar com hidratação, sono e contexto de carga recente antes de tirar conclusão.",
    riskLanguageLevel: "watchful",
    sources: FC_RECOVERY_SOURCES,
    disclaimer:
      "Métrica isolada não fecha quadro — manter acompanhamento integrado com outras variáveis e com contexto clínico/treino.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "fc_recovery_1min",
    metric: "fc_recovery_1min_bpm",
    observedValue: null,
    classification: "Adequada",
    interpretation:
      "Recuperação de FC no primeiro minuto em faixa adequada sugere resposta autonômica pós-esforço compatível com boa recuperação naquele contexto de teste.",
    evidenceSummary:
      "Cole, Nishime e Vivekananthan associam recuperação mais rápida de FC a perfil prognóstico mais favorável; a métrica deve ser lida junto do protocolo e do esforço atingido.",
    coachAction:
      "Manter monitoramento em reavaliações, comparando sempre protocolo, esforço percebido, sono e carga recente para interpretar tendências.",
    riskLanguageLevel: "reassuring",
    sources: FC_RECOVERY_SOURCES,
    disclaimer:
      "Métrica isolada não fecha quadro — manter acompanhamento integrado com outras variáveis e com contexto clínico/treino.",
    principles: ALL_PRINCIPLES_OK,
  },

  // ── Handgrip ───────────────────────────────────────────────────────────
  {
    domain: "handgrip",
    metric: "handgrip_kg",
    observedValue: null,
    classification: "Baixo",
    interpretation:
      "Handgrip na faixa Baixo para idade/sexo pode estar associado a maior risco cardiometabólico e funcional global. É marcador modificável.",
    evidenceSummary:
      "Mathiowetz e Dodds fornecem dados normativos por idade/sexo; PURE sugere associação inversa entre força de preensão manual e mortalidade/eventos cardiovasculares em 17 países.",
    coachAction:
      "Inserir trabalho de força global e acompanhamento de adesão; reavaliar handgrip em 8-12 semanas. Discutir nutrição (proteína adequada) com profissional habilitado se relevante ao caso.",
    riskLanguageLevel: "watchful",
    sources: HANDGRIP_WATCHFUL_SOURCES,
    disclaimer:
      "Resultado deve ser interpretado em conjunto com outras métricas e com o acompanhamento de treino, não isolado.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "handgrip",
    metric: "handgrip_kg",
    observedValue: null,
    classification: "Médio",
    interpretation:
      "Handgrip na faixa Médio sugere força preservada para a referência populacional, sem sinais imediatos de alerta isolado.",
    evidenceSummary:
      "Dados normativos de Mathiowetz/Dodds contextualizam faixas médias por idade/sexo; PURE associa maior handgrip a perfil de risco mais favorável que extremos inferiores.",
    coachAction:
      "Manter rotina de força e reavaliar periodicamente. Integrar com objetivos individuais do aluno no treino.",
    riskLanguageLevel: "informational",
    sources: HANDGRIP_REFERENCE_SOURCES,
    disclaimer:
      "Métrica pontual; manter acompanhamento periódico de treino e contexto integral.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "handgrip",
    metric: "handgrip_kg",
    observedValue: null,
    classification: "Alto",
    interpretation:
      "Handgrip na faixa Alta sugere força de preensão preservada para idade/sexo e está associado a perfil funcional mais favorável em coortes populacionais.",
    evidenceSummary:
      "Mathiowetz e Dodds contextualizam valores de referência; PURE associa maior força de preensão a menor risco de mortalidade e eventos cardiovasculares.",
    coachAction:
      "Manter treino de força global e usar handgrip como marcador simples de tendência, sem substituir avaliação de força por padrões de movimento.",
    riskLanguageLevel: "reassuring",
    sources: HANDGRIP_REFERENCE_SOURCES,
    disclaimer:
      "Métrica pontual; manter acompanhamento periódico de treino e contexto integral.",
    principles: ALL_PRINCIPLES_OK,
  },

  // ── Sit-to-Stand ───────────────────────────────────────────────────────
  {
    domain: "sit_to_stand",
    metric: "sit_to_stand_total",
    observedValue: null,
    classification: "Alerta",
    interpretation:
      "Score baixo (0–3) sugere perda combinada em força, mobilidade e equilíbrio. Indica necessidade de acompanhamento próximo como sinal operacional.",
    evidenceSummary:
      "Brito/Araújo et al. reportam associação entre score baixo e maior mortalidade total; Araújo et al. 2020 fornece scores de referência por sexo e idade.",
    coachAction:
      "Trabalhar mobilidade de quadril/tornozelo, força de membros inferiores, core e equilíbrio. Reavaliar em 12 semanas; score é modificável mesmo após os 70 anos.",
    riskLanguageLevel: "watchful",
    sources: SIT_TO_STAND_SOURCES,
    disclaimer:
      "Score deve ser integrado ao histórico do aluno e ao acompanhamento clínico/treino, não usado isoladamente.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "sit_to_stand",
    metric: "sit_to_stand_total",
    observedValue: null,
    classification: "Intermediário",
    interpretation:
      "Score intermediário sugere capacidade funcional útil, com oportunidades de melhora em mobilidade, força de membros inferiores e equilíbrio.",
    evidenceSummary:
      "Brito/Araújo associa scores mais baixos a maior risco em coorte de seguimento; Araújo et al. 2020 fornece referência por sexo/idade para contextualizar faixas intermediárias.",
    coachAction:
      "Manter progressão funcional com ênfase em controle, amplitude, força de membros inferiores e equilíbrio. Reavaliar periodicamente para observar tendência.",
    riskLanguageLevel: "informational",
    sources: SIT_TO_STAND_SOURCES,
    disclaimer:
      "Score deve ser integrado ao histórico do aluno e ao acompanhamento clínico/treino, não usado isoladamente.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "sit_to_stand",
    metric: "sit_to_stand_total",
    observedValue: null,
    classification: "Excelente",
    interpretation:
      "Score 8–10 sugere capacidade neuromuscular integrada preservada para a faixa etária, associada a perfis de risco mais favoráveis em estudos populacionais.",
    evidenceSummary:
      "A coorte de Brito/Araújo associa scores mais altos a perfis de sobrevida mais favoráveis; a publicação de referência por sexo/idade ajuda a contextualizar o resultado individual.",
    coachAction:
      "Manter rotina e progressão funcional periódica. Continuar acompanhamento integral.",
    riskLanguageLevel: "reassuring",
    sources: SIT_TO_STAND_SOURCES,
    disclaimer:
      "Resultado favorável; manter reavaliação periódica e acompanhamento do contexto integral do aluno.",
    principles: ALL_PRINCIPLES_OK,
  },

  // ── DEXA / composição corporal ─────────────────────────────────────────
  {
    domain: "dexa",
    metric: "body_fat_pct",
    observedValue: null,
    classification: "% gordura elevada para faixa etária",
    interpretation:
      "% de gordura corporal acima da referência para idade/sexo pode estar associada a maior risco cardiometabólico. Métrica é modificável com ajustes de treino + estilo de vida.",
    evidenceSummary:
      "NHANES/Kelly fornece valores de referência por DXA; Gallagher propõe faixas de % gordura por idade/sexo; ISCD orienta aquisição/análise e repetibilidade de medidas por DXA.",
    coachAction:
      "Integrar com VO₂, força, adesão e contexto nutricional; ajustar treino e, se aplicável, encaminhar a profissional de nutrição. Reavaliar DEXA em 4–6 meses.",
    riskLanguageLevel: "watchful",
    sources: DEXA_BODY_FAT_SOURCES,
    disclaimer:
      "Este app interpreta o laudo DEXA para acompanhamento de performance e composição; NÃO substitui o laudo médico da clínica parceira nem avaliação clínica especializada.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "dexa",
    metric: "body_fat_pct",
    observedValue: null,
    classification: "% gordura dentro da referência",
    interpretation:
      "% de gordura corporal dentro da referência para idade/sexo sugere composição favorável naquele componente, sem dispensar leitura conjunta com massa magra, VO₂, força e adesão.",
    evidenceSummary:
      "NHANES/Kelly e Gallagher fornecem referências populacionais de composição por DXA; ISCD reforça que medidas devem considerar técnica, repetibilidade e contexto.",
    coachAction:
      "Manter rotina de força, condicionamento e hábitos de recuperação. Usar o resultado como baseline para acompanhar tendência em ciclos futuros.",
    riskLanguageLevel: "reassuring",
    sources: DEXA_BODY_FAT_SOURCES,
    disclaimer:
      "Este app interpreta o laudo DEXA para acompanhamento de performance e composição; NÃO substitui o laudo médico da clínica parceira nem avaliação clínica especializada.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "dexa",
    metric: "visceral_fat_g",
    observedValue: null,
    classification: "Gordura visceral elevada",
    interpretation:
      "Gordura visceral elevada no laudo DEXA pode estar associada a perfil cardiometabólico menos favorável e merece acompanhamento de tendência ao longo do ciclo.",
    evidenceSummary:
      "NHANES/Kelly oferece referência por DXA e ISCD orienta interpretação técnica; % gordura e distribuição corporal devem ser lidas em conjunto, não isoladamente.",
    coachAction:
      "Integrar com VO₂, circunferências se disponíveis, adesão e contexto nutricional. Priorizar consistência de treino aeróbico/força e reavaliar em 4–6 meses.",
    riskLanguageLevel: "watchful",
    sources: DEXA_BODY_FAT_SOURCES,
    disclaimer:
      "Este app interpreta o laudo DEXA para acompanhamento de performance e composição; NÃO substitui o laudo médico da clínica parceira nem avaliação clínica especializada.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "dexa",
    metric: "android_gynoid_ratio",
    observedValue: null,
    classification: "Relação androide/ginoide elevada",
    interpretation:
      "Relação androide/ginoide elevada sugere maior concentração relativa de gordura na região central, componente associado a perfil cardiometabólico menos favorável em estudos populacionais.",
    evidenceSummary:
      "NHANES/Kelly e Gallagher contextualizam composição corporal por DXA; ISCD reforça leitura técnica e repetibilidade das medidas de composição.",
    coachAction:
      "Acompanhar tendência junto de VO₂, força e adesão. Ajustar plano de treino e considerar integração com orientação nutricional quando fizer sentido.",
    riskLanguageLevel: "watchful",
    sources: DEXA_BODY_FAT_SOURCES,
    disclaimer:
      "Este app interpreta o laudo DEXA para acompanhamento de performance e composição; NÃO substitui o laudo médico da clínica parceira nem avaliação clínica especializada.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "dexa",
    metric: "appendicular_lean_mass_kg",
    observedValue: null,
    classification: "ALM/altura² abaixo do corte populacional",
    interpretation:
      "Massa magra apendicular relativa à altura abaixo dos cortes populacionais pode estar associada a maior risco funcional e de eventos adversos ao longo do tempo. Indicador modificável com treino de força + nutrição adequada.",
    evidenceSummary:
      "NHANES/Kelly contextualiza massa magra por DXA; Baumgartner descreve ALM/altura² como índice populacional; ISCD orienta interpretação técnica e repetibilidade de DXA.",
    coachAction:
      "Estruturar protocolo de força progressiva e acompanhar adesão. Considerar encaminhamento para nutrição clínica se ingestão proteica/calórica for fator. Reavaliar em 4–6 meses.",
    riskLanguageLevel: "actionable",
    sources: DEXA_LEAN_MASS_SOURCES,
    disclaimer:
      "Este app interpreta o laudo DEXA para acompanhamento de performance e composição; NÃO substitui o laudo médico da clínica parceira nem avaliação clínica especializada.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "dexa",
    metric: "appendicular_lean_mass_kg",
    observedValue: null,
    classification: "ALM/altura² dentro da referência",
    interpretation:
      "Massa magra apendicular relativa à altura dentro da referência sugere reserva muscular favorável naquele componente, considerando idade, sexo e contexto de treino.",
    evidenceSummary:
      "NHANES/Kelly contextualiza massa magra por DXA; Baumgartner descreve ALM/altura² como índice populacional; ISCD orienta aquisição e repetibilidade das medidas.",
    coachAction:
      "Manter treino de força progressivo, acompanhar performance funcional e usar DEXA futura para observar tendência de massa magra ao longo do programa.",
    riskLanguageLevel: "reassuring",
    sources: DEXA_LEAN_MASS_SOURCES,
    disclaimer:
      "Este app interpreta o laudo DEXA para acompanhamento de performance e composição; NÃO substitui o laudo médico da clínica parceira nem avaliação clínica especializada.",
    principles: ALL_PRINCIPLES_OK,
  },

  // ── Questionário / PAR-Q ───────────────────────────────────────────────
  {
    domain: "questionnaire_parq",
    metric: "parq_blocked",
    observedValue: null,
    classification: "PAR-Q positivo (blocked)",
    interpretation:
      "Aluno respondeu pelo menos uma pergunta do PAR-Q de forma que sugere necessidade de revisão clínica antes de liberar treino intenso.",
    evidenceSummary:
      "PAR-Q+ foi lançado como ferramenta internacional de triagem pré-participação; recomendações ACSM reforçam triagem pré-exercício baseada em risco e encaminhamento quando apropriado.",
    coachAction:
      "Revisar respostas do questionário com o aluno, encaminhar para acompanhamento clínico antes de prescrever treino vigoroso, e manter linhas de comunicação abertas com o profissional de saúde.",
    riskLanguageLevel: "actionable",
    sources: PARQ_SOURCES,
    disclaimer:
      "PAR-Q é triagem operacional; NÃO substitui avaliação clínica nem laudo médico. Bloqueio significa apenas pausa precaucional para revisão profissional.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "questionnaire_parq",
    metric: "parq_clear",
    observedValue: null,
    classification: "PAR-Q sem sinalizações",
    interpretation:
      "Respostas do PAR-Q não acionaram critérios de pausa precaucional; treino pode prosseguir conforme planejamento, integrando contexto do aluno.",
    evidenceSummary:
      "PAR-Q+ é triagem operacional para identificar necessidade de revisão prévia; recomendações ACSM apoiam triagem pré-exercício sem prometer eliminação completa de risco.",
    coachAction:
      "Prosseguir com a programação. Manter reavaliação periódica do questionário em ciclos do programa.",
    riskLanguageLevel: "reassuring",
    sources: PARQ_SOURCES,
    disclaimer:
      "PAR-Q é triagem operacional; NÃO substitui avaliação clínica. Manter atenção a eventuais mudanças de saúde durante o ciclo.",
    principles: ALL_PRINCIPLES_OK,
  },

  // ── Sono / estresse / energia / adesão ─────────────────────────────────
  {
    domain: "sleep_stress_energy_adherence",
    metric: "sleep_quality",
    observedValue: null,
    classification: "Sono insuficiente",
    interpretation:
      "Sono insuficiente ou de baixa qualidade pode estar associado a pior recuperação, menor energia percebida e maior dificuldade de aderir ao plano.",
    evidenceSummary:
      "O consenso AASM/SRS contextualiza necessidade de sono em adultos; revisões de adesão em exercício incluem fatores psicossociais e barreiras autorrelatadas como componentes relevantes.",
    coachAction:
      "Ajustar carga quando recuperação estiver baixa, discutir rotina pré-sono e acompanhar tendência no próximo questionário sem transformar o achado em rótulo clínico.",
    riskLanguageLevel: "watchful",
    sources: [SLEEP_AASM_SRS_2015, ADHERENCE_EYNON_2019],
    disclaimer:
      "Risco de adesão é sinal operacional, não substitui avaliação clínica — sempre integrar ao contexto integral do aluno e ao acompanhamento profissional adequado.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "sleep_stress_energy_adherence",
    metric: "stress_level",
    observedValue: null,
    classification: "Estresse alto",
    interpretation:
      "Estresse percebido alto pode estar associado a menor recuperação percebida, maior barreira de adesão e necessidade de ajuste no plano de treino.",
    evidenceSummary:
      "Cohen fundamenta a mensuração de estresse percebido; Eynon et al. revisa fatores psicossociais associados à adesão em programas de exercício.",
    coachAction:
      "Reduzir complexidade operacional quando necessário, ajustar frequência/carga e considerar encaminhamento a profissional habilitado se o relato sugerir necessidade.",
    riskLanguageLevel: "watchful",
    sources: [STRESS_COHEN_1983, ADHERENCE_EYNON_2019],
    disclaimer:
      "Risco de adesão é sinal operacional, não substitui avaliação clínica — sempre integrar ao contexto integral do aluno e ao acompanhamento profissional adequado.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "sleep_stress_energy_adherence",
    metric: "energy_level",
    observedValue: null,
    classification: "Baixa energia",
    interpretation:
      "Baixa energia autorrelatada pode estar associada a menor prontidão para treino e maior risco de inconsistência no ciclo.",
    evidenceSummary:
      "Ryan/Frederick descreve vitalidade subjetiva como reflexo dinâmico de energia e bem-estar; Eynon et al. contextualiza fatores psicossociais ligados à adesão.",
    coachAction:
      "Ajustar expectativa de sessão, observar tendência semanal e cruzar com sono, estresse, alimentação e carga recente antes de progredir volume.",
    riskLanguageLevel: "watchful",
    sources: [ENERGY_RYAN_1997, ADHERENCE_EYNON_2019],
    disclaimer:
      "Risco de adesão é sinal operacional, não substitui avaliação clínica — sempre integrar ao contexto integral do aluno e ao acompanhamento profissional adequado.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "sleep_stress_energy_adherence",
    metric: "adherence_barrier",
    observedValue: null,
    classification: "Barreira de adesão relevante",
    interpretation:
      "Barreira autorrelatada relevante pode estar associada a maior chance de interrupção do plano se não for traduzida em ajuste operacional concreto.",
    evidenceSummary:
      "Eynon et al. revisa fatores psicossociais associados à adesão em programas de exercício; sono, estresse e vitalidade ajudam a contextualizar a barreira relatada.",
    coachAction:
      "Converter a barreira em ajuste prático: reduzir fricção, simplificar frequência, escolher horários viáveis e combinar revisão curta no próximo contato.",
    riskLanguageLevel: "actionable",
    sources: ADHERENCE_SOURCES,
    disclaimer:
      "Risco de adesão é sinal operacional, não substitui avaliação clínica — sempre integrar ao contexto integral do aluno e ao acompanhamento profissional adequado.",
    principles: ALL_PRINCIPLES_OK,
  },
  {
    domain: "sleep_stress_energy_adherence",
    metric: "adherence_risk_flags",
    observedValue: null,
    classification: "Risco de adesão (≥ 2 flags)",
    interpretation:
      "Combinação de sono ruim, estresse alto, baixa energia e/ou barreiras autorrelatadas pode estar associada a menor adesão ao programa. É sinal operacional para acompanhamento próximo.",
    evidenceSummary:
      "AASM/SRS contextualiza sono em adultos; Cohen fundamenta estresse percebido; Ryan/Frederick valida vitalidade subjetiva; Eynon et al. revisa fatores psicossociais associados à adesão em programas de exercício.",
    coachAction:
      "Conversar com o aluno sobre barreiras específicas, ajustar carga e frequência do plano, e considerar encaminhamento a profissional de saúde mental se houver indício pertinente. Reavaliar no próximo questionário do ciclo.",
    riskLanguageLevel: "watchful",
    sources: ADHERENCE_SOURCES,
    disclaimer:
      "Risco de adesão é sinal operacional, não substitui avaliação clínica — sempre integrar ao contexto integral do aluno e ao acompanhamento profissional adequado.",
    principles: ALL_PRINCIPLES_OK,
  },
] as const;
