/**
 * Edge function: extract-dexa-pdf
 *
 * Lê um PDF de laudo DEXA do bucket privado `dexa-pdfs` e usa a
 * OpenAI Responses API (multimodal, com `input_file`) pra extrair um
 * JSON estruturado dos campos clínicos. Não persiste nada — apenas
 * devolve a extração pro frontend, que vai preencher o form como
 * RASCUNHO. Persistência só acontece no submit existente, depois de
 * revisão humana.
 *
 * Contrato (POST JSON):
 *   { "student_id": "<uuid>", "storage_path": "<path em dexa-pdfs>" }
 *
 * Auth:
 *   1. Authorization: Bearer <jwt>
 *   2. Valida user via anon client + auth.getUser()
 *   3. Cria service-role client SÓ depois de validar JWT
 *   4. Aceita: admin (user_roles.role='admin') OU trainer dono do aluno
 *   5. storage_path PRECISA começar com `${student_id}/` (defensivo,
 *      mesmo com RLS — defesa em profundidade)
 *   6. Object name precisa terminar em `.pdf`
 *
 * NÃO escreve em tabela nenhuma. NÃO gera signed URL. NÃO retorna
 * base64. NÃO loga PDF/path/token/prompt/response cru.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

// ────────────────────────────────────────────────────────────────────────────
// Constantes
// ────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  // Garantia de não cachear: extração contém PII clínica.
  "Cache-Control": "no-store",
};

const BUCKET_ID = "dexa-pdfs";
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_MODEL = "gpt-4.1";

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
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Hardening: normalização da resposta da OpenAI ANTES de devolver pro
// browser. Defesa em profundidade — o client também normaliza, mas a
// edge é a primeira linha. Garante que mesmo um modelo que devolva
// chaves extras (output, messages, base64, prompt, etc.) não vaze pra
// fora desta função.
// ────────────────────────────────────────────────────────────────────────────

const DEXA_SOURCE_TEXT_MAX_CHARS = 500;
const DEXA_CONCLUSION_TEXT_MAX_CHARS = 5000;

/**
 * Chaves PROIBIDAS no payload devolvido ao browser. Removidas
 * recursivamente em qualquer nível antes do response. Lista expandida
 * em relação ao sanitizer do client porque a IA pode devolver shape
 * arbitrário no top-level.
 */
const DEXA_EDGE_FORBIDDEN_KEYS: readonly string[] = [
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
  "messages",
  "input",
  "output",
  "raw_response",
];

/** Inteiros: TMB + percentil. Demais numéricos são float. */
const DEXA_EDGE_INTEGER_FIELDS = new Set<string>([
  "bmr_harris_benedict_kcal",
  "bmr_mifflin_stjeor_kcal",
  "fat_percentile",
]);

const DEXA_REGION_KEYS = [
  "trunk",
  "arms_right",
  "arms_left",
  "legs_right",
  "legs_left",
  "android",
  "gynoid",
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Helpers de resposta (NUNCA expor detalhes internos em error msg)
// ────────────────────────────────────────────────────────────────────────────

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { headers: jsonHeaders, status });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ ok: false, error: message }, status);
}

/** Log seguro: só mensagem curta + status, NUNCA path/token/PDF/body. */
function logSafe(tag: string, info: Record<string, string | number | boolean>) {
  console.log(`[extract-dexa-pdf] ${tag}`, info);
}

// ────────────────────────────────────────────────────────────────────────────
// Body parsing + validação
// ────────────────────────────────────────────────────────────────────────────

interface ExtractRequestBody {
  student_id: string;
  storage_path: string;
}

function parseAndValidateBody(raw: unknown): ExtractRequestBody | string {
  if (!raw || typeof raw !== "object") return "Payload inválido";
  const body = raw as Record<string, unknown>;
  const studentId =
    typeof body.student_id === "string" ? body.student_id.trim() : "";
  const storagePath =
    typeof body.storage_path === "string" ? body.storage_path.trim() : "";
  if (!studentId || !UUID_RE.test(studentId)) {
    return "student_id inválido";
  }
  if (!storagePath || storagePath.length > 1024) {
    return "storage_path inválido";
  }
  // Defensivo: não permite path traversal (`..`) ou paths absolutos.
  if (storagePath.includes("..") || storagePath.startsWith("/")) {
    return "storage_path inválido";
  }
  // Precisa começar com `${student_id}/` — alinhado com o esquema usado
  // pelo DexaForm no upload e com as policies RLS do bucket.
  if (!storagePath.startsWith(`${studentId}/`)) {
    return "storage_path fora do prefixo do aluno";
  }
  // Precisa terminar em .pdf (lower/upper).
  if (!/\.pdf$/i.test(storagePath)) {
    return "Arquivo não é PDF";
  }
  return { student_id: studentId, storage_path: storagePath };
}

