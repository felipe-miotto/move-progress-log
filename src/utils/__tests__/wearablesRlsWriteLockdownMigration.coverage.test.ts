/**
 * Source-based coverage da migration `wearables_rls_write_lockdown`.
 *
 * Contexto (auditoria Codex do plano B2 Whoop, 09/jul/2026): as tabelas
 * oura_* e whoop_* usavam policies RLS `FOR ALL` com USING de ownership,
 * permitindo INSERT/UPDATE/DELETE por qualquer trainer autenticado do aluno
 * via client — quando só o pipeline server-side (service_role) deveria
 * escrever métricas/workouts/logs/conexões.
 *
 * A migration separa: SELECT para trainer/admin; escrita só service_role
 * (que faz bypass de RLS). Os testes travam os invariantes sem precisar de
 * um Postgres — mesmo padrão dos demais *.coverage.test.ts.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/20260709150000_wearables_rls_write_lockdown.sql",
);
const migrationSql = readFileSync(migrationPath, "utf-8");

/** Migration sem comentários SQL — usado nas asserts de conteúdo. */
const codeOnly = migrationSql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");
const codeLower = codeOnly.toLowerCase();

const TABLES = [
  "oura_connections",
  "oura_metrics",
  "oura_workouts",
  "oura_sync_logs",
  "oura_acute_metrics",
  "whoop_connections",
  "whoop_metrics",
  "whoop_workouts",
  "whoop_sync_logs",
] as const;

/** Nomes das policies FOR ALL antigas que precisam ser derrubadas. */
const OLD_POLICIES: Record<(typeof TABLES)[number], string> = {
  oura_connections: "Trainers access own student connections",
  oura_metrics: "Trainers access own student metrics",
  oura_workouts: "Trainers access own student workouts",
  oura_sync_logs: "Trainers access own student sync logs",
  oura_acute_metrics: "Trainers access own student acute metrics",
  whoop_connections: "Trainers access own student whoop connections",
  whoop_metrics: "Trainers access own student whoop metrics",
  whoop_workouts: "Trainers access own student whoop workouts",
  whoop_sync_logs: "Trainers access own student whoop sync logs",
};

describe("migration wearables_rls_write_lockdown", () => {
  it.each(TABLES)("derruba a policy FOR ALL antiga de %s", (table) => {
    const dropRe = new RegExp(
      `drop\\s+policy\\s+if\\s+exists\\s+"${OLD_POLICIES[table]}"\\s+on\\s+public\\.${table}`,
      "i",
    );
    expect(codeOnly).toMatch(dropRe);
  });

  it.each(TABLES)(
    "cria policy SELECT-only para authenticated em %s",
    (table) => {
      const createRe = new RegExp(
        `create\\s+policy\\s+"[^"]+"\\s+on\\s+public\\.${table}\\s+for\\s+select\\s+to\\s+authenticated`,
        "i",
      );
      expect(codeOnly).toMatch(createRe);
    },
  );

  it.each(TABLES)("policy de %s valida ownership trainer/admin", (table) => {
    const policyBlock =
      codeLower.match(
        new RegExp(
          `create\\s+policy[^;]*on\\s+public\\.${table}\\s+for\\s+select[^;]*;`,
        ),
      )?.[0] ?? "";
    expect(policyBlock).toContain(`s.id = ${table}.student_id`);
    expect(policyBlock).toContain("s.trainer_id = auth.uid()");
    expect(policyBlock).toContain(
      "public.has_role(auth.uid(), 'admin'::app_role)",
    );
  });

  it("não cria nenhuma policy de escrita para roles de client", () => {
    expect(codeLower).not.toMatch(/for\s+all/);
    expect(codeLower).not.toMatch(/for\s+insert/);
    expect(codeLower).not.toMatch(/for\s+update/);
    expect(codeLower).not.toMatch(/for\s+delete/);
    expect(codeLower).not.toContain("with check");
  });

  it.each(TABLES)(
    "revoga INSERT/UPDATE/DELETE de anon e authenticated em %s",
    (table) => {
      const revokeRe = new RegExp(
        `revoke\\s+insert,\\s*update,\\s*delete\\s+on\\s+public\\.${table}\\s+from\\s+anon,\\s*authenticated`,
        "i",
      );
      expect(codeOnly).toMatch(revokeRe);
    },
  );

  it("não revoga SELECT (leitura do client continua funcionando)", () => {
    expect(codeLower).not.toMatch(/revoke[^;]*\bselect\b/);
  });

  it("não toca em RPCs de token nem no Vault", () => {
    expect(codeLower).not.toContain("create or replace function");
    expect(codeLower).not.toContain("vault.");
    expect(codeLower).not.toContain("decrypted_secret");
  });
});

describe("edge functions de disconnect escrevem via service_role", () => {
  const functionsDir = resolve(__dirname, "../../../supabase/functions");

  it.each([
    ["oura-disconnect", "oura_connections"],
    ["whoop-disconnect", "whoop_connections"],
  ])("%s usa service client no UPDATE de %s", (fn, table) => {
    const source = readFileSync(
      resolve(functionsDir, fn, "index.ts"),
      "utf-8",
    );

    // O client autenticado (JWT do trainer) continua validando ownership...
    expect(source).toContain("SUPABASE_ANON_KEY");
    expect(source).toMatch(/from\('students'\)/);

    // ...mas o UPDATE em *_connections sai pelo service client, já que a
    // tabela é read-only para roles de client após a migration.
    expect(source).toContain("SUPABASE_SERVICE_ROLE_KEY");
    const updateRe = new RegExp(
      `supabaseAdmin\\s*[\\s\\S]{0,80}\\.from\\('${table}'\\)[\\s\\S]{0,80}\\.update\\(`,
    );
    expect(source).toMatch(updateRe);

    // Nenhum UPDATE nessas tabelas pelo client do usuário.
    const userClientUpdateRe = new RegExp(
      `supabaseClient\\s*[\\s\\S]{0,80}\\.from\\('${table}'\\)[\\s\\S]{0,80}\\.update\\(`,
    );
    expect(source).not.toMatch(userClientUpdateRe);
  });
});

describe("frontend não escreve em tabelas de wearables", () => {
  it("useOuraMetrics não tem mais mutação de insert em oura_metrics", () => {
    const source = readFileSync(
      resolve(__dirname, "../../hooks/useOuraMetrics.ts"),
      "utf-8",
    );
    expect(source).not.toContain("useAddOuraMetrics");
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain("useMutation");
  });
});
