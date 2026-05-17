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
    expect(edgeSource).toContain("data:application/pdf;base64,");
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

describe("config.toml — extract-dexa-pdf registrada com verify_jwt=true", () => {
  it("entry [functions.extract-dexa-pdf] presente", () => {
    expect(configSource).toMatch(
      /\[functions\.extract-dexa-pdf\]\s*\nverify_jwt = true/,
    );
  });
});
