# Plano final — Backend Whoop no ar (com 5 adendos da auditoria)

Zero alteração de código-fonte. Zero alteração de secrets. Somente `supabase--migration`, `supabase--read_query`, `supabase--deploy_edge_functions`, `supabase--curl_edge_functions`.

---

## Passo 1 — Pré-check das 22 assinaturas de RPC (adendo 1)

`supabase--read_query`:
```sql
WITH expected(signature) AS (
  SELECT unnest(ARRAY[
    'public.get_oura_access_token(uuid)',
    'public.get_oura_refresh_token(uuid)',
    'public.store_oura_tokens(uuid, text, text, timestamp with time zone)',
    'public.cleanup_rate_limit_attempts()',
    'public.migrate_oura_tokens_to_vault()',
    'public.compute_week_adherence()',
    'public.update_folder_full_path()',
    'public.count_active_students(date)',
    'public.count_students_inactive(integer)',
    'public.count_students_frequency_dropping()',
    'public.count_prescriptions_stagnant(integer)',
    'public.list_students_inactive(integer)',
    'public.list_students_frequency_dropping()',
    'public.list_prescriptions_stagnant(integer)',
    'public.calc_oura_baseline(uuid, integer)',
    'public.delete_prescription_cascade(uuid)',
    'public.update_prescription_with_exercises(uuid, text, text, jsonb)',
    'public.create_workout_session_with_exercises(uuid, date, time without time zone, text, jsonb)',
    'public.create_group_workout_session_with_exercises(uuid, uuid, date, time without time zone, jsonb)',
    'public.list_unlinked_session_exercise_review()',
    'public.search_exercises_by_name(text, text, integer)',
    'public.normalize_objective(text)'
  ]::text[])
)
SELECT signature, to_regprocedure(signature) IS NOT NULL AS exists_exact
FROM expected
ORDER BY exists_exact, signature;
```
**Gate:** se qualquer `exists_exact = false`, PARO, reporto quais faltam e não sigo com a 1.1.

## Passo 2 — Migration 1.1 `20260704204139_harden_definer_rpc_grants`

`supabase--migration` com o SQL do arquivo (envolvido em `begin;/commit;` explícito).

**Verificação pós:** para cada uma das 22 assinaturas:
```sql
SELECT signature, has_function_privilege('anon', signature, 'EXECUTE') AS anon_exec
FROM (VALUES ('public.get_oura_access_token(uuid)'), … ) AS t(signature);
```
Todas devem retornar `false`.

## Passo 3 — Migration 1.2 `20260707182719_whoop_integration`

`supabase--migration`. Cria 4 tabelas `whoop_*` + GRANT + RLS + policies + 3 RPCs vault (`store_whoop_tokens`, `get_whoop_access_token`, `get_whoop_refresh_token`) com grants least-privilege.

Transação implícita da ferramenta: falha atômica → nada é gravado em `supabase_migrations.schema_migrations`.

**Verificação pós (adendo 5):**
```sql
-- (a) tabelas + RLS
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname='public' AND tablename LIKE 'whoop_%' ORDER BY tablename;
-- esperado: 4 linhas, rowsecurity=true

-- (b) ≥1 policy por tabela
SELECT tablename, COUNT(*) FROM pg_policies
WHERE schemaname='public' AND tablename LIKE 'whoop_%' GROUP BY tablename;

-- (c) authenticated tem SELECT nas 4 tabelas (frontend lê via REST)
SELECT tablename,
       has_table_privilege('authenticated', 'public.'||tablename, 'SELECT') AS auth_select
FROM (VALUES ('whoop_connections'),('whoop_metrics'),('whoop_workouts'),('whoop_sync_logs')) AS t(tablename);
-- esperado: auth_select=true nas 4

-- (d) grants das 3 RPCs de token: anon=false, authenticated=false, service_role=true
SELECT fn,
  has_function_privilege('anon',          fn, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', fn, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role',  fn, 'EXECUTE') AS srv_exec
FROM (VALUES
  ('public.get_whoop_access_token(uuid)'),
  ('public.get_whoop_refresh_token(uuid)'),
  ('public.store_whoop_tokens(uuid, text, text, timestamp with time zone)')
) AS t(fn);
-- esperado: anon=false, auth=false, srv=true nas 3
```

## Passo 4 — Migration 1.3 `20260709130000_whoop_sync_logs_workouts_synced`

`supabase--migration`. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS workouts_synced integer`.

**Verificação pós:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='whoop_sync_logs' AND column_name='workouts_synced';
-- esperado: 1 linha
```

