/**
 * E5.3 — Precision 12 Evidence Derivation Layer.
 *
 * Funções PURAS que transformam dados reais de avaliações/questionário do
 * Precision 12 em `EvidenceClaim[]` consumindo o `EVIDENCE_CATALOG` populado
 * em E5.1/E5.2. Não toca Supabase, não muta, não chama edge function, não
 * gera PDF.
 *
 * Contrato:
 *   • Recebe `Precision12EvidenceInput` (shape enxuto, todos os campos
 *     opcionais — o input pode estar parcial).
 *   • Retorna `EvidenceClaim[]` na ordem canônica dos 7 domínios.
 *   • Quando uma classificação não tem entry no catálogo, IGNORA
 *     silenciosamente (não lança, não inventa texto).
 *   • Quando `observedValue` é não-vazio, instancia a claim via
 *     `instantiateClaim` (preservando imutabilidade do catálogo).
 *   • Nenhuma função muta o input ou o catálogo.
 *
 * Sem texto dinâmico fora do catálogo. Toda safety-net de wording
 * permanece concentrada em `precision12Evidence.ts` (`validateEvidenceClaim`,
 * `EVIDENCE_PROHIBITED_TERMS`, etc.).
 */

import {
  getEvidenceClaim,
  instantiateClaim,
  type EvidenceClaim,
  type EvidenceDomain,
} from "./precision12Evidence";

// ────────────────────────────────────────────────────────────────────────────
// Input
// ────────────────────────────────────────────────────────────────────────────

/** Campo de marcador com classificação textual + valor observado opcional. */
export interface EvidenceMarkerInput {
  /** Classificação textual conforme catálogo (ex.: "Fraco", "Bom"). */
  classification?: string | null;
  /** Valor observado pra exibição (ex.: "27 ml/kg/min"). */
  observedValue?: string | null;
}

