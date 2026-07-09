-- === 20260709150000_wearables_rls_write_lockdown.sql ===
DROP POLICY IF EXISTS "Trainers access own student connections" ON public.oura_connections;
CREATE POLICY "Trainers read own student oura connections" ON public.oura_connections
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = oura_connections.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY IF EXISTS "Trainers access own student metrics" ON public.oura_metrics;
CREATE POLICY "Trainers read own student oura metrics" ON public.oura_metrics
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = oura_metrics.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY IF EXISTS "Trainers access own student workouts" ON public.oura_workouts;
CREATE POLICY "Trainers read own student oura workouts" ON public.oura_workouts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = oura_workouts.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY IF EXISTS "Trainers access own student sync logs" ON public.oura_sync_logs;
CREATE POLICY "Trainers read own student oura sync logs" ON public.oura_sync_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = oura_sync_logs.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY IF EXISTS "Trainers access own student acute metrics" ON public.oura_acute_metrics;
CREATE POLICY "Trainers read own student oura acute metrics" ON public.oura_acute_metrics
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = oura_acute_metrics.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY IF EXISTS "Trainers access own student whoop connections" ON public.whoop_connections;
CREATE POLICY "Trainers read own student whoop connections" ON public.whoop_connections
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = whoop_connections.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY IF EXISTS "Trainers access own student whoop metrics" ON public.whoop_metrics;
CREATE POLICY "Trainers read own student whoop metrics" ON public.whoop_metrics
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = whoop_metrics.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY IF EXISTS "Trainers access own student whoop workouts" ON public.whoop_workouts;
CREATE POLICY "Trainers read own student whoop workouts" ON public.whoop_workouts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = whoop_workouts.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY IF EXISTS "Trainers access own student whoop sync logs" ON public.whoop_sync_logs;
CREATE POLICY "Trainers read own student whoop sync logs" ON public.whoop_sync_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = whoop_sync_logs.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

REVOKE INSERT, UPDATE, DELETE ON public.oura_connections    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.oura_metrics        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.oura_workouts       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.oura_sync_logs      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.oura_acute_metrics  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.whoop_connections   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.whoop_metrics       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.whoop_workouts      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.whoop_sync_logs     FROM anon, authenticated;

-- === 20260709200000_drop_bootstrap_vault_helper.sql ===
DROP FUNCTION IF EXISTS public._bootstrap_upsert_vault_secret(text, text);

-- === 20260709201000_security_linter_hardening.sql ===
DROP POLICY IF EXISTS "Trainers manage own students" ON public.students;
CREATE POLICY "Trainers manage own students" ON public.students
  FOR ALL TO authenticated
  USING (auth.uid() = trainer_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = trainer_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "dexa_pdfs_trainer_own_or_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "dexa_pdfs_trainer_own_or_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "dexa_pdfs_trainer_own_or_admin_update" ON storage.objects;

CREATE POLICY "dexa_pdfs_trainer_own_or_admin_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dexa-pdfs'
    AND (
      EXISTS (SELECT 1 FROM public.students s WHERE s.trainer_id = auth.uid() AND starts_with(storage.objects.name, s.id::text || '/'))
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    )
  );

CREATE POLICY "dexa_pdfs_trainer_own_or_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dexa-pdfs'
    AND (
      EXISTS (SELECT 1 FROM public.students s WHERE s.trainer_id = auth.uid() AND starts_with(storage.objects.name, s.id::text || '/'))
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    )
  );

CREATE POLICY "dexa_pdfs_trainer_own_or_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dexa-pdfs'
    AND (
      EXISTS (SELECT 1 FROM public.students s WHERE s.trainer_id = auth.uid() AND starts_with(storage.objects.name, s.id::text || '/'))
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'dexa-pdfs'
    AND (
      EXISTS (SELECT 1 FROM public.students s WHERE s.trainer_id = auth.uid() AND starts_with(storage.objects.name, s.id::text || '/'))
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    )
  );

DROP POLICY IF EXISTS "precision_reports_trainer_own_or_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "precision_reports_trainer_own_or_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "precision_reports_trainer_own_or_admin_update" ON storage.objects;

CREATE POLICY "precision_reports_trainer_own_or_admin_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'precision-reports'
    AND (
      EXISTS (SELECT 1 FROM public.students s WHERE s.trainer_id = auth.uid() AND starts_with(storage.objects.name, s.id::text || '/'))
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    )
  );

CREATE POLICY "precision_reports_trainer_own_or_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'precision-reports'
    AND (
      EXISTS (SELECT 1 FROM public.students s WHERE s.trainer_id = auth.uid() AND starts_with(storage.objects.name, s.id::text || '/'))
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    )
  );

CREATE POLICY "precision_reports_trainer_own_or_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'precision-reports'
    AND (
      EXISTS (SELECT 1 FROM public.students s WHERE s.trainer_id = auth.uid() AND starts_with(storage.objects.name, s.id::text || '/'))
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'precision-reports'
    AND (
      EXISTS (SELECT 1 FROM public.students s WHERE s.trainer_id = auth.uid() AND starts_with(storage.objects.name, s.id::text || '/'))
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    )
  );