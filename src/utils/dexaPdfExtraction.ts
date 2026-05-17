/**
 * Helpers PUROS pra extração assistida por IA do PDF do laudo DEXA.
 *
 * Responsabilidades cobertas aqui (sem efeito colateral, sem fetch):
 *
 *   - normalizar a resposta da edge `extract-dexa-pdf` (coage tipos,
 *     trunca strings longas, descarta campos desconhecidos);
 *   - aplicar a extração ao formulário SEM sobrescrever valores que o
 *     coach já preencheu manualmente (regra conservadora);
 *   - sanitizar o que vai pra `dexa_results.raw_extracted_json` (sem
 *     base64, sem signed URL, sem path do bucket, sem prompt).
 *
 * NÃO contém microcopy clínica, NÃO classifica, NÃO diagnostica. É só
 * adaptador entre o JSON da edge e o shape do form/banco.
 */
import type { DexaInput } from "./assessmentValidation";

// ────────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────────

/**
 * Lista canônica dos campos numéricos do DEXA cuja unidade de armazenamento
 * é kg. Usada pelo coerce — quando o laudo traz o valor em g (separador
 * brasileiro `78.025 g`), interpretamos como kg pra alinhar com o schema.
 */
export const DEXA_KG_FIELDS = [
  "total_mass_kg",
  "fat_mass_kg",
  "lean_mass_kg",
  "bone_mass_kg",
  "appendicular_lean_mass_kg",
] as const;

/** Campo numérico expresso em gramas no schema. */
export const DEXA_VISCERAL_FAT_FIELD = "visceral_fat_g" as const;

/**
 * Campos numéricos esperados em cada `fields[*]` da resposta da edge,
 * com os tipos do schema do banco (`dexa_results`).
 */
export const DEXA_NUMERIC_FIELDS = [
  "total_mass_kg",
  "fat_mass_kg",
  "fat_pct",
  "lean_mass_kg",
  "bone_mass_kg",
  "bone_density_z_score",
  "visceral_fat_g",
  "android_gynoid_ratio",
  "appendicular_lean_mass_kg",
  "imma_baumgartner",
  "fmi",
  "fat_percentile",
  "bmr_harris_benedict_kcal",
  "bmr_mifflin_stjeor_kcal",
] as const;
export type DexaNumericFieldName = (typeof DEXA_NUMERIC_FIELDS)[number];

/** Campos textuais ou estruturais (não-numéricos) extraíveis. */
export const DEXA_NON_NUMERIC_FIELDS = [
  "conclusion_text",
  "regional_distribution",
] as const;

/** Todas as chaves esperadas em `extraction.fields`. */
export const DEXA_EXTRACTION_FIELDS = [
  ...DEXA_NUMERIC_FIELDS,
  ...DEXA_NON_NUMERIC_FIELDS,
] as const;
export type DexaExtractionFieldName = (typeof DEXA_EXTRACTION_FIELDS)[number];

/** Máximo de caracteres a preservar de `source_text` no payload sanitizado. */
export const DEXA_SOURCE_TEXT_MAX_CHARS = 500;

/** Máximo de caracteres do `conclusion_text` extraído. */
export const DEXA_CONCLUSION_TEXT_MAX_CHARS = 5000;

/**
 * Lista de chaves QUE NUNCA podem aparecer no payload sanitizado guardado
 * em `dexa_results.raw_extracted_json`. Auditada via teste.
 */
export const DEXA_FORBIDDEN_RAW_KEYS = [
  "base64",
  "file_data",
  "signedUrl",
  "signed_url",
  "storage_path",
  "storagePath",
  "bucket",
  "pdfBytes",
  "pdf_bytes",
  "prompt",
] as const;

export type DexaRegionKey =
  | "trunk"
  | "arms_right"
  | "arms_left"
  | "legs_right"
  | "legs_left"
  | "android"
  | "gynoid";

