-- Fix: store_oura_tokens só fazia UPDATE, então o primeiro OAuth callback de
-- um aluno (ou a reconexão de um aluno desativado) silenciosamente não
-- gravava em oura_connections. O callback redirecionava pra success, mas
-- o app do treinador (useOuraConnection / useOuraConnectionStatus) filtra
-- oura_connections.is_active = true e via "não conectado".
--
-- Causa raiz (versão atual em 20260521194447_fix_oura_token_rpc_service_role):
--   UPDATE public.oura_connections
--   SET token_expires_at = p_token_expires_at,
--       updated_at = now()
--   WHERE student_id = p_student_id;
--
-- Sem INSERT, sem is_active = true, sem access_token/refresh_token (NOT NULL
-- no schema). O esquema da tabela tem UNIQUE(student_id) — usamos
-- INSERT ... ON CONFLICT (student_id) DO UPDATE.
--
-- Política de tokens: continuam armazenados no Vault (oura_access_<id> /
-- oura_refresh_<id>). As colunas access_token / refresh_token de
-- oura_connections viram ponteiros literais 'ENCRYPTED' — apenas pra
-- satisfazer NOT NULL; o app real consulta o Vault via
-- get_oura_access_token / get_oura_refresh_token.
--
-- Segurança preservada (idêntica à migration anterior):
--   * SECURITY DEFINER + search_path = 'public','vault'
--   * Ownership guard só para auth.uid() IS NOT NULL — service_role passa
--     (gate é a EXECUTE grant)
--   * REVOKE EXECUTE de PUBLIC, anon, authenticated
--   * GRANT EXECUTE só para service_role
--
-- Não toca:
--   * get_oura_access_token / get_oura_refresh_token (sem mudança).
--   * oura-callback edge function (já chama o RPC com os 4 params certos).
--   * Vault secret names ou política de criação/limpeza.

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

  -- Vault: rotaciona secrets antigos antes de criar os novos. Mesma política
  -- de antes — não há leitura de valores antigos.
  DELETE FROM vault.secrets WHERE name = access_secret_name;
  DELETE FROM vault.secrets WHERE name = refresh_secret_name;

  PERFORM vault.create_secret(p_access_token, access_secret_name);
  PERFORM vault.create_secret(p_refresh_token, refresh_secret_name);

  -- Upsert da conexão. access_token/refresh_token são ponteiros literais —
  -- o token real está no Vault. is_active = true reabilita reconexões de
  -- alunos que tinham desativado a conexão. connected_at é preservado em
  -- reconexões (COALESCE com o valor existente), pra refletir a primeira
  -- conexão; updated_at sempre marca a operação atual.
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

-- Reafirma a barreira principal: EXECUTE só para service_role.
REVOKE EXECUTE ON FUNCTION public.store_oura_tokens(uuid, text, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_oura_tokens(uuid, text, text, timestamp with time zone) TO service_role;
