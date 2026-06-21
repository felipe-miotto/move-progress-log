
-- 1. adaptation_rules: read authenticated, write admin-only
DROP POLICY IF EXISTS "Authenticated users access adaptation rules" ON public.adaptation_rules;
CREATE POLICY "adaptation_rules_select_authenticated" ON public.adaptation_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "adaptation_rules_admin_write" ON public.adaptation_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. exercises_library: read authenticated, write admin-only
DROP POLICY IF EXISTS "Authenticated users access exercise library" ON public.exercises_library;
CREATE POLICY "exercises_library_select_authenticated" ON public.exercises_library
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "exercises_library_admin_write" ON public.exercises_library
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. oura_connections: revoke SELECT of token columns from authenticated
REVOKE SELECT (access_token, refresh_token) ON public.oura_connections FROM authenticated;
REVOKE SELECT (access_token, refresh_token) ON public.oura_connections FROM anon;

-- 4. precision12_questionnaire_links: revoke SELECT of token_hash from authenticated
REVOKE SELECT (token_hash) ON public.precision12_questionnaire_links FROM authenticated;
REVOKE SELECT (token_hash) ON public.precision12_questionnaire_links FROM anon;

-- 5. rate_limit_attempts: block anon explicitly
CREATE POLICY "Block all direct anon access to rate limits" ON public.rate_limit_attempts
  FOR ALL TO anon USING (false) WITH CHECK (false);
REVOKE ALL ON public.rate_limit_attempts FROM anon;

-- 6. recovery_protocols: authenticated read, admin write
DROP POLICY IF EXISTS "Anyone can view recovery protocols" ON public.recovery_protocols;
DROP POLICY IF EXISTS "Authenticated users manage protocols" ON public.recovery_protocols;
CREATE POLICY "recovery_protocols_select_authenticated" ON public.recovery_protocols
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "recovery_protocols_admin_write" ON public.recovery_protocols
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE SELECT ON public.recovery_protocols FROM anon;

-- 7. student_invites: scope policy to authenticated and revoke invite_token column from clients
DROP POLICY IF EXISTS "Trainers manage own invites" ON public.student_invites;
CREATE POLICY "student_invites_trainer_owner" ON public.student_invites
  FOR ALL TO authenticated
  USING (auth.uid() = trainer_id)
  WITH CHECK (auth.uid() = trainer_id);
REVOKE SELECT (invite_token) ON public.student_invites FROM authenticated;
REVOKE SELECT (invite_token) ON public.student_invites FROM anon;

-- 8. workout_sessions_time_fix_audit: enable RLS, admin-only SELECT
ALTER TABLE public.workout_sessions_time_fix_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workout_sessions_time_fix_audit_admin_select" ON public.workout_sessions_time_fix_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.workout_sessions_time_fix_audit FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.workout_sessions_time_fix_audit FROM authenticated;
