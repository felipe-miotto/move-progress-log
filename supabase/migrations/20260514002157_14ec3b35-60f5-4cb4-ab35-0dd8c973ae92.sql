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
  if p_token_hash is null or length(p_token_hash) = 0 then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  select * into v_link
    from public.precision12_questionnaire_links
   where token_hash = p_token_hash
   for update;

  if not found then
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

  select exists (
    select 1 from public.questionnaire_responses
     where assessment_id = v_assessment.id
  ) into v_response_exists;

  if v_response_exists then
    raise exception 'already_submitted' using errcode = '23505';
  end if;

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

  select * into v_response
    from public.questionnaire_responses
   where assessment_id = v_assessment.id;

  v_final_status := case
    when coalesce(v_response.parq_blocked, false) then 'blocked'
    else 'completed'
  end;

  update public.assessments
     set status = v_final_status,
         completed_at = now(),
         updated_at = now()
   where id = v_assessment.id;

  update public.precision12_questionnaire_links
     set used_at = now()
   where id = v_link.id;

  return jsonb_build_object(
    'ok', true,
    'assessment_id', v_assessment.id,
    'status', v_final_status,
    'parq_blocked', coalesce(v_response.parq_blocked, false),
    'submitted_at', v_response.submitted_at
  );
end;
$$;

revoke all on function public.submit_precision12_questionnaire_response(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.submit_precision12_questionnaire_response(text, jsonb)
  to service_role;

comment on function public.submit_precision12_questionnaire_response(text, jsonb) is 'RPC atomico de submit do Questionario Precision 12. Defesa em camadas: GRANT EXECUTE restrito a service_role; valida token via hash; valida assessment; bloqueia row pre-existente (already_submitted); INSERT forcando assessment_id/questionnaire_version/submitted_at server-side; parq_blocked nunca aceita do payload; UPDATE em assessments.status + completed_at; UPDATE em precision12_questionnaire_links.used_at. Tudo numa unica transacao plpgsql com SELECT FOR UPDATE no link. SECURITY INVOKER mas chamada por service_role.';