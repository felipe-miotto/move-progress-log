-- Security linter follow-ups (Lovable scan, 2026-07-09), findings 1 and 2.
-- Finding 3 (student-avatars INSERT scope) needs an app-side path refactor
-- first (AddStudentDialog uploads before the student row exists) and is
-- deliberately NOT addressed here.

-- ── Finding 1: students lacked the admin bypass every sibling table has ─────
DROP POLICY IF EXISTS "Trainers manage own students" ON public.students;
CREATE POLICY "Trainers manage own students" ON public.students
  FOR ALL TO authenticated
  USING (auth.uid() = trainer_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = trainer_id OR public.has_role(auth.uid(), 'admin'));

-- ── Finding 2: replace LIKE prefix checks with starts_with() ────────────────
-- LIKE treats % and _ in object names as wildcards; starts_with() is literal.
-- Same policies as 20260513074954, only the name check changes.

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

-- The *_delete policies are admin-only and never used LIKE; left untouched.
