/**
 * Source-based defensivo do script `scripts/dexa-pdf-orphans-audit.mjs`.
 *
 * O script NÃO roda em CI. É admin tool standalone pra coach limpar
 * PDFs órfãos do bucket `dexa-pdfs`. Por construir uma operação
 * DESTRUTIVA (delete), blindamos por testes-source que o script:
 *
 *   1. Defaults seguros (dry-run por padrão, threshold conservador);
 *   2. Delete EXIGE flag explícita `--confirm-delete`;
 *   3. JAMAIS deleta arquivo referenciado em `dexa_results`;
 *   4. NÃO loga signed URL/token/PDF bytes/nome real de aluno;
 *   5. Catch genérico (sem `e.message` / stack).
 *
 * Cobertura comportamental adicional vem dos testes unit da função
 * pura `selectOrphanCandidates` (importada em runtime).
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

import { selectOrphanCandidates } from "../dexa-pdf-orphans-audit.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scriptPath = resolve(__dirname, "../dexa-pdf-orphans-audit.mjs");
const scriptSource = readFileSync(scriptPath, "utf-8");

const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*\n/g, "");

describe("dexa-pdf-orphans-audit.mjs — segurança e defaults", () => {
  const code = stripComments(scriptSource);

  it("usa SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY via env (zero hardcoded)", () => {
    expect(code).toMatch(/process\.env\.SUPABASE_URL/);
    expect(code).toMatch(/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    // Nenhuma URL/key hardcoded.
    expect(code).not.toMatch(/https:\/\/[a-z0-9]+\.supabase\.co/);
    expect(code).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
  });

  it("dry-run é o DEFAULT — delete exige `--confirm-delete` explícito", () => {
    expect(code).toMatch(/const\s+CONFIRM_DELETE_FLAG\s*=\s*"--confirm-delete"/);
    // O flag é checado em argv.
    expect(code).toMatch(/argv\.includes\(\s*CONFIRM_DELETE_FLAG\s*\)/);
    // E ENV VAR (que poderia ser configurada acidentalmente) NÃO
    // ativa delete. Garantia explícita: apenas argv flag.
    expect(code).not.toMatch(/process\.env\.\w*CONFIRM_DELETE/);
    expect(code).not.toMatch(/process\.env\.\w*DELETE_CONFIRMED/);
  });

  it("threshold de idade padrão é >= 24h (janela conservadora)", () => {
    expect(code).toMatch(/const\s+DEFAULT_AGE_THRESHOLD_HOURS\s*=\s*24/);
    expect(code).toMatch(/const\s+MIN_AGE_THRESHOLD_HOURS\s*=\s*1/);
    // Sanity: max está definido pra evitar overflow numérico.
    expect(code).toMatch(/const\s+MAX_AGE_THRESHOLD_HOURS\s*=/);
  });

  it("guard explícito antes do delete: nenhum candidate pode estar referenciado", () => {
    // Defesa em profundidade — após o select já filtrar, re-verificamos
    // antes de chamar `deleteOrphans`.
    expect(code).toMatch(
      /for\s*\([\s\S]*?of\s+candidates\)\s*\{\s*\n\s*if\s*\(\s*referencedPaths\.has\(c\.path\)\s*\)/,
    );
    expect(code).toMatch(/Guard tripped/i);
  });

  it("usa `.not(\"scan_pdf_storage_path\", \"is\", null)` ao montar set de referenciados", () => {
    expect(code).toMatch(
      /\.from\("dexa_results"\)[\s\S]*?\.select\("scan_pdf_storage_path"\)[\s\S]*?\.not\("scan_pdf_storage_path"\s*,\s*"is"\s*,\s*null\)/,
    );
  });

  it("bucket alvo é EXCLUSIVAMENTE `dexa-pdfs` (nenhum outro)", () => {
    expect(code).toMatch(/const\s+BUCKET_ID\s*=\s*"dexa-pdfs"/);
    // Não há referência a buckets vizinhos que possam ser apagados
    // por engano.
    expect(code).not.toMatch(/student-avatars/);
    expect(code).not.toMatch(/oura-/);
  });

  it("output mascara UUIDs (não vaza student_id inteiro)", () => {
    expect(code).toMatch(/function maskUuidLike\(/);
    // Usada em pelo menos uma chamada (no log do candidate).
    expect(code).toMatch(/maskUuidLike\(c\.path\)/);
  });

  it("NÃO loga signed URL / token / response.text / PDF bytes / e.message", () => {
    expect(code).not.toMatch(/createSignedUrl/);
    expect(code).not.toMatch(/\bsignedUrl\b/);
    expect(code).not.toMatch(/\bsigned_url\b/);
    expect(code).not.toMatch(/response\.text\(\)/);
    expect(code).not.toMatch(/\barrayBuffer\(\)/);
    expect(code).not.toMatch(/\.toString\(\s*["']base64["']\s*\)/);
    expect(code).not.toMatch(/\be\.message\b/);
    expect(code).not.toMatch(/\berror\.message\b/);
    expect(code).not.toMatch(/\.stack\b/);
  });

  it("catch do main usa mensagem genérica FIXA (sem err parameter)", () => {
    expect(code).toMatch(/main\(\)\.catch\(\(\)\s*=>/);
    expect(code).not.toMatch(/main\(\)\.catch\(\(\s*e\s*\)/);
    expect(code).toMatch(
      /const\s+AUDIT_GENERIC_FAILURE_MESSAGE\s*=\s*\n?\s*"[^"]+"/,
    );
    expect(code).toMatch(
      /console\.error\(\s*AUDIT_GENERIC_FAILURE_MESSAGE\s*\)/,
    );
  });

  it("read-only no banco: zero insert/update/upsert/rpc (só select + storage.remove com flag)", () => {
    expect(code).not.toMatch(/\.insert\(/);
    expect(code).not.toMatch(/\.update\(/);
    expect(code).not.toMatch(/\.upsert\(/);
    expect(code).not.toMatch(/\brpc\(/);
    expect(code).not.toMatch(/functions\.invoke/);
    // O único `.remove(` é no helper de delete, condicionado ao flag.
    const removes = code.match(/\.remove\(/g) ?? [];
    expect(removes.length).toBe(1);
  });

  it("storage.remove só é chamado DEPOIS do guard de confirmDelete + guard referenced", () => {
    // Localiza a definição da função `deleteOrphans`.
    expect(code).toMatch(/async function deleteOrphans\(/);
    // E ela só é invocada dentro do bloco `if (confirmDelete)` lógico —
    // procuramos por `await deleteOrphans` precedido (em algum ponto
    // anterior) por `confirmDelete` e `Guard tripped`.
    const invokeIdx = code.indexOf("await deleteOrphans");
    const confirmCheckIdx = code.indexOf("argv.includes(\n");
    const altConfirmCheckIdx = code.indexOf("argv.includes( CONFIRM_DELETE_FLAG");
    const anyConfirmIdx = Math.max(
      code.indexOf("argv.includes(CONFIRM_DELETE_FLAG"),
      confirmCheckIdx,
      altConfirmCheckIdx,
    );
    expect(invokeIdx).toBeGreaterThan(-1);
    expect(anyConfirmIdx).toBeGreaterThan(-1);
    expect(invokeIdx).toBeGreaterThan(anyConfirmIdx);
  });

  it("exporta `selectOrphanCandidates` (função pura, testável)", () => {
    expect(code).toMatch(/export function selectOrphanCandidates\(/);
  });
});

// ── selectOrphanCandidates — comportamento puro ────────────────────────────

describe("selectOrphanCandidates — set difference + threshold", () => {
  const NOW = 1_770_000_000_000; // valor fixo, determinístico
  const THRESHOLD_24H_MS = 24 * 3_600_000;

  function obj(path: string, ageMs: number, size = 100_000) {
    return { path, createdAt: NOW - ageMs, size };
  }

  it("candidato órfão + antigo o suficiente → entra na lista", () => {
    const result = selectOrphanCandidates({
      bucketObjects: [obj("uuid1/123-a.pdf", 48 * 3_600_000)], // 2 dias atrás
      referencedPaths: new Set<string>(),
      nowMs: NOW,
      thresholdMs: THRESHOLD_24H_MS,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].path).toBe("uuid1/123-a.pdf");
    expect(result.referencedCount).toBe(0);
    expect(result.tooYoungCount).toBe(0);
  });

  it("referenciado em dexa_results NUNCA entra (mesmo se for antigo)", () => {
    const result = selectOrphanCandidates({
      bucketObjects: [obj("uuid1/123-a.pdf", 365 * 24 * 3_600_000)], // 1 ano
      referencedPaths: new Set<string>(["uuid1/123-a.pdf"]),
      nowMs: NOW,
      thresholdMs: THRESHOLD_24H_MS,
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.referencedCount).toBe(1);
  });

  it("mais novo que o threshold NÃO entra (mesmo se órfão)", () => {
    const result = selectOrphanCandidates({
      bucketObjects: [obj("uuid1/123-a.pdf", 1 * 3_600_000)], // 1h atrás
      referencedPaths: new Set<string>(),
      nowMs: NOW,
      thresholdMs: THRESHOLD_24H_MS,
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.tooYoungCount).toBe(1);
  });

  it("sem createdAt confiável → CONSERVADOR, NÃO entra", () => {
    const result = selectOrphanCandidates({
      bucketObjects: [{ path: "uuid1/123-a.pdf", createdAt: null, size: 0 }],
      referencedPaths: new Set<string>(),
      nowMs: NOW,
      thresholdMs: THRESHOLD_24H_MS,
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.tooYoungCount).toBe(1);
  });

  it("mix realista: 1 órfão antigo + 1 referenciado + 1 órfão recente → só o primeiro entra", () => {
    const result = selectOrphanCandidates({
      bucketObjects: [
        obj("uuid1/orphan-old.pdf", 48 * 3_600_000),
        obj("uuid2/refed.pdf", 100 * 3_600_000),
        obj("uuid3/orphan-recent.pdf", 2 * 3_600_000),
      ],
      referencedPaths: new Set<string>(["uuid2/refed.pdf"]),
      nowMs: NOW,
      thresholdMs: THRESHOLD_24H_MS,
    });
    expect(result.candidates.map((c) => c.path)).toEqual([
      "uuid1/orphan-old.pdf",
    ]);
    expect(result.referencedCount).toBe(1);
    expect(result.tooYoungCount).toBe(1);
  });

  it("set vazio in → set vazio out", () => {
    const result = selectOrphanCandidates({
      bucketObjects: [],
      referencedPaths: new Set<string>(),
      nowMs: NOW,
      thresholdMs: THRESHOLD_24H_MS,
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.referencedCount).toBe(0);
    expect(result.tooYoungCount).toBe(0);
  });
});
