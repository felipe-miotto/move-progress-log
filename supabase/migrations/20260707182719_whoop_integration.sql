-- Whoop integration — tables, RLS, and Vault token functions (hardened).
-- Mirrors the Oura pipeline. Token functions use a POSITIVE allow-list guard
-- (service_role OR owner) — NOT the Oura `auth.uid() IS NOT NULL AND NOT EXISTS`
-- pattern, which no-ops for anon (the PR #220 vuln). Least-privilege grants applied.

-- ── Tables ────────────────────────────────────────────────────────────────
CREATE TABLE public.whoop_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  access_token text NOT NULL DEFAULT 'ENCRYPTED',
  refresh_token text NOT NULL DEFAULT 'ENCRYPTED',
  token_expires_at timestamptz NOT NULL,
  whoop_user_id bigint,
  connected_at timestamptz DEFAULT now(),
  last_sync_at timestamptz,
  is_active boolean DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id)
);

CREATE TABLE public.whoop_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date date NOT NULL,
  cycle_id bigint,
  recovery_score integer,
  hrv_rmssd numeric,
  resting_heart_rate integer,
  spo2 numeric,
  skin_temp numeric,
  day_strain numeric,
  kilojoules numeric,
  sleep_performance integer,
  sleep_efficiency numeric,
  respiratory_rate numeric,
  total_sleep_duration integer,   -- seconds
  deep_sleep_duration integer,    -- seconds (slow-wave)
  rem_sleep_duration integer,     -- seconds
  light_sleep_duration integer,   -- seconds
  awake_time integer,             -- seconds
  disturbance_count integer,
  score_state text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);

CREATE TABLE public.whoop_workouts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  whoop_workout_id uuid NOT NULL,
  sport_name text,
  start_datetime timestamptz,
  end_datetime timestamptz,
  strain numeric,
  average_heart_rate integer,
  max_heart_rate integer,
  kilojoules numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE (student_id, whoop_workout_id)
);

CREATE TABLE public.whoop_sync_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL,
  attempt_number integer DEFAULT 1,
  error_message text,
  metrics_synced integer,
  created_at timestamptz DEFAULT now()
);

-- ── RLS (mirror the "Trainers access own student <x>" oura policies) ────────
ALTER TABLE public.whoop_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whoop_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whoop_workouts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whoop_sync_logs   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers access own student whoop connections" ON public.whoop_connections
  FOR ALL TO public USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = whoop_connections.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));
CREATE POLICY "Trainers access own student whoop metrics" ON public.whoop_metrics
  FOR ALL TO public USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = whoop_metrics.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));
CREATE POLICY "Trainers access own student whoop workouts" ON public.whoop_workouts
  FOR ALL TO public USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = whoop_workouts.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));
CREATE POLICY "Trainers access own student whoop sync logs" ON public.whoop_sync_logs
  FOR ALL TO public USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = whoop_sync_logs.student_id
      AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

-- ── Vault token functions — HARDENED guard (positive allow-list) ───────────
CREATE OR REPLACE FUNCTION public.store_whoop_tokens(
  p_student_id uuid, p_access_token text, p_refresh_token text, p_token_expires_at timestamptz)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','vault' AS $function$
DECLARE access_secret_name text; refresh_secret_name text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.students s WHERE s.id = p_student_id
        AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))))) THEN
    RAISE EXCEPTION 'Access denied to store Whoop tokens for this student' USING ERRCODE = '42501';
  END IF;
  access_secret_name  := 'whoop_access_'  || p_student_id::text;
  refresh_secret_name := 'whoop_refresh_' || p_student_id::text;
  DELETE FROM vault.secrets WHERE name = access_secret_name;
  DELETE FROM vault.secrets WHERE name = refresh_secret_name;
  PERFORM vault.create_secret(p_access_token,  access_secret_name);
  PERFORM vault.create_secret(p_refresh_token, refresh_secret_name);
  INSERT INTO public.whoop_connections (student_id, access_token, refresh_token, token_expires_at, is_active, connected_at, updated_at)
  VALUES (p_student_id, 'ENCRYPTED', 'ENCRYPTED', p_token_expires_at, true, now(), now())
  ON CONFLICT (student_id) DO UPDATE
    SET token_expires_at = EXCLUDED.token_expires_at, is_active = true, updated_at = now();
END; $function$;

CREATE OR REPLACE FUNCTION public.get_whoop_access_token(p_student_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','vault' AS $function$
DECLARE decrypted_token text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.students s WHERE s.id = p_student_id
        AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))))) THEN
    RAISE EXCEPTION 'Access denied to Whoop tokens for this student' USING ERRCODE = '42501';
  END IF;
  SELECT decrypted_secret INTO decrypted_token FROM vault.decrypted_secrets
    WHERE name = 'whoop_access_' || p_student_id::text LIMIT 1;
  RETURN decrypted_token;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_whoop_refresh_token(p_student_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','vault' AS $function$
DECLARE decrypted_token text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.students s WHERE s.id = p_student_id
        AND (s.trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))))) THEN
    RAISE EXCEPTION 'Access denied to Whoop tokens for this student' USING ERRCODE = '42501';
  END IF;
  SELECT decrypted_secret INTO decrypted_token FROM vault.decrypted_secrets
    WHERE name = 'whoop_refresh_' || p_student_id::text LIMIT 1;
  RETURN decrypted_token;
END; $function$;

-- ── Least-privilege grants (day one) ───────────────────────────────────────
-- Revoke the blanket PUBLIC grant too: CREATE FUNCTION grants EXECUTE to PUBLIC
-- by default, so revoking only anon/authenticated leaves them able to execute
-- via PUBLIC. Revoke PUBLIC + both roles, then grant service_role explicitly
-- (the Edge Functions run as service_role).
REVOKE EXECUTE ON FUNCTION public.store_whoop_tokens(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_whoop_access_token(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_whoop_refresh_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.store_whoop_tokens(uuid, text, text, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.get_whoop_access_token(uuid)  TO service_role;
GRANT  EXECUTE ON FUNCTION public.get_whoop_refresh_token(uuid) TO service_role;
