/**
 * Source-based defensivo do `DexaPdfButton`.
 *
 * Histórico:
 *   - PR #157: abria signedUrl direto → Chrome com extensão de privacy
 *     disparava `ERR_BLOCKED_BY_CLIENT` em `*.supabase.co`.
 *   - PR #166: trocou pra `window.open(blobUrl, "_blank", ...)` (mesma
 *     origem, escapava do filtro de host). Funcionou em bench mas o
 *     mesmo Chrome do usuário também bloqueou aba `blob:` em algumas
 *     configurações.
 *   - PR ATUAL: substitui `window.open` por DOWNLOAD EXPLÍCITO via
 *     `<a download>` programático — navegador trata como ação local
 *     em arquivo, sem abrir aba, sem expor URL na barra de endereço,
 *     sem filtro de host envolvido.
 *
 * Estas asserções TRAVAM a regressão por construção. Padrão coverage-
 * test sem DOM/jsdom (alinhado com `useDexaPdfSignedUrl.coverage.test.ts`).
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const buttonPath = resolve(__dirname, "../DexaPdfButton.tsx");
const buttonSource = readFileSync(buttonPath, "utf-8");

const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*\n/g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("DexaPdfButton — download explícito via <a download> (fix ERR_BLOCKED_BY_CLIENT)", () => {
  const code = stripComments(buttonSource);

  it("usa useDexaPdfSignedUrl pra obter o signedUrl (acesso ao bucket privado)", () => {
    expect(code).toMatch(/useDexaPdfSignedUrl/);
    expect(code).toMatch(/const\s*\{\s*sign[^}]*\}\s*=\s*useDexaPdfSignedUrl\(\)/);
  });

  it("NÃO usa window.open em lugar nenhum (zero abertura de aba)", () => {
    // Regression guard contra PR #157 (window.open(signedUrl)) E
    // PR #166 (window.open(blobUrl)). QUALQUER window.open é proibido
    // — o ambiente do usuário bloqueia.
    expect(code).not.toMatch(/window\.open\(/);
  });

  it("baixa o PDF via fetch(signedUrl) e converte em Blob", () => {
    expect(code).toMatch(/await\s+fetch\(\s*signedUrl\s*\)/);
    expect(code).toMatch(/await\s+response\.blob\(\)/);
  });

  it("valida response.ok antes de prosseguir (não converte body de erro em blob)", () => {
    expect(code).toMatch(/if\s*\(\s*!response\.ok\s*\)/);
  });

  it("força MIME type application/pdf no Blob (storage pode devolver octet-stream)", () => {
    expect(code).toMatch(/new\s+Blob\([\s\S]*?type:\s*["']application\/pdf["']/);
  });

  it("cria blob URL local via URL.createObjectURL", () => {
    expect(code).toMatch(/URL\.createObjectURL\(\s*pdfBlob\s*\)/);
  });

  it("dispara download via <a download> programático (createElement → href → download → click)", () => {
    expect(code).toMatch(/document\.createElement\(\s*["']a["']\s*\)/);
    expect(code).toMatch(/\.href\s*=\s*blobUrl/);
    expect(code).toMatch(/\.download\s*=\s*DEXA_PDF_DOWNLOAD_FILENAME/);
    expect(code).toMatch(/\.click\(\)/);
  });

  it("nome de arquivo é constante NEUTRA (sem student_id, nome, data — zero PII)", () => {
    expect(code).toMatch(
      /const\s+DEXA_PDF_DOWNLOAD_FILENAME\s*=\s*["']laudo-dexa\.pdf["']/,
    );
    // Defesa: nenhum interpolation de storagePath/studentId/sex/name
    // no filename.
    const filenameAssignments = [
      ...code.matchAll(/\.download\s*=\s*[^;]+;/g),
    ].map((m) => m[0]);
    expect(filenameAssignments.length).toBeGreaterThan(0);
    for (const stmt of filenameAssignments) {
      expect(stmt).not.toMatch(/\bstoragePath\b/);
      expect(stmt).not.toMatch(/\bstudent/i);
    }
  });

  it("anexa/remove <a> do DOM ao redor do .click() (padrão cross-browser)", () => {
    expect(code).toMatch(/document\.body\.appendChild\(\s*a\s*\)/);
    expect(code).toMatch(/document\.body\.removeChild\(\s*a\s*\)/);
  });

  it("revoga o blob URL no finally (sucesso OU erro — não vaza memória)", () => {
    expect(code).toMatch(/URL\.revokeObjectURL\(/);
    // O revoke acontece dentro do `finally` bloco — garantia de
    // execução em qualquer caminho.
    expect(code).toMatch(
      /\}\s*finally\s*\{[\s\S]*?URL\.revokeObjectURL\(\s*blobUrl\s*\)/,
    );
  });

  it("setTimeout NÃO é usado pra revogar (não há aba consumindo — revoga já no finally)", () => {
    // Diferente do PR #166 (que precisava de delay porque a aba
    // estava renderizando o blob). Download dispara em instante, o
    // browser segura o byte stream durante o save — revoga agora.
    expect(code).not.toMatch(/setTimeout\([^)]*revokeObjectURL/);
  });

  it("se fetch/blob falhar, toast genérico (sem expor URL/path/token via err.message)", () => {
    expect(code).toMatch(/\}\s*catch\s*\{/);
    expect(code).not.toMatch(/\berr\.message\b/);
    expect(code).not.toMatch(/\berror\.message\b/);
    expect(code).not.toMatch(/\.stack\b/);
  });

  it("toast usa constantes humanas fixas (zero interpolação de URL/path/token)", () => {
    expect(code).toMatch(/const\s+DEXA_PDF_DOWNLOAD_ERROR_TITLE\s*=\s*"[^"]+"/);
    expect(code).toMatch(
      /const\s+DEXA_PDF_DOWNLOAD_GENERIC_DESCRIPTION\s*=\s*"[^"]+"/,
    );
    // Cada notify.error é uma statement que termina em `;`. Escopamos
    // os checks de ausência dentro dos ARGUMENTOS de cada call (entre
    // `(` e `;`), pra não bater em ocorrências legítimas de
    // signedUrl/blobUrl/storagePath em código posterior.
    const notifyErrorCalls = [
      ...code.matchAll(/notify\.error\([^;]*?\);/g),
    ].map((m) => m[0]);
    expect(notifyErrorCalls.length).toBeGreaterThan(0);
    for (const call of notifyErrorCalls) {
      expect(call).not.toMatch(/\bsignedUrl\b/);
      expect(call).not.toMatch(/\bblobUrl\b/);
      expect(call).not.toMatch(/\bstoragePath\b/);
      expect(call).not.toMatch(/\btoken\b/);
    }
  });

  it("NÃO persiste signedUrl/blobUrl/path em localStorage/sessionStorage", () => {
    expect(code).not.toMatch(/\blocalStorage\b/);
    expect(code).not.toMatch(/\bsessionStorage\b/);
    expect(code).not.toMatch(/\bIndexedDB\b/);
    expect(code).not.toMatch(/\bdocument\.cookie\b/);
  });

  it("NÃO loga signedUrl/blobUrl/path/token via console.*", () => {
    expect(code).not.toMatch(/console\.(log|info|warn|error|debug)/);
  });

  it("estado de loading composto (sign + fetch) — botão fica disabled durante a etapa de fetch", () => {
    expect(code).toMatch(/setIsFetching/);
    expect(code).toMatch(/disabled=\{isLoading\}/);
  });

  it("CTA: label do botão é 'Baixar laudo DEXA' (não 'Abrir')", () => {
    expect(code).toMatch(/"Baixar laudo DEXA"/);
    expect(code).not.toMatch(/"Abrir laudo DEXA"/);
  });

  it("CTA loading: 'Preparando download…' (não 'Abrindo…')", () => {
    expect(code).toMatch(/"Preparando download…"/);
    expect(code).not.toMatch(/"Abrindo…"/);
  });

  it("aria-label do botão reflete a ação real ('Baixar laudo DEXA')", () => {
    expect(code).toMatch(/aria-label="Baixar laudo DEXA"/);
    expect(code).not.toMatch(/aria-label="Abrir laudo DEXA[^"]*"/);
  });

  it("storagePath vazio/null/undefined renderiza estado 'sem PDF' (zero botão exposto)", () => {
    expect(code).toMatch(/data-testid="dexa-pdf-empty"/);
    expect(code).toMatch(/Laudo DEXA ainda não anexado/);
  });

  it("read-only absoluto: zero insert/update/delete/upsert/rpc/invoke/useMutation", () => {
    expect(code).not.toMatch(/\.insert\(/);
    expect(code).not.toMatch(/\.update\(/);
    expect(code).not.toMatch(/\.delete\(/);
    expect(code).not.toMatch(/\.upsert\(/);
    expect(code).not.toMatch(/\.rpc\(/);
    expect(code).not.toMatch(/functions\.invoke/);
    expect(code).not.toMatch(/\buseMutation\b/);
  });
});
