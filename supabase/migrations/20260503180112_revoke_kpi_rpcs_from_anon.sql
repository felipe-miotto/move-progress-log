-- Revoke EXECUTE on dashboard KPI RPCs from anon/PUBLIC
--
-- Achado da auditoria do Lovable (2026-05-03): as 7 RPCs de dashboard
-- (count_* + list_* + compute_week_adherence) herdaram EXECUTE pra anon
-- por padrão do Postgres (toda função criada via CREATE OR REPLACE
-- FUNCTION recebe GRANT EXECUTE TO PUBLIC implicitamente).
--
-- Risco real é baixo porque essas RPCs apenas contam/listam IDs sem
-- expor dados sensíveis, mas o linter do Supabase (`supabase--linter`)
-- emite warn `0028_anon_security_definer_function_executable` em cada
-- uma, gerando ruído operacional e mau exemplo arquitetural.
--
-- Frontend já usa sessão `authenticated` (token Bearer JWT) em toda
-- chamada `supabase.rpc(...)` — nenhum caminho legítimo depende de
-- acesso anônimo a essas funções.
--
-- Política aplicada por função:
--   REVOKE EXECUTE FROM PUBLIC, anon
--   GRANT  EXECUTE TO authenticated
--
-- Idempotente: REVOKE/GRANT são no-ops quando o estado já bate.
--
-- Validação pós-aplicação:
--   - Frontend continua funcionando normalmente (chamadas autenticadas)
--   - `supabase--linter` deve parar de flagar 0028 nessas 7 funções
--   - Tentativa de chamada anônima retorna 42501 (insufficient_privilege)

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.count_students_inactive(integer)',
    'public.count_students_frequency_dropping()',
    'public.count_prescriptions_stagnant(integer)',
    'public.compute_week_adherence()',
    'public.list_students_inactive(integer)',
    'public.list_students_frequency_dropping()',
    'public.list_prescriptions_stagnant(integer)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;
