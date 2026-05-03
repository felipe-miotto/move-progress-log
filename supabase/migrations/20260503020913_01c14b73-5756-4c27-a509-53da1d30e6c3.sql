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