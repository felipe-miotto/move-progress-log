#!/usr/bin/env node
/**
 * Smoke standalone da extração DEXA via OpenAI Responses API.
 *
 * NÃO é um teste automatizado (não roda em CI). Existe pra que o coach
 * valide localmente, com PDFs reais, que a estratégia da edge function
 * `extract-dexa-pdf` realmente extrai os campos esperados — incluindo
 * em laudos com layout visual/tabular onde `pdftotext` falha.
 *
 * Privacidade:
 *   - PDFs não são commitados; passar caminhos absolutos via argv.
 *   - PII (nome do aluno, números de massa etc.) é truncada/ocultada
 *     antes de imprimir no console.
 *   - OPENAI_API_KEY vem via env, nunca hardcoded.
 *
 * Uso:
 *   OPENAI_API_KEY=sk-... node scripts/smoke-dexa-extraction.mjs \
 *     "/path/to/dexa-sample-1.pdf" \
 *     "/path/to/dexa-sample-2.pdf"
 *
 * Modelo (opcional):
 *   OPENAI_DEXA_EXTRACTION_MODEL=gpt-4.1 ...
 */

import { readFileSync } from "node:fs";

/**
 * Mensagem genérica fixa para o `main().catch`. Não inclui `e.message`
 * porque a mensagem do erro pode revelar caminho do PDF local, hostname
 * da OpenAI, token, querystring, stack trace ou qualquer pedaço de PII
 * que vier do request/response.
 */
const SMOKE_GENERIC_FAILURE_MESSAGE =
  "Smoke falhou. Verifique OPENAI_API_KEY, caminhos dos PDFs e conectividade.";

const DEXA_NUMERIC_FIELDS = [
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
];

const DEXA_REGION_KEYS = [
  "trunk",
  "arms_right",
  "arms_left",
  "legs_right",
  "legs_left",
  "android",
  "gynoid",
];

const CORE_FIELDS_REQUIRED = [
  "total_mass_kg",
  "fat_mass_kg",
  "fat_pct",
  "lean_mass_kg",
  "visceral_fat_g",
];

const INSTRUCTIONS = `Você é um assistente que extrai dados crus de um laudo DEXA brasileiro.

Regras absolutas:
- Devolva APENAS um JSON válido seguindo o schema solicitado.
- NÃO classifique, NÃO interprete clinicamente, NÃO diagnostique, NÃO faça recomendações.
- Se um campo não estiver explícito no laudo, devolva value=null, confidence=0, source_text=null, page=null.
- Não invente valores.
- Para massas (total_mass_kg, fat_mass_kg, lean_mass_kg, bone_mass_kg, appendicular_lean_mass_kg): converta para kg.
  - Atenção: laudos brasileiros usam ponto como separador decimal interpretado como milhar em alguns sistemas. Quando o laudo trouxer um número como "78.025 g", interprete como 78,025 quilogramas — NÃO multiplique por 1000.
- visceral_fat_g é em gramas. Se vier "VAT 322 g (342 cm³)", o valor é 322; ignore o volume em cm³.
- bone_density_z_score é o Z-score (não T-score).
- bmr_*: apenas se o laudo já apresentar TMB calculada; não calcule.
- appendicular_lean_mass_kg: só calcule a soma dos membros se o laudo apresentar a fórmula. Caso contrário, devolva null e adicione um warning.
- regional_distribution: preencha SOMENTE regiões claramente identificadas (trunk, arms_right, arms_left, legs_right, legs_left, android, gynoid). Se o laudo agregar como "membros superiores" sem distinguir direito/esquerdo, NÃO invente: deixe direito e esquerdo null e adicione um warning.
- conclusion_text: copie o texto da seção "conclusão" ou equivalente. Se não houver, null.
- Para cada campo extraído, registre source_text com o trecho LITERAL do laudo (no máximo 200 caracteres) e page (1-indexed) onde foi encontrado.
- confidence ∈ [0,1] por campo + overall_confidence ∈ [0,1].
- missing_fields: liste os campos do schema que você NÃO encontrou.
- warnings: avisos relevantes (ex.: "região agregada sem distinção direito/esquerdo").
`;

const SCHEMA = {
  name: "dexa_extraction",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["fields", "overall_confidence", "missing_fields", "warnings"],
    properties: {
      fields: {
        type: "object",
        additionalProperties: false,
        required: [
          ...DEXA_NUMERIC_FIELDS,
          "conclusion_text",
          "regional_distribution",
        ],
        properties: Object.fromEntries([
          ...DEXA_NUMERIC_FIELDS.map((name) => [
            name,
            {
              type: "object",
              additionalProperties: false,
              required: ["value", "confidence", "source_text", "page"],
              properties: {
                value: { type: ["number", "null"] },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                source_text: { type: ["string", "null"] },
                page: { type: ["integer", "null"] },
              },
            },
          ]),
          [
            "conclusion_text",
            {
              type: "object",
              additionalProperties: false,
              required: ["value", "confidence", "source_text", "page"],
              properties: {
                value: { type: ["string", "null"] },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                source_text: { type: ["string", "null"] },
                page: { type: ["integer", "null"] },
              },
            },
          ],
          [
            "regional_distribution",
            {
              type: "object",
              additionalProperties: false,
              required: ["value", "confidence", "source_text", "page"],
              properties: {
                value: {
                  anyOf: [
                    { type: "null" },
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: Object.fromEntries(
                        DEXA_REGION_KEYS.map((region) => [
                          region,
                          {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                              fat_pct: { type: ["number", "null"] },
                              lean_mass_g: { type: ["number", "null"] },
                              fat_mass_g: { type: ["number", "null"] },
                            },
                          },
                        ]),
                      ),
                    },
                  ],
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                source_text: { type: ["string", "null"] },
                page: { type: ["integer", "null"] },
              },
            },
          ],
        ]),
      },
      overall_confidence: { type: "number", minimum: 0, maximum: 1 },
      missing_fields: { type: "array", items: { type: "string" } },
      warnings: { type: "array", items: { type: "string" } },
    },
  },
  strict: true,
};

