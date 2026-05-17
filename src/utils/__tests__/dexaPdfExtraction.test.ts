/**
 * Unit tests dos helpers puros de extração DEXA.
 *
 * Foco: garantir que o pipeline IA → form / IA → raw_extracted_json
 * respeita as regras do produto (sem auto-save, sem sobrescrever, sem
 * vazar path/base64, sem inventar valores).
 */
import { describe, expect, it } from "vitest";

import {
  DEXA_FORBIDDEN_RAW_KEYS,
  DEXA_REGION_KEYS,
  DEXA_SOURCE_TEXT_MAX_CHARS,
  applyDexaExtractionToEmptyFields,
  isDexaFieldEmpty,
  normalizeDexaExtractionResponse,
  parseBrazilianNumber,
  sanitizeDexaExtractionForStorage,
  type DexaExtraction,
} from "../dexaPdfExtraction";

// ── parseBrazilianNumber ────────────────────────────────────────────────────

describe("parseBrazilianNumber — formatos numéricos de laudo BR", () => {
  it("aceita ponto como decimal: '78.025'", () => {
    expect(parseBrazilianNumber("78.025")).toBe(78.025);
  });

  it("aceita vírgula como decimal: '78,025'", () => {
    expect(parseBrazilianNumber("78,025")).toBe(78.025);
  });

  it("aceita milhar BR + decimal: '1.234,56'", () => {
    expect(parseBrazilianNumber("1.234,56")).toBe(1234.56);
  });

  it("aceita formato US: '1,234.56'", () => {
    expect(parseBrazilianNumber("1,234.56")).toBe(1234.56);
  });

  it("ignora sufixo de unidade: '78.025 g'", () => {
    expect(parseBrazilianNumber("78.025 g")).toBe(78.025);
  });

  it("ignora sufixo de unidade kg: '78,025 kg'", () => {
    expect(parseBrazilianNumber("78,025 kg")).toBe(78.025);
  });

  it("extrai o primeiro número de texto livre: 'VAT 322 g (342 cm³)'", () => {
    expect(parseBrazilianNumber("VAT 322 g (342 cm³)")).toBe(322);
  });

  it("string sem número → null", () => {
    expect(parseBrazilianNumber("não disponível")).toBeNull();
  });

  it("input null/undefined/objeto → null (defensivo)", () => {
    // @ts-expect-error — input intencionalmente inválido para testar guard
    expect(parseBrazilianNumber(null)).toBeNull();
    // @ts-expect-error — input intencionalmente inválido para testar guard
    expect(parseBrazilianNumber({})).toBeNull();
  });
});

// ── normalizeDexaExtractionResponse ─────────────────────────────────────────

function makeMinimalExtractionRaw(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    fields: {},
    overall_confidence: 0.5,
    missing_fields: [],
    warnings: [],
    model: "gpt-test",
    extracted_at: "2026-05-17T00:00:00Z",
    ...overrides,
  };
}