export const DEXA_REGION_KEYS: readonly DexaRegionKey[] = [
  "trunk",
  "arms_right",
  "arms_left",
  "legs_right",
  "legs_left",
  "android",
  "gynoid",
];

export interface DexaExtractionField<TValue> {
  value: TValue | null;
  confidence: number;
  source_text: string | null;
  page: number | null;
}

export type DexaRegionalDistributionField = DexaExtractionField<
  Partial<
    Record<
      DexaRegionKey,
      {
        fat_pct?: number | null;
        lean_mass_g?: number | null;
        fat_mass_g?: number | null;
      }
    >
  >
>;

export interface DexaExtraction {
  fields: Record<DexaNumericFieldName, DexaExtractionField<number>> & {
    conclusion_text: DexaExtractionField<string>;
    regional_distribution: DexaRegionalDistributionField;
  };
  overall_confidence: number;
  missing_fields: string[];
  warnings: string[];
  model: string;
  extracted_at: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Coerção / utilidades
// ────────────────────────────────────────────────────────────────────────────

function clamp01(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function coerceString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function coerceInt(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = parseBrazilianNumber(value);
    return parsed == null ? null : Math.round(parsed);
  }
  return null;
}

function coerceNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    return parseBrazilianNumber(value);
  }
  return null;
}

/**
 * Aceita string numérica em formato brasileiro ou internacional:
 *   "78.025"     → 78.025 (interpreta como decimal com ponto)
 *   "78,025"     → 78.025 (vírgula brasileira como decimal)
 *   "1.234,56"   → 1234.56 (milhar com ponto + decimal com vírgula)
 *   "1,234.56"   → 1234.56 (formato US)
 *   "78.025 g"   → 78.025 (sufixo ignorado)
 *   "78,025 kg"  → 78.025
 *   "VAT 322 g"  → 322
 *
 * A IA é instruída a já enviar números, mas o helper é defensivo: cobre
 * o caso de a IA esquecer e devolver string.
 */
