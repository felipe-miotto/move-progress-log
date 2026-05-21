-- Add the `updated_at` audit column that store_oura_tokens expects.
--
-- Migrations 20260521194447_fix_oura_token_rpc_service_role.sql and
-- 20260521195717 redefined public.store_oura_tokens with
--   UPDATE public.oura_connections SET ..., updated_at = now() ...
-- but public.oura_connections never had an `updated_at` column. plpgsql
-- defers column resolution to execution time, so the function was created
-- fine, yet oura-callback failed when persisting refreshed tokens with
--   SQLSTATE 42703: column "updated_at" of relation "oura_connections"
--   does not exist
--
-- Fix: add `updated_at` as a standard audit column. ADD COLUMN ... DEFAULT
-- backfills existing rows with now(); the column is NOT NULL with a now()
-- default for future inserts. It is kept current on every UPDATE via the
-- project's shared trigger function public.update_updated_at_column() --
-- the same pattern already used by public.oura_acute_metrics and others.
--
-- `last_sync_at` is a distinct concept (last successful Oura data sync) and
-- is intentionally left untouched.

ALTER TABLE public.oura_connections
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER update_oura_connections_updated_at
  BEFORE UPDATE ON public.oura_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
