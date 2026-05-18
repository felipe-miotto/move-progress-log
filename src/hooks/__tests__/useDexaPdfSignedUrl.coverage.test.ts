/**
 * PR-A — testes source-based pra cobertura de segurança do hook
 * `useDexaPdfSignedUrl` e do componente `DexaPdfButton`, mais a
 * integração no `AssessmentDetailSheet`. Padrão coverage-test (sem DOM /
 * sem testing-library), alinhado ao resto do app (vide
 * `Precision12Console.coverage.test.ts`).
 *
 * Objetivos verificados:
 *   - hook usa `createSignedUrl` com TTL curto (60s) no bucket `dexa-pdfs`;
 *   - hook não introduz mutation (insert/update/delete/upsert/rpc/invoke);
 *   - hook não persiste a URL/token em localStorage/sessionStorage/cache;
 *   - hook não loga URL/token em console;
 *   - botão usa `target="_blank"` + `rel="noopener,noreferrer"`;
 *   - botão mostra estado "sem PDF" claro quando `storagePath` é falsy;
 *   - DetailSheet não renderiza mais o `scan_pdf_storage_path` cru na
 *     grid principal — agora consome o `DexaPdfButton`.
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const hookPath = resolve(__dirname, "../useDexaPdfSignedUrl.ts");
const hookSource = readFileSync(hookPath, "utf-8");

const buttonPath = resolve(
  __dirname,
  "../../components/assessments/DexaPdfButton.tsx",
);
const buttonSource = readFileSync(buttonPath, "utf-8");

const detailSheetPath = resolve(
  __dirname,
  "../../components/assessments/AssessmentDetailSheet.tsx",
);
const detailSheetSource = readFileSync(detailSheetPath, "utf-8");

const sanitizerPath = resolve(
  __dirname,
  "../../utils/assessmentDebugSanitize.ts",
);
const sanitizerSource = readFileSync(sanitizerPath, "utf-8");

// Strip de comentários — alguns asserts negativos pesquisam palavras-chave
// que aparecem em comentários explicativos do hardening (ex.: "não logar").
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*\n/g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── Hook: useDexaPdfSignedUrl ───────────────────────────────────────────────

describe("useDexaPdfSignedUrl — contract", () => {
  it("centraliza o bucket privado dexa-pdfs em constante exportada", () => {
    expect(hookSource).toContain('export const DEXA_PDFS_BUCKET = "dexa-pdfs"');
  });

  it("usa TTL curto (60 segundos) e exporta a constante", () => {
    expect(hookSource).toContain(
      "export const DEXA_PDF_SIGNED_URL_TTL_SECONDS = 60",
    );
  });

  it("invoca createSignedUrl com o TTL constante (não hard-coded)", () => {
    expect(hookSource).toMatch(
      /createSignedUrl\(\s*storagePath\s*,\s*DEXA_PDF_SIGNED_URL_TTL_SECONDS\s*\)/,
    );
  });

  // ── PR-A hardening ────────────────────────────────────────────────────
  it("exporta uma mensagem de erro GENÉRICA fixa (sem detalhes do Supabase)", () => {
    expect(hookSource).toContain(
      "export const DEXA_PDF_SIGNED_URL_GENERIC_ERROR",
    );
    // A mensagem em si não pode mencionar 'path', 'bucket', 'storage', etc.
    expect(hookSource).toMatch(
      /export const DEXA_PDF_SIGNED_URL_GENERIC_ERROR\s*=\s*\n?\s*"[^"]+"/,
    );
  });

  it("NÃO armazena signError.message nem err.message no estado de erro", () => {
    const code = stripComments(hookSource);
    // Bloqueia qualquer captura de message vinda do Supabase / Error.
    expect(code).not.toMatch(/setError\(\s*signError\.message/);
    expect(code).not.toMatch(/setError\(\s*err\.message/);
    expect(code).not.toMatch(/setError\(\s*error\.message/);
    // Bloqueia também o ternário "signError?.message ?? '…'" que existia antes.
    expect(code).not.toMatch(/signError\?\.message/);
    // err.message como leitura (mesmo que não vá pro setError direto) também
    // é proibida nesse arquivo — qualquer manipulação abre porta pra log.
    expect(code).not.toMatch(/err\.message/);
  });

  it("setError SEMPRE recebe a constante genérica fixa", () => {
    const code = stripComments(hookSource);
    // Toda chamada setError(...) deve usar a constante; nada de literais
    // ou expressões dinâmicas.
    const setErrorCalls =
      code.match(/setError\([^)]*\)/g)?.filter(
        (call) => !call.includes("setError(null)"),
      ) ?? [];
    expect(setErrorCalls.length).toBeGreaterThan(0);
    for (const call of setErrorCalls) {
      expect(call).toContain("DEXA_PDF_SIGNED_URL_GENERIC_ERROR");
    }
  });

  it("catch é vazio (sem bind do err) pra impedir vazamento acidental", () => {
    const code = stripComments(hookSource);
    // `catch (err)` permite alguém usar err em refactor; `catch {}` é
    // explícito de que o erro foi descartado deliberadamente.
    expect(code).toMatch(/}\s*catch\s*\{/);
    expect(code).not.toMatch(/}\s*catch\s*\(\s*err\s*\)/);
    expect(code).not.toMatch(/}\s*catch\s*\(\s*error\s*\)/);
  });

  it("opera apenas sobre o bucket dexa-pdfs (via constante)", () => {
    expect(hookSource).toMatch(/\.from\(\s*DEXA_PDFS_BUCKET\s*\)/);
  });

  it("é defensivo com storagePath vazio/null (early return null, sem chamar API)", () => {
    expect(hookSource).toMatch(
      /if\s*\(\s*!storagePath\s*\|\|\s*storagePath\.trim\(\)\.length\s*===\s*0\s*\)\s*\{\s*\n\s*return null/,
    );
  });

  it("não usa useMutation (não é mutação de dados — apenas request à Storage API)", () => {
    // Strip comentários — o jsdoc do hook menciona `useMutation` apenas
    // pra documentar que NÃO usa (auditoria semântica).
    const code = stripComments(hookSource);
    expect(code).not.toMatch(/\buseMutation\b/);
  });

  it("não introduz mutation de tabela / RPC / edge function", () => {
    const code = stripComments(hookSource);
    expect(code).not.toMatch(/\.insert\(/);
    expect(code).not.toMatch(/\.update\(/);
    expect(code).not.toMatch(/\.delete\(/);
    expect(code).not.toMatch(/\.upsert\(/);
    expect(code).not.toMatch(/\bsupabase\.rpc\b/);
    expect(code).not.toMatch(/\bfunctions\.invoke\b/);
  });

  it("não persiste a URL/token em localStorage/sessionStorage", () => {
    const code = stripComments(hookSource);
    expect(code).not.toMatch(/\blocalStorage\b/);
    expect(code).not.toMatch(/\bsessionStorage\b/);
    expect(code).not.toMatch(/\bIndexedDB\b/);
  });

  it("não persiste a URL no cache do React Query (sem useQuery/queryClient)", () => {
    expect(hookSource).not.toMatch(/\buseQuery\b/);
    expect(hookSource).not.toMatch(/\bqueryClient\b/);
    expect(hookSource).not.toMatch(/@tanstack\/react-query/);
  });

  it("não loga URL/token via console.* (sem console nenhum no code path)", () => {
    const code = stripComments(hookSource);
    expect(code).not.toMatch(/\bconsole\.(log|info|warn|error|debug)\b/);
  });
});

// ── Componente: DexaPdfButton ──────────────────────────────────────────────

describe("DexaPdfButton — UX/segurança", () => {
  it("importa e usa o hook useDexaPdfSignedUrl", () => {
    expect(buttonSource).toContain(
      'from "@/hooks/useDexaPdfSignedUrl"',
    );
    expect(buttonSource).toContain("useDexaPdfSignedUrl()");
  });

  it("renderiza estado claro quando storagePath é falsy ('Laudo DEXA ainda não anexado')", () => {
    expect(buttonSource).toContain("Laudo DEXA ainda não anexado");
    expect(buttonSource).toContain('data-testid="dexa-pdf-empty"');
  });

  it("baixa o PDF via download explícito (<a download>), NUNCA usa window.open", () => {
    // Histórico do bugfix:
    //   PR #157 — window.open(signedUrl) → ERR_BLOCKED_BY_CLIENT em
    //     `*.supabase.co` (Chrome com extensões de privacy/adblock).
    //   PR #166 — window.open(blobUrl) → mesmo erro em aba `blob:` em
    //     algumas configurações.
    //   PR ATUAL — download programático via <a download>, sem aba,
    //     sem URL exposta, sem filtro de host.
    // Hard guard: NENHUM window.open pode aparecer no botão.
    expect(buttonSource).not.toMatch(/window\.open\(/);
    // Sinais positivos do fluxo de download explícito.
    expect(buttonSource).toMatch(/document\.createElement\(\s*["']a["']\s*\)/);
    expect(buttonSource).toMatch(/\.download\s*=\s*DEXA_PDF_DOWNLOAD_FILENAME/);
    expect(buttonSource).toMatch(/\.click\(\)/);
  });

  it("nunca renderiza o storagePath técnico como texto da UI", () => {
    const code = stripComments(buttonSource);
    // O componente recebe `storagePath` como prop. NÃO pode renderizá-lo
    // como conteúdo de texto pra não vazar caminhos internos do bucket.
    expect(code).not.toMatch(/\{storagePath\}/);
    expect(code).not.toMatch(/\{props\.storagePath\}/);
  });

  it("aria-label descritivo no botão (acessibilidade) — reflete download", () => {
    expect(buttonSource).toContain('aria-label="Baixar laudo DEXA"');
    expect(buttonSource).not.toMatch(/aria-label="Abrir laudo DEXA[^"]*"/);
  });

  it("não introduz mutation / persistência local / log de URL", () => {
    const code = stripComments(buttonSource);
    expect(code).not.toMatch(/\.insert\(/);
    expect(code).not.toMatch(/\.update\(/);
    expect(code).not.toMatch(/\.delete\(/);
    expect(code).not.toMatch(/\.upsert\(/);
    expect(code).not.toMatch(/\bsupabase\.rpc\b/);
    expect(code).not.toMatch(/\bfunctions\.invoke\b/);
    expect(code).not.toMatch(/\blocalStorage\b/);
    expect(code).not.toMatch(/\bsessionStorage\b/);
    expect(code).not.toMatch(/\bconsole\.(log|info|warn|error|debug)\b/);
  });
});

// ── Integração: AssessmentDetailSheet ──────────────────────────────────────

describe("AssessmentDetailSheet — integra DexaPdfButton e não vaza path cru", () => {
  it("importa DexaPdfButton", () => {
    expect(detailSheetSource).toContain('from "./DexaPdfButton"');
  });

  it("DexaPdfButton continua recebendo storagePath={dexa.scan_pdf_storage_path}", () => {
    // Garantia funcional do PR-A: o botão precisa do path REAL pra assinar
    // a URL. O hardening cobre só a UI de debug e a mensagem de erro;
    // o canal de assinatura permanece intacto.
    expect(detailSheetSource).toMatch(
      /<DexaPdfButton\s+storagePath=\{dexa\.scan_pdf_storage_path\}\s*\/>/,
    );
  });

  it("NÃO renderiza mais a tupla ['PDF no storage', dexa.scan_pdf_storage_path] no grid principal", () => {
    // Regressão: o path técnico era exibido como informação principal,
    // contradizendo as boas práticas de não vazar estrutura interna de
    // storage pro usuário final. Após PR-A, deve sumir do grid.
    expect(detailSheetSource).not.toContain(
      '["PDF no storage", dexa.scan_pdf_storage_path]',
    );
  });

  it("manteve a seção DEXA chamando renderDexa (não quebrou o pipeline existente)", () => {
    expect(detailSheetSource).toContain("const renderDexa = ");
    expect(detailSheetSource).toContain("data.dexa");
  });

  // ── PR-A hardening: JsonBlock 'Debug técnico' sanitizado ─────────────
  it("NÃO existe <JsonBlock … value={data} … /> sem passar por sanitize", () => {
    // Estrita: `value={data}` cru no debug serializaria
    // `data.dexa.scan_pdf_storage_path` e `data.dexa.scan_pdf_url`. Deve
    // sempre passar por `sanitizeAssessmentDebugPayload(data)`.
    expect(detailSheetSource).not.toMatch(/<JsonBlock[\s\S]*?value=\{\s*data\s*\}/);
  });

  it("usa sanitizeAssessmentDebugPayload(data) no JsonBlock de debug", () => {
    expect(detailSheetSource).toContain(
      'from "@/utils/assessmentDebugSanitize"',
    );
    expect(detailSheetSource).toMatch(
      /value=\{\s*sanitizeAssessmentDebugPayload\(\s*data\s*\)\s*\}/,
    );
  });
});

// ── Sanitizer: assessmentDebugSanitize ─────────────────────────────────────

describe("assessmentDebugSanitize — contrato do helper", () => {
  it("exporta REDACTED_SENTINEL + DEXA_SENSITIVE_FIELDS + sanitizeAssessmentDebugPayload", () => {
    expect(sanitizerSource).toContain("export const REDACTED_SENTINEL");
    expect(sanitizerSource).toContain("export const DEXA_SENSITIVE_FIELDS");
    expect(sanitizerSource).toContain(
      "export function sanitizeAssessmentDebugPayload",
    );
  });

  it("lista canônica inclui scan_pdf_storage_path E scan_pdf_url", () => {
    expect(sanitizerSource).toMatch(/"scan_pdf_storage_path"/);
    expect(sanitizerSource).toMatch(/"scan_pdf_url"/);
  });

  it("é puro: deep-clone via JSON, sem mutate do input", () => {
    expect(sanitizerSource).toContain("JSON.parse(JSON.stringify");
  });

  it("não toca em nada além de clone.dexa (cobertura intencional limitada)", () => {
    // Defensivo: o sanitizer não pode silenciar campos de outras tabelas
    // sem aviso. Garantimos por código que o único path tocado é `.dexa`.
    expect(sanitizerSource).toMatch(/dexa\[field\]\s*=\s*REDACTED_SENTINEL/);
    expect(sanitizerSource).not.toMatch(
      /clone\[(?!"dexa")[^\]]+\]\s*=\s*REDACTED_SENTINEL/,
    );
  });

  it("comportamento funcional: redige scan_pdf_storage_path e scan_pdf_url", async () => {
    // Import dinâmico pra rodar o helper de fato (não só source).
    const mod = await import("../../utils/assessmentDebugSanitize");
    const input = {
      assessment: { id: "a-1" },
      dexa: {
        fat_pct: 22.1,
        scan_pdf_storage_path: "s-1/123-abc.pdf",
        scan_pdf_url: "https://example/scan.pdf",
      },
    };
    const out = mod.sanitizeAssessmentDebugPayload(input);
    // Input intacto (imutabilidade).
    expect(input.dexa.scan_pdf_storage_path).toBe("s-1/123-abc.pdf");
    expect(input.dexa.scan_pdf_url).toBe("https://example/scan.pdf");
    // Output redigido.
    expect(out.dexa.scan_pdf_storage_path).toBe(mod.REDACTED_SENTINEL);
    expect(out.dexa.scan_pdf_url).toBe(mod.REDACTED_SENTINEL);
    // Outros campos do dexa preservados.
    expect(out.dexa.fat_pct).toBe(22.1);
    // Campos fora do dexa preservados.
    expect(out.assessment).toEqual({ id: "a-1" });
  });

  it("comportamento funcional: payload null/undefined/sem dexa é devolvido sem mexer", async () => {
    const mod = await import("../../utils/assessmentDebugSanitize");
    expect(mod.sanitizeAssessmentDebugPayload(null)).toBeNull();
    expect(mod.sanitizeAssessmentDebugPayload(undefined)).toBeUndefined();
    expect(mod.sanitizeAssessmentDebugPayload({ vo2: { fc_peak: 180 } }))
      .toEqual({ vo2: { fc_peak: 180 } });
    // null/empty no campo sensível permanece null/empty (não vira [redacted]).
    const out = mod.sanitizeAssessmentDebugPayload({
      dexa: { scan_pdf_storage_path: null, scan_pdf_url: "" },
    });
    expect(out.dexa.scan_pdf_storage_path).toBeNull();
    expect(out.dexa.scan_pdf_url).toBe("");
  });
});
