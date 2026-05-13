/**
 * Evidência clínica por métrica do app — schema único pra render via
 * `<EvidenceCard>` (UI + PDF).
 *
 * Esta estrutura é **populada na Etapa 5** (Evidence layer). Por enquanto
 * (E1) carrega apenas:
 *  • Tipos
 *  • Mapa vazio com entries esperadas
 *  • 1 entrada de exemplo (sit-to-stand — único totalmente confirmado em E1)
 *
 * Regra dos 4 princípios pros textos `plainExplanation` e `whatToDo`:
 *   1. Manter o desfecho real (mortalidade, morbidade, longevidade)
 *   2. Indicador associativo, não diagnóstico
 *   3. Frame de modificabilidade explícito
 *   4. Multidimensional quando aplicável
 *
 * Cada métrica deve citar fonte primária de impacto factor alto.
 */

// ────────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────────

export interface ClinicalEvidenceStudy {
  /** Título curto da publicação. */
  title: string;
  /** Citação resumida (autores + ano + journal). */
  citation: string;
  /** URL (DOI/PubMed/etc.). */
  url: string;
  /** N da amostra ou tipo (meta-análise, revisão sistemática, RCT). */
  population?: string;
}

export interface ClinicalEvidenceDimension {
  /** Texto contextualizando saúde geral / morbidade. */
  health: string;
  /** Texto sobre longevidade / mortalidade. */
  longevity: string;
  /** Texto sobre performance física. */
  performance: string;
}

export interface ClinicalEvidenceCard {
  /** Identificador único da métrica. */
  fieldKey: string;
  /** Label exibido em UI/PDF. */
  label: string;
  /** Unidade de medida (ex: "ml/kg/min", "%", "kg/m²"). */
  unit: string;
  /** Explicação em 1-2 frases em linguagem leiga. */
  plainExplanation: string;
  /** Dimensões saúde / longevidade / performance. */
  dimensions: ClinicalEvidenceDimension;
  /** Recomendação de ação modificável. */
  whatToDo: string;
  /** Fontes primárias citadas (mínimo 1, recomendado 2-3). */
  studies: ClinicalEvidenceStudy[];
}

// ────────────────────────────────────────────────────────────────────────────
// Lista de métricas que serão populadas (E5 entrega cada uma com texto + estudos)
// ────────────────────────────────────────────────────────────────────────────

export const CLINICAL_EVIDENCE_FIELDS = [
  "vo2_max",
  "fc_max_predicted",
  "fc_recovery_1min",
  "handgrip_strength",
  "sit_to_stand_total",
  "body_fat_pct",
  "visceral_fat",
  "appendicular_lean_mass",
  "imma_baumgartner",
  "fmi",
  "bone_density_z_score",
  "hrv_rmssd",
  "sleep_total_hours",
  "readiness_score",
  "bmr",
] as const;

export type ClinicalEvidenceFieldKey =
  (typeof CLINICAL_EVIDENCE_FIELDS)[number];

// ────────────────────────────────────────────────────────────────────────────
// Mapa de cards (skeleton — E5 popula com texto + estudos validados em
// revistas de alto impacto)
// ────────────────────────────────────────────────────────────────────────────

export const CLINICAL_EVIDENCE: Partial<
  Record<ClinicalEvidenceFieldKey, ClinicalEvidenceCard>
> = {
  sit_to_stand_total: {
    fieldKey: "sit_to_stand_total",
    label: "Sentar e Levantar (score)",
    unit: "pontos / 10",
    plainExplanation:
      "Mede sua capacidade neuromuscular integrada — força, mobilidade, equilíbrio e coordenação juntos — na tarefa funcional de sentar no chão e levantar com o mínimo de apoios.",
    dimensions: {
      health:
        "Score baixo indica perda combinada em força, mobilidade e/ou equilíbrio. Faixa Atenção (3,5-5,5) está associada a maior risco de eventos adversos de saúde.",
      longevity:
        "Estudos com mais de 2.000 adultos mostram correlação linear entre score alto e maior expectativa de vida saudável em 10 anos. Score 8-10 indica menor risco de mortalidade total no acompanhamento.",
      performance:
        "Reflete prontidão funcional pra atividades do dia-a-dia. Modificável com treino estruturado em força, mobilidade e equilíbrio.",
    },
    whatToDo:
      "Trabalhar mobilidade de quadril/tornozelo + força de membros inferiores + core + equilíbrio. Reavaliar em 12 semanas. Score é reversível com treino consistente mesmo após os 70 anos.",
    studies: [
      {
        title:
          "Ability to sit and rise from the floor as a predictor of all-cause mortality",
        citation:
          "Araújo CG et al., 2012, European Journal of Preventive Cardiology",
        url: "https://pubmed.ncbi.nlm.nih.gov/23242910/",
        population: "n=2.002 adultos 51-80 anos, 6,3 anos de seguimento",
      },
      {
        title:
          "Sitting-rising test scores predict natural and cardiovascular causes of deaths in middle-aged and older men and women",
        citation: "Araújo CG et al., 2025, European Journal of Preventive Cardiology",
        url: "https://academic.oup.com/eurjpc/advance-article/doi/10.1093/eurjpc/zwaf325/8163161",
      },
    ],
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Retorna o card de evidência pra uma métrica, ou null se ainda não populado.
 */
export function getEvidenceCard(
  fieldKey: ClinicalEvidenceFieldKey,
): ClinicalEvidenceCard | null {
  return CLINICAL_EVIDENCE[fieldKey] ?? null;
}

/**
 * Quantas métricas ainda estão pendentes de população em E5.
 * Usado em testes pra garantir que E5 fechou todas.
 */
export function getMissingEvidenceCards(): ClinicalEvidenceFieldKey[] {
  return CLINICAL_EVIDENCE_FIELDS.filter((k) => !CLINICAL_EVIDENCE[k]);
}
