CREATE OR REPLACE FUNCTION public._bootstrap_upsert_vault_secret(p_name text, p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = p_name;
  PERFORM vault.create_secret(p_value, p_name);
END;
$$;

REVOKE ALL ON FUNCTION public._bootstrap_upsert_vault_secret(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._bootstrap_upsert_vault_secret(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public._bootstrap_upsert_vault_secret(text, text) TO service_role;

-- Helper to invoke edge functions from cron using vault-stored service role key.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.invoke_cron_edge(function_name text, body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_key text;
  v_url text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'cron_service_role_key'
  LIMIT 1;

  IF v_key IS NULL OR length(v_key) < 20 THEN
    RAISE EXCEPTION 'cron_service_role_key missing or invalid in vault';
  END IF;

  v_url := 'https://zrgfrdmywxlemcuiqtqg.supabase.co/functions/v1/' || function_name;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := body
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_cron_edge(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.invoke_cron_edge(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.invoke_cron_edge(text, jsonb) TO service_role, postgres;