export function parseBrazilianNumber(input: string): number | null {
  if (typeof input !== "string") return null;
  // 1. Remove ruído conhecido (rótulos antes do número).
  //    Captura o PRIMEIRO grupo numérico do texto.
  const numericMatch = input
    .replace(/\u00A0/g, " ")
    .match(/-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/);
  if (!numericMatch) return null;
  let token = numericMatch[0];
  const hasComma = token.includes(",");
  const hasDot = token.includes(".");
  if (hasComma && hasDot) {
    // Detecta qual é o separador decimal: o ÚLTIMO separador encontrado.
    const lastComma = token.lastIndexOf(",");
    const lastDot = token.lastIndexOf(".");
    if (lastComma > lastDot) {
      // formato BR: "1.234,56"
      token = token.replace(/\./g, "").replace(",", ".");
    } else {
      // formato US: "1,234.56"
      token = token.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Só vírgula → decimal BR
    token = token.replace(",", ".");
  }
  const parsed = Number(token);
  return Number.isFinite(parsed) ? parsed : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Normalização da response da edge
// ────────────────────────────────────────────────────────────────────────────

function defaultNumericField(): DexaExtractionField<number> {
  return { value: null, confidence: 0, source_text: null, page: null };
}

function defaultStringField(): DexaExtractionField<string> {
  return { value: null, confidence: 0, source_text: null, page: null };
}

function defaultRegionalField(): DexaRegionalDistributionField {
  return { value: null, confidence: 0, source_text: null, page: null };
}

function normalizeNumericField(
  raw: unknown,
  isInteger: boolean,
): DexaExtractionField<number> {
  if (!raw || typeof raw !== "object") return defaultNumericField();
  const obj = raw as Record<string, unknown>;
  const value = isInteger ? coerceInt(obj.value) : coerceNullableNumber(obj.value);
  return {
    value,
    confidence: clamp01(obj.confidence),
    source_text: coerceString(obj.source_text, DEXA_SOURCE_TEXT_MAX_CHARS),
    page:
      typeof obj.page === "number" && Number.isFinite(obj.page)
        ? Math.max(0, Math.trunc(obj.page))
        : null,
  };
}

function normalizeConclusionField(raw: unknown): DexaExtractionField<string> {
  if (!raw || typeof raw !== "object") return defaultStringField();
  const obj = raw as Record<string, unknown>;
  return {
    value: coerceString(obj.value, DEXA_CONCLUSION_TEXT_MAX_CHARS),
    confidence: clamp01(obj.confidence),
    source_text: coerceString(obj.source_text, DEXA_SOURCE_TEXT_MAX_CHARS),
    page:
      typeof obj.page === "number" && Number.isFinite(obj.page)
        ? Math.max(0, Math.trunc(obj.page))
        : null,
  };
}

function normalizeRegionalDistributionField(
  raw: unknown,
): DexaRegionalDistributionField {
  if (!raw || typeof raw !== "object") return defaultRegionalField();
  const obj = raw as Record<string, unknown>;
  const valueRaw = obj.value;
  let value: DexaRegionalDistributionField["value"] = null;
  if (valueRaw && typeof valueRaw === "object" && !Array.isArray(valueRaw)) {
    const cleaned: NonNullable<DexaRegionalDistributionField["value"]> = {};
    for (const region of DEXA_REGION_KEYS) {
      const regionRaw = (valueRaw as Record<string, unknown>)[region];
      if (!regionRaw || typeof regionRaw !== "object") continue;
      const r = regionRaw as Record<string, unknown>;
      const entry: NonNullable<
        NonNullable<DexaRegionalDistributionField["value"]>[DexaRegionKey]
      > = {};
      const fatPct = coerceNullableNumber(r.fat_pct);
      const leanG = coerceNullableNumber(r.lean_mass_g);
      const fatG = coerceNullableNumber(r.fat_mass_g);
      if (fatPct != null) entry.fat_pct = fatPct;
      if (leanG != null) entry.lean_mass_g = leanG;
      if (fatG != null) entry.fat_mass_g = fatG;
      if (Object.keys(entry).length > 0) {
        cleaned[region] = entry;
      }
    }
    value = Object.keys(cleaned).length > 0 ? cleaned : null;
  }
  return {
    value,
    confidence: clamp01(obj.confidence),
    source_text: coerceString(obj.source_text, DEXA_SOURCE_TEXT_MAX_CHARS),
    page:
      typeof obj.page === "number" && Number.isFinite(obj.page)
        ? Math.max(0, Math.trunc(obj.page))
        : null,
  };
}

function coerceStringArray(value: unknown, maxItems = 50): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const trimmed = item.trim().slice(0, 200);
      if (trimmed.length > 0) out.push(trimmed);
      if (out.length >= maxItems) break;
    }
  }
  return out;
}

const INTEGER_FIELDS = new Set<DexaNumericFieldName>([
  "bmr_harris_benedict_kcal",
  "bmr_mifflin_stjeor_kcal",
  "fat_percentile",
]);

/**
 * Coage o JSON cru da edge num shape garantido (`DexaExtraction`),
 * descartando chaves desconhecidas. NUNCA inventa valor: o que não bate
 * vira `null`/`0`/`""`.
 */