// ────────────────────────────────────────────────────────────────────────────
// Base64 (sem usar btoa: precisa lidar com binário sem corromper)
// ────────────────────────────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  // Chunking pra não estourar o limit de argumentos do String.fromCharCode.
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ────────────────────────────────────────────────────────────────────────────
// OpenAI Responses API: chamada multimodal com PDF
// ────────────────────────────────────────────────────────────────────────────

const EXTRACTION_INSTRUCTIONS = `Você é um assistente que extrai dados crus de um laudo DEXA brasileiro.

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

const RESPONSE_JSON_SCHEMA = {
  name: "dexa_extraction",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "fields",
      "overall_confidence",
      "missing_fields",
      "warnings",
    ],
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
} as const;

async function callOpenAiExtraction(
  base64Pdf: string,
  apiKey: string,
  model: string,
): Promise<{ ok: true; parsed: Record<string, unknown> } | { ok: false; status: number }> {
  const requestBody = {
    model,
    instructions: EXTRACTION_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: "dexa.pdf",
            file_data: `data:application/pdf;base64,${base64Pdf}`,
          },
          {
            type: "input_text",
            text: "Extraia os campos do laudo DEXA seguindo o schema JSON. Devolva apenas o JSON.",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        ...RESPONSE_JSON_SCHEMA,
      },
    },
    temperature: 0,
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    // NUNCA logar o body — pode incluir prompt ou path interno. Só status.
    logSafe("openai_error", { status: response.status });
    return { ok: false, status: response.status };
  }

  const data = (await response.json()) as Record<string, unknown>;
  // A Responses API devolve `output_text` (string) e/ou `output` (array de
  // mensagens). Tentamos `output_text` primeiro; fallback pra `output[0]
  // .content[0].text`.
  let text: string | null = null;
  if (typeof data.output_text === "string") {
    text = data.output_text;
  } else if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item && typeof item === "object" && Array.isArray((item as Record<string, unknown>).content)) {
        for (const c of (item as Record<string, unknown>).content as unknown[]) {
          if (
            c &&
            typeof c === "object" &&
            (c as Record<string, unknown>).type === "output_text" &&
            typeof (c as Record<string, unknown>).text === "string"
          ) {
            text = (c as Record<string, unknown>).text as string;
            break;
          }
        }
      }
      if (text) break;
    }
  }
  if (!text) {
    logSafe("openai_no_text", { status: response.status });
    return { ok: false, status: 502 };
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return { ok: true, parsed };
  } catch {
    logSafe("openai_bad_json", { status: response.status });
    return { ok: false, status: 502 };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// normalizeEdgeExtraction — coerção + sanitização defensiva
//
// Por que duplicar o helper do frontend aqui (em vez de importar):
//   * Deno edge runtime não compartilha bundler com o app React;
//   * Manter um helper local mínimo evita pular o `import.meta` /
//     resolution quirk do Deno;
//   * Defesa em profundidade: client TAMBÉM normaliza (segunda camada).
// ────────────────────────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clamp01(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function coerceNullableString(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function coerceNullableNumber(v: unknown, isInteger: boolean): number | null {
  if (v == null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return isInteger ? Math.round(v) : v;
}

function coerceNullablePage(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, Math.trunc(v));
}

function coerceStringArray(v: unknown, maxItems = 50): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      const trimmed = item.trim().slice(0, 200);
      if (trimmed.length > 0) out.push(trimmed);
      if (out.length >= maxItems) break;
    }
  }
  return out;
}

function defaultField(): {
  value: null;
  confidence: number;
  source_text: null;
  page: null;
} {
  return { value: null, confidence: 0, source_text: null, page: null };
}

