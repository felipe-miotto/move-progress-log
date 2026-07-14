-- Add 06:00 BRT (09:00 UTC) morning auto-sync cycles for Oura and Whoop.
-- Restores the morning cycle oura-sync-scheduled documents in its header
-- ("6h BRT = 9h UTC") but that was never committed — only the 13:00 UTC
-- midmorning pair exists. Additive: the midmorning (and prod-only evening)
-- cycles are left untouched.
--
-- Depends on prod-side pieces that already exist and are NOT recreated here:
--   * private.invoke_cron_edge(text, jsonb)   (migration 20260709182651)
--   * vault secret cron_service_role_key
--   * extensions pg_cron and pg_net
--
-- Idempotency: pg_cron's named cron.schedule() upserts-on-duplicate in recent
-- versions but ERRORed on older ones (Context7 / pg_cron: job_metadata.c
-- ON CONFLICT vs errors.md "jobname_username_uniq"). We guard explicitly so the
-- migration is safely re-runnable on any pg_cron version.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'oura-sync-morning') THEN
    PERFORM cron.unschedule('oura-sync-morning');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whoop-sync-morning') THEN
    PERFORM cron.unschedule('whoop-sync-morning');
  END IF;
END $$;

-- Oura morning cycle — 09:00 UTC = 06:00 BRT
SELECT cron.schedule(
  'oura-sync-morning',
  '0 9 * * *',
  $$SELECT private.invoke_cron_edge('oura-sync-scheduled', '{"time":"morning","schedule":"6h"}'::jsonb);$$
);

-- Whoop morning cycle — 09:15 UTC = 06:15 BRT (mirrors the existing :00/:15 midmorning stagger)
SELECT cron.schedule(
  'whoop-sync-morning',
  '15 9 * * *',
  $$SELECT private.invoke_cron_edge('whoop-sync-all', '{"schedule":"morning"}'::jsonb);$$
);
