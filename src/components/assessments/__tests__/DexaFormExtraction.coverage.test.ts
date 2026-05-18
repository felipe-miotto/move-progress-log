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
    // `file_data` deve receber a variável base64 PURA — sem prefixo de
    // data URL. O prefixo `data:application/pdf;base64,` fazia o
    // request retornar 502 (Responses API espera base64 puro).
    const code = stripComments(edgeSource);
    expect(code).toMatch(/file_data:\s*base64Pdf/);
    expect(code).not.toMatch(/data:application\/pdf;base64,/);
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
    expect(code).toMatch(
      /\{\s*ok:\s*false\s*;\s*failure_code:\s*FailureCode\s*;\s*upstream_status:\s*number\s*\}/,
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
    expect(code).toMatch(
      /return errorResponse\(\s*"Falha na extração automática"\s*,\s*502\s*,\s*\{\s*\n\s*failure_code:\s*aiResult\.failure_code\s*,\s*\n\s*upstream_status:\s*aiResult\.upstream_status\s*,?\s*\n?\s*\}\s*\)/,
    );
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
    // O catch precisa ser vazio (sem bind do err).
    // Esperamos zero ocorrências de `err.message` / `error.message`.
    expect(code).not.toMatch(/\berr\.message\b/);
    expect(code).not.toMatch(/\berror\.message\b/);
    expect(code).not.toMatch(/\.stack\b/);
    // E nenhum log/body deve carregar `response.text()` (body cru da OpenAI).
    expect(code).not.toMatch(/response\.text\(\)/);
    // Defensivo extra: `data.error`, `data.output_text` etc. NÃO podem
    // aparecer dentro do PAYLOAD do logSafe (segundo argumento). A tag
    // string (1º argumento) tem liberdade pra usar `openai_no_text`,
    // `openai_bad_json` etc. — checamos apenas o payload.
    const logSafePayloads = [
      ...code.matchAll(/logSafe\(\s*"[^"]+"\s*,\s*(\{[^}]*\})\s*\)/g),
    ].map((m) => m[1]);
    expect(logSafePayloads.length).toBeGreaterThan(0);
    for (const payload of logSafePayloads) {
      expect(payload).not.toMatch(/data\./);
      // Bloqueia `text:` / `body:` / `parsed:` / `output:` como chaves,
      // mas permite `status:` etc.
      expect(payload).not.toMatch(/\btext\s*:/);
      expect(payload).not.toMatch(/\bbody\s*:/);
      expect(payload).not.toMatch(/\bparsed\s*:/);
      expect(payload).not.toMatch(/\boutput\s*:/);
      expect(payload).not.toMatch(/\bbase64\s*:/);
      expect(payload).not.toMatch(/\bprompt\s*:/);
    }
  });

  it("logSafe dos códigos de falha SÓ carrega status (zero detalhe adicional)", () => {
    // Padrão único: `logSafe("<tag>", { status: ... })`.
    expect(code).toMatch(
      /logSafe\(\s*"openai_exception"\s*,\s*\{\s*status:\s*0\s*\}\s*\)/,
    );
    expect(code).toMatch(
      /logSafe\(\s*"openai_error"\s*,\s*\{\s*status:\s*response\.status\s*\}\s*\)/,
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
  });
});

// ── DexaForm — toast permanece genérico (sem failure_code visível) ─────────

describe("DexaForm — toast permanece genérico após introdução de failure_code", () => {
  const code = stripComments(dexaFormSource);

  it("DexaForm NÃO lê failure_code/upstream_status do response da edge (toast não muda)", () => {
    // Hardening: o client não pode começar a EXIBIR esses códigos pro
    // coach. Eles existem apenas pra triagem técnica via Network tab.
    expect(code).not.toMatch(/\bfailure_code\b/);
    expect(code).not.toMatch(/\bupstream_status\b/);
  });

  it("toast de erro de extração continua usando string fixa 'Não foi possível ler o PDF automaticamente'", () => {
    expect(code).toContain("Não foi possível ler o PDF automaticamente");
  });
});