function normalizeNumericField(raw: unknown, isInteger: boolean) {
  if (!isPlainObject(raw)) return defaultField();
  return {
    value: coerceNullableNumber(raw.value, isInteger),
    confidence: clamp01(raw.confidence),
    source_text: coerceNullableString(raw.source_text, DEXA_SOURCE_TEXT_MAX_CHARS),
    page: coerceNullablePage(raw.page),
  };
}

function normalizeConclusionField(raw: unknown) {
  if (!isPlainObject(raw)) return defaultField();
  return {
    value: coerceNullableString(raw.value, DEXA_CONCLUSION_TEXT_MAX_CHARS),
    confidence: clamp01(raw.confidence),
    source_text: coerceNullableString(raw.source_text, DEXA_SOURCE_TEXT_MAX_CHARS),
    page: coerceNullablePage(raw.page),
  };
}

function normalizeRegionalField(raw: unknown) {
  if (!isPlainObject(raw)) return defaultField();
  const valueRaw = raw.value;
  let value: Record<string, Record<string, number>> | null = null;
  if (isPlainObject(valueRaw)) {
    const cleaned: Record<string, Record<string, number>> = {};
    for (const region of DEXA_REGION_KEYS) {
      const regionRaw = (valueRaw as Record<string, unknown>)[region];
      if (!isPlainObject(regionRaw)) continue;
      const entry: Record<string, number> = {};
      const fatPct = coerceNullableNumber(regionRaw.fat_pct, false);
      const leanG = coerceNullableNumber(regionRaw.lean_mass_g, false);
      const fatG = coerceNullableNumber(regionRaw.fat_mass_g, false);
      if (fatPct != null) entry.fat_pct = fatPct;
      if (leanG != null) entry.lean_mass_g = leanG;
      if (fatG != null) entry.fat_mass_g = fatG;
      if (Object.keys(entry).length > 0) cleaned[region] = entry;
    }
    if (Object.keys(cleaned).length > 0) value = cleaned;
  }
  return {
    value,
    confidence: clamp01(raw.confidence),
    source_text: coerceNullableString(raw.source_text, DEXA_SOURCE_TEXT_MAX_CHARS),
    page: coerceNullablePage(raw.page),
  };
}

/**
 * Remove recursivamente chaves proibidas em qualquer nível.
 * Aplicado APÓS o `normalizeFields` por defesa em profundidade —
 * mesmo que um campo legítimo herdasse uma chave perigosa, ela some.
 */
function deepStripForbidden(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepStripForbidden);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (DEXA_EDGE_FORBIDDEN_KEYS.includes(k)) continue;
      out[k] = deepStripForbidden(v);
    }
    return out;
  }
  return value;
}

/**
 * Pipeline da edge: coage o JSON cru da OpenAI no contrato esperado
 * pelo browser, trunca textos longos, clampa confidences, descarta
 * chaves desconhecidas, remove chaves proibidas em qualquer nível.
 */