function maskValue(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return `~${v}`;
  if (typeof v === "string") return `len=${v.length}`;
  return typeof v;
}

async function extract(pdfPath, apiKey, model) {
  const buf = readFileSync(pdfPath);
  const base64 = buf.toString("base64");
  const body = {
    model,
    instructions: INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: "dexa.pdf",
            file_data: `data:application/pdf;base64,${base64}`,
          },
          {
            type: "input_text",
            text: "Extraia os campos do laudo DEXA seguindo o schema JSON. Devolva apenas o JSON.",
          },
        ],
      },
    ],
    text: { format: { type: "json_schema", ...SCHEMA } },
    temperature: 0,
  };
  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const elapsed = Date.now() - t0;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      elapsed,
      error: `HTTP ${res.status}`,
    };
  }
  const data = await res.json();
  let text = typeof data.output_text === "string" ? data.output_text : null;
  if (!text && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item?.content) {
        for (const c of item.content) {
          if (c?.type === "output_text" && typeof c.text === "string") {
            text = c.text;
            break;
          }
        }
      }
      if (text) break;
    }
  }
  if (!text) return { ok: false, status: 502, elapsed, error: "no text" };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: 502, elapsed, error: "bad json" };
  }
  return { ok: true, elapsed, parsed };
}

function reportOne(label, _file, result) {
  // Hardening: NÃO logamos basename(file) — mesmo o nome do arquivo
  // local pode revelar identidade do aluno. O label posicional
  // ("PDF 1", "PDF 2") é suficiente pra correlacionar.
  console.log(`\n=== ${label} ===`);
  if (!result.ok) {
    console.log(`  ✗ FAIL: status=${result.status} elapsed=${result.elapsed}ms`);
    return false;
  }
  const f = result.parsed.fields;
  const summary = {};
  for (const name of DEXA_NUMERIC_FIELDS) {
    summary[name] = {
      present: f[name]?.value != null,
      conf: f[name]?.confidence ?? 0,
      val: maskValue(f[name]?.value ?? null),
    };
  }
  summary.conclusion_text = {
    present: !!f.conclusion_text?.value,
    conf: f.conclusion_text?.confidence ?? 0,
    val: maskValue(f.conclusion_text?.value ?? null),
  };
  summary.regional_distribution = {
    regions: Object.keys(f.regional_distribution?.value ?? {}),
    conf: f.regional_distribution?.confidence ?? 0,
  };
  const corePresent = CORE_FIELDS_REQUIRED.filter(
    (n) => f[n]?.value != null,
  );
  const coreOk = corePresent.length === CORE_FIELDS_REQUIRED.length;
  console.log(
    `  elapsed=${result.elapsed}ms  overall_confidence=${result.parsed.overall_confidence?.toFixed(2)}`,
  );
  console.log(
    `  core fields presentes: ${corePresent.length}/${CORE_FIELDS_REQUIRED.length} [${corePresent.join(", ")}]`,
  );
  // Hardening: NÃO logamos o array `warnings` cru. Cada warning pode
  // citar literalmente um trecho do laudo (ex.: nome do aluno, número
  // específico, região anatômica). Mostramos só a contagem; o coach
  // que precisar de detalhe inspeciona o JSON cru em outra ferramenta.
  // `missing_fields` segue como contagem + nomes porque os nomes são
  // chaves do schema (fixas, não-PII).
  const warningsCount = Array.isArray(result.parsed.warnings)
    ? result.parsed.warnings.length
    : 0;
  console.log(`  missing_fields: [${(result.parsed.missing_fields ?? []).join(", ")}]`);
  console.log(`  warnings_count: ${warningsCount}`);
  console.log(`  todos os campos (sem PII):`);
  console.table(summary);
  return coreOk;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("✗ defina OPENAI_API_KEY no env");
    process.exit(2);
  }
  const model =
    process.env.OPENAI_DEXA_EXTRACTION_MODEL?.trim() || "gpt-4.1";
  const pdfs = process.argv.slice(2);
  if (pdfs.length === 0) {
    console.error(
      "uso: OPENAI_API_KEY=… node scripts/smoke-dexa-extraction.mjs <pdf1> [pdf2…]",
    );
    process.exit(2);
  }
  console.log(`modelo: ${model}\nPDFs: ${pdfs.length}`);
  let allOk = true;
  for (const [i, p] of pdfs.entries()) {
    const label = `PDF ${i + 1}`;
    const result = await extract(p, apiKey, model);
    const ok = reportOne(label, p, result);
    if (!ok) allOk = false;
  }
  console.log(
    `\n=== Resultado final: ${allOk ? "✅ OK" : "❌ FAIL (algum core field não foi extraído)"} ===`,
  );
  process.exit(allOk ? 0 : 1);
}

main().catch(() => {
  // Hardening: NÃO bindamos `e` nem usamos `e.message`. A mensagem
  // do Error pode incluir caminho do PDF local, hostname/path da
  // OpenAI, querystring de token, stack ou response body. Mensagem
  // fixa e genérica; diagnóstico fica nos logs da própria OpenAI.
  console.error(SMOKE_GENERIC_FAILURE_MESSAGE);
  process.exit(2);
});
