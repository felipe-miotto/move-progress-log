/**
 * Source-based defensivo do script `scripts/smoke-dexa-extraction.mjs`.
 *
 * O script NÃO roda em CI nem é importado pelo app — é só pra coach
 * rodar local com PDFs reais. Mas a saída dele pode acabar colada em
 * issue/chat/ticket, então blindamos por construção os 3 vetores de
 * vazamento que a auditoria do PR #159 pegou:
 *
 *   1. nome do arquivo (basename) no log;
 *   2. `warnings` cruas no log (podem citar PII do laudo);
 *   3. `e.message` no `main().catch` (pode revelar path/token/stack).
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scriptPath = resolve(__dirname, "../smoke-dexa-extraction.mjs");
const scriptSource = readFileSync(scriptPath, "utf-8");

const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*\n/g, "");

describe("smoke-dexa-extraction.mjs — micro-hardening", () => {
  const code = stripComments(scriptSource);

  it("Fix 1: NÃO importa nem chama basename do node:path", () => {
    expect(code).not.toMatch(/from\s+"node:path"/);
    expect(code).not.toMatch(/\bbasename\s*\(/);
  });

  it("Fix 1: log do PDF usa só label posicional (PDF N), sem nome de arquivo", () => {
    // Header do reportOne: `=== ${label} ===` — sem ${basename(...)}.
    expect(code).toMatch(/`\\n=== \$\{label\} ===`/);
  });

  it("Fix 2: NÃO loga o array `warnings` cru (apenas a contagem)", () => {
    // O literal antigo era: `warnings: [${...warnings...}]`.
    expect(code).not.toMatch(/`\s*warnings:\s*\[/);
    // O novo é uma contagem inteira: `warnings_count: ${n}`.
    expect(code).toMatch(/warnings_count:/);
  });

  it("Fix 3: main().catch NÃO recebe parâmetro nem usa e.message/error.message", () => {
    expect(code).toMatch(/main\(\)\.catch\(\(\)\s*=>/);
    expect(code).not.toMatch(/main\(\)\.catch\(\(\s*e\s*\)/);
    expect(code).not.toMatch(/e\.message/);
    expect(code).not.toMatch(/error\.message/);
  });

  it("Fix 3: usa constante fixa SMOKE_GENERIC_FAILURE_MESSAGE no catch", () => {
    expect(code).toMatch(
      /const SMOKE_GENERIC_FAILURE_MESSAGE\s*=\s*\n?\s*"[^"]+"/,
    );
    expect(code).toMatch(
      /console\.error\(\s*SMOKE_GENERIC_FAILURE_MESSAGE\s*\)/,
    );
  });

  it("não escreve em disco / não envia pra Supabase / não usa storage", () => {
    expect(code).not.toMatch(/writeFile|writeFileSync/);
    expect(code).not.toMatch(/supabase/i);
    expect(code).not.toMatch(/localStorage|sessionStorage/);
  });

  it("PDFs reais aceitos só via argv (paths absolutos do usuário, nunca hardcoded)", () => {
    expect(code).toMatch(/process\.argv\.slice\(2\)/);
    // Nenhum caminho absoluto típico de usuário hardcoded no script.
    // O regex aceita espaços no path/nome do arquivo (ex.: "DEXA Alex.pdf"),
    // que o regex anterior `[^"\s]+` deixava passar.
    expect(scriptSource).not.toMatch(/\/Users\/[^"\n]+?\.pdf/);
    expect(scriptSource).not.toMatch(/\/home\/[^"\n]+?\.pdf/);
    // Bloqueia também nomes reais conhecidos, em qualquer contexto
    // (comentário, jsdoc, string), com ou sem path absoluto.
    expect(scriptSource).not.toMatch(/DEXA Alex/i);
    expect(scriptSource).not.toMatch(/DEXA Ana Paula/i);
  });

  it("file_data usa DATA URL (espelha o fix da edge — base64 puro foi rejeitado)", () => {
    // Smoke real (2026-05-18) confirmou que `file_data: <base64 puro>`
    // é rejeitado pela Responses API com HTTP 400 /
    // error.code="invalid_value". Voltamos pra data URL.
    expect(scriptSource).toMatch(
      /file_data:\s*`data:application\/pdf;base64,\$\{base64\}`/,
    );
    // Guard: não pode reaparecer `file_data: base64` puro.
    expect(scriptSource).not.toMatch(/file_data:\s*base64\s*,/);
  });

  it("schema tem `required` nos sub-objetos de regional_distribution.value (strict-compatible)", () => {
    // OpenAI strict mode exige `required` cobrindo TODAS as properties
    // quando `additionalProperties: false`. Espelha o fix da edge.
    expect(scriptSource).toMatch(
      /required:\s*\[\s*\.\.\.\s*DEXA_REGION_KEYS\s*\]/,
    );
    expect(scriptSource).toMatch(
      /required:\s*\[\s*"fat_pct"\s*,\s*"lean_mass_g"\s*,\s*"fat_mass_g"\s*\]/,
    );
  });
});