export interface Precision12EvidenceInput {
  vo2?: EvidenceMarkerInput;
  fcRecovery1Min?: EvidenceMarkerInput;
  handgrip?: EvidenceMarkerInput;
  sitToStand?: EvidenceMarkerInput;
  /** DEXA tem múltiplos marcadores independentes, cada um com sua faixa. */
  dexa?: {
    bodyFatClassification?: string | null;
    bodyFatObservedValue?: string | null;
    visceralFatClassification?: string | null;
    visceralFatObservedValue?: string | null;
    androidGynoidClassification?: string | null;
    androidGynoidObservedValue?: string | null;
    almHeightClassification?: string | null;
    almHeightObservedValue?: string | null;
  };
  /**
   * PAR-Q operacional:
   *   true → claim "PAR-Q positivo (blocked)"
   *   false → claim "PAR-Q sem sinalizações"
   *   null/undefined → sem claim
   */
  parq?: {
    blocked?: boolean | null;
  };
  /**
   * Sinais individuais de adesão. Cada flag `true` gera uma claim isolada do
   * domínio `sleep_stress_energy_adherence`. Quando `riskFlagCount >= 2`,
   * adicionalmente emite a claim agregada "Risco de adesão (≥ 2 flags)".
   */
  adherence?: {
    sleepFlag?: boolean;
    stressFlag?: boolean;
    energyFlag?: boolean;
    barrierFlag?: boolean;
    riskFlagCount?: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ────────────────────────────────────────────────────────────────────────────

/**
 * Lookup + instanciação opcional do observedValue. Retorna null quando o
 * catálogo não tem entry para essa (domain, classification) — não lança.
 */
function tryDerive(
  domain: EvidenceDomain,
  classification: string | null | undefined,
  observedValue: string | null | undefined,
): EvidenceClaim | null {
  if (!classification || classification.trim().length === 0) return null;
  const claim = getEvidenceClaim(domain, classification);
  if (!claim) return null;
  if (observedValue && observedValue.length > 0) {
    return instantiateClaim(claim, observedValue);
  }
  return claim;
}

/** Filtra nulos preservando tipo de saída. */
function compact<T>(arr: ReadonlyArray<T | null>): T[] {
  return arr.filter((x): x is T => x !== null);
}

// ────────────────────────────────────────────────────────────────────────────
// Derivações por domínio
// ────────────────────────────────────────────────────────────────────────────

export function deriveVo2EvidenceClaims(
  input: Precision12EvidenceInput,
): EvidenceClaim[] {
  const m = input.vo2;
  return compact([tryDerive("vo2_max", m?.classification, m?.observedValue)]);
}

export function deriveFcRecoveryEvidenceClaims(
  input: Precision12EvidenceInput,
): EvidenceClaim[] {
  const m = input.fcRecovery1Min;
  return compact([
    tryDerive("fc_recovery_1min", m?.classification, m?.observedValue),
  ]);
}

export function deriveHandgripEvidenceClaims(
  input: Precision12EvidenceInput,
): EvidenceClaim[] {
  const m = input.handgrip;
  return compact([
    tryDerive("handgrip", m?.classification, m?.observedValue),
  ]);
}

export function deriveSitToStandEvidenceClaims(
  input: Precision12EvidenceInput,
): EvidenceClaim[] {
  const m = input.sitToStand;
  return compact([
    tryDerive("sit_to_stand", m?.classification, m?.observedValue),
  ]);
}

export function deriveDexaEvidenceClaims(
  input: Precision12EvidenceInput,
): EvidenceClaim[] {
  const d = input.dexa;
  if (!d) return [];
  // Ordem fixa: body fat → visceral → androide/ginoide → ALM/altura².
  // Múltiplos marcadores podem gerar múltiplas claims; classificação
  // inexistente é silenciosamente ignorada.
  return compact([
    tryDerive("dexa", d.bodyFatClassification, d.bodyFatObservedValue),
    tryDerive("dexa", d.visceralFatClassification, d.visceralFatObservedValue),
    tryDerive(
      "dexa",
      d.androidGynoidClassification,
      d.androidGynoidObservedValue,
    ),
    tryDerive("dexa", d.almHeightClassification, d.almHeightObservedValue),
  ]);
}

export function deriveParqEvidenceClaims(
  input: Precision12EvidenceInput,
): EvidenceClaim[] {
  const blocked = input.parq?.blocked;
  if (blocked === true) {
    return compact([
      tryDerive("questionnaire_parq", "PAR-Q positivo (blocked)", null),
    ]);
  }
  if (blocked === false) {
    return compact([
      tryDerive("questionnaire_parq", "PAR-Q sem sinalizações", null),
    ]);
  }
  // null/undefined → nada.
  return [];
}

export function deriveAdherenceEvidenceClaims(
  input: Precision12EvidenceInput,
): EvidenceClaim[] {
  const a = input.adherence;
  if (!a) return [];

  const claims: (EvidenceClaim | null)[] = [];

  // Ordem fixa pra estabilidade visual: sono → estresse → energia → barreira
  // → agregada (quando aplicável).
  if (a.sleepFlag === true) {
    claims.push(
      tryDerive("sleep_stress_energy_adherence", "Sono insuficiente", null),
    );
  }
  if (a.stressFlag === true) {
    claims.push(
      tryDerive("sleep_stress_energy_adherence", "Estresse alto", null),
    );
  }
  if (a.energyFlag === true) {
    claims.push(
      tryDerive("sleep_stress_energy_adherence", "Baixa energia", null),
    );
  }
  if (a.barrierFlag === true) {
    claims.push(
      tryDerive(
        "sleep_stress_energy_adherence",
        "Barreira de adesão relevante",
        null,
      ),
    );
  }
  if (typeof a.riskFlagCount === "number" && a.riskFlagCount >= 2) {
    claims.push(
      tryDerive(
        "sleep_stress_energy_adherence",
        "Risco de adesão (≥ 2 flags)",
        null,
      ),
    );
  }

  return compact(claims);
}

// ────────────────────────────────────────────────────────────────────────────
// Orquestrador
// ────────────────────────────────────────────────────────────────────────────

/**
 * Retorna todas as claims aplicáveis ao input, na ordem canônica dos
 * 7 domínios:
 *
 *   1. VO₂
 *   2. FC recovery 1min
 *   3. Handgrip
 *   4. Sit-to-Stand
 *   5. DEXA (múltiplos marcadores)
 *   6. PAR-Q
 *   7. Sono/estresse/energia/adesão (individuais + agregada)
 *
 * Input parcial é tolerado: domínios ausentes simplesmente não contribuem.
 * Nenhuma claim é inventada — todo texto vem do catálogo.
 */
export function deriveEvidenceClaims(
  input: Precision12EvidenceInput,
): EvidenceClaim[] {
  return [
    ...deriveVo2EvidenceClaims(input),
    ...deriveFcRecoveryEvidenceClaims(input),
    ...deriveHandgripEvidenceClaims(input),
    ...deriveSitToStandEvidenceClaims(input),
    ...deriveDexaEvidenceClaims(input),
    ...deriveParqEvidenceClaims(input),
    ...deriveAdherenceEvidenceClaims(input),
  ];
}
