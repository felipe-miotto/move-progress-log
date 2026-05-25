/**
 * Source-based coverage da migration
 * `20260525090000_fix_store_oura_tokens_upsert.sql`.
 *
 * Contexto: a versão de `store_oura_tokens` em
 * 20260521194447_fix_oura_token_rpc_service_role.sql só fazia UPDATE em
 * `oura_connections`. O primeiro callback OAuth de um aluno (ou a reconexão
 * de um aluno desativado) virava no-op silencioso — o callback redirecionava
 * pra success, mas o app filtra `is_active = true` e via "não conectado".
 *
 * Esta migration corrige fazendo um INSERT ... ON CONFLICT (student_id) DO
 * UPDATE que sempre seta `is_active = true` e mantém os ponteiros
 * `'ENCRYPTED'` nas colunas NOT NULL (o token real continua no Vault).
 *
 * Os testes lêem o código-fonte (source-based) e travam:
 *   - upsert real (INSERT + ON CONFLICT (student_id) DO UPDATE);
 *   - is_active = true gravado em ambas as faces (insert e update);
 *   - access_token / refresh_token = 'ENCRYPTED' (ponteiros);
 *   - secrets do Vault rotacionados (DELETE + create_secret);
 *   - SECURITY DEFINER + search_path = 'public','vault';
 *   - ownership guard preservado (auth.uid() IS NOT NULL);
 *   - REVOKE PUBLIC/anon/authenticated;
 *   - GRANT só para service_role;
 *   - nada de log/select de tokens;
 *   - oura-callback intocado (mesma chamada de RPC).
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/20260525090000_fix_store_oura_tokens_upsert.sql",
);
const migrationSql = readFileSync(migrationPath, "utf-8");

/** Migration sem comentários SQL — usado nas asserts de "não deve conter". */
const codeOnly = migrationSql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");
const codeLower = codeOnly.toLowerCase();

const STORE_FN_SIG =
  "public.store_oura_tokens(uuid, text, text, timestamp with time zone)";