export function normalizeDexaExtractionResponse(raw: unknown): DexaExtraction {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const fieldsRaw =
    obj.fields && typeof obj.fields === "object"
      ? (obj.fields as Record<string, unknown>)
      : {};

  const numericFields = {} as Record<
    DexaNumericFieldName,
    DexaExtractionField<number>
  >;
  for (const fieldName of DEXA_NUMERIC_FIELDS) {
    numericFields[fieldName] = normalizeNumericField(
      fieldsRaw[fieldName],
      INTEGER_FIELDS.has(fieldName),
    );
  }

  return {
    fields: {
      ...numericFields,
      conclusion_text: normalizeConclusionField(fieldsRaw.conclusion_text),
      regional_distribution: normalizeRegionalDistributionField(
        fieldsRaw.regional_distribution,
      ),
    },
    overall_confidence: clamp01(obj.overall_confidence),
    missing_fields: coerceStringArray(obj.missing_fields),
    warnings: coerceStringArray(obj.warnings),
    model: coerceString(obj.model, 120) ?? "",
    extracted_at: coerceString(obj.extracted_at, 64) ?? "",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Aplicação no formulário (sem sobrescrever campos preenchidos)
// ────────────────────────────────────────────────────────────────────────────

/** Considera vazio: null, undefined, "" e (apenas para campos numéricos) NaN. */
export function isDexaFieldEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof value === "number") return Number.isNaN(value);
  if (typeof value === "object") {
    // objeto vazio (`{}`) também conta como vazio pra regional_distribution.
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

export type DexaFormValueMap = Partial<
  Pick<
    DexaInput,
    | (typeof DEXA_NUMERIC_FIELDS)[number]
    | "conclusion_text"
    | "regional_distribution"
  >
>;

export interface ApplyDexaExtractionResult<TValues extends DexaFormValueMap> {
  values: TValues;
  appliedFields: DexaExtractionFieldName[];
  skippedFields: DexaExtractionFieldName[];
}

/**
 * Devolve uma versão NOVA de `currentValues` com os campos preenchidos
 * a partir da extração. Campos JÁ preenchidos manualmente pelo coach
 * são preservados (incluídos em `skippedFields`).
 *
 * Imutável: não muta `currentValues` nem `extraction`.
 */
export function applyDexaExtractionToEmptyFields<TValues extends DexaFormValueMap>(
  currentValues: TValues,
  extraction: DexaExtraction,
): ApplyDexaExtractionResult<TValues> {
  const next = { ...currentValues };
  const applied: DexaExtractionFieldName[] = [];
  const skipped: DexaExtractionFieldName[] = [];

  for (const fieldName of DEXA_EXTRACTION_FIELDS) {
    const incoming = extraction.fields[fieldName]?.value;
    if (incoming == null || (typeof incoming === "string" && incoming.trim() === "")) {
      continue;
    }
    if (typeof incoming === "object" && Object.keys(incoming).length === 0) {
      continue;
    }
    const currentValue = (next as Record<string, unknown>)[fieldName];
    if (isDexaFieldEmpty(currentValue)) {
      (next as Record<string, unknown>)[fieldName] = incoming;
      applied.push(fieldName);
    } else {
      skipped.push(fieldName);
    }
  }

  return { values: next, appliedFields: applied, skippedFields: skipped };
}

// ────────────────────────────────────────────────────────────────────────────
// Sanitização do payload guardado em raw_extracted_json
// ────────────────────────────────────────────────────────────────────────────

/**
 * Recursivamente remove chaves perigosas (path/base64/signed URL/etc.)
 * de qualquer objeto. Defensivo a estruturas que a IA possa ter inflado
 * por engano.
 */
function deepStripForbiddenKeys(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => deepStripForbiddenKeys(item));
  }
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if ((DEXA_FORBIDDEN_RAW_KEYS as readonly string[]).includes(key)) continue;
      out[key] = deepStripForbiddenKeys(value);
    }
    return out;
  }
  return input;
}

/**
 * Versão segura da extração pra ser guardada em
 * `dexa_results.raw_extracted_json` no submit.
 *
 *   - trunca `source_text` por campo (`DEXA_SOURCE_TEXT_MAX_CHARS`);
 *   - remove chaves perigosas em qualquer nível (`DEXA_FORBIDDEN_RAW_KEYS`);
 *   - preserva `model`, `extracted_at`, `overall_confidence`,
 *     `missing_fields`, `warnings`.
 */
export function sanitizeDexaExtractionForStorage(
  extraction: DexaExtraction,
): DexaExtraction {
  const normalized = normalizeDexaExtractionResponse(extraction);
  return deepStripForbiddenKeys(normalized) as DexaExtraction;
}