describe("normalizeDexaExtractionResponse — coerce + clamp", () => {
  it("payload vazio → fields todos null com confidence 0", () => {
    const out = normalizeDexaExtractionResponse({});
    expect(out.fields.total_mass_kg.value).toBeNull();
    expect(out.fields.total_mass_kg.confidence).toBe(0);
    expect(out.fields.conclusion_text.value).toBeNull();
    expect(out.fields.regional_distribution.value).toBeNull();
  });

  it("ausência de campo NÃO vira zero", () => {
    const out = normalizeDexaExtractionResponse(makeMinimalExtractionRaw());
    expect(out.fields.fat_mass_kg.value).toBeNull();
    expect(out.fields.bmr_harris_benedict_kcal.value).toBeNull();
  });

  it("aceita número com vírgula decimal e converte", () => {
    const out = normalizeDexaExtractionResponse(
      makeMinimalExtractionRaw({
        fields: {
          fat_pct: { value: "22,3", confidence: 0.9 },
        },
      }),
    );
    expect(out.fields.fat_pct.value).toBe(22.3);
  });

  it("'78.025 g' como massa em kg (laudo BR) é interpretado como 78.025", () => {
    const out = normalizeDexaExtractionResponse(
      makeMinimalExtractionRaw({
        fields: {
          total_mass_kg: { value: "78.025 g", confidence: 0.95 },
        },
      }),
    );
    // Helper trata número direto: 78.025 (ponto = decimal). Coach lendo
    // o laudo deve já ter "78,025 kg"; o helper aceita ambos.
    expect(out.fields.total_mass_kg.value).toBe(78.025);
  });

  it("'11.743 g' vira 11.743 (laudo BR de massa)", () => {
    const out = normalizeDexaExtractionResponse(
      makeMinimalExtractionRaw({
        fields: {
          lean_mass_kg: { value: "11.743 g", confidence: 0.8 },
        },
      }),
    );
    expect(out.fields.lean_mass_kg.value).toBe(11.743);
  });

  it("VAT em texto livre extrai número de gramas, não o volume em cm³", () => {
    const out = normalizeDexaExtractionResponse(
      makeMinimalExtractionRaw({
        fields: {
          visceral_fat_g: {
            value: "322 g (342 cm³)",
            confidence: 0.85,
            source_text: "VAT 322 g (342 cm³)",
          },
        },
      }),
    );
    // parseBrazilianNumber pega o PRIMEIRO grupo numérico: 322.
    expect(out.fields.visceral_fat_g.value).toBe(322);
  });

  it("confidence clamp 0..1", () => {
    const out = normalizeDexaExtractionResponse(
      makeMinimalExtractionRaw({
        overall_confidence: 1.7,
        fields: {
          fat_pct: { value: 22, confidence: -0.5 },
          lean_mass_kg: { value: 50, confidence: 2 },
        },
      }),
    );
    expect(out.overall_confidence).toBe(1);
    expect(out.fields.fat_pct.confidence).toBe(0);
    expect(out.fields.lean_mass_kg.confidence).toBe(1);
  });

  it("source_text é truncado em DEXA_SOURCE_TEXT_MAX_CHARS", () => {
    const long = "a".repeat(DEXA_SOURCE_TEXT_MAX_CHARS + 200);
    const out = normalizeDexaExtractionResponse(
      makeMinimalExtractionRaw({
        fields: { fat_pct: { value: 22, confidence: 0.9, source_text: long } },
      }),
    );
    expect(out.fields.fat_pct.source_text?.length).toBe(
      DEXA_SOURCE_TEXT_MAX_CHARS,
    );
  });

  it("campos inteiros são arredondados (TMB, fat_percentile)", () => {
    const out = normalizeDexaExtractionResponse(
      makeMinimalExtractionRaw({
        fields: {
          bmr_harris_benedict_kcal: { value: 1745.7, confidence: 0.9 },
          fat_percentile: { value: 32.6, confidence: 0.7 },
        },
      }),
    );
    expect(out.fields.bmr_harris_benedict_kcal.value).toBe(1746);
    expect(out.fields.fat_percentile.value).toBe(33);
  });

  it("descarta regional_distribution sem campos numéricos", () => {
    const out = normalizeDexaExtractionResponse(
      makeMinimalExtractionRaw({
        fields: {
          regional_distribution: {
            value: { trunk: { fat_pct: null, lean_mass_g: null, fat_mass_g: null } },
            confidence: 0.8,
          },
        },
      }),
    );
    expect(out.fields.regional_distribution.value).toBeNull();
  });

  it("preserva regional_distribution só pras regiões com dado numérico (não inventa direito/esquerdo de agregado)", () => {
    const out = normalizeDexaExtractionResponse(
      makeMinimalExtractionRaw({
        fields: {
          regional_distribution: {
            value: {
              trunk: { fat_pct: 24.5, lean_mass_g: 22500 },
              // arms_left omitido → não aparece no output
            },
            confidence: 0.8,
          },
        },
      }),
    );
    expect(out.fields.regional_distribution.value).toEqual({
      trunk: { fat_pct: 24.5, lean_mass_g: 22500 },
    });
    expect(out.fields.regional_distribution.value?.arms_left).toBeUndefined();
  });

  it("região desconhecida (não no enum) é silenciosamente descartada", () => {
    const out = normalizeDexaExtractionResponse(
      makeMinimalExtractionRaw({
        fields: {
          regional_distribution: {
            value: {
              membros_superiores: { fat_pct: 18 }, // não é trunk/arms_*/etc.
            },
            confidence: 0.6,
          },
        },
      }),
    );
    expect(out.fields.regional_distribution.value).toBeNull();
  });

  it("regiões reconhecidas estão todas em DEXA_REGION_KEYS (sanity)", () => {
    expect(DEXA_REGION_KEYS).toEqual([
      "trunk",
      "arms_right",
      "arms_left",
      "legs_right",
      "legs_left",
      "android",
      "gynoid",
    ]);
  });

  it("strings extra (model, extracted_at) são preservadas truncadas", () => {
    const out = normalizeDexaExtractionResponse(
      makeMinimalExtractionRaw({
        model: "gpt-4.1-2026-05-01",
        extracted_at: "2026-05-17T08:15:00Z",
      }),
    );
    expect(out.model).toBe("gpt-4.1-2026-05-01");
    expect(out.extracted_at).toBe("2026-05-17T08:15:00Z");
  });
});

// ── isDexaFieldEmpty + applyDexaExtractionToEmptyFields ─────────────────────

describe("isDexaFieldEmpty", () => {
  it.each([
    [null, true],
    [undefined, true],
    ["", true],
    ["   ", true],
    [0, false],
    [12.3, false],
    ["abc", false],
    [Number.NaN, true],
    [{}, true],
    [{ trunk: { fat_pct: 22 } }, false],
  ])("valor=%p → vazio=%p", (input, expected) => {
    expect(isDexaFieldEmpty(input)).toBe(expected);
  });
});

