-- Admin-only read model for historical session exercises that still lack
-- exercise_library_id. This avoids broadening public.exercises RLS while making
-- the admin review page reliable for catalog curation.

CREATE OR REPLACE FUNCTION public.list_unlinked_session_exercise_review()
RETURNS TABLE(
  normalized_name text,
  display_name text,
  total_rows integer,
  variants text[],
  load_samples text[],
  observation_samples text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin role required to review unlinked session exercises'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH normalized AS (
    SELECT
      regexp_replace(
        trim(regexp_replace(
          translate(
            lower(coalesce(e.exercise_name, '')),
            'áàâãäéèêëíìîïóòôõöúùûüç',
            'aaaaaeeeeiiiiooooouuuuc'
          ),
          '[^a-z0-9]+',
          ' ',
          'g'
        )),
        '[[:space:]]+',
        ' ',
        'g'
      ) AS normalized_name,
      trim(e.exercise_name) AS exercise_name,
      e.load_kg,
      nullif(trim(e.load_breakdown), '') AS load_breakdown,
      nullif(trim(e.observations), '') AS observations
    FROM public.exercises e
    WHERE e.exercise_library_id IS NULL
      AND coalesce(trim(e.exercise_name), '') <> ''
  ),
  variant_counts AS (
    SELECT
      n.normalized_name,
      n.exercise_name,
      count(*)::integer AS variant_rows
    FROM normalized n
    WHERE n.normalized_name <> ''
    GROUP BY n.normalized_name, n.exercise_name
  ),
  variant_arrays AS (
    SELECT
      vc.normalized_name,
      (array_agg(vc.exercise_name ORDER BY vc.variant_rows DESC, vc.exercise_name))[1] AS display_name,
      array_agg(format('%s (%s)', vc.exercise_name, vc.variant_rows) ORDER BY vc.variant_rows DESC, vc.exercise_name) AS variants
    FROM variant_counts vc
    GROUP BY vc.normalized_name
  ),
  totals AS (
    SELECT n.normalized_name, count(*)::integer AS total_rows
    FROM normalized n
    WHERE n.normalized_name <> ''
    GROUP BY n.normalized_name
  )
  SELECT
    t.normalized_name,
    va.display_name,
    t.total_rows,
    va.variants,
    ARRAY(
      SELECT sample
      FROM (
        SELECT DISTINCT coalesce(n2.load_breakdown, CASE WHEN n2.load_kg IS NOT NULL THEN n2.load_kg::text || ' kg' END) AS sample
        FROM normalized n2
        WHERE n2.normalized_name = t.normalized_name
      ) s
      WHERE sample IS NOT NULL AND sample <> ''
      ORDER BY sample
      LIMIT 3
    ) AS load_samples,
    ARRAY(
      SELECT sample
      FROM (
        SELECT DISTINCT n3.observations AS sample
        FROM normalized n3
        WHERE n3.normalized_name = t.normalized_name
      ) s
      WHERE sample IS NOT NULL AND sample <> ''
      ORDER BY sample
      LIMIT 2
    ) AS observation_samples
  FROM totals t
  JOIN variant_arrays va ON va.normalized_name = t.normalized_name
  ORDER BY t.total_rows DESC, va.display_name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_unlinked_session_exercise_review() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_unlinked_session_exercise_review() TO authenticated;