## Passo 5 — Registro das 3 migrations

```sql
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('20260704204139','20260707182719','20260709130000') ORDER BY version;
-- esperado: 3 linhas
```

## Passo 6 — Reload do PostgREST (adendo 2)

`supabase--read_query`:
```sql
SELECT pg_notify('pgrst','reload schema');
```
Necessário pra que as novas tabelas/RPCs whoop apareçam no gateway REST antes das functions serem chamadas.

## Passo 7 — Deploy das 6 edge functions

`supabase--deploy_edge_functions`:
```json
["whoop-connect-link","whoop-callback","whoop-sync","whoop-sync-all","whoop-disconnect","validate-student-invite"]
```
`supabase/config.toml` é respeitado por deploy — cada `[functions.<nome>].verify_jwt` já está definido no arquivo (não vou alterá-lo):
- `whoop-connect-link` = true
- `whoop-callback` = false (OAuth público, valida state em código)
- `whoop-sync` = false (service-role, valida em código)
- `whoop-sync-all` = false (service-role/admin, valida em código)
- `whoop-disconnect` = true
- `validate-student-invite` = false (público, valida token)

## Passo 8 — Probes pós-deploy (adendo 3)

`supabase--curl_edge_functions` em cada rota, com payloads mínimos. Critério de aceite por rota:

| Function | Método/payload | Aceitável | Falha |
|---|---|---|---|
| `whoop-connect-link` | POST sem body (sem auth) | 401 | 404, 5xx, timeout, erro de rede |
| `whoop-callback` | GET sem params | 400 (missing code/state) | 404, 5xx, timeout |
| `whoop-sync` | POST sem body (sem auth) | 401 | 404, 5xx, timeout |
| `whoop-sync-all` | POST sem body (sem auth) | 401 | 404, 5xx, timeout |
| `whoop-disconnect` | POST sem body (sem auth) | 401 | 404, 5xx, timeout |
| `validate-student-invite` | POST `{}` | 400 (payload) | 404, 5xx, timeout |

**Falha = 404 OU qualquer 5xx OU timeout OU erro de rede.** 400/401/403/405 só passam se coincidirem com a expectativa da tabela acima.

## Passo 9 — Reporte final

Consolidado com resultado de cada verificação (1 a 8) e status de cada function.

---

## Falhas no meio (adendo 4)

- **Passo 1 (pré-check falha):** paro, listo assinaturas ausentes, nenhuma migration roda.
- **Passo 2 (1.1 falha):** rollback automático da migration pela transação `begin;/commit;` interna. Reporto o erro. Não sigo pra 1.2.
- **Passo 3 (1.2 falha):** **NÃO assumo rollback.** Rodo diagnóstico imediato:
  ```sql
  -- estado das tabelas
  SELECT tablename, rowsecurity FROM pg_tables
  WHERE schemaname='public' AND tablename LIKE 'whoop_%';
  -- policies criadas
  SELECT tablename, policyname FROM pg_policies
  WHERE schemaname='public' AND tablename LIKE 'whoop_%';
  -- colunas que chegaram a existir
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name LIKE 'whoop_%' ORDER BY 1,2;
  -- RPCs whoop
  SELECT fn, to_regprocedure(fn) IS NOT NULL AS exists
  FROM (VALUES
    ('public.store_whoop_tokens(uuid, text, text, timestamp with time zone)'),
    ('public.get_whoop_access_token(uuid)'),
    ('public.get_whoop_refresh_token(uuid)')
  ) AS t(fn);
  -- registro da migration
  SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260707182719';
  ```
  Reporto o estado parcial exato. Nenhuma ação corretiva sem sua autorização explícita.
- **Passo 4 (1.3 falha):** paro antes do deploy (whoop-sync depende de `workouts_synced`). Reporto.
- **Passo 7 (deploy falha em alguma function):** reporto qual falhou e o erro do build. As functions que subiram permanecem. Não faço redeploy cego.

## Compromissos

- **Zero** edição de `.ts`, `.sql`, `.toml`, `.json`.
- **Zero** criação/leitura/alteração de secrets (`WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `PUBLIC_APP_URL`, service role).
- **Zero** `INSERT/UPDATE/DELETE` em tabelas de negócio.
- **Zero** rollback destrutivo (nenhum `DROP TABLE`) sem sua autorização.

Aguardando o botão "Implementar plano" pra executar exatamente esta sequência.
