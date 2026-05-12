-- Harden legacy analytical views that are not part of the current UI flow.
-- They aggregate sensitive student/training data and should not be directly
-- exposed through the public Data API to anon/authenticated roles.

DO $$
BEGIN
  IF to_regclass('public.athlete_daily_loads') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.athlete_daily_loads FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regclass('public.athlete_metric_trends') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.athlete_metric_trends FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regclass('public.ai_tasks_rate_limit') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.ai_tasks_rate_limit FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