export function normalizeEdgeExtraction(
  raw: unknown,
  model: string,
  extractedAt: string,
): Record<string, unknown> {
  const obj = isPlainObject(raw) ? raw : {};
  const fieldsRaw = isPlainObject(obj.fields) ? obj.fields : {};

  const fields: Record<string, unknown> = {};
  for (const fieldName of DEXA_NUMERIC_FIELDS) {
    fields[fieldName] = normalizeNumericField(
      (fieldsRaw as Record<string, unknown>)[fieldName],
      DEXA_EDGE_INTEGER_FIELDS.has(fieldName),
    );
  }
  fields.conclusion_text = normalizeConclusionField(
    (fieldsRaw as Record<string, unknown>).conclusion_text,
  );
  fields.regional_distribution = normalizeRegionalField(
    (fieldsRaw as Record<string, unknown>).regional_distribution,
  );

  const normalized = {
    fields,
    overall_confidence: clamp01(obj.overall_confidence),
    missing_fields: coerceStringArray(obj.missing_fields),
    warnings: coerceStringArray(obj.warnings),
    model: coerceNullableString(model, 120) ?? "",
    extracted_at: coerceNullableString(extractedAt, 64) ?? "",
  };

  // Última defesa: mesmo que algum sub-objeto preservado herdasse uma
  // chave perigosa (improvável após o whitelist acima, mas defensivo
  // contra refactor que abra `additionalProperties: true`).
  return deepStripForbidden(normalized) as Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse("Method Not Allowed", 405);
  }

  try {
    // 0. Env vars
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const model =
      Deno.env.get("OPENAI_DEXA_EXTRACTION_MODEL")?.trim() || DEFAULT_MODEL;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      logSafe("env_missing_supabase", { ok: false });
      return errorResponse("Configuração indisponível", 500);
    }
    if (!openAiKey) {
      logSafe("env_missing_openai", { ok: false });
      return errorResponse("Configuração de extração indisponível", 500);
    }

    // 1. JWT — validar com anon client (NUNCA usar service role antes disso)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return errorResponse("Unauthorized", 401);
    }
    const userId = userData.user.id;

    // 2. Body
    const bodyRaw = await req.json().catch(() => null);
    const parsedBody = parseAndValidateBody(bodyRaw);
    if (typeof parsedBody === "string") {
      return errorResponse(parsedBody, 400);
    }
    const { student_id: studentId, storage_path: storagePath } = parsedBody;

    // 3. Service role client (depois do JWT validado)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 4. Ownership: admin OR trainer dono
    const { data: adminRoleRow, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) {
      logSafe("role_check_failed", { ok: false });
      return errorResponse("Falha ao verificar permissão", 500);
    }
    const isAdmin = !!adminRoleRow;

    const { data: student, error: studentError } = await adminClient
      .from("students")
      .select("id, trainer_id")
      .eq("id", studentId)
      .maybeSingle();
    if (studentError) {
      logSafe("student_fetch_failed", { ok: false });
      return errorResponse("Falha ao buscar aluno", 500);
    }
    if (!student) {
      return errorResponse("Aluno não encontrado", 404);
    }
    if (!isAdmin && student.trainer_id !== userId) {
      return errorResponse("Acesso negado", 403);
    }

    // 5. Download do PDF — usando service role, do bucket privado.
    //    Nada de signed URL pra fora; o PDF nunca sai daqui.
    const { data: pdfBlob, error: downloadError } = await adminClient.storage
      .from(BUCKET_ID)
      .download(storagePath);
    if (downloadError || !pdfBlob) {
      // Diferencia 404 vs 500 quando possível (erro do storage sem path).
      const message = (downloadError?.message ?? "").toLowerCase();
      if (message.includes("not found") || message.includes("404")) {
        return errorResponse("Arquivo não encontrado", 404);
      }
      logSafe("download_failed", { ok: false });
      return errorResponse("Falha ao baixar arquivo", 500);
    }

    // 6. Validações de tamanho/tipo
    if (pdfBlob.size > MAX_PDF_BYTES) {
      return errorResponse("Arquivo excede tamanho máximo", 400);
    }
    const contentType = pdfBlob.type?.toLowerCase() ?? "";
    if (contentType && !contentType.includes("pdf")) {
      return errorResponse("Arquivo não é PDF", 400);
    }

    // 7. Converte pra base64 e chama OpenAI
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const base64Pdf = bytesToBase64(new Uint8Array(arrayBuffer));

    const aiResult = await callOpenAiExtraction(base64Pdf, openAiKey, model);
    if (!aiResult.ok) {
      // Status interno do OpenAI não é exposto. Mensagem genérica.
      return errorResponse("Falha na extração automática", 502);
    }

    // 8. Devolve só o JSON estruturado + metadata. Passa pelo
    //    `normalizeEdgeExtraction` ANTES de virar response — defesa em
    //    profundidade que garante schema fixo, sem `...aiResult.parsed`
    //    cru, sem chaves perigosas (base64/file_data/signed_url/
    //    storage_path/bucket/prompt/messages/input/output/raw_response),
    //    com `confidence` clampada e `source_text` truncado.
    const extraction = normalizeEdgeExtraction(
      aiResult.parsed,
      model,
      new Date().toISOString(),
    );

    // Hardening: NÃO logamos studentId/path/PDF/base64/token/prompt/raw.
    // Diagnóstico server-side fica nos logs do Supabase Storage / OpenAI,
    // que já têm os IDs internos sem precisarmos duplicar aqui.
    logSafe("ok", { ok: true });

    return jsonResponse({ ok: true, extraction });
  } catch {
    // Catch genérico: NUNCA expor stack ou message original ao client.
    logSafe("uncaught", { ok: false });
    return errorResponse("Erro inesperado", 500);
  }
});
