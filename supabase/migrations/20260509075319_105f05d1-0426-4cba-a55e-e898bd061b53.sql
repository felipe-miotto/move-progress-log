-- Defense-in-depth for Oura token RPCs.
CREATE OR REPLACE FUNCTION public.get_oura_access_token(p_student_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  secret_name TEXT;
  decrypted_token TEXT;
  caller_id uuid := auth.uid();
  caller_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF caller_role <> 'service_role' THEN
    IF caller_id IS NULL THEN
      RAISE EXCEPTION 'Access denied to Oura tokens for this student' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = p_student_id
        AND (s.trainer_id = caller_id OR public.has_role(caller_id, 'admin'::app_role))
    ) THEN
      RAISE EXCEPTION 'Access denied to Oura tokens for this student' USING ERRCODE = '42501';
    END IF;
  END IF;
  secret_name := 'oura_access_' || p_student_id::text;
  SELECT decrypted_secret INTO decrypted_token
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
  RETURN decrypted_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_oura_refresh_token(p_student_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  secret_name TEXT;
  decrypted_token TEXT;
  caller_id uuid := auth.uid();
  caller_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF caller_role <> 'service_role' THEN
    IF caller_id IS NULL THEN
      RAISE EXCEPTION 'Access denied to Oura tokens for this student' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = p_student_id
        AND (s.trainer_id = caller_id OR public.has_role(caller_id, 'admin'::app_role))
    ) THEN
      RAISE EXCEPTION 'Access denied to Oura tokens for this student' USING ERRCODE = '42501';
    END IF;
  END IF;
  secret_name := 'oura_refresh_' || p_student_id::text;
  SELECT decrypted_secret INTO decrypted_token
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
  RETURN decrypted_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.store_oura_tokens(
  p_student_id uuid,
  p_access_token text,
  p_refresh_token text,
  p_token_expires_at timestamp with time zone
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  access_secret_name TEXT;
  refresh_secret_name TEXT;
  caller_id uuid := auth.uid();
  caller_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF caller_role <> 'service_role' THEN
    IF caller_id IS NULL THEN
      RAISE EXCEPTION 'Access denied to store Oura tokens for this student' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = p_student_id
        AND (s.trainer_id = caller_id OR public.has_role(caller_id, 'admin'::app_role))
    ) THEN
      RAISE EXCEPTION 'Access denied to store Oura tokens for this student' USING ERRCODE = '42501';
    END IF;
  END IF;
  access_secret_name := 'oura_access_' || p_student_id::text;
  refresh_secret_name := 'oura_refresh_' || p_student_id::text;
  DELETE FROM vault.secrets WHERE name = access_secret_name;
  DELETE FROM vault.secrets WHERE name = refresh_secret_name;
  PERFORM vault.create_secret(p_access_token, access_secret_name);
  PERFORM vault.create_secret(p_refresh_token, refresh_secret_name);
  UPDATE public.oura_connections
  SET token_expires_at = p_token_expires_at,
      updated_at = now()
  WHERE student_id = p_student_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_oura_access_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_oura_refresh_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_oura_tokens(uuid, text, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_oura_access_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_oura_refresh_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_oura_tokens(uuid, text, text, timestamp with time zone) TO service_role;

-- Admin-only review RPC for unlinked session exercises
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
      SELECT sample FROM (
        SELECT DISTINCT coalesce(n2.load_breakdown, CASE WHEN n2.load_kg IS NOT NULL THEN n2.load_kg::text || ' kg' END) AS sample
        FROM normalized n2
        WHERE n2.normalized_name = t.normalized_name
      ) s
      WHERE sample IS NOT NULL AND sample <> ''
      ORDER BY sample
      LIMIT 3
    ) AS load_samples,
    ARRAY(
      SELECT sample FROM (
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