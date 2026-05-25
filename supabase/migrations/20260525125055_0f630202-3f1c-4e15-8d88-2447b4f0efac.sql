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
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ) THEN
    RAISE EXCEPTION 'Access denied to store Oura tokens for this student' USING ERRCODE = '42501';
  END IF;

  access_secret_name := 'oura_access_' || p_student_id::text;
  refresh_secret_name := 'oura_refresh_' || p_student_id::text;

  DELETE FROM vault.secrets WHERE name = access_secret_name;
  DELETE FROM vault.secrets WHERE name = refresh_secret_name;

  PERFORM vault.create_secret(p_access_token, access_secret_name);
  PERFORM vault.create_secret(p_refresh_token, refresh_secret_name);

  INSERT INTO public.oura_connections (
    student_id,
    access_token,
    refresh_token,
    token_expires_at,
    is_active,
    connected_at,
    updated_at
  ) VALUES (
    p_student_id,
    'ENCRYPTED',
    'ENCRYPTED',
    p_token_expires_at,
    true,
    now(),
    now()
  )
  ON CONFLICT (student_id) DO UPDATE
  SET access_token = 'ENCRYPTED',
      refresh_token = 'ENCRYPTED',
      token_expires_at = EXCLUDED.token_expires_at,
      is_active = true,
      connected_at = COALESCE(public.oura_connections.connected_at, now()),
      updated_at = now();
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.store_oura_tokens(uuid, text, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_oura_tokens(uuid, text, text, timestamp with time zone) TO service_role;