/**
 * Source-based coverage da migration `fix_oura_token_rpc_service_role`.
 *
 * Contexto: a migration 20260507190000_harden_oura_token_rpc_auth_guard.sql
 * passou a detectar service_role via `current_setting('request.jwt.claim.role')`
 * — GUC que não é populado de forma confiável. Resultado: as chamadas
 * service_role da edge `oura-sync` caíam no branch `auth.uid() IS NULL` e eram
 * rejeitadas com SQLSTATE 42501, quebrando a leitura/refresh de tokens Oura.
 *
 * Esta migration restaura o guard seguro para service_role. Os testes abaixo
 * travam os invariantes de segurança sem precisar de um Postgres — mesmo
 * padrão dos demais *.coverage.test.ts (readFileSync + asserts no fonte).
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/20260521194447_fix_oura_token_rpc_service_role.sql",
);
const migrationSql = readFileSync(migrationPath, "utf-8");

/** Migration sem comentários SQL — usado nas asserts de "não deve conter". */
const codeOnly = migrationSql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");
const codeLower = codeOnly.toLowerCase();

const TOKEN_FUNCTIONS = [
  "public.get_oura_access_token(uuid)",
  "public.get_oura_refresh_token(uuid)",
  "public.store_oura_tokens(uuid, text, text, timestamp with time zone)",
];

describe("migration fix_oura_token_rpc_service_role", () => {
  it("concede EXECUTE a service_role nos 3 RPCs de token", () => {
    for (const fn of TOKEN_FUNCTIONS) {
      expect(migrationSql).toContain(
        `GRANT EXECUTE ON FUNCTION ${fn} TO service_role;`,
      );
    }
  });

  it("revoga EXECUTE de PUBLIC, anon e authenticated nos 3 RPCs", () => {
    for (const fn of TOKEN_FUNCTIONS) {
      expect(migrationSql).toContain(
        `REVOKE EXECUTE ON FUNCTION ${fn} FROM PUBLIC, anon, authenticated;`,
      );
    }
  });

  it("nunca concede EXECUTE a authenticated", () => {
    const grantsToAuthenticated = codeOnly
      .split("\n")
      .filter(
        (line) => /\bgrant\b/i.test(line) && /\bauthenticated\b/i.test(line),
      );
    expect(grantsToAuthenticated).toEqual([]);
  });

  it("preserva os nomes dos secrets do Vault", () => {
    expect(migrationSql).toContain("'oura_access_' || p_student_id::text");
    expect(migrationSql).toContain("'oura_refresh_' || p_student_id::text");
  });

  it("remove o guard quebrado (request.jwt.claim.role / caller_role)", () => {
    expect(codeLower).not.toContain("request.jwt.claim.role");
    expect(codeLower).not.toContain("caller_role");
    expect(codeLower).not.toMatch(/caller_id\s+is\s+null/);
  });

  it("usa o guard de posse que não bloqueia service_role", () => {
    // service_role tem auth.uid() IS NULL -> guard ignorado, RPC prossegue.
    const safeGuards = migrationSql.match(
      /IF auth\.uid\(\) IS NOT NULL AND NOT EXISTS/g,
    );
    expect(safeGuards?.length).toBe(3);
  });

  it("mantém SECURITY DEFINER e search_path travado nos 3 RPCs", () => {
    expect(migrationSql.match(/SECURITY DEFINER/g)?.length).toBe(3);
    expect(
      migrationSql.match(/SET search_path TO 'public', 'vault'/g)?.length,
    ).toBe(3);
  });

  it("não loga nem seleciona valores de token", () => {
    expect(codeLower).not.toMatch(/raise\s+(notice|log|info|warning|debug)/);
    expect(codeLower).not.toMatch(
      /select[^;]*\b(access_token|refresh_token)\b/,
    );
  });
});
