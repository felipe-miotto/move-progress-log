-- Fix: Oura token RPCs were rejecting legitimate service_role (edge) calls.
--
-- Root cause: 20260507190000_harden_oura_token_rpc_auth_guard.sql (re-applied
-- by 20260509075319) gated the function bodies on
--   current_setting('request.jwt.claim.role', true)
-- to detect service_role. That GUC is the deprecated per-claim PostgREST
-- setting and is not reliably populated, so service_role calls were seen as
-- caller_role <> 'service_role' with auth.uid() IS NULL and rejected with
-- SQLSTATE 42501 ("Access denied to Oura tokens for this student"). The
-- oura-sync edge function could no longer read or refresh Vault tokens, so
-- the 7-day sync failed for every day.
--
-- Fix: restore the service_role-safe ownership guard used before
-- 20260507190000 -- the in-body check runs only for real end users
-- (auth.uid() IS NOT NULL); service_role calls (auth.uid() IS NULL) pass
-- through. The principal access barrier remains the EXECUTE grant: these
-- RPCs are granted only to service_role, with PUBLIC/anon/authenticated
-- revoked, so they stay callable solely by the edge/service_role.
--
-- This migration reads no token values and logs none; Vault secret names
-- ('oura_access_' / 'oura_refresh_' || student_id) and behavior are preserved.

CREATE OR REPLACE FUNCTION public.get_oura_access_token(p_student_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  secret_name TEXT;
  decrypted_token TEXT;
BEGIN
  -- Defense-in-depth: ownership is enforced only for end users. service_role
  -- has auth.uid() IS NULL, so it is not blocked here -- the GRANT is the gate.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ) THEN
    RAISE EXCEPTION 'Access denied to Oura tokens for this student' USING ERRCODE = '42501';
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
BEGIN
  -- Defense-in-depth: ownership is enforced only for end users. service_role
  -- has auth.uid() IS NULL, so it is not blocked here -- the GRANT is the gate.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ) THEN
    RAISE EXCEPTION 'Access denied to Oura tokens for this student' USING ERRCODE = '42501';
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
BEGIN
  -- Defense-in-depth: ownership is enforced only for end users. service_role
  -- has auth.uid() IS NULL, so it is not blocked here -- the GRANT is the gate.
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

  UPDATE public.oura_connections
  SET token_expires_at = p_token_expires_at,
      updated_at = now()
  WHERE student_id = p_student_id;
END;
$function$;

-- Re-affirm the principal barrier: EXECUTE only for service_role.
REVOKE EXECUTE ON FUNCTION public.get_oura_access_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_oura_refresh_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_oura_tokens(uuid, text, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_oura_access_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_oura_refresh_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_oura_tokens(uuid, text, text, timestamp with time zone) TO service_role;
