-- =============================================================================
-- Migration: move EXECUTE grants on public-schema functions to least privilege
-- Author:    Felipe (for Alex's review)
-- Date:      2026-07-04  (revoke-from-PUBLIC correctness fix: 2026-07-09)
-- =============================================================================
--
-- Supabase exposes every `public`-schema function over REST at
-- /rest/v1/rpc/<function>, and `CREATE FUNCTION` grants EXECUTE to `PUBLIC`
-- (i.e. to *every* role) by default.
--
-- IMPORTANT (fixed 2026-07-09): because the default grant is to PUBLIC,
-- `revoke execute ... from anon, authenticated` alone is a NO-OP — anon and
-- authenticated still execute the function through the PUBLIC grant. To actually
-- restrict a function we must `revoke ... from public` and then grant EXECUTE
-- back ONLY to the roles that legitimately call it.
--
--   1) Backend-only fns (called by Edge Functions or fired by triggers):
--      revoke from PUBLIC, anon, authenticated  →  grant to service_role.
--   2) Authenticated-called fns (invoked from the browser by a logged-in
--      trainer/admin): revoke from PUBLIC, anon  →  grant to authenticated.
--
-- Left intentionally untouched: has_role() and can_access_trainer() — RLS
-- policy evaluation for anon/authenticated needs EXECUTE on them, and they
-- only return booleans.
--
-- Verify after applying (sandbox):
--   select has_function_privilege('anon','public.get_oura_access_token(uuid)','EXECUTE');        -- f
--   select has_function_privilege('service_role','public.get_oura_access_token(uuid)','EXECUTE');-- t
--   select has_function_privilege('anon','public.count_active_students(date)','EXECUTE');         -- f
--   select has_function_privilege('authenticated','public.count_active_students(date)','EXECUTE');-- t
--
-- Complements the approach started in `chore/revoke-kpi-execute-from-anon`.
-- A separate review of individual function bodies is planned as a follow-up.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Backend-only functions: revoke from PUBLIC, anon, authenticated; grant
--    service_role (Edge Functions run as service_role; triggers fire regardless
--    of EXECUTE grants, but service_role keeps any direct backend call working).
-- -----------------------------------------------------------------------------
revoke execute on function public.get_oura_access_token(uuid)                       from public, anon, authenticated;
grant  execute on function public.get_oura_access_token(uuid)                       to service_role;
revoke execute on function public.get_oura_refresh_token(uuid)                      from public, anon, authenticated;
grant  execute on function public.get_oura_refresh_token(uuid)                      to service_role;
revoke execute on function public.store_oura_tokens(uuid, text, text, timestamp with time zone) from public, anon, authenticated;
grant  execute on function public.store_oura_tokens(uuid, text, text, timestamp with time zone) to service_role;
revoke execute on function public.cleanup_rate_limit_attempts()                     from public, anon, authenticated;
grant  execute on function public.cleanup_rate_limit_attempts()                     to service_role;
revoke execute on function public.migrate_oura_tokens_to_vault()                    from public, anon, authenticated;
grant  execute on function public.migrate_oura_tokens_to_vault()                    to service_role;
revoke execute on function public.compute_week_adherence()                          from public, anon, authenticated;  -- trigger fn
grant  execute on function public.compute_week_adherence()                          to service_role;
revoke execute on function public.update_folder_full_path()                         from public, anon, authenticated;  -- trigger fn
grant  execute on function public.update_folder_full_path()                         to service_role;

-- -----------------------------------------------------------------------------
-- 2) Authenticated-only functions: revoke from PUBLIC, anon; grant authenticated
--    (called from the browser by a logged-in trainer/admin).
-- -----------------------------------------------------------------------------
revoke execute on function public.count_active_students(date)                       from public, anon;
grant  execute on function public.count_active_students(date)                       to authenticated;
revoke execute on function public.count_students_inactive(integer)                  from public, anon;
grant  execute on function public.count_students_inactive(integer)                  to authenticated;
revoke execute on function public.count_students_frequency_dropping()               from public, anon;
grant  execute on function public.count_students_frequency_dropping()               to authenticated;
revoke execute on function public.count_prescriptions_stagnant(integer)             from public, anon;
grant  execute on function public.count_prescriptions_stagnant(integer)             to authenticated;
revoke execute on function public.list_students_inactive(integer)                   from public, anon;
grant  execute on function public.list_students_inactive(integer)                   to authenticated;
revoke execute on function public.list_students_frequency_dropping()                from public, anon;
grant  execute on function public.list_students_frequency_dropping()                to authenticated;
revoke execute on function public.list_prescriptions_stagnant(integer)              from public, anon;
grant  execute on function public.list_prescriptions_stagnant(integer)              to authenticated;
revoke execute on function public.calc_oura_baseline(uuid, integer)                 from public, anon;
grant  execute on function public.calc_oura_baseline(uuid, integer)                 to authenticated;
revoke execute on function public.delete_prescription_cascade(uuid)                 from public, anon;
grant  execute on function public.delete_prescription_cascade(uuid)                 to authenticated;
revoke execute on function public.update_prescription_with_exercises(uuid, text, text, jsonb) from public, anon;
grant  execute on function public.update_prescription_with_exercises(uuid, text, text, jsonb) to authenticated;
revoke execute on function public.create_workout_session_with_exercises(uuid, date, time without time zone, text, jsonb) from public, anon;
grant  execute on function public.create_workout_session_with_exercises(uuid, date, time without time zone, text, jsonb) to authenticated;
revoke execute on function public.create_group_workout_session_with_exercises(uuid, uuid, date, time without time zone, jsonb) from public, anon;
grant  execute on function public.create_group_workout_session_with_exercises(uuid, uuid, date, time without time zone, jsonb) to authenticated;
revoke execute on function public.list_unlinked_session_exercise_review()           from public, anon;
grant  execute on function public.list_unlinked_session_exercise_review()           to authenticated;
revoke execute on function public.search_exercises_by_name(text, text, integer)     from public, anon;
grant  execute on function public.search_exercises_by_name(text, text, integer)     to authenticated;
revoke execute on function public.normalize_objective(text)                         from public, anon;
grant  execute on function public.normalize_objective(text)                         to authenticated;

commit;
