-- One-shot helper used to seed the cron_service_role_key Vault secret during
-- the B2 cron bootstrap (20260709182651). The secret is stored and nothing
-- references this function anymore.
-- private.invoke_cron_edge stays: the four wearable cron jobs depend on it.
DROP FUNCTION IF EXISTS public._bootstrap_upsert_vault_secret(text, text);
