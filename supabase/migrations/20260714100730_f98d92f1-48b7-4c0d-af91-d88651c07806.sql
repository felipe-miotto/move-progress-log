
CREATE OR REPLACE FUNCTION public.mcp_run_readonly_query(
  p_sql text,
  p_max_rows int DEFAULT 5000,
  p_timeout_ms int DEFAULT 15000
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sql text;
  v_lower text;
  v_max int;
  v_timeout int;
BEGIN
  IF p_sql IS NULL OR btrim(p_sql) = '' THEN
    RAISE EXCEPTION 'Empty query';
  END IF;

  -- Trim + strip trailing semicolons (single statement only)
  v_sql := regexp_replace(btrim(p_sql), ';+\s*$', '');

  IF position(';' in v_sql) > 0 THEN
    RAISE EXCEPTION 'Multiple statements are not allowed';
  END IF;

  v_lower := lower(v_sql);
  IF v_lower !~ '^(select|with|explain\s+select|explain\s+with|table|values)\M' THEN
    RAISE EXCEPTION 'Only SELECT / WITH / EXPLAIN SELECT / TABLE / VALUES queries are allowed';
  END IF;

  -- Belt-and-suspenders keyword blocklist (edge function already validates, but guard the DB too)
  IF v_lower ~ '\m(insert|update|delete|merge|alter|drop|create|grant|revoke|truncate|copy|vacuum|reindex|cluster|call|do|listen|notify|lock|comment|security\s+definer|set\s+role|reset\s+role)\M' THEN
    RAISE EXCEPTION 'Forbidden keyword in query';
  END IF;

  v_max := LEAST(GREATEST(COALESCE(p_max_rows, 5000), 1), 10000);
  v_timeout := LEAST(GREATEST(COALESCE(p_timeout_ms, 15000), 500), 30000);

  -- Enforce read-only + timeout for THIS call only
  PERFORM set_config('transaction_read_only', 'on', true);
  PERFORM set_config('statement_timeout', v_timeout::text, true);

  RETURN QUERY EXECUTE
    format('SELECT to_jsonb(t) FROM (%s) t LIMIT %s', v_sql, v_max);
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_run_readonly_query(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_run_readonly_query(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_run_readonly_query(text, int, int) TO service_role;

COMMENT ON FUNCTION public.mcp_run_readonly_query(text, int, int) IS
  'Read-only SQL executor for the app-hosted MCP server. Runs a single SELECT/WITH as the caller (SECURITY INVOKER), enforcing RLS, a READ ONLY transaction, a statement timeout, and a row cap.';
