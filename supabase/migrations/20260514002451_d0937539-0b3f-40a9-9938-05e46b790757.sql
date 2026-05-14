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
  v_rec public.questionnaire_responses%rowtype;
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

  if not found then raise exception 'invalid_token' using errcode = 'P0002'; end if;
  if v_link.revoked_at is not null then raise exception 'invalid_token' using errcode = 'P0002'; end if;
  if v_link.used_at is not null then raise exception 'invalid_token' using errcode = 'P0002'; end if;
  if v_link.expires_at <= now() then raise exception 'invalid_token' using errcode = 'P0002'; end if;

  select * into v_assessment
    from public.assessments
   where id = v_link.assessment_id
   for update;

  if not found then raise exception 'invalid_token' using errcode = 'P0002'; end if;
  if v_assessment.assessment_type is distinct from 'questionnaire_precision12' then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;
  if v_assessment.status not in ('in_progress', 'blocked') then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.questionnaire_responses where assessment_id = v_assessment.id
  ) into v_response_exists;

  if v_response_exists then
    raise exception 'already_submitted' using errcode = '23505';
  end if;

  -- Popula record a partir do payload (sem parq_blocked / created_at / updated_at),
  -- depois INSERT explícito sem a coluna gerada.
  v_rec := jsonb_populate_record(
    null::public.questionnaire_responses,
    p_payload - 'parq_blocked' - 'created_at' - 'updated_at'
      || jsonb_build_object(
        'assessment_id', v_assessment.id,
        'questionnaire_version', 'precision12_v1',
        'submitted_at', now()
      )
  );

  insert into public.questionnaire_responses (
    assessment_id, questionnaire_version,
    full_name, email, phone, birthdate, gender, profession, routine,
    parq_q8_heart_condition, parq_q9_chest_pain_exercise, parq_q10_chest_pain_recent,
    parq_q11_loss_consciousness_or_dizziness_fall, parq_q12_bone_joint,
    parq_q13_blood_pressure_meds, parq_q14_other_health_reason,
    goals, goal_details, previous_attempts, exercise_history,
    fitness_self_rating, body_satisfaction,
    session_duration, weekly_frequency, training_available_days, training_period,
    frequent_traveler, external_training_resources, routine_description,
    primary_adherence_barrier,
    pain_status, pain_movements, pain_location, biggest_difficulty,
    has_medical_condition, medical_condition_details,
    uses_medications, medications_continuous, injury_surgery_history,
    recovery_strategies, alcohol, tobacco, caffeine_doses,
    sleep_hours, sleep_quality, stress_level, energy_level, recovery_quality,
    uses_wearable, wearable_brand, share_data,
    motivations, discomfort_response, difficulty_helper, missed_session_response,
    firm_professional_response, accompaniment_preference, correction_preference,
    consistency_self_rating, life_stability, deal_breaker,
    consent_truthful, consent_not_medical, consent_data_use, consent_terms,
    submitted_at
  ) values (
    v_assessment.id, 'precision12_v1',
    v_rec.full_name, v_rec.email, v_rec.phone, v_rec.birthdate, v_rec.gender, v_rec.profession, v_rec.routine,
    v_rec.parq_q8_heart_condition, v_rec.parq_q9_chest_pain_exercise, v_rec.parq_q10_chest_pain_recent,
    v_rec.parq_q11_loss_consciousness_or_dizziness_fall, v_rec.parq_q12_bone_joint,
    v_rec.parq_q13_blood_pressure_meds, v_rec.parq_q14_other_health_reason,
    v_rec.goals, v_rec.goal_details, v_rec.previous_attempts, v_rec.exercise_history,
    v_rec.fitness_self_rating, v_rec.body_satisfaction,
    v_rec.session_duration, v_rec.weekly_frequency, v_rec.training_available_days, v_rec.training_period,
    v_rec.frequent_traveler, v_rec.external_training_resources, v_rec.routine_description,
    v_rec.primary_adherence_barrier,
    v_rec.pain_status, v_rec.pain_movements, v_rec.pain_location, v_rec.biggest_difficulty,
    v_rec.has_medical_condition, v_rec.medical_condition_details,
    v_rec.uses_medications, v_rec.medications_continuous, v_rec.injury_surgery_history,
    v_rec.recovery_strategies, v_rec.alcohol, v_rec.tobacco, v_rec.caffeine_doses,
    v_rec.sleep_hours, v_rec.sleep_quality, v_rec.stress_level, v_rec.energy_level, v_rec.recovery_quality,
    v_rec.uses_wearable, v_rec.wearable_brand, v_rec.share_data,
    v_rec.motivations, v_rec.discomfort_response, v_rec.difficulty_helper, v_rec.missed_session_response,
    v_rec.firm_professional_response, v_rec.accompaniment_preference, v_rec.correction_preference,
    v_rec.consistency_self_rating, v_rec.life_stability, v_rec.deal_breaker,
    v_rec.consent_truthful, v_rec.consent_not_medical, v_rec.consent_data_use, v_rec.consent_terms,
    now()
  );

  select * into v_response from public.questionnaire_responses where assessment_id = v_assessment.id;

  v_final_status := case when coalesce(v_response.parq_blocked, false) then 'blocked' else 'completed' end;

  update public.assessments
     set status = v_final_status, completed_at = now(), updated_at = now()
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

revoke all on function public.submit_precision12_questionnaire_response(text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_precision12_questionnaire_response(text, jsonb) to service_role;