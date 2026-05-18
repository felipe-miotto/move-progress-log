/**
 * Source-based tests pra integração da extração assistida no DexaForm
 * e pras garantias de segurança da edge `extract-dexa-pdf`.
 *
 * Padrão coverage-test (sem DOM/testing-library) — segue o mesmo modelo
 * de `useDexaPdfSignedUrl.coverage.test.ts`.
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dexaFormPath = resolve(__dirname, "../DexaForm.tsx");
const dexaFormSource = readFileSync(dexaFormPath, "utf-8");

const edgePath = resolve(
  __dirname,
  "../../../../supabase/functions/extract-dexa-pdf/index.ts",
);
const edgeSource = readFileSync(edgePath, "utf-8");

const configPath = resolve(__dirname, "../../../../supabase/config.toml");
const configSource = readFileSync(configPath, "utf-8");

const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*\n/g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── DexaForm: UI e fluxo ────────────────────────────────────────────────────

describe("DexaForm — botão e fluxo de extração", () => {
  it("renderiza o botão 'Ler PDF e preencher campos' (data-testid='dexa-extract-button')", () => {
    expect(dexaFormSource).toContain('data-testid="dexa-extract-button"');
    expect(dexaFormSource).toContain("Ler PDF e preencher campos");
  });

  it("botão só aparece quando há pdfFile (gating defensivo)", () => {
    expect(dexaFormSource).toMatch(
      /pdfFile && \(\s*\n\s*<Button[\s\S]*?data-testid="dexa-extract-button"/,
    );
  });

  it("usa handler handleExtract (não chama createAssessment.mutateAsync no click)", () => {
    expect(dexaFormSource).toContain("const handleExtract = useCallback(");
    // Defensivo: o handler de extração NÃO pode disparar o submit.
    const code = stripComments(dexaFormSource);
    const handleExtractBlock = code.match(
      /const handleExtract = useCallback\([\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\);/,
    )?.[0] ?? "";
    expect(handleExtractBlock).not.toContain("createAssessment.mutateAsync");
    expect(handleExtractBlock).not.toContain("createAssessment.mutate(");
  });

  it("expõe uploadPdfIfNeeded idempotente (reuso de path)", () => {
    expect(dexaFormSource).toContain(
      "const uploadPdfIfNeeded = useCallback(",
    );
    // Sinal de idempotência: early-return quando uploadedPdfPath já existe.
    expect(dexaFormSource).toMatch(
      /if\s*\(\s*uploadedPdfPath\s*\)\s*return uploadedPdfPath/,
    );
  });

  it("invoca a edge 'extract-dexa-pdf' (não outra)", () => {
    expect(dexaFormSource).toMatch(
      /supabase\.functions\.invoke\(\s*\n?\s*"extract-dexa-pdf"/,
    );
  });

  it("envia body { student_id, storage_path } pra edge", () => {
    expect(dexaFormSource).toMatch(/body:\s*\{[^}]*student_id:\s*studentId/);
    expect(dexaFormSource).toMatch(/body:\s*\{[^}]*storage_path:\s*path/);
  });

  it("normaliza response com normalizeDexaExtractionResponse antes de aplicar", () => {
    expect(dexaFormSource).toContain("normalizeDexaExtractionResponse(");
  });

  it("aplica via applyDexaExtractionToEmptyFields (regra conservadora)", () => {
    expect(dexaFormSource).toContain("applyDexaExtractionToEmptyFields(");
  });

  it("onSubmit reusa uploadedPdfPath via uploadPdfIfNeeded (não duplica upload)", () => {
    const code = stripComments(dexaFormSource);
    const onSubmitBlock = code.match(
      /const onSubmit = async \(data: FormData\) =>[\s\S]*?\n\s{2}\};/,
    )?.[0] ?? "";
    expect(onSubmitBlock).toContain("uploadPdfIfNeeded()");
    // Não pode haver uma SEGUNDA chamada a `supabase.storage…upload(`
    // direto no onSubmit (toda a lógica passa por uploadPdfIfNeeded).
    const uploadCalls = (
      onSubmitBlock.match(/supabase\.storage\.from\(.+\)\.upload\(/g) ?? []
    ).length;
    expect(uploadCalls).toBe(0);
  });

  it("extraction_method='hybrid' + raw_extracted_json sanitizado SÓ quando houve extração aplicada", () => {
    expect(dexaFormSource).toContain(
      "sanitizeDexaExtractionForStorage(extractionState.extraction)",
    );
    expect(dexaFormSource).toContain(
      'extraction_method: usedExtraction ? "hybrid" : "manual"',
    );
    expect(dexaFormSource).toMatch(
      /usedExtraction\s*=\s*\n\s*extractionState\s*!=\s*null\s*&&\s*extractionState\.applied\.length\s*>\s*0/,
    );
  });

  it("sem extração, raw_extracted_json fica null e extraction_method='manual'", () => {
    // Lê o ternário literal: `usedExtraction ? sanitized : null`.
    expect(dexaFormSource).toMatch(
      /raw_extracted_json:\s*sanitizedExtraction/,
    );
    expect(dexaFormSource).toMatch(
      /sanitizedExtraction\s*=\s*usedExtraction\s*\?\s*sanitizeDexaExtractionForStorage/,
    );
  });

  it("UI de revisão pós-extração presente (data-testid='dexa-extraction-review')", () => {
    expect(dexaFormSource).toContain('data-testid="dexa-extraction-review"');
    expect(dexaFormSource).toContain("Confiança geral");
    expect(dexaFormSource).toContain("Leitura automática aplicada");
    // String visível quebrada por JSX (\n + whitespace dentro do <p>);
    // verifica fragmentos-âncora.
    expect(dexaFormSource).toMatch(/leitura automática não/);
    expect(dexaFormSource).toMatch(/revisão humana do/);
  });

  it("NÃO usa localStorage/sessionStorage/IndexedDB pra guardar extração", () => {
    const code = stripComments(dexaFormSource);
    expect(code).not.toMatch(/\blocalStorage\b/);
    expect(code).not.toMatch(/\bsessionStorage\b/);
    expect(code).not.toMatch(/\bIndexedDB\b/);
  });

  it("error path do extract usa mensagem genérica (sem path/detalhes internos)", () => {
    expect(dexaFormSource).toContain(
      "Não foi possível ler o PDF automaticamente",
    );
  });

  it("guard contra cliques múltiplos via ref (extractionInFlight)", () => {
    expect(dexaFormSource).toContain("extractionInFlight");
    expect(dexaFormSource).toMatch(
      /if\s*\(\s*extractionInFlight\.current\s*\)\s*return/,
    );
  });
});

// ── Edge function: contrato + segurança ────────────────────────────────────

describe("extract-dexa-pdf edge — contrato + segurança", () => {
  it("é POST-only (rejeita outros verbos) e responde OPTIONS sem auth (CORS)", () => {
    expect(edgeSource).toContain('req.method === "OPTIONS"');
    expect(edgeSource).toContain('req.method !== "POST"');
  });

  it("Cache-Control: no-store em todas as responses JSON", () => {
    expect(edgeSource).toContain('"Cache-Control": "no-store"');
  });

  it("valida Authorization Bearer + auth.getUser() ANTES de criar service-role client", () => {
    // Ordem importa: o `adminClient` (service role) só pode existir
    // DEPOIS do `auth.getUser()` ter validado o JWT do caller.
    const authGetUserIdx = edgeSource.indexOf("await userClient.auth.getUser()");
    const adminCreateIdx = edgeSource.indexOf(
      "const adminClient = createClient(supabaseUrl, supabaseServiceKey)",
    );
    expect(authGetUserIdx).toBeGreaterThan(-1);
    expect(adminCreateIdx).toBeGreaterThan(authGetUserIdx);
    // Defesa adicional: validação de "Bearer" header também precede o
    // adminClient.
    const bearerCheckIdx = edgeSource.indexOf('startsWith("Bearer ")');
    expect(bearerCheckIdx).toBeGreaterThan(-1);
    expect(adminCreateIdx).toBeGreaterThan(bearerCheckIdx);
  });

  it("valida ownership: admin via user_roles OU trainer dono", () => {
    expect(edgeSource).toContain('.eq("role", "admin")');
    expect(edgeSource).toMatch(/student\.trainer_id !== userId/);
  });

  it("valida storage_path.startsWith(`${student_id}/`) (defesa em profundidade)", () => {
    expect(edgeSource).toMatch(
      /storagePath\.startsWith\(`\$\{studentId\}\/`\)/,
    );
    expect(edgeSource).toContain("storage_path fora do prefixo do aluno");
  });

  it("rejeita path traversal (..) e paths absolutos", () => {
    expect(edgeSource).toMatch(/storagePath\.includes\("\.\."\)/);
    expect(edgeSource).toMatch(/storagePath\.startsWith\("\/"\)/);
  });

  it("exige extensão .pdf (case-insensitive)", () => {
    expect(edgeSource).toMatch(/\\\.pdf\$\/i\.test\(storagePath\)/);
  });

  it("usa o bucket 'dexa-pdfs' (privado) via service role", () => {
    expect(edgeSource).toContain('const BUCKET_ID = "dexa-pdfs"');
    expect(edgeSource).toMatch(/adminClient\.storage\s*\n?\s*\.from\(BUCKET_ID\)\s*\n?\s*\.download/);
  });

  it("NÃO cria signed URL (não usa createSignedUrl)", () => {
    expect(edgeSource).not.toMatch(/\bcreateSignedUrl\b/);
  });

  it("NÃO escreve em tabela nenhuma (zero insert/update/delete/upsert)", () => {
    expect(edgeSource).not.toMatch(/\.insert\(/);
    expect(edgeSource).not.toMatch(/\.update\(/);
    expect(edgeSource).not.toMatch(/\.delete\(/);
    expect(edgeSource).not.toMatch(/\.upsert\(/);
  });

  it("NÃO chama RPC nem outra edge function", () => {
    expect(edgeSource).not.toMatch(/\bsupabase\.rpc\b/);
    expect(edgeSource).not.toMatch(/functions\.invoke/);
  });

  it("NÃO retorna base64/PDF bytes/signed URL pro client", () => {
    // Devolve apenas {ok, extraction}.
    expect(edgeSource).not.toMatch(/return\s+.*base64Pdf/);
    expect(edgeSource).not.toMatch(/return.*signedUrl/);
  });

  it("logs SÓ via logSafe (sem console.log/info/warn/error/debug solto)", () => {
    const code = stripComments(edgeSource);
    // Permite console.log DENTRO de logSafe; bloqueia uso fora.
    const consoleCalls = code.match(/console\.(log|info|warn|error|debug)\(/g) ?? [];
    // Só 1 ocorrência: a do logSafe.
    expect(consoleCalls.length).toBeLessThanOrEqual(1);
  });

  it("erros são genéricos (não expõem path/token/stack)", () => {
    // Mensagens humanas curtas, padronizadas.
    expect(edgeSource).toContain("Configuração de extração indisponível");
    expect(edgeSource).toContain("Aluno não encontrado");
    expect(edgeSource).toContain("Arquivo não encontrado");
    expect(edgeSource).toContain("Falha na extração automática");
    // catch genérico — sem bind do err.
    expect(edgeSource).toMatch(/}\s*catch\s*\{/);
  });

  it("modelo OpenAI configurável via env OPENAI_DEXA_EXTRACTION_MODEL", () => {
    expect(edgeSource).toContain('"OPENAI_DEXA_EXTRACTION_MODEL"');
  });

  it("usa Responses API (POST https://api.openai.com/v1/responses) com input_file PDF", () => {
    expect(edgeSource).toContain("https://api.openai.com/v1/responses");
    expect(edgeSource).toContain('type: "input_file"');
    // Garantias do shape do `input_file`:
    expect(edgeSource).toContain('filename: "dexa.pdf"');
    // `file_data` DEVE ser DATA URL com MIME prefix
    // (`data:application/pdf;base64,...`). Smoke real (2026-05-18)
    // capturou via `failure_code` + `upstream_*` que base64 PURO é
    // rejeitado com `error.code="invalid_value"` em
    // `input[0].content[0].file_data`. Bloqueia regressão pra base64 puro.
    expect(edgeSource).toMatch(
      /file_data:\s*`data:application\/pdf;base64,\$\{base64Pdf\}`/,
    );
    expect(edgeSource).not.toMatch(/file_data:\s*base64Pdf\s*,/);
  });

  it("prompt instrui sem classificar/diagnosticar/inventar", () => {
    expect(edgeSource).toContain("NÃO classifique");
    expect(edgeSource).toContain("NÃO diagnostique");
    expect(edgeSource).toContain("Não invente valores");
  });

  it("schema JSON exige fields/overall_confidence/missing_fields/warnings (strict)", () => {
    expect(edgeSource).toContain('strict: true');
    expect(edgeSource).toContain('"overall_confidence"');
    expect(edgeSource).toContain('"missing_fields"');
    expect(edgeSource).toContain('"warnings"');
  });

  it("limita PDF a 20 MB (MAX_PDF_BYTES)", () => {
    expect(edgeSource).toContain("MAX_PDF_BYTES = 20 * 1024 * 1024");
  });
});

// ── Hardening pós-revisão do PR #159 ───────────────────────────────────────

describe("extract-dexa-pdf edge — hardening pós-review", () => {
  const code = stripComments(edgeSource);

  it("Fix 1: NÃO loga studentId nem usa studentId.slice (zero identificador no log)", () => {
    expect(code).not.toMatch(/studentId\.slice\(/);
    // O log de sucesso virou neutro: `logSafe("ok", { ok: true })`.
    expect(code).toMatch(/logSafe\(\s*"ok"\s*,\s*\{\s*ok:\s*true\s*\}\s*\)/);
    expect(code).not.toMatch(/logSafe\(\s*"ok"\s*,\s*\{\s*studentId/);
  });

  it("Fix 1: nenhum logSafe carrega chaves PII (studentId, storagePath, path, bucket, token, prompt)", () => {
    const logSafeCalls = code.match(/logSafe\([^)]+\)/g) ?? [];
    for (const call of logSafeCalls) {
      expect(call).not.toMatch(/studentId/);
      expect(call).not.toMatch(/storagePath/);
      expect(call).not.toMatch(/storage_path/);
      expect(call).not.toMatch(/bucket/);
      expect(call).not.toMatch(/token/);
      expect(call).not.toMatch(/prompt/);
      expect(call).not.toMatch(/base64/);
    }
  });

  it("Fix 3: exporta normalizeEdgeExtraction e o handler USA ele", () => {
    expect(code).toMatch(/export function normalizeEdgeExtraction\b/);
    // Uso REAL no handler — não pode ficar só declarado.
    expect(code).toMatch(
      /const extraction = normalizeEdgeExtraction\(\s*aiResult\.parsed/,
    );
  });

  it("Fix 3: o spread cru `...aiResult.parsed` foi REMOVIDO do handler", () => {
    expect(code).not.toMatch(/\.\.\.aiResult\.parsed/);
  });

  it("Fix 3: lista de chaves proibidas DEXA_EDGE_FORBIDDEN_KEYS cobre todos os vetores", () => {
    const forbidden = [
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
    for (const key of forbidden) {
      expect(edgeSource).toContain(`"${key}"`);
    }
  });

  it("Fix 3: edge clampa confidence (clamp01) e trunca source_text/conclusion_text", () => {
    expect(code).toMatch(/function clamp01\b/);
    expect(code).toMatch(/DEXA_SOURCE_TEXT_MAX_CHARS\s*=\s*500/);
    expect(code).toMatch(/DEXA_CONCLUSION_TEXT_MAX_CHARS\s*=\s*5000/);
  });

  it("Fix 3: normalizeEdgeExtraction faz deepStripForbidden no final", () => {
    expect(code).toMatch(/function deepStripForbidden\b/);
    expect(code).toMatch(
      /return deepStripForbidden\(normalized\)/,
    );
  });

  it("Fix 3: response é `{ ok: true, extraction }` (não vaza outras chaves do AI)", () => {
    expect(code).toMatch(
      /return jsonResponse\(\{\s*ok:\s*true\s*,\s*extraction\s*\}\)/,
    );
  });
});

// ── DexaForm — hardening do toast de erro ───────────────────────────────────

describe("DexaForm — hardening do toast de erro de upload", () => {
  const code = stripComments(dexaFormSource);

  it("Fix 2: NÃO usa err.message/error.message/signError.message em notify.error", () => {
    expect(code).not.toMatch(/err\.message/);
    expect(code).not.toMatch(/error\.message/);
    expect(code).not.toMatch(/signError\.message/);
  });

  it("Fix 2: usa constante DEXA_UPLOAD_GENERIC_ERROR_DESCRIPTION fixa", () => {
    expect(code).toMatch(
      /const DEXA_UPLOAD_GENERIC_ERROR_DESCRIPTION\s*=\s*\n?\s*"[^"]+"/,
    );
    expect(code).toMatch(
      /description:\s*DEXA_UPLOAD_GENERIC_ERROR_DESCRIPTION/,
    );
  });

  it("Fix 2: catch do submit é vazio (sem bind do err — defesa contra refactor)", () => {
    // Procura especificamente o catch que vinha após o submit/save.
    expect(code).toMatch(/}\s*catch\s*\{\s*\n\s*if\s*\(\s*!mutationStarted\s*\)/);
    expect(code).not.toMatch(/catch\s*\(\s*err\s*\)\s*\{\s*\n\s*if\s*\(\s*!mutationStarted/);
  });
});

// ── config.toml ────────────────────────────────────────────────────────────

describe("config.toml — extract-dexa-pdf registrada com verify_jwt=false", () => {
  it("entry [functions.extract-dexa-pdf] tem verify_jwt = false (CORS preflight)", () => {
    // Deliberadamente FALSE no gateway: a edge precisa aceitar OPTIONS
    // sem Authorization pra que o browser consiga fazer preflight CORS.
    // JWT continua validado em código pelo handler (auth.getUser).
    // Mesmo padrão de oura-sync-all / validate-student-invite /
    // create-student-from-invite.
    expect(configSource).toMatch(
      /\[functions\.extract-dexa-pdf\]\s*\nverify_jwt = false/,
    );
    // Regressão guard: não pode reaparecer = true acidentalmente.
    expect(configSource).not.toMatch(
      /\[functions\.extract-dexa-pdf\]\s*\nverify_jwt = true/,
    );
  });

  it("handler do extract-dexa-pdf valida JWT em código (defesa em profundidade)", () => {
    // Sanity: mesmo com gateway sem verify_jwt, o handler PRECISA
    // validar Authorization Bearer + auth.getUser() ANTES do
    // service-role client. Esse teste é redundante com os outros
    // (linha "Fix 1: nenhum logSafe...") mas mantém-se aqui como
    // pareamento explícito ao config.toml.
    expect(edgeSource).toContain('startsWith("Bearer ")');
    expect(edgeSource).toContain("await userClient.auth.getUser()");
  });
});

// ── extract-dexa-pdf — diagnóstico via failure_code/upstream_status ─────────

describe("extract-dexa-pdf edge — failure_code + upstream_status (diagnóstico cego)", () => {
  const code = stripComments(edgeSource);

  it("declara FailureCode com TODOS os códigos enumerados permitidos", () => {
    // Os 6 valores permitidos (5 categorias específicas + unknown).
    // Cada um precisa ser parte do union literal type.
    expect(code).toMatch(/type FailureCode\s*=/);
    expect(code).toMatch(/"openai_http_error"/);
    expect(code).toMatch(/"openai_no_text"/);
    expect(code).toMatch(/"openai_bad_json"/);
    expect(code).toMatch(/"openai_response_parse_error"/);
    expect(code).toMatch(/"openai_exception"/);
    expect(code).toMatch(/"unknown"/);
  });

  it("errorResponse aceita metadata opcional { failure_code, upstream_status }", () => {
    expect(code).toMatch(
      /function errorResponse\(\s*message:\s*string\s*,\s*status:\s*number\s*,\s*metadata\?:\s*ErrorMetadata\s*,?\s*\)/,
    );
    expect(code).toMatch(/interface ErrorMetadata/);
    expect(code).toMatch(/failure_code\?:\s*FailureCode/);
    expect(code).toMatch(/upstream_status\?:\s*number/);
  });

  it("errorResponse SÓ inclui failure_code/upstream_status quando passados (não vaza chaves vazias)", () => {
    // Guard contra body com `failure_code: undefined` ou `null`.
    expect(code).toMatch(
      /if\s*\(\s*metadata\?\.failure_code\s*\)\s*body\.failure_code\s*=/,
    );
    expect(code).toMatch(
      /if\s*\(\s*typeof\s+metadata\?\.upstream_status\s*===\s*"number"\s*\)/,
    );
  });

  it("callOpenAiExtraction tem return type CallOpenAiResult com failure_code + upstream_status no branch !ok", () => {
    expect(code).toMatch(/type CallOpenAiResult\s*=/);
    // Regex flexível: o branch !ok pode estar formatado em uma única
    // linha OU em múltiplas (com campos extras como `openai_error?:`).
    // Garantimos ordem `ok: false` → `failure_code: FailureCode` →
    // `upstream_status: number`.
    expect(code).toMatch(
      /ok:\s*false\s*;\s*\n?\s*failure_code:\s*FailureCode\s*;\s*\n?\s*upstream_status:\s*number/,
    );
  });

  it("fetch da OpenAI está dentro de try/catch que retorna failure_code='openai_exception'", () => {
    // O try envolve o fetch da Responses API; o catch retorna o código.
    // Usa `edgeSource` (raw) e não `code` (stripped), porque o helper
    // `stripComments` interpreta `//` dentro de URLs como início de
    // comentário e mutila a string `"https://api.openai.com/..."`.
    expect(edgeSource).toMatch(
      /try\s*\{[\s\S]*?response\s*=\s*await\s+fetch\(\s*"https:\/\/api\.openai\.com\/v1\/responses"/,
    );
    expect(code).toMatch(
      /failure_code:\s*"openai_exception"\s*,\s*\n\s*upstream_status:\s*0/,
    );
  });

  it("response.json() está dentro de try/catch que retorna 'openai_response_parse_error' (sem expor body)", () => {
    expect(code).toMatch(
      /try\s*\{\s*\n\s*data\s*=\s*\(\s*await\s+response\.json\(\)\s*\)/,
    );
    expect(code).toMatch(/failure_code:\s*"openai_response_parse_error"/);
  });

  it("!response.ok retorna failure_code='openai_http_error' + upstream_status=response.status", () => {
    expect(code).toMatch(
      /if\s*\(\s*!response\.ok\s*\)\s*\{[\s\S]*?failure_code:\s*"openai_http_error"\s*,\s*\n\s*upstream_status:\s*response\.status/,
    );
  });

  it("!text retorna failure_code='openai_no_text' + upstream_status=response.status", () => {
    expect(code).toMatch(
      /if\s*\(\s*!text\s*\)\s*\{[\s\S]*?failure_code:\s*"openai_no_text"\s*,\s*\n\s*upstream_status:\s*response\.status/,
    );
  });

  it("JSON.parse(text) failure retorna 'openai_bad_json' + upstream_status=response.status", () => {
    // Procura o último catch da função — o do JSON.parse(text).
    expect(code).toMatch(
      /JSON\.parse\(text\)[\s\S]*?catch\s*\{[\s\S]*?failure_code:\s*"openai_bad_json"\s*,\s*\n\s*upstream_status:\s*response\.status/,
    );
  });

  it("handler propaga aiResult.failure_code + aiResult.upstream_status pro errorResponse", () => {
    // Regex tolerante: o objeto de metadata cresceu (agora também
    // carrega upstream_code/type/param/message), mas failure_code e
    // upstream_status precisam estar lá dentro do mesmo errorResponse
    // call. Procuramos o errorResponse que carrega "Falha na extração
    // automática" e validamos as 2 chaves dentro do bloco.
    const errorCall = code.match(
      /return errorResponse\(\s*"Falha na extração automática"\s*,\s*502\s*,\s*\{[\s\S]*?\}\s*\);/,
    )?.[0] ?? "";
    expect(errorCall.length).toBeGreaterThan(0);
    expect(errorCall).toMatch(/failure_code:\s*aiResult\.failure_code/);
    expect(errorCall).toMatch(/upstream_status:\s*aiResult\.upstream_status/);
  });

  it("toast humano permanece genérico ('Falha na extração automática' — sem failure_code visível pro coach)", () => {
    // A mensagem humana NÃO muda. O failure_code é metadata interna do body.
    expect(code).toMatch(/"Falha na extração automática"/);
    // O failure_code NUNCA aparece como string interpolada em error
    // message humana.
    expect(code).not.toMatch(/error:\s*`[^`]*\$\{[^}]*failure_code/);
    expect(code).not.toMatch(/error:\s*"[^"]*failure_code/);
  });

  it("NÃO loga err.message, error.message, stack, ou body raw da OpenAI em lugar nenhum", () => {
    // O catch precisa ser vazio (sem bind do err). Esperamos zero
    // ocorrências de `err.message` / `error.message` / `.stack`. A
    // variável `errFields` em `extractOpenAiErrorDetails` NÃO bate
    // com `\berr\b` porque word boundary diferencia `err` de
    // `errFields` (transição word-to-word, sem \b).
    expect(code).not.toMatch(/\berr\.message\b/);
    expect(code).not.toMatch(/\berror\.message\b/);
    expect(code).not.toMatch(/\.stack\b/);
    expect(code).not.toMatch(/response\.text\(\)/);
    // Defensivo: PAYLOAD do logSafe (segundo argumento) NÃO pode
    // carregar text/body/parsed/output/base64/prompt/message — só
    // status + enumerados curtos (code/type/param).
    const logSafePayloads = [
      ...code.matchAll(/logSafe\(\s*"[^"]+"\s*,\s*(\{[^}]*\})\s*\)/g),
    ].map((m) => m[1]);
    expect(logSafePayloads.length).toBeGreaterThan(0);
    for (const payload of logSafePayloads) {
      expect(payload).not.toMatch(/data\./);
      expect(payload).not.toMatch(/\btext\s*:/);
      expect(payload).not.toMatch(/\bbody\s*:/);
      expect(payload).not.toMatch(/\bparsed\s*:/);
      expect(payload).not.toMatch(/\boutput\s*:/);
      expect(payload).not.toMatch(/\bbase64\s*:/);
      expect(payload).not.toMatch(/\bprompt\s*:/);
      expect(payload).not.toMatch(/\bmessage\s*:/);
    }
  });

  it("logSafe dos códigos de falha SÓ carrega status (+ enumerados seguros em openai_error)", () => {
    // Padrão estrito pros 4 códigos que SÓ têm status:
    expect(code).toMatch(
      /logSafe\(\s*"openai_exception"\s*,\s*\{\s*status:\s*0\s*\}\s*\)/,
    );
    expect(code).toMatch(
      /logSafe\(\s*"openai_response_parse_error"\s*,\s*\{\s*status:\s*response\.status\s*\}\s*\)/,
    );
    expect(code).toMatch(
      /logSafe\(\s*"openai_no_text"\s*,\s*\{\s*status:\s*response\.status\s*\}\s*\)/,
    );
    expect(code).toMatch(
      /logSafe\(\s*"openai_bad_json"\s*,\s*\{\s*status:\s*response\.status\s*\}\s*\)/,
    );
    // `openai_error` é o ÚNICO que pode carregar mais — status +
    // code/type/param enumerados curtos. NUNCA message/body. Garantia
    // de NÃO-leak está no teste anterior (logSafePayloads loop).
    expect(code).toMatch(
      /logSafe\(\s*"openai_error"\s*,\s*\{[\s\S]*?status:\s*response\.status/,
    );
  });
});

// ── extract-dexa-pdf — scan_date no schema + prompt ───────────────────────

describe("extract-dexa-pdf edge — scan_date no schema strict + prompt", () => {
  it("schema declara fields.scan_date com value string|null + confidence/source/page", () => {
    // scan_date entra no `required` do fields (strict mode).
    expect(edgeSource).toMatch(
      /required:\s*\[\s*\.\.\.DEXA_NUMERIC_FIELDS\s*,\s*\n\s*"conclusion_text"\s*,\s*\n\s*"regional_distribution"\s*,\s*\n\s*"scan_date"\s*,\s*\n\s*\]/,
    );
    // E a entry tem o shape {value: string|null, confidence, source_text, page}.
    const code = stripComments(edgeSource);
    expect(code).toMatch(
      /"scan_date"\s*,\s*\{[\s\S]*?value:\s*\{\s*type:\s*\[\s*"string"\s*,\s*"null"\s*\]\s*\}/,
    );
  });

  it("prompt orienta extração da data DE REALIZAÇÃO (não emissão/impressão)", () => {
    expect(edgeSource).toContain("scan_date");
    expect(edgeSource).toMatch(/data\s+EM\s+QUE\s+O\s+EXAME\s+FOI\s+REALIZADO/i);
    // E orienta explicitamente preferir realização sobre emissão/impressão.
    expect(edgeSource).toMatch(/PREFIRA\s+SEMPRE\s+a\s+data\s+de\s+REALIZAÇÃO/i);
    expect(edgeSource).toMatch(/nunca\s+a\s+data\s+de\s+emissão\/impressão/i);
  });

  it("edge normaliza scan_date com regex ISO + cutoff de ano", () => {
    expect(edgeSource).toMatch(/function normalizeScanDateField\(/);
    // Constante SCAN_DATE_ISO_RE declarada (regex específico inspecionado
    // em outros testes — aqui só verifica a existência da constante).
    expect(edgeSource).toMatch(/SCAN_DATE_ISO_RE\s*=/);
    expect(edgeSource).toMatch(/year\s*>=\s*1900/);
    // Edge normaliza scan_date como parte do pipeline:
    expect(edgeSource).toMatch(/fields\.scan_date\s*=\s*normalizeScanDateField\(/);
  });
});

// ── extract-dexa-pdf — schema strict (required em sub-objetos) ─────────────

describe("extract-dexa-pdf edge — RESPONSE_JSON_SCHEMA strict-compatible", () => {
  it("regional_distribution.value.anyOf[1] tem `required: [...DEXA_REGION_KEYS]`", () => {
    // Strict mode da OpenAI exige `required` cobrindo TODAS as
    // properties quando `additionalProperties: false`. Pegou no smoke
    // real (HTTP 400 / error.code="invalid_value" apontando justamente
    // pra esse path).
    expect(edgeSource).toMatch(
      /required:\s*\[\s*\.\.\.\s*DEXA_REGION_KEYS\s*\]/,
    );
  });

  it("cada sub-objeto por região tem `required: ['fat_pct', 'lean_mass_g', 'fat_mass_g']`", () => {
    expect(edgeSource).toMatch(
      /required:\s*\[\s*"fat_pct"\s*,\s*"lean_mass_g"\s*,\s*"fat_mass_g"\s*\]/,
    );
  });

  it("regional_distribution mantém `additionalProperties: false` em ambos os níveis", () => {
    const regionalBlock = edgeSource.match(
      /"regional_distribution"[\s\S]*?\n\s{10}\],/,
    )?.[0] ?? "";
    expect(regionalBlock.length).toBeGreaterThan(0);
    const additionalFalse = (regionalBlock.match(/additionalProperties:\s*false/g) ?? []).length;
    expect(additionalFalse).toBeGreaterThanOrEqual(2);
    expect(regionalBlock).not.toMatch(/additionalProperties:\s*true/);
  });

  it("strict: true preservado no schema", () => {
    expect(edgeSource).toContain("strict: true");
  });
});

// ── extract-dexa-pdf — diagnóstico sanitizado do erro OpenAI (Fix C) ───────

describe("extract-dexa-pdf edge — upstream_* sanitizado (code/type/param/message)", () => {
  const code = stripComments(edgeSource);

  it("define OPENAI_ERROR_MESSAGE_MAX_CHARS = 240", () => {
    expect(code).toMatch(/OPENAI_ERROR_MESSAGE_MAX_CHARS\s*=\s*240/);
  });

  it("OpenAiErrorDetails declara apenas { code, type, param, message } — sem body/raw/payload/prompt/stack", () => {
    expect(code).toMatch(/interface OpenAiErrorDetails/);
    const ifaceBlock = code.match(/interface OpenAiErrorDetails\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(ifaceBlock.length).toBeGreaterThan(0);
    expect(ifaceBlock).toMatch(/code:\s*string\s*\|\s*null/);
    expect(ifaceBlock).toMatch(/type:\s*string\s*\|\s*null/);
    expect(ifaceBlock).toMatch(/param:\s*string\s*\|\s*null/);
    expect(ifaceBlock).toMatch(/message:\s*string\s*\|\s*null/);
    expect(ifaceBlock).not.toMatch(/\bbody\b/);
    expect(ifaceBlock).not.toMatch(/\braw\b/);
    expect(ifaceBlock).not.toMatch(/\brequest\b/);
    expect(ifaceBlock).not.toMatch(/\bpayload\b/);
    expect(ifaceBlock).not.toMatch(/\bprompt\b/);
    expect(ifaceBlock).not.toMatch(/\bstack\b/);
  });

  it("extractOpenAiErrorDetails só lê chaves seguras e trunca message a 240 chars", () => {
    expect(code).toMatch(/function extractOpenAiErrorDetails\(/);
    const fnBlock = code.match(
      /function extractOpenAiErrorDetails\([\s\S]*?\n\}/,
    )?.[0] ?? "";
    expect(fnBlock.length).toBeGreaterThan(0);
    // Aceita `errFields.X` ou `err.X` (variável local pode ter qualquer
    // nome curto — o que importa é que só leia as 4 chaves seguras).
    expect(fnBlock).toMatch(/(errFields|err)\.code/);
    expect(fnBlock).toMatch(/(errFields|err)\.type/);
    expect(fnBlock).toMatch(/(errFields|err)\.param/);
    expect(fnBlock).toMatch(/(errFields|err)\.message/);
    for (const prefix of ["err", "errFields"]) {
      const re = (suffix: string) => new RegExp(`\\b${prefix}\\.${suffix}\\b`);
      expect(fnBlock).not.toMatch(re("body"));
      expect(fnBlock).not.toMatch(re("raw"));
      expect(fnBlock).not.toMatch(re("payload"));
      expect(fnBlock).not.toMatch(re("prompt"));
      expect(fnBlock).not.toMatch(re("stack"));
      expect(fnBlock).not.toMatch(re("data"));
    }
    expect(fnBlock).not.toMatch(/JSON\.stringify/);
    expect(fnBlock).toMatch(/OPENAI_ERROR_MESSAGE_MAX_CHARS/);
  });

  it("!response.ok ENVOLVE response.json() em try/catch (não estoura se body for inválido)", () => {
    const notOkBlock = code.match(
      /if\s*\(\s*!response\.ok\s*\)\s*\{[\s\S]*?return\s*\{[\s\S]*?openai_error[\s\S]*?\};[\s\S]*?\}/,
    )?.[0] ?? "";
    expect(notOkBlock.length).toBeGreaterThan(0);
    expect(notOkBlock).toMatch(
      /try\s*\{[\s\S]*?await\s+response\.json\(\)[\s\S]*?\}\s*catch\s*\{[\s\S]*?openAiError\s*=\s*null/,
    );
  });

  it("!response.ok retorna openai_error: OpenAiErrorDetails | null no result", () => {
    expect(code).toMatch(/openai_error\?:\s*OpenAiErrorDetails\s*\|\s*null/);
    expect(code).toMatch(
      /failure_code:\s*"openai_http_error"\s*,\s*\n\s*upstream_status:\s*response\.status\s*,\s*\n\s*openai_error:\s*openAiError/,
    );
  });

  it("errorResponse aceita upstream_code/upstream_type/upstream_param/upstream_message como metadata opcional", () => {
    // Naming `upstream_*` é consistente com `upstream_status` (PR #162)
    // e provider-agnostic — facilita troca futura sem quebrar contrato.
    expect(code).toMatch(/upstream_code\?:\s*string\s*\|\s*null/);
    expect(code).toMatch(/upstream_type\?:\s*string\s*\|\s*null/);
    expect(code).toMatch(/upstream_param\?:\s*string\s*\|\s*null/);
    expect(code).toMatch(/upstream_message\?:\s*string\s*\|\s*null/);
  });

  it("errorResponse SÓ inclui upstream_* quando string não-vazia (guard contra null/undefined no body)", () => {
    expect(code).toMatch(
      /if\s*\(\s*typeof\s+metadata\?\.upstream_code\s*===\s*"string"\s+&&\s+metadata\.upstream_code\s*\)/,
    );
    expect(code).toMatch(
      /if\s*\(\s*typeof\s+metadata\?\.upstream_message\s*===\s*"string"\s+&&\s+metadata\.upstream_message\s*\)/,
    );
  });

  it("handler propaga aiResult.openai_error.{code,type,param,message} pro errorResponse como upstream_*", () => {
    expect(code).toMatch(/upstream_code:\s*openAiError\?\.code\s*\?\?\s*null/);
    expect(code).toMatch(/upstream_type:\s*openAiError\?\.type\s*\?\?\s*null/);
    expect(code).toMatch(/upstream_param:\s*openAiError\?\.param\s*\?\?\s*null/);
    expect(code).toMatch(/upstream_message:\s*openAiError\?\.message\s*\?\?\s*null/);
  });

  it("logSafe('openai_error') carrega APENAS status/code/type/param (sem message, sem body, sem prompt)", () => {
    const openaiErrorLog = code.match(
      /logSafe\(\s*"openai_error"\s*,\s*\{[\s\S]*?\}\s*\)/,
    )?.[0] ?? "";
    expect(openaiErrorLog.length).toBeGreaterThan(0);
    expect(openaiErrorLog).toMatch(/status/);
    expect(openaiErrorLog).toMatch(/code/);
    expect(openaiErrorLog).toMatch(/type/);
    expect(openaiErrorLog).toMatch(/param/);
    // Defensivo: zero leak de message/body/raw/data/payload/prompt no
    // PAYLOAD do log (message vai SÓ pro response body, nunca pro log).
    expect(openaiErrorLog).not.toMatch(/\bmessage\s*:/);
    expect(openaiErrorLog).not.toMatch(/\bbody\s*:/);
    expect(openaiErrorLog).not.toMatch(/\braw\s*:/);
    expect(openaiErrorLog).not.toMatch(/\bdata\s*:/);
    expect(openaiErrorLog).not.toMatch(/\bpayload\s*:/);
    expect(openaiErrorLog).not.toMatch(/\bprompt\s*:/);
  });

  it("upstream_message vai pro body já TRUNCADO a 240 chars (via extractOpenAiErrorDetails)", () => {
    // O truncamento real acontece em extractOpenAiErrorDetails.
    // Garantimos que essa constante alimenta o caminho que vai pro
    // upstream_message — ou seja, que o pipeline não pula a truncagem.
    expect(code).toMatch(/OPENAI_ERROR_MESSAGE_MAX_CHARS\s*=\s*240/);
    const fnBlock = code.match(
      /function extractOpenAiErrorDetails\([\s\S]*?\n\}/,
    )?.[0] ?? "";
    expect(fnBlock).toMatch(/(errFields|err)\.message[\s\S]*?OPENAI_ERROR_MESSAGE_MAX_CHARS/);
  });

  it("NUNCA retorna o body cru da OpenAI no response (zero echo de errBody/requestBody/data em errorResponse/jsonResponse)", () => {
    // `JSON.stringify(requestBody)` é usado LEGITIMAMENTE no fetch body
    // pra ENVIAR pra OpenAI — não é problema. O que queremos garantir é
    // que NENHUM `errorResponse(...)` carrega `errBody`/`requestBody`/
    // `data` no metadata e não vão pro `jsonResponse` de retorno.
    const errorResponseCalls = [
      ...code.matchAll(/errorResponse\([^;]*?\);/g),
    ].map((m) => m[0]);
    for (const call of errorResponseCalls) {
      expect(call).not.toMatch(/\berrBody\b/);
      expect(call).not.toMatch(/\brequestBody\b/);
      expect(call).not.toMatch(/\bdata\b/);
      expect(call).not.toMatch(/JSON\.stringify/);
    }
    const jsonResponseCalls = [
      ...code.matchAll(/jsonResponse\([^;]*?\);/g),
    ].map((m) => m[0]);
    for (const call of jsonResponseCalls) {
      expect(call).not.toMatch(/\berrBody\b/);
      expect(call).not.toMatch(/\brequestBody\b/);
    }
  });
});

// ── DexaForm — data do exame (não default-hoje, scan_date extraído) ──────

describe("DexaForm — Data do exame (não default-hoje, scan_date extraído)", () => {
  it("label do campo de data é 'Data do exame' (não 'Data do scan')", () => {
    expect(dexaFormSource).toMatch(/<FormLabel>Data do exame<\/FormLabel>/);
    expect(dexaFormSource).not.toMatch(/<FormLabel>Data do scan<\/FormLabel>/);
  });

  it("default de assessment_date é VAZIO (não localTodayIso) — coach precisa preencher OU IA extrai", () => {
    // Comentário inline documenta a decisão. Garantia hard:
    expect(dexaFormSource).toMatch(/assessment_date:\s*""/);
    // E NÃO chama localTodayIso() no default do DexaForm:
    const code = stripComments(dexaFormSource);
    expect(code).not.toMatch(/assessment_date:\s*localTodayIso\(\)/);
  });

  it("renderiza data-testid='dexa-exam-date' pra facilitar tests E2E", () => {
    expect(dexaFormSource).toMatch(/data-testid="dexa-exam-date"/);
  });

  it("handleExtract chama applyDexaScanDateToAssessmentDate com (scan_date.value, form.getValues)", () => {
    expect(dexaFormSource).toMatch(/applyDexaScanDateToAssessmentDate\(/);
    expect(dexaFormSource).toMatch(
      /extraction\.fields\.scan_date\?\.value\s*\?\?\s*null/,
    );
    expect(dexaFormSource).toMatch(/form\.getValues\("assessment_date"\)/);
  });

  it("aplica scan_date via form.setValue SÓ quando applied=true e nextValue não-vazio", () => {
    const code = stripComments(dexaFormSource);
    expect(code).toMatch(
      /if\s*\(\s*scanDateApply\.applied\s*&&\s*scanDateApply\.nextValue\s*\)/,
    );
    expect(code).toMatch(
      /form\.setValue\("assessment_date"\s*,\s*scanDateApply\.nextValue/,
    );
  });

  it("scan_date aplicado entra em appliedFields (coach vê 'n campos preenchidos')", () => {
    const code = stripComments(dexaFormSource);
    expect(code).toMatch(/appliedFields\.push\("scan_date"\)/);
  });
});

// ── DexaForm — campo Sexo no bloco base (fix Sexo "—" no detail sheet) ───

describe("DexaForm — campo Sexo renderizado e enviado no submit", () => {
  it("renderiza o campo 'Sexo' no bloco inicial (junto de Data/Idade/Peso/Altura)", () => {
    // O bloco base é o `<section>` com `grid sm:grid-cols-5` (4 antes
    // do fix → 5 agora pra acomodar o Sexo).
    expect(dexaFormSource).toMatch(/<FormLabel>Sexo<\/FormLabel>/);
    expect(dexaFormSource).toMatch(/name="sex"/);
    expect(dexaFormSource).toMatch(/data-testid="dexa-sex-trigger"/);
  });

  it("usa Select shadcn com placeholder 'Não informado' + opções M/F", () => {
    expect(dexaFormSource).toMatch(/SelectValue\s+placeholder="Não informado"/);
    expect(dexaFormSource).toMatch(/<SelectItem value="M">Masculino<\/SelectItem>/);
    expect(dexaFormSource).toMatch(/<SelectItem value="F">Feminino<\/SelectItem>/);
  });

  it("mapeia 'Não informado' (CLEAR_SELECT_VALUE) ↔ null no field state", () => {
    // Sentinel string pra Radix Select (que não aceita value === "").
    expect(dexaFormSource).toMatch(
      /const CLEAR_SELECT_VALUE\s*=\s*"__none"/,
    );
    // onChange null quando o usuário escolhe "Não informado":
    expect(dexaFormSource).toMatch(
      /v\s*===\s*CLEAR_SELECT_VALUE\s*\?\s*null\s*:\s*\(v\s+as\s+"M"\s*\|\s*"F"\)/,
    );
  });

  it("preserva defaults?.sex no initial state do form (não sobrescreve sex de avaliação anterior)", () => {
    expect(dexaFormSource).toMatch(/sex:\s*defaults\?\.sex\s*\?\?\s*null/);
  });

  it("submit envia sex: data.sex ?? null (compatível com schema base)", () => {
    expect(dexaFormSource).toMatch(/sex:\s*data\.sex\s*\?\?\s*null/);
  });

  it("grid do bloco base é sm:grid-cols-5 (4 campos antigos + Sexo)", () => {
    // Antes do fix: `sm:grid-cols-4` (Data/Idade/Peso/Altura).
    // Pós-fix: `sm:grid-cols-5` (acomoda o Sexo).
    expect(dexaFormSource).toMatch(/sm:grid-cols-5/);
  });
});

// ── DexaForm — regional_distribution é OPCIONAL (não bloqueia submit) ─────

describe("DexaForm — regional_distribution opcional / não-bloqueante", () => {
  const validationPath = resolve(__dirname, "../../../utils/assessmentValidation.ts");
  const validationSource = readFileSync(validationPath, "utf-8");

  it("regional_distribution é nullable+optional no dexaSchema (toda a seção opcional)", () => {
    expect(validationSource).toMatch(
      /regional_distribution:\s*dexaRegionalDistributionSchema\.nullable\(\)\.optional\(\)/,
    );
  });

  it("cada sub-campo regional (fat_pct/lean_mass_g/fat_mass_g) usa nullableNumber (não requiredNumber)", () => {
    // Bugfix: se um dos 3 sub-campos usar `requiredNumber`, a IA
    // extraindo região parcial faz o submit do form falhar em silêncio
    // (a seção "Distribuição regional (opcional)" é colapsada e o
    // erro de validação fica escondido). Bloqueio explícito:
    const dexaRegionBlock = validationSource.match(
      /const dexaRegionSchema\s*=\s*z\.object\(\{[\s\S]*?\n\}\);/,
    )?.[0] ?? "";
    expect(dexaRegionBlock.length).toBeGreaterThan(0);
    expect(dexaRegionBlock).toMatch(/fat_pct:\s*nullableNumber\(/);
    expect(dexaRegionBlock).toMatch(/lean_mass_g:\s*nullableNumber\(/);
    expect(dexaRegionBlock).toMatch(/fat_mass_g:\s*nullableNumber\(/);
    expect(dexaRegionBlock).not.toMatch(/fat_pct:\s*requiredNumber\(/);
    expect(dexaRegionBlock).not.toMatch(/lean_mass_g:\s*requiredNumber\(/);
    expect(dexaRegionBlock).not.toMatch(/fat_mass_g:\s*requiredNumber\(/);
  });

  it("DexaForm rotula a seção regional como 'opcional' (sinal pro coach + alinhamento de UX)", () => {
    expect(dexaFormSource).toMatch(/Distribuição regional \(opcional\)/);
  });

  it("DexaForm default state inicializa regional_distribution como null (não objeto vazio)", () => {
    // Defaults novos abrem com `regional_distribution: null`, não com
    // sub-objetos vazios que ativariam validação por região acidentalmente.
    expect(dexaFormSource).toMatch(/regional_distribution:\s*null/);
  });

  it("onSubmit passa regional_distribution como ?? null (nunca undefined que falharia type-check)", () => {
    expect(dexaFormSource).toMatch(
      /regional_distribution:\s*data\.regional_distribution\s*\?\?\s*null/,
    );
  });
});

// ── DexaForm — toast permanece genérico (sem failure_code/upstream_* visível) ─

describe("DexaForm — toast permanece genérico após introdução de failure_code/upstream_*", () => {
  const code = stripComments(dexaFormSource);

  it("DexaForm NÃO lê failure_code/upstream_status do response da edge (toast não muda)", () => {
    // Hardening: o client não pode começar a EXIBIR esses códigos pro
    // coach. Eles existem apenas pra triagem técnica via Network tab.
    expect(code).not.toMatch(/\bfailure_code\b/);
    expect(code).not.toMatch(/\bupstream_status\b/);
  });

  it("DexaForm NÃO lê upstream_code/upstream_type/upstream_param/upstream_message (zero exposição pro coach)", () => {
    expect(code).not.toMatch(/\bupstream_code\b/);
    expect(code).not.toMatch(/\bupstream_type\b/);
    expect(code).not.toMatch(/\bupstream_param\b/);
    expect(code).not.toMatch(/\bupstream_message\b/);
  });

  it("DexaForm tampouco lê os nomes antigos openai_* (guard regressão pré-rename)", () => {
    expect(code).not.toMatch(/\bopenai_code\b/);
    expect(code).not.toMatch(/\bopenai_type\b/);
    expect(code).not.toMatch(/\bopenai_param\b/);
    expect(code).not.toMatch(/\bopenai_message\b/);
  });

  it("toast de erro de extração continua usando string fixa 'Não foi possível ler o PDF automaticamente'", () => {
    expect(code).toContain("Não foi possível ler o PDF automaticamente");
  });
});
