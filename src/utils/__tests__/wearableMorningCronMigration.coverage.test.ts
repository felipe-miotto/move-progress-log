/**
 * Source-based coverage da migration `add_wearable_morning_cron`.
 *
 * Contexto: `oura-sync-scheduled` documenta um ciclo de 6h BRT (09h UTC) que
 * nunca foi commitado — só o `midmorning` (13h UTC) existe em migration. Esta
 * migration adiciona os ciclos matinais 06:00 BRT para Oura e Whoop, espelhando
 * o par midmorning. Como o helper `invoke_cron_edge` chama a URL de PROD, não dá
 * pra testar o cron de ponta a ponta no sandbox — estes testes travam os
 * invariantes lendo o SQL, no mesmo padrão dos demais *.coverage.test.ts.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/20260714090000_add_wearable_morning_cron.sql",
);
const migrationSql = readFileSync(migrationPath, "utf-8");

/** Migration sem comentários SQL — usado nas asserts de "não deve conter". */
const codeOnly = migrationSql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");
const codeLower = codeOnly.toLowerCase();

describe("migration add_wearable_morning_cron", () => {
  it("agenda o ciclo matinal do Oura às 09:00 UTC (06:00 BRT)", () => {
    expect(codeOnly).toMatch(
      /cron\.schedule\(\s*'oura-sync-morning'\s*,\s*'0 9 \* \* \*'/i,
    );
  });

  it("agenda o ciclo matinal do Whoop às 09:15 UTC (06:15 BRT)", () => {
    expect(codeOnly).toMatch(
      /cron\.schedule\(\s*'whoop-sync-morning'\s*,\s*'15 9 \* \* \*'/i,
    );
  });

  it("chama as edge functions corretas via private.invoke_cron_edge", () => {
    expect(codeLower).toContain(
      "private.invoke_cron_edge('oura-sync-scheduled'",
    );
    expect(codeLower).toContain("private.invoke_cron_edge('whoop-sync-all'");
    expect(codeLower).toContain('"time":"morning"');
    expect(codeLower).toContain('"schedule":"morning"');
  });

  it("é idempotente e independente de versão do pg_cron (guard IF EXISTS → unschedule)", () => {
    expect(codeOnly).toMatch(
      /if\s+exists\s*\(\s*select\s+1\s+from\s+cron\.job\s+where\s+jobname\s*=\s*'oura-sync-morning'/i,
    );
    expect(codeOnly).toMatch(
      /if\s+exists\s*\(\s*select\s+1\s+from\s+cron\.job\s+where\s+jobname\s*=\s*'whoop-sync-morning'/i,
    );
    expect(codeLower).toContain("cron.unschedule('oura-sync-morning')");
    expect(codeLower).toContain("cron.unschedule('whoop-sync-morning')");
  });

  it("é aditiva — não mexe nos ciclos existentes (midmorning/evening)", () => {
    expect(codeLower).not.toContain("midmorning");
    expect(codeLower).not.toContain("evening");
    expect(codeLower).not.toMatch(/unschedule\(\s*'oura-sync-(?!morning)/);
    expect(codeLower).not.toMatch(/unschedule\(\s*'whoop-sync-(?!morning)/);
  });

  it("não redefine funções, secrets nem toca vault/edge source", () => {
    expect(codeLower).not.toContain("create or replace function");
    expect(codeLower).not.toContain("create schema");
    expect(codeLower).not.toContain("vault.");
    expect(codeLower).not.toContain("create_secret");
    expect(codeLower).not.toContain("cron_service_role_key");
    expect(codeLower).not.toContain("supabase/functions");
  });
});
