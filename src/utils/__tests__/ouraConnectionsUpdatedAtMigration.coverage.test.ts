/**
 * Source-based coverage da migration `add_updated_at_to_oura_connections`.
 *
 * Contexto: as migrations 20260521194447 / 20260521195717 redefiniram
 * `store_oura_tokens` com `UPDATE public.oura_connections SET ...,
 * updated_at = now()`, mas a tabela não tinha a coluna `updated_at` —
 * `oura-callback` falhava ao salvar tokens com SQLSTATE 42703.
 *
 * Esta migration adiciona a coluna de auditoria seguindo o padrão de
 * trigger do projeto. Os testes travam os invariantes sem precisar de um
 * Postgres — mesmo padrão dos demais *.coverage.test.ts.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/20260521202410_add_updated_at_to_oura_connections.sql",
);
const migrationSql = readFileSync(migrationPath, "utf-8");

/** Migration sem comentários SQL — usado nas asserts de "não deve conter". */
const codeOnly = migrationSql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");
const codeLower = codeOnly.toLowerCase();

describe("migration add_updated_at_to_oura_connections", () => {
  it("adiciona a coluna updated_at em public.oura_connections", () => {
    expect(codeOnly).toMatch(
      /alter\s+table\s+public\.oura_connections\s+add\s+column\s+updated_at/i,
    );
  });

  it("declara updated_at como timestamptz NOT NULL com DEFAULT now()", () => {
    const addColumn =
      codeLower.match(/add\s+column\s+updated_at[^;]*/)?.[0] ?? "";
    expect(addColumn).toContain("timestamptz");
    expect(addColumn).toContain("not null");
    expect(addColumn).toContain("default now()");
  });

  it("mantém last_sync_at intocado", () => {
    expect(codeLower).not.toContain("last_sync_at");
  });

  it("segue o padrão de trigger updated_at do projeto", () => {
    expect(codeOnly).toMatch(
      /create\s+trigger\s+update_oura_connections_updated_at/i,
    );
    expect(codeOnly).toMatch(
      /before\s+update\s+on\s+public\.oura_connections/i,
    );
    expect(codeLower).toContain(
      "execute function public.update_updated_at_column()",
    );
  });

  it("não redefine RPCs nem toca edge functions", () => {
    expect(codeLower).not.toContain("create or replace function");
    expect(codeLower).not.toContain("store_oura_tokens");
    expect(codeLower).not.toContain("get_oura_access_token");
    expect(codeLower).not.toContain("get_oura_refresh_token");
    expect(codeLower).not.toContain("supabase/functions");
  });

  it("não referencia nem expõe valores de token", () => {
    expect(codeLower).not.toMatch(/\b(access_token|refresh_token)\b/);
    expect(codeLower).not.toContain("decrypted_secret");
    expect(codeLower).not.toContain("vault.");
  });
});