describe("applyDexaExtractionToEmptyFields — regra conservadora", () => {
  const baseExtraction: DexaExtraction = normalizeDexaExtractionResponse({
    fields: {
      total_mass_kg: { value: 78.025, confidence: 0.95 },
      fat_pct: { value: 22.3, confidence: 0.9 },
      lean_mass_kg: { value: 55.4, confidence: 0.9 },
      conclusion_text: { value: "Composição dentro do esperado.", confidence: 0.7 },
    },
    overall_confidence: 0.88,
    missing_fields: [],
    warnings: [],
    model: "gpt-test",
    extracted_at: "2026-05-17",
  });

  it("preenche campos vazios", () => {
    const result = applyDexaExtractionToEmptyFields(
      { total_mass_kg: null, fat_pct: null, lean_mass_kg: null },
      baseExtraction,
    );
    expect(result.values.total_mass_kg).toBe(78.025);
    expect(result.values.fat_pct).toBe(22.3);
    expect(result.values.lean_mass_kg).toBe(55.4);
    expect(result.appliedFields).toEqual(
      expect.arrayContaining(["total_mass_kg", "fat_pct", "lean_mass_kg", "conclusion_text"]),
    );
    expect(result.skippedFields).toEqual([]);
  });

  it("NÃO sobrescreve campo já preenchido pelo coach", () => {
    const result = applyDexaExtractionToEmptyFields(
      {
        total_mass_kg: 80.0, // já preenchido
        fat_pct: null,
        lean_mass_kg: 60.0, // já preenchido
        conclusion_text: "Conclusão do coach",
      },
      baseExtraction,
    );
    // Valores do coach preservados:
    expect(result.values.total_mass_kg).toBe(80.0);
    expect(result.values.lean_mass_kg).toBe(60.0);
    expect(result.values.conclusion_text).toBe("Conclusão do coach");
    // Campo vazio foi preenchido:
    expect(result.values.fat_pct).toBe(22.3);
    expect(result.appliedFields).toEqual(["fat_pct"]);
    expect(result.skippedFields).toEqual(
      expect.arrayContaining(["total_mass_kg", "lean_mass_kg", "conclusion_text"]),
    );
  });

  it("input vazio (todos null) + extração com null em alguns campos → não preenche os null", () => {
    const partial = normalizeDexaExtractionResponse({
      fields: { fat_pct: { value: null, confidence: 0 } },
    });
    const result = applyDexaExtractionToEmptyFields({ fat_pct: null }, partial);
    expect(result.values.fat_pct).toBeNull();
    expect(result.appliedFields).toEqual([]);
  });

  it("não muta o currentValues original (imutabilidade)", () => {
    const original = { total_mass_kg: null, fat_pct: null };
    applyDexaExtractionToEmptyFields(original, baseExtraction);
    expect(original.total_mass_kg).toBeNull();
    expect(original.fat_pct).toBeNull();
  });
});

// ── sanitizeDexaExtractionForStorage ────────────────────────────────────────

describe("sanitizeDexaExtractionForStorage", () => {
  it("trunca source_text", () => {
    const long = "x".repeat(DEXA_SOURCE_TEXT_MAX_CHARS + 100);
    const out = sanitizeDexaExtractionForStorage(
      normalizeDexaExtractionResponse({
        fields: { fat_pct: { value: 22, confidence: 0.9, source_text: long } },
      }),
    );
    expect(out.fields.fat_pct.source_text?.length).toBe(
      DEXA_SOURCE_TEXT_MAX_CHARS,
    );
  });

  it("não contém chaves proibidas (base64, file_data, signedUrl, storage_path, etc.)", () => {
    // Construímos um payload "sujo" pra simular IA equivocada.
    const dirty = normalizeDexaExtractionResponse({
      fields: { fat_pct: { value: 22, confidence: 0.9 } },
    }) as unknown as Record<string, unknown>;
    (dirty as Record<string, unknown>).base64 = "AAAA";
    (dirty as Record<string, unknown>).file_data = "data:application/pdf;base64,XXX";
    (dirty as Record<string, unknown>).signedUrl = "https://example/x";
    (dirty as Record<string, unknown>).storage_path = "s/1/2.pdf";
    (dirty.fields as Record<string, unknown>).prompt = "do not include";

    const out = sanitizeDexaExtractionForStorage(dirty as DexaExtraction);
    const serialized = JSON.stringify(out);
    for (const forbidden of DEXA_FORBIDDEN_RAW_KEYS) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it("preserva campos legítimos (overall_confidence, model, extracted_at)", () => {
    const out = sanitizeDexaExtractionForStorage(
      normalizeDexaExtractionResponse({
        fields: { fat_pct: { value: 22.5, confidence: 0.9 } },
        overall_confidence: 0.91,
        model: "gpt-test",
        extracted_at: "2026-05-17T00:00:00Z",
      }),
    );
    expect(out.overall_confidence).toBe(0.91);
    expect(out.model).toBe("gpt-test");
    expect(out.extracted_at).toBe("2026-05-17T00:00:00Z");
    expect(out.fields.fat_pct.value).toBe(22.5);
  });
});
