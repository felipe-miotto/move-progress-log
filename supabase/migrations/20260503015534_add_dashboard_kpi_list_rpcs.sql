-- Dashboard KPI list RPCs (drill-down support)
--
-- The existing count_* functions (migration 20260502230000) return totals
-- used by the dashboard cards. This migration adds matching list_* functions
-- that return the actual student/prescription IDs, so the drill-down lists
-- (/alunos?inactive=N, /alunos?dropping=true, /prescricoes?stagnant=N) can
-- use the EXACT same server-side rule and stay consistent with the cards.
--
-- Each list_* function uses the same boundary logic as its count_*
-- counterpart (CURRENT_DATE, p_weeks * 7, etc.) — never Date.now()/Date.parse()
-- on the client, which previously caused timezone drift around midnight.
--
-- All functions are STABLE + SECURITY DEFINER, mirroring the existing pattern.
--
-- Manual validation queries (run after applying):
--   SELECT count_students_inactive(7);
--   SELECT count(*) FROM list_students_inactive(7);   -- must equal above
--   SELECT count_students_frequency_dropping();
--   SELECT count(*) FROM list_students_frequency_dropping();   -- must equal
--   SELECT count_prescriptions_stagnant(4);
--   SELECT count(*) FROM list_prescriptions_stagnant(4);   -- must equal

-- ────────────────────────────────────────────────────────────────────────────
-- 1. list_students_inactive(p_days int)
--    Mirror of count_students_inactive(p_days): students that exist for at
--    least p_days but had no workout_session in the last p_days. Brand new
--    students (created < p_days ago) are NOT included.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_students_inactive(p_days integer)
 RETURNS TABLE(student_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT s.id AS student_id
  FROM students s
  WHERE s.created_at::date <= CURRENT_DATE - p_days
    AND NOT EXISTS (
      SELECT 1
      FROM workout_sessions ws
      WHERE ws.student_id = s.id
        AND ws.date >= CURRENT_DATE - p_days
    );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. list_students_frequency_dropping()
--    Mirror of count_students_frequency_dropping(): students whose session
--    count in the last 28 days (rolling) is strictly less than their count
--    in the prior 28-day window (days 28-56 ago). Students with no sessions
--    in the prior window are excluded to avoid noise from new students.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_students_frequency_dropping()
 RETURNS TABLE(student_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  WITH prior AS (
    SELECT ws.student_id, COUNT(*)::integer AS prior_count
    FROM workout_sessions ws
    WHERE ws.date >= CURRENT_DATE - 56
      AND ws.date <  CURRENT_DATE - 28
    GROUP BY ws.student_id
  ),
  recent AS (
    SELECT ws.student_id, COUNT(*)::integer AS recent_count
    FROM workout_sessions ws
    WHERE ws.date >= CURRENT_DATE - 28
      AND ws.date <  CURRENT_DATE
    GROUP BY ws.student_id
  )
  SELECT p.student_id
  FROM prior p
  LEFT JOIN recent r ON r.student_id = p.student_id
  WHERE COALESCE(r.recent_count, 0) < p.prior_count
    AND p.prior_count > 0;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. list_prescriptions_stagnant(p_weeks int)
--    Mirror of count_prescriptions_stagnant(p_weeks): prescriptions with at
--    least one ACTIVE assignment whose updated_at is older than p_weeks
--    weeks. Returns DISTINCT prescription IDs.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_prescriptions_stagnant(p_weeks integer)
 RETURNS TABLE(prescription_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT DISTINCT wp.id AS prescription_id
  FROM workout_prescriptions wp
  WHERE wp.updated_at < (CURRENT_DATE - (p_weeks * 7))::timestamp
    AND EXISTS (
      SELECT 1
      FROM prescription_assignments pa
      WHERE pa.prescription_id = wp.id
        AND pa.start_date <= CURRENT_DATE
        AND (pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE)
    );
$$;
