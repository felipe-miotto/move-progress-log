-- Wearable tables (oura_*, whoop_*): split RLS into read vs. write.
--
-- The original policies were FOR ALL with an ownership USING clause, which let
-- any authenticated trainer of the student INSERT/UPDATE/DELETE metrics,
-- workouts, sync logs, and connections directly from the client. Only the
-- server-side pipeline (Edge Functions running as service_role, which
-- bypasses RLS) should write to these tables.
--
-- New shape per table:
--   * SELECT  -> authenticated trainer of the student, or admin
--   * writes  -> no policy (service_role bypasses RLS); privileges also
--                revoked from anon/authenticated as defense in depth
--
-- The only user-JWT write path was the *_connections UPDATE inside
-- oura-disconnect / whoop-disconnect; both functions now perform that write
-- with the service client (see supabase/functions/*-disconnect/index.ts).

-- ── oura_connections ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trainers access own student connections" ON public.oura_connections;
CREATE POLICY "Trainers read own student oura connections" ON public.oura_connections
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = oura_connections.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

-- ── oura_metrics ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trainers access own student metrics" ON public.oura_metrics;
CREATE POLICY "Trainers read own student oura metrics" ON public.oura_metrics
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = oura_metrics.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

-- ── oura_workouts ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trainers access own student workouts" ON public.oura_workouts;
CREATE POLICY "Trainers read own student oura workouts" ON public.oura_workouts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = oura_workouts.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

-- ── oura_sync_logs ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trainers access own student sync logs" ON public.oura_sync_logs;
CREATE POLICY "Trainers read own student oura sync logs" ON public.oura_sync_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = oura_sync_logs.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

-- ── oura_acute_metrics ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trainers access own student acute metrics" ON public.oura_acute_metrics;
CREATE POLICY "Trainers read own student oura acute metrics" ON public.oura_acute_metrics
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = oura_acute_metrics.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

-- ── whoop_connections ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trainers access own student whoop connections" ON public.whoop_connections;
CREATE POLICY "Trainers read own student whoop connections" ON public.whoop_connections
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = whoop_connections.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

-- ── whoop_metrics ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trainers access own student whoop metrics" ON public.whoop_metrics;
CREATE POLICY "Trainers read own student whoop metrics" ON public.whoop_metrics
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = whoop_metrics.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

-- ── whoop_workouts ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trainers access own student whoop workouts" ON public.whoop_workouts;
CREATE POLICY "Trainers read own student whoop workouts" ON public.whoop_workouts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = whoop_workouts.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

-- ── whoop_sync_logs ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trainers access own student whoop sync logs" ON public.whoop_sync_logs;
CREATE POLICY "Trainers read own student whoop sync logs" ON public.whoop_sync_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = whoop_sync_logs.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

-- ── Defense in depth: drop write privileges at the grant layer too ──────────
-- With RLS enabled and no write policies these are already denied, but the
-- revoke keeps the tables locked even if a permissive policy is added later.
REVOKE INSERT, UPDATE, DELETE ON public.oura_connections    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.oura_metrics        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.oura_workouts       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.oura_sync_logs      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.oura_acute_metrics  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.whoop_connections   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.whoop_metrics       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.whoop_workouts      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.whoop_sync_logs     FROM anon, authenticated;
