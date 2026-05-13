/**
 * Cálculos de VO₂ e variáveis relacionadas — fórmulas validadas em literatura.
 *
 * Todas as funções são puras, sem dependências externas, cobertas por testes
 * unitários em src/utils/__tests__/vo2.test.ts.
 *
 * Fontes:
 *  • Tanaka et al. 2001 (Journal of the American College of Cardiology)
 *    — FCmáx prevista = 208 − 0.7 × idade
 *  • ACSM Metabolic Calculations 2018
 *    — VO₂ bike = (10.8 × watts ÷ peso_kg) + 7
 *  • Cole et al. 1999 (New England Journal of Medicine 341:1351-1357)
 *    — Heart-rate recovery (HRR) imediatamente após exercício como
 *      preditor de mortalidade. Estabeleceu HRR ≤ 12 bpm em 1 min como
 *      ponto de corte anormal (risco aumentado de morte por qualquer
 *      causa em 6 anos).
 *  • ACSM Guidelines for Exercise Testing and Prescription, 10th ed.
 *    — Faixas operacionais derivadas pra classificação clínica em
 *      4 categorias (≥30 Excelente · 20-29 Muito Boa · 12-19 Moderada
 *      · <12 Baixa) usadas como protocolo Fabrik.
 *
 * NOTA: Araújo et al. 2012 (European Journal of Preventive Cardiology)
 * é fonte do Sit-to-Stand (SRT), NÃO do HRR. Citação incorreta foi
 * corrigida no hardening pré-E2 após auditoria externa Codex.
 */

/**
 * FCmáx prevista pela equação de Tanaka 2001 (mais precisa que 220 − idade
 * para populações modernas, principalmente em adultos > 40 anos).
 *
 * @param ageYears Idade em anos (deve ser > 0).
 * @returns FCmáx prevista em bpm. Retorna 0 se idade inválida.
 */
export function calcFcMaxPredicted(ageYears: number): number {
  if (!Number.isFinite(ageYears) || ageYears <= 0) return 0;
  return Math.round(208 - 0.7 * ageYears);
}

/**
 * VO₂ estimado pra bike ergométrica via equação ACSM 2018.
 *
 * Fórmula: VO₂ (ml/kg/min) = (10.8 × watts ÷ peso_kg) + 7
 *
 * O coeficiente 10.8 vem da eficiência mecânica padrão da bike (~25%);
 * o termo +7 cobre o custo de oxigênio do pedalar sem carga + repouso.
 *
 * @param watts Carga em watts (deve ser ≥ 0).
 * @param weightKg Peso do aluno em kg (deve ser > 0).
 * @returns VO₂ estimado em ml/kg/min. Retorna 0 se inputs inválidos.
 */
export function calcVo2Bike(watts: number, weightKg: number): number {
  if (!Number.isFinite(watts) || watts < 0) return 0;
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  const vo2 = (10.8 * watts) / weightKg + 7;
  return Math.round(vo2 * 100) / 100; // 2 casas decimais
}

/**
 * Percentual de FCmáx atingido.
 *
 * @param observed FC observada no momento (bpm).
 * @param predicted FCmáx prevista (Tanaka) (bpm).
 * @returns Razão entre 0 e ≥1 (ex: 0.85 = 85% da FCmáx). 0 se inputs inválidos.
 */
export function calcPercentFcMax(
  observed: number,
  predicted: number,
): number {
  if (!Number.isFinite(observed) || observed <= 0) return 0;
  if (!Number.isFinite(predicted) || predicted <= 0) return 0;
  return Math.round((observed / predicted) * 10000) / 10000;
}

/**
 * Classificação da queda da FC em 1 minuto de recuperação pós-teste (HRR).
 *
 * Ponto de corte clínico de Cole 1999 NEJM: HRR ≤ 12 bpm em 1 min é
 * preditor independente de mortalidade. Por isso 12 cai em "Baixa"
 * (zona crítica). Acima disso, faixas operacionais derivadas de ACSM
 * Guidelines + protocolo Fabrik pra orientar o coach na progressão:
 *
 *  • ≥ 30 bpm → "Excelente"   (manter progressão atual)
 *  • 20–29 bpm → "Muito Boa"  (boa resposta autonômica)
 *  • 13–19 bpm → "Moderada"   (observar evolução nas próximas 4 semanas)
 *  • ≤ 12 bpm  → "Baixa"      (cutoff anormal Cole 1999 — investigar
 *                              condicionamento/fatores limitantes)
 *
 * @param dropBpm Queda da FC em 1 min (FC pico − FC após 1 min).
 * @returns Classificação textual.
 */
export function classifyRecovery(dropBpm: number): RecoveryClassification {
  if (!Number.isFinite(dropBpm)) return "Indeterminada";
  if (dropBpm >= 30) return "Excelente";
  if (dropBpm >= 20) return "Muito Boa";
  if (dropBpm > 12) return "Moderada";
  return "Baixa";
}

export type RecoveryClassification =
  | "Excelente"
  | "Muito Boa"
  | "Moderada"
  | "Baixa"
  | "Indeterminada";