describe("migration fix_store_oura_tokens_upsert", () => {
  it("recria CREATE OR REPLACE FUNCTION public.store_oura_tokens com a assinatura esperada", () => {
    expect(migrationSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.store_oura_tokens\(\s*p_student_id uuid,\s*p_access_token text,\s*p_refresh_token text,\s*p_token_expires_at timestamp with time zone\s*\)/,
    );
    expect(migrationSql).toMatch(/RETURNS void/);
    expect(migrationSql).toMatch(/LANGUAGE plpgsql/);
  });

  it("faz upsert real: INSERT INTO public.oura_connections + ON CONFLICT (student_id) DO UPDATE", () => {
    expect(codeOnly).toMatch(/INSERT INTO public\.oura_connections/);
    expect(codeOnly).toMatch(/ON CONFLICT\s*\(\s*student_id\s*\)\s*DO UPDATE/);
  });

  it("seta is_active = true tanto no INSERT quanto no DO UPDATE", () => {
    // No INSERT VALUES (...), is_active aparece como literal true.
    expect(codeOnly).toMatch(/VALUES[\s\S]*?\btrue\b[\s\S]*?\);/);
    // No DO UPDATE SET, is_active = true precisa ser explícito (reativa
    // conexões antigas que foram desativadas).
    expect(codeOnly).toMatch(/SET[\s\S]*?is_active\s*=\s*true/);
  });

  it("colunas NOT NULL access_token/refresh_token recebem ponteiros 'ENCRYPTED' (tokens reais ficam no Vault)", () => {
    const encryptedMatches = codeOnly.match(/'ENCRYPTED'/g) ?? [];
    // Insert: 2 ('ENCRYPTED') + Update: 2 ('ENCRYPTED') = 4 ocorrências.
    expect(encryptedMatches.length).toBeGreaterThanOrEqual(4);
    expect(codeOnly).toMatch(/access_token\s*=\s*'ENCRYPTED'/);
    expect(codeOnly).toMatch(/refresh_token\s*=\s*'ENCRYPTED'/);
  });

  it("token_expires_at vem do parâmetro (insert direto / EXCLUDED no update)", () => {
    expect(codeOnly).toMatch(/p_token_expires_at/);
    expect(codeOnly).toMatch(
      /token_expires_at\s*=\s*EXCLUDED\.token_expires_at/,
    );
  });

  it("preserva os secrets do Vault: rotação (DELETE) + create_secret", () => {
    expect(migrationSql).toContain("'oura_access_' || p_student_id::text");
    expect(migrationSql).toContain("'oura_refresh_' || p_student_id::text");
    const deletes = codeOnly.match(/DELETE FROM vault\.secrets/g) ?? [];
    expect(deletes.length).toBe(2);
    const creates = codeOnly.match(/vault\.create_secret\(/g) ?? [];
    expect(creates.length).toBe(2);
  });

  it("preserva SECURITY DEFINER + search_path = 'public','vault'", () => {
    expect(migrationSql).toMatch(/SECURITY DEFINER/);
    expect(migrationSql).toMatch(
      /SET search_path TO 'public',\s*'vault'/,
    );
  });

  it("preserva o ownership guard que não bloqueia service_role", () => {
    // service_role tem auth.uid() IS NULL -> guard ignorado, RPC prossegue.
    expect(migrationSql).toMatch(
      /IF auth\.uid\(\) IS NOT NULL AND NOT EXISTS/,
    );
    expect(migrationSql).toMatch(
      /RAISE EXCEPTION 'Access denied to store Oura tokens for this student' USING ERRCODE = '42501'/,
    );
    // Bloqueia regressão pro guard quebrado (request.jwt.claim.role / caller_role).
    expect(codeLower).not.toContain("request.jwt.claim.role");
    expect(codeLower).not.toContain("caller_role");
  });

  it("revoga EXECUTE de PUBLIC, anon e authenticated", () => {
    expect(migrationSql).toContain(
      `REVOKE EXECUTE ON FUNCTION ${STORE_FN_SIG} FROM PUBLIC, anon, authenticated;`,
    );
  });

  it("concede EXECUTE apenas para service_role (nada para authenticated/anon/PUBLIC)", () => {
    expect(migrationSql).toContain(
      `GRANT EXECUTE ON FUNCTION ${STORE_FN_SIG} TO service_role;`,
    );

    const grants = codeOnly
      .split(";")
      .map((s) => s.trim())
      .filter((stmt) => /\bgrant\s+execute\b/i.test(stmt));
    // Só pode haver um GRANT EXECUTE — e é o de service_role.
    expect(grants.length).toBe(1);
    expect(grants[0]).toMatch(/\bto\s+service_role\b/i);

    // Defense-in-depth: nenhum GRANT EXECUTE TO authenticated/anon/PUBLIC.
    // Atenção: `public.store_oura_tokens` (qualificação de schema) tem
    // `public` no nome — checamos o role só depois do `TO`.
    const grantsToOthers = grants.filter((stmt) =>
      /\bto\s+(public|anon|authenticated)\b/i.test(stmt),
    );
    expect(grantsToOthers).toEqual([]);
  });

  it("não loga nem seleciona valores de token", () => {
    expect(codeLower).not.toMatch(/raise\s+(notice|log|info|warning|debug)/);
    expect(codeLower).not.toMatch(
      /select[^;]*\b(access_token|refresh_token)\b/,
    );
  });

  it("não toca em get_oura_access_token / get_oura_refresh_token (sem CREATE/ALTER/GRANT/REVOKE)", () => {
    // Comentários podem citar os nomes, mas o CÓDIGO SQL real não pode
    // redefinir nem alterar permissão dessas funções nesta migration.
    expect(codeOnly).not.toMatch(
      /(?:CREATE\s+OR\s+REPLACE\s+FUNCTION|ALTER\s+FUNCTION|GRANT\s+EXECUTE\s+ON\s+FUNCTION|REVOKE\s+EXECUTE\s+ON\s+FUNCTION)[\s\S]*?get_oura_access_token/i,
    );
    expect(codeOnly).not.toMatch(
      /(?:CREATE\s+OR\s+REPLACE\s+FUNCTION|ALTER\s+FUNCTION|GRANT\s+EXECUTE\s+ON\s+FUNCTION|REVOKE\s+EXECUTE\s+ON\s+FUNCTION)[\s\S]*?get_oura_refresh_token/i,
    );
  });

  it("connected_at é preservado em reconexões (COALESCE com valor existente)", () => {
    // INSERT seta now(); o ON CONFLICT preserva o valor antigo via COALESCE.
    expect(codeOnly).toMatch(
      /connected_at\s*=\s*COALESCE\(public\.oura_connections\.connected_at,\s*now\(\)\)/,
    );
  });
});

describe("oura-callback intocado", () => {
  const callbackSrc = readFileSync(
    resolve(
      __dirname,
      "../../../supabase/functions/oura-callback/index.ts",
    ),
    "utf-8",
  );

  it("continua chamando supabaseClient.rpc('store_oura_tokens', { ... }) com os 4 params", () => {
    expect(callbackSrc).toMatch(
      /\.rpc\(\s*['"]store_oura_tokens['"][\s\S]*?p_student_id[\s\S]*?p_access_token[\s\S]*?p_refresh_token[\s\S]*?p_token_expires_at/,
    );
  });
});
