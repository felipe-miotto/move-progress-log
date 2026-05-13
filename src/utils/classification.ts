/**
 * Classificação automática de métricas clínicas baseada em tabelas de
 * referência seedadas no banco (vo2_reference_ranges, handgrip_reference_ranges,
 * sit_to_stand_reference_ranges).
 *
 * Esta camada é **lookup-based** — não armazena lógica de faixas em código.
 * O coach/admin pode atualizar as tabelas de referência sem precisar de deploy.
 *
 * As funções aqui são **puras** sobre o resultado dos lookups. O lookup em si
 * (que precisa de Supabase client) fica em hooks (E2/E5).
 *
 * Tipos esperados pra cada teste estão documentados; populados em E5.
 */

// ────────────────────────────────────────────────────────────────────────────
// Tipos de classificação retornados pelas tabelas de referência
// ────────────────────────────────────────────────────────────────────────────

export type Vo2Classification =
  | "Muito Fraco"
  | "Fraco"
  | "Regular"
  | "Bom"
  | "Excelente"
  | "Superior";

export type HandgripClassification =
  | "Muito Baixo"
  | "Baixo"
  | "Médio"
  | "Alto"
  | "Muito Alto";

export type SitToStandClassification =
  | "Alerta"   // 0-3
  | "Atenção"  // 3.5-5.5
  | "Bom"      // 6-7.5
  | "Excelente"; // 8-10

// ────────────────────────────────────────────────────────────────────────────
// Lookup row shapes (espelha o schema das tabelas de referência)
// ────────────────────────────────────────────────────────────────────────────

export interface Vo2ReferenceRange {
  sex: "M" | "F";
  age_min: number;
  age_max: number;
  classification: Vo2Classification;
  vo2_min: number;
  vo2_max: number;
}

export interface HandgripReferenceRange {
  sex: "M" | "F";
  age_min: number;
  age_max: number;
  classification: HandgripClassification;
  kg_min: number;
  kg_max: number;
}

export interface SitToStandReferenceRange {
  age_min: number;
  age_max: number;
  classification: SitToStandClassification;
  score_min: number;
  score_max: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Pure classifiers (recebem o lookup já filtrado por idade/sexo)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Classifica VO₂ máx baseado em faixa ACSM 2018 pra sexo/idade do aluno.
 * Retorna `null` se nenhum range bater (faixa etária fora das seedadas).
 *
 * @param vo2 VO₂ em ml/kg/min.
 * @param ranges Faixas já filtradas por sex + age (subset relevante).
 */
export function classifyVo2(
  vo2: number,
  ranges: Vo2ReferenceRange[],
): Vo2Classification | null {
  if (!Number.isFinite(vo2) || vo2 < 0) return null;
  const hit = ranges.find(
    (r) => vo2 >= r.vo2_min && vo2 <= r.vo2_max,
  );
  return hit?.classification ?? null;
}

/**
 * Classifica handgrip strength (Mathiowetz 1985) baseado na MAIOR das 3
 * tentativas (best_kg na tabela).
 */
export function classifyHandgrip(
  bestKg: number,
  ranges: HandgripReferenceRange[],
): HandgripClassification | null {
  if (!Number.isFinite(bestKg) || bestKg < 0) return null;
  const hit = ranges.find(
    (r) => bestKg >= r.kg_min && bestKg <= r.kg_max,
  );
  return hit?.classification ?? null;
}

/**
 * Classifica sit-to-stand (Araújo 2012) baseado no score total (0-10).
 *
 * Faixas (Araújo 2012/2025):
 *  • 8-10  → Excelente
 *  • 6-7.5 → Bom
 *  • 3.5-5.5 → Atenção
 *  • 0-3   → Alerta
 */
export function classifySitToStand(
  totalScore: number,
  ranges: SitToStandReferenceRange[],
): SitToStandClassification | null {
  if (!Number.isFinite(totalScore) || totalScore < 0 || totalScore > 10) {
    return null;
  }
  const hit = ranges.find(
    (r) => totalScore >= r.score_min && totalScore <= r.score_max,
  );
  return hit?.classification ?? null;
}

/**
 * Filtra ranges de VO₂ ou handgrip por sexo + idade do aluno.
 */
export function filterRangesBySexAge<
  T extends { sex: "M" | "F"; age_min: number; age_max: number },
>(ranges: T[], sex: "M" | "F" | null, ageYears: number | null): T[] {
  if (!sex || ageYears == null || !Number.isFinite(ageYears)) return [];
  return ranges.filter(
    (r) => r.sex === sex && ageYears >= r.age_min && ageYears <= r.age_max,
  );
}

/**
 * Filtra ranges de sit-to-stand por idade (não tem dimorfismo sexual nas faixas
 * Araújo 2012).
 */
export function filterSitToStandByAge(
  ranges: SitToStandReferenceRange[],
  ageYears: number | null,
): SitToStandReferenceRange[] {
  if (ageYears == null || !Number.isFinite(ageYears)) return [];
  return ranges.filter(
    (r) => ageYears >= r.age_min && ageYears <= r.age_max,
  );
}
