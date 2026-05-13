-- ============================================================================
-- PRECISION 12 — RPC transacional de submit do Questionário (E3.5)
-- ============================================================================
-- Atomiza o submit final do Questionário Precision 12 em 4 escritas
-- relacionadas que precisam ser consistentes:
--
--   1. Validar token (link válido, não usado, não revogado, não expirado)
--   2. Validar assessment (existe, tipo correto, status compatível)
--   3. INSERT em questionnaire_responses (com assessment_id, version,
--      submitted_at server-side e nunca parq_blocked — generated column)
--   4. UPDATE em assessments (status baseado em parq_blocked + completed_at)
--   5. UPDATE em precision12_questionnaire_links (used_at = now())
--
-- Tudo dentro de uma única transação Postgres — se qualquer passo falhar,
-- nenhuma escrita persiste (sem assessments completados sem response,
-- sem links marcados como used sem dados, etc.).
--
-- SECURITY INVOKER: chamada APENAS via service role (edge function
-- submit-precision12-questionnaire). RLS continua valendo se algum
-- outro caller tentar — defesa em profundidade.
--
-- GRANT: apenas service_role pode executar. Anon/authenticated bloqueados.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — Função
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.submit_precision12_questionnaire_response(
  p_token_hash text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_link public.precision12_questionnaire_links%rowtype;
  v_assessment public.assessments%rowtype;
  v_response public.questionnaire_responses%rowtype;
  v_response_exists boolean;
  v_final_status text;
begin
  -- ─── Validação básica de input ──────────────────────────────────────────
  if p_token_hash is null or length(p_token_hash) = 0 then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  -- ─── 1. Lookup do link por hash (SELECT FOR UPDATE pra serializar
  --        submits simultâneos do mesmo token) ────────────────────────────
  select * into v_link
    from public.precision12_questionnaire_links
   where token_hash = p_token_hash
   for update;

  if not found then
    -- Erro genérico (não diferencia entre 'não existe' / 'expirado' /
    -- 'revogado' / 'usado' pra evitar enumeração)
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;
  if v_link.revoked_at is not null then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;
  if v_link.used_at is not null then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;
  if v_link.expires_at <= now() then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;

  -- ─── 2. Lookup do assessment vinculado ──────────────────────────────────
  select * into v_assessment
    from public.assessments
   where id = v_link.assessment_id
   for update;

  if not found then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;
  if v_assessment.assessment_type is distinct from 'questionnaire_precision12' then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;
  if v_assessment.status not in ('in_progress', 'blocked') then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;

  -- ─── 3. Bloquear submit duplicado ───────────────────────────────────────
  select exists (
    select 1 from public.questionnaire_responses
     where assessment_id = v_assessment.id
       and submitted_at is not null
  ) into v_response_exists;

  if v_response_exists then
    raise exception 'already_submitted' using errcode = '23505';
  end if;

  -- ─── 4. INSERT em questionnaire_responses ───────────────────────────────
  -- Força assessment_id, questionnaire_version e submitted_at server-side.
  -- Remove parq_blocked do payload pra garantir que vem da generated column.
  -- jsonb_populate_record popula colunas a partir do payload (campos
  -- ausentes ficam null; campos extras são ignorados; tipos são coagidos).
  insert into public.questionnaire_responses
  select * from jsonb_populate_record(
    null::public.questionnaire_responses,
    p_payload
      - 'parq_blocked'
      - 'created_at'
      - 'updated_at'
    || jsonb_build_object(
      'assessment_id', v_assessment.id,
      'questionnaire_version', 'precision12_v1',
      'submitted_at', now()
    )
  );

  -- Re-read pra obter o parq_blocked computado pela generated column
  select * into v_response
    from public.questionnaire_responses
   where assessment_id = v_assessment.id;

  -- ─── 5. UPDATE assessment status ────────────────────────────────────────
  v_final_status := case
    when coalesce(v_response.parq_blocked, false) then 'blocked'
    else 'completed'
  end;

  update public.assessments
     set status = v_final_status,
         completed_at = now(),
         updated_at = now()
   where id = v_assessment.id;

  -- ─── 6. Marcar link como usado (single-use) ─────────────────────────────
  update public.precision12_questionnaire_links
     set used_at = now()
   where id = v_link.id;

  -- ─── 7. Retornar resposta segura (sem payload, sem token) ───────────────
  return jsonb_build_object(
    'ok', true,
    'assessment_id', v_assessment.id,
    'status', v_final_status,
    'parq_blocked', coalesce(v_response.parq_blocked, false),
    'submitted_at', v_response.submitted_at
  );
end;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — Grants (apenas service_role executa)
-- ────────────────────────────────────────────────────────────────────────────

revoke all on function public.submit_precision12_questionnaire_response(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.submit_precision12_questionnaire_response(text, jsonb)
  to service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — COMMENT (string literal única, sem `||` — gotcha Lovable)
-- ────────────────────────────────────────────────────────────────────────────

comment on function public.submit_precision12_questionnaire_response(text, jsonb) is 'RPC atomico de submit do Questionario Precision 12. Valida token (lookup por hash, nao usado/nao revogado/nao expirado), valida assessment (tipo questionnaire_precision12, status in_progress ou blocked), INSERT em questionnaire_responses (assessment_id/questionnaire_version/submitted_at sao forcados server-side; parq_blocked nunca aceita do payload pois e generated column), UPDATE em assessments.status (completed ou blocked baseado em parq_blocked), UPDATE em precision12_questionnaire_links.used_at. Tudo numa unica transacao. SECURITY INVOKER + GRANT apenas service_role. Erros de token sao genericos (invalid_token) para nao ajudar enumeracao.';